/**
 * Importa la SQLite de la app Tkinter (C:\proyectosDev\viandas\viandas.db)
 * a SQL Server.
 *
 *   npm run db:import                          # falla si ya hay datos
 *   npm run db:import -- --truncate            # borra todo primero
 *   npm run db:import -- --dry-run             # solo cuenta y valida
 *   npm run db:import -- --db ./data/otra.db
 *
 * --truncate se lleva puesta la base entera (nomina, cuentas e historial de
 * pedidos), asi que exige PERMITIR_DESTRUCTIVO=si en el .env -- marca que solo
 * existe en desarrollo -- y ademas tipear el nombre de la base.
 *
 * NO se preservan los ids originales: SET IDENTITY_INSERT es de alcance de
 * sesion y con un pool no hay garantia de que el INSERT caiga en la misma
 * conexion. Como se importa sobre una base vacia y en orden de id ascendente,
 * los ids terminan coincidiendo igual, asi que el "#" que ven los GLs en el
 * historial se conserva. De todas formas se llevan mapas viejo->nuevo para no
 * depender de esa coincidencia.
 */

import path from "node:path";
import readline from "node:readline/promises";
import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { exigirEntornoDestruible, destinoActual } from "@/lib/entorno";
import {
  parseFechaDdMmYyyy,
  parseFechaHoraSqlite,
  hhmmAMinutos,
} from "@/lib/tiempo";
import { parseRangoHorario } from "@/lib/overtime/parse";
import { PREFS, defaultsGlobales } from "@/lib/prefs/registro";

// ── CLI ──────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const tieneFlag = (nombre: string) => argv.includes(nombre);
const valorFlag = (nombre: string): string | undefined => {
  const i = argv.indexOf(nombre);
  return i >= 0 ? argv[i + 1] : undefined;
};

const RUTA_SQLITE = path.resolve(valorFlag("--db") ?? "./data/viandas.db");
const TRUNCAR = tieneFlag("--truncate");
const SIMULAR = tieneFlag("--dry-run");
const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 10);

// ── Helpers de conversion ────────────────────────────────────

const aBool = (v: unknown): boolean => v === 1 || v === "1" || v === true;
const aTexto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Recorta al largo maximo de la columna para que un dato sucio no aborte todo. */
const recortar = (v: string | null, max: number): string | null =>
  v === null ? null : v.length > max ? v.slice(0, max) : v;

// ── Tipos de las filas de origen ─────────────────────────────

interface FilaSector { id: number; nombre: string; activo: number }
interface FilaCargo { id: number; codigo: string; descripcion: string | null; es_lider: number; activo: number }
interface FilaTurno { id: number; nombre: string; activo: number }
interface FilaVentana { id: number; orden: number | null; ot_previo: string | null; turno_horario: string | null; ot_posterior: string | null }
interface FilaEmpleado { id: number; legajo: number; apellido_nombre: string; cargo_id: number | null; sector_id: number | null; turno_id: number | null; es_externo: number; activo: number; creado_at: string | null }
interface FilaUsuario { id: number; legajo: number; windows_user: string | null; password_hash: string | null; sector_default_id: number | null; es_admin: number; es_gl: number; activo: number }
interface FilaMotivo { id: number; texto: string; usos: number; activo: number }
interface FilaPreferencia { clave: string; valor: string | null }
interface FilaPedido { id: number; creado_at: string | null; fecha_solicitud: string; retiro_desde: string; retiro_hasta: string | null; solicitante_legajo: number; cantidad_viandas: number; motivo: string | null; destinatarios_to: string | null; destinatarios_cc: string | null; asunto: string | null; cuerpo: string | null; metodo_envio: string | null; estado: string | null }
interface FilaPedidoItem { id: number; pedido_id: number; legajo: number | null; apellido_nombre: string; sector_nombre: string | null; cargo_nombre: string | null; es_externo: number }

// ── Reporte ──────────────────────────────────────────────────

interface LineaReporte {
  tabla: string;
  origen: number;
  destino: number;
  nota?: string;
  /** true cuando origen != destino es el resultado esperado y no un problema. */
  desparejoEsperado?: boolean;
}
const reporte: LineaReporte[] = [];
const anotar = (
  tabla: string,
  origen: number,
  destino: number,
  nota?: string,
  desparejoEsperado?: boolean,
) => reporte.push({ tabla, origen, destino, nota, desparejoEsperado });

// ── Borrado previo ───────────────────────────────────────────

/**
 * Segundo cerrojo del --truncate: hay que tipear el nombre de la base.
 *
 * La marca de entorno sola no alcanza, porque en el equipo de desarrollo esta
 * siempre puesta y ahi el .env se apunta a la base de la compania cada tanto.
 * Esto obliga a leer contra que se esta por correr.
 */
async function confirmarNombreDeBase() {
  const esperado = process.env.DB_NOMBRE ?? "";

  if (!process.stdin.isTTY) {
    throw new Error(
      `--truncate necesita confirmacion interactiva y no hay terminal. ` +
      `Destino: ${destinoActual()}`,
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`\n  Se va a BORRAR TODO el contenido de ${destinoActual()}`);
    console.log("  (nomina, cuentas, pedidos e historial completo)\n");
    const respuesta = await rl.question(
      `  Escribi el nombre de la base para confirmar (${esperado}): `,
    );
    if (respuesta.trim() !== esperado) {
      throw new Error("El nombre no coincide: no se borro nada.");
    }
  } finally {
    rl.close();
  }
}

async function truncar() {
  // Orden inverso al de las FKs.
  await prisma.pedidoItem.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.usuarioPreferencia.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.empleado.deleteMany();
  await prisma.motivo.deleteMany();
  await prisma.preferencia.deleteMany();
  await prisma.overtimeVentana.deleteMany();
  await prisma.turno.deleteMany();
  await prisma.cargo.deleteMany();
  await prisma.sector.deleteMany();

  // Sin el reseed, los ids nuevos arrancarian donde quedo el IDENTITY.
  // El prefijo `viandas_` es obligatorio: en produccion esta base es
  // compartida con otros sistemas y hay tablas homonimas sin el prefijo.
  const tablas = [
    "viandas_pedido_items", "viandas_pedidos", "viandas_usuarios",
    "viandas_empleados", "viandas_motivos", "viandas_overtime_ventanas",
    "viandas_turnos", "viandas_cargos", "viandas_sectores",
  ];
  for (const t of tablas) {
    await prisma.$executeRawUnsafe(`DBCC CHECKIDENT ('dbo.${t}', RESEED, 0)`);
  }
}

async function hayDatos(): Promise<boolean> {
  const [empleados, sectores] = await Promise.all([
    prisma.empleado.count(),
    prisma.sector.count(),
  ]);
  return empleados > 0 || sectores > 0;
}

// ── Importacion ──────────────────────────────────────────────

async function importar() {
  const origen = new DatabaseSync(RUTA_SQLITE, { readOnly: true });
  const leer = <T>(sql: string): T[] => origen.prepare(sql).all() as T[];

  // 1. Sectores
  const sectores = leer<FilaSector>("SELECT * FROM sectores ORDER BY id");
  const mapaSectores = new Map<number, number>();
  for (const s of sectores) {
    const creado = await prisma.sector.create({
      data: { nombre: s.nombre.trim(), activo: aBool(s.activo) },
    });
    mapaSectores.set(s.id, creado.id);
  }
  anotar("sectores", sectores.length, mapaSectores.size);

  // 2. Cargos
  const cargos = leer<FilaCargo>("SELECT * FROM cargos ORDER BY id");
  const mapaCargos = new Map<number, number>();
  for (const c of cargos) {
    const creado = await prisma.cargo.create({
      data: {
        codigo: c.codigo.trim(),
        descripcion: aTexto(c.descripcion),
        esLider: aBool(c.es_lider),
        activo: aBool(c.activo),
      },
    });
    mapaCargos.set(c.id, creado.id);
  }
  const lideres = cargos.filter((c) => aBool(c.es_lider)).length;
  anotar("cargos", cargos.length, mapaCargos.size, `${lideres} marcados como líder`);

  // 3. Turnos
  const turnos = leer<FilaTurno>("SELECT * FROM turnos ORDER BY id");
  const mapaTurnos = new Map<number, number>();
  for (const t of turnos) {
    const creado = await prisma.turno.create({
      data: { nombre: t.nombre.trim(), activo: aBool(t.activo) },
    });
    mapaTurnos.set(t.id, creado.id);
  }
  anotar("turnos", turnos.length, mapaTurnos.size);

  // 4. Ventanas de overtime (+ derivar minutos)
  const ventanas = leer<FilaVentana>("SELECT * FROM overtime_ventanas ORDER BY orden, id");
  let ventanasParseadas = 0;
  for (const v of ventanas) {
    const previo = parseRangoHorario(v.ot_previo);
    const posterior = parseRangoHorario(v.ot_posterior);
    if (previo || posterior) ventanasParseadas++;
    await prisma.overtimeVentana.create({
      data: {
        orden: v.orden ?? 0,
        otPrevio: aTexto(v.ot_previo),
        turnoHorario: aTexto(v.turno_horario),
        otPosterior: aTexto(v.ot_posterior),
        otPrevioDesdeMin: previo?.desdeMin ?? null,
        otPrevioHastaMin: previo?.hastaMin ?? null,
        otPosteriorDesdeMin: posterior?.desdeMin ?? null,
        otPosteriorHastaMin: posterior?.hastaMin ?? null,
        activo: true,
      },
    });
  }
  anotar("overtime_ventanas", ventanas.length, ventanas.length,
    `${ventanasParseadas} con horarios legibles`);

  // 5. Empleados
  const empleados = leer<FilaEmpleado>("SELECT * FROM empleados ORDER BY id");
  let sinCatalogo = 0;
  for (const lote of enLotes(empleados, 200)) {
    await prisma.empleado.createMany({
      data: lote.map((e) => {
        if (!e.cargo_id || !e.sector_id || !e.turno_id) sinCatalogo++;
        return {
          legajo: e.legajo,
          apellidoNombre: recortar(e.apellido_nombre.trim(), 150)!,
          cargoId: e.cargo_id ? mapaCargos.get(e.cargo_id) ?? null : null,
          sectorId: e.sector_id ? mapaSectores.get(e.sector_id) ?? null : null,
          turnoId: e.turno_id ? mapaTurnos.get(e.turno_id) ?? null : null,
          esExterno: aBool(e.es_externo),
          activo: aBool(e.activo),
          creadoAt: e.creado_at ? parseFechaHoraSqlite(e.creado_at) : new Date(),
        };
      }),
    });
  }
  anotar("empleados", empleados.length, await prisma.empleado.count(),
    sinCatalogo > 0 ? `${sinCatalogo} sin cargo/sector/turno` : undefined);

  // 6. Usuarios (re-hash a bcrypt)
  //    Los 806 hashes de origen son sha256(legajo) sin salt: no hay password
  //    que preservar. Se hashea el legajo con bcrypt y se fuerza el cambio.
  const usuarios = leer<FilaUsuario>("SELECT * FROM usuarios ORDER BY id");
  const legajosEmpleado = new Set(empleados.map((e) => e.legajo));
  const usuariosValidos = usuarios.filter((u) => legajosEmpleado.has(u.legajo));
  const huerfanos = usuarios.length - usuariosValidos.length;

  process.stdout.write(`  hasheando ${usuariosValidos.length} contraseñas con bcrypt (cost ${ROUNDS})...\n`);
  const inicioHash = Date.now();
  let hechos = 0;
  for (const lote of enLotes(usuariosValidos, 100)) {
    const datos = await Promise.all(
      lote.map(async (u) => ({
        legajo: u.legajo,
        passwordHash: await bcrypt.hash(String(u.legajo), ROUNDS),
        debeCambiarPassword: true,
        passwordActualizadoAt: null,
        email: null,
        sectorDefaultId: u.sector_default_id
          ? mapaSectores.get(u.sector_default_id) ?? null
          : null,
        esAdmin: aBool(u.es_admin),
        esGl: aBool(u.es_gl),
        activo: aBool(u.activo),
      })),
    );
    await prisma.usuario.createMany({ data: datos });
    hechos += lote.length;
    process.stdout.write(`\r  ${hechos}/${usuariosValidos.length}`);
  }
  const segundos = ((Date.now() - inicioHash) / 1000).toFixed(1);
  process.stdout.write(`\r  ${hechos}/${usuariosValidos.length} en ${segundos}s\n`);

  const gls = usuariosValidos.filter((u) => aBool(u.es_gl)).length;
  const admins = usuariosValidos.filter((u) => aBool(u.es_admin)).length;
  anotar("usuarios", usuarios.length, await prisma.usuario.count(),
    `${gls} GL, ${admins} admin, bcrypt en ${segundos}s` +
    (huerfanos > 0 ? ` — ${huerfanos} descartados sin empleado` : ""));

  // 7. Motivos
  const motivos = leer<FilaMotivo>("SELECT * FROM motivos ORDER BY id");
  await prisma.motivo.createMany({
    data: motivos.map((m) => ({
      texto: recortar(m.texto.trim(), 200)!,
      usos: m.usos ?? 0,
      activo: aBool(m.activo),
    })),
  });
  anotar("motivos", motivos.length, await prisma.motivo.count());

  // 8. Preferencias (con migracion de claves)
  const prefsOrigen = new Map(
    leer<FilaPreferencia>("SELECT * FROM preferencias").map((p) => [p.clave, p.valor ?? ""]),
  );
  const descartadas: string[] = [];
  const valores = new Map(defaultsGlobales().map((d) => [d.clave, d.valor]));

  for (const [clave, valor] of prefsOrigen) {
    if (clave === "login_windows_auto") {
      // No hay auto-login de Windows en web.
      descartadas.push(clave);
      continue;
    }
    if (clave === "mail_method") {
      // Renombrada. 'outlook' ya no existe como metodo: cae a mailto.
      valores.set(PREFS.mail_metodo_default.clave, valor === "gmail" ? "gmail" : "mailto");
      continue;
    }
    if (valores.has(clave)) valores.set(clave, valor);
    else descartadas.push(clave);
  }
  // El seed viejo dejaba mail_to vacio en algunas instalaciones.
  if (!valores.get("mail_to")) valores.set("mail_to", PREFS.mail_to.valorDefault);

  await prisma.preferencia.createMany({
    data: [...valores].map(([clave, valor]) => ({ clave, valor })),
  });
  // El desparejo es intencional: se suman claves nuevas y se descarta
  // login_windows_auto, que no aplica en web.
  anotar("preferencias", prefsOrigen.size, valores.size,
    descartadas.length ? `descartadas: ${descartadas.join(", ")}` : undefined,
    true);

  // 9. Pedidos
  const pedidos = leer<FilaPedido>("SELECT * FROM pedidos ORDER BY id");
  const mapaPedidos = new Map<number, number>();
  let horasIlegibles = 0;
  const fechas: Date[] = [];

  for (const p of pedidos) {
    if (!legajosEmpleado.has(p.solicitante_legajo)) {
      anotar("pedidos", 0, 0, `pedido ${p.id} descartado: solicitante ${p.solicitante_legajo} no existe`);
      continue;
    }
    const desdeMin = hhmmAMinutos(p.retiro_desde);
    if (desdeMin === null) horasIlegibles++;
    const fecha = parseFechaDdMmYyyy(p.fecha_solicitud);
    fechas.push(fecha);

    const creado = await prisma.pedido.create({
      data: {
        creadoAt: p.creado_at ? parseFechaHoraSqlite(p.creado_at) : new Date(),
        fechaSolicitud: fecha,
        retiroDesdeMin: desdeMin ?? 0,
        retiroHastaMin: hhmmAMinutos(p.retiro_hasta),
        solicitanteLegajo: p.solicitante_legajo,
        cantidadViandas: p.cantidad_viandas,
        motivo: recortar(aTexto(p.motivo) ?? "-", 200)!,
        destinatariosTo: recortar(aTexto(p.destinatarios_to) ?? "", 500)!,
        destinatariosCc: recortar(aTexto(p.destinatarios_cc), 500),
        asunto: recortar(aTexto(p.asunto) ?? "", 300)!,
        cuerpo: p.cuerpo ?? "",
        // 'outlook' ya no es un metodo posible en web.
        metodoEnvio: p.metodo_envio === "gmail" ? "gmail" : "mailto",
        // Los historicos ya se enviaron: no vuelven a 'borrador'.
        estado: p.estado === "cancelado" ? "cancelado" : "enviado",
        fueraDeVentanaOt: false,
      },
    });
    mapaPedidos.set(p.id, creado.id);
  }
  const rango = fechas.length
    ? `${fmt(fechas.reduce((a, b) => (a < b ? a : b)))}..${fmt(fechas.reduce((a, b) => (a > b ? a : b)))}`
    : "sin fechas";
  anotar("pedidos", pedidos.length, mapaPedidos.size,
    `fechas ${rango}` + (horasIlegibles ? ` — ${horasIlegibles} con hora ilegible` : ""));

  // 10. Items
  const items = leer<FilaPedidoItem>("SELECT * FROM pedido_items ORDER BY id");
  const itemsValidos = items.filter((i) => mapaPedidos.has(i.pedido_id));
  for (const lote of enLotes(itemsValidos, 200)) {
    await prisma.pedidoItem.createMany({
      data: lote.map((i) => ({
        pedidoId: mapaPedidos.get(i.pedido_id)!,
        legajo: i.legajo ?? null,
        apellidoNombre: recortar(i.apellido_nombre.trim(), 150)!,
        sectorNombre: recortar(aTexto(i.sector_nombre), 120),
        cargoNombre: recortar(aTexto(i.cargo_nombre), 120),
        esExterno: aBool(i.es_externo),
      })),
    });
  }
  const externos = itemsValidos.filter((i) => aBool(i.es_externo)).length;
  const sinLegajo = itemsValidos.filter((i) => i.legajo === null).length;
  anotar("pedido_items", items.length, await prisma.pedidoItem.count(),
    `${externos} externos, ${sinLegajo} sin legajo`);

  origen.close();
}

function* enLotes<T>(items: T[], tamano: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += tamano) yield items.slice(i, i + tamano);
}

const fmt = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log(`\nOrigen : ${RUTA_SQLITE}`);
  console.log(`Destino: ${process.env.DB_HOST}:${process.env.DB_PUERTO}/${process.env.DB_NOMBRE}\n`);

  if (SIMULAR) {
    const db = new DatabaseSync(RUTA_SQLITE, { readOnly: true });
    const tablas = ["sectores", "cargos", "turnos", "overtime_ventanas", "empleados",
      "usuarios", "motivos", "preferencias", "pedidos", "pedido_items"];
    console.log("--dry-run: contenido del origen\n");
    for (const t of tablas) {
      const fila = db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number };
      console.log(`  ${t.padEnd(20)} ${String(fila.c).padStart(5)}`);
    }
    db.close();
    return;
  }

  if (TRUNCAR) {
    // --truncate vacia las 11 tablas y reinicia los IDENTITY: se lleva puesta
    // la nomina, las cuentas y todo el historial de pedidos. Dos cerrojos.
    exigirEntornoDestruible("vaciar la base con --truncate");
    await confirmarNombreDeBase();
    console.log("--truncate: borrando el destino...");
    await truncar();
  } else if (await hayDatos()) {
    throw new Error(
      "La base de destino ya tiene datos. Usá --truncate para reemplazarlos " +
      "o --dry-run para solo inspeccionar el origen.",
    );
  }

  await importar();

  console.log("\n=== Importación completada ===");
  for (const l of reporte) {
    const ok = l.origen === l.destino || l.desparejoEsperado ? "ok" : "REVISAR";
    console.log(
      `  ${l.tabla.padEnd(20)} ${String(l.origen).padStart(4)} → ${String(l.destino).padStart(4)}   ${ok.padEnd(8)}${l.nota ? `(${l.nota})` : ""}`,
    );
  }
  console.log();
}

main()
  .catch((e) => {
    console.error("\nERROR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
