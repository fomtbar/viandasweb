/**
 * Horas y fechas.
 *
 * Dos decisiones que atraviesan todo el proyecto:
 *
 * 1. Las horas de retiro se guardan como MINUTOS DESDE MEDIANOCHE (0..1439),
 *    no como texto 'HH:MM'. Asi se pueden ordenar, comparar y validar contra
 *    las ventanas de overtime sin parsear nada.
 *
 * 2. Las fechas de columnas @db.Date se construyen SIEMPRE con Date.UTC().
 *    Con `new Date(2026, 6, 28)` bajo TZ=America/Argentina/Buenos_Aires el
 *    valor se serializa como 2026-07-28T03:00:00Z y SQL Server lo trunca al
 *    dia anterior.
 */

export const MINUTOS_POR_DIA = 1440;

/** 'HH:MM' o 'HHMM' -> minutos desde medianoche. null si no es una hora valida. */
export function hhmmAMinutos(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpio = texto.trim();
  const m =
    /^(\d{1,2}):(\d{2})$/.exec(limpio) ?? /^(\d{1,2})(\d{2})$/.exec(limpio);
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/** Minutos desde medianoche -> 'HH:MM' con cero a la izquierda. */
export function minutosAHhmm(minutos: number): string {
  const normalizado =
    ((minutos % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA;
  const h = Math.floor(normalizado / 60);
  const m = normalizado % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Formateo progresivo mientras se tipea: inserta el ':' solo.
 * Escribir "1130" produce "11:30". Reemplaza al bind_hora_entry de Tkinter.
 */
export function formatearHoraParcial(bruto: string): string {
  const digitos = bruto.replace(/\D/g, "").slice(0, 4);
  if (digitos.length <= 2) return digitos;
  return `${digitos.slice(0, 2)}:${digitos.slice(2)}`;
}

/**
 * Duracion de un rango de retiro en minutos, contemplando el cruce de
 * medianoche (turno noche). Devuelve 0 si desde === hasta.
 */
export function duracionRango(desdeMin: number, hastaMin: number): number {
  return (
    ((hastaMin - desdeMin) % MINUTOS_POR_DIA + MINUTOS_POR_DIA) %
    MINUTOS_POR_DIA
  );
}

/** 'dd/mm/YYYY' -> Date en UTC medianoche. Lanza si no parsea. */
export function parseFechaDdMmYyyy(texto: string): Date {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m) throw new Error(`Fecha no parseable (se esperaba dd/mm/YYYY): "${texto}"`);
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
}

/** 'YYYY-MM-DD' (el value de un <input type="date">) -> Date en UTC medianoche. */
export function parseFechaIso(texto: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

/** Date -> 'dd/mm/YYYY' leyendo los componentes en UTC (asi se guardaron). */
export function formatearFechaDdMmYyyy(fecha: Date): string {
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${fecha.getUTCFullYear()}`;
}

/** Date -> 'YYYY-MM-DD' para el value de un <input type="date">. */
export function formatearFechaIso(fecha: Date): string {
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${m}-${d}`;
}

/**
 * "Hoy" segun la zona horaria de la planta, como Date UTC-medianoche listo
 * para una columna @db.Date. No usar new Date() a secas: a las 22:00 de
 * Argentina el UTC ya es el dia siguiente.
 */
export function hoyEnZona(
  zona = process.env.TZ || "America/Argentina/Buenos_Aires",
  ahora = new Date(),
): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ahora);
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  return new Date(Date.UTC(valor("year"), valor("month") - 1, valor("day")));
}

/**
 * Instante (creado_at, cancelado_at, ultimo_login_at) -> 'dd/mm/YYYY HH:MM'
 * en la zona de la planta.
 *
 * NO usar formatearFechaDdMmYyyy() para esto: esa lee los componentes en UTC
 * porque esta pensada para las columnas @db.Date, que se guardan como
 * UTC-medianoche. Aplicada a un instante, a partir de las 21:00 de Argentina
 * devuelve el dia siguiente.
 */
export function formatearFechaHoraEnZona(
  instante: Date,
  zona = process.env.TZ || "America/Argentina/Buenos_Aires",
): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instante);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

/** Fecha y hora de SQLite ('YYYY-MM-DD HH:MM:SS', que es UTC) -> Date. */
export function parseFechaHoraSqlite(texto: string): Date {
  return new Date(`${texto.replace(" ", "T")}Z`);
}
