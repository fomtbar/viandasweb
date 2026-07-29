import { hhmmAMinutos } from "@/lib/tiempo";

/**
 * Parseo de las ventanas de overtime.
 *
 * El texto viene del Excel original y es irregular: "3:00 A 6:00",
 * "23:13 A 2:34", "6:00 a 14:34". El separador puede ser 'A' o 'a' y las
 * horas no tienen cero a la izquierda.
 *
 * OJO: dos de las tres ventanas reales CRUZAN MEDIANOCHE
 * ("23:13 A 2:34" y "5:54 A 8:54" respecto de su turno), asi que un rango
 * con desdeMin > hastaMin es valido y no un error de carga.
 */

export interface RangoMinutos {
  desdeMin: number;
  hastaMin: number;
}

/** "23:13 A 2:34" -> { desdeMin: 1393, hastaMin: 154 }. null si no parsea. */
export function parseRangoHorario(
  texto: string | null | undefined,
): RangoMinutos | null {
  if (!texto) return null;
  const partes = texto.trim().split(/\s+[Aa]\s+/);
  if (partes.length !== 2) return null;
  const desdeMin = hhmmAMinutos(partes[0]);
  const hastaMin = hhmmAMinutos(partes[1]);
  if (desdeMin === null || hastaMin === null) return null;
  return { desdeMin, hastaMin };
}

/**
 * true si el minuto cae dentro del rango, contemplando el cruce de medianoche.
 * El limite inferior es inclusivo y el superior tambien: una ventana
 * "3:00 A 6:00" acepta tanto las 3:00 como las 6:00.
 */
export function minutoEnRango(minuto: number, rango: RangoMinutos): boolean {
  const { desdeMin, hastaMin } = rango;
  if (desdeMin <= hastaMin) {
    return minuto >= desdeMin && minuto <= hastaMin;
  }
  // Cruza medianoche: [desde, 23:59] U [00:00, hasta]
  return minuto >= desdeMin || minuto <= hastaMin;
}
