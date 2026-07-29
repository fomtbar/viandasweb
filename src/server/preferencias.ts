import "server-only";
import { prisma } from "@/lib/prisma";
import {
  PREFS,
  type ClavePref,
  defaultsGlobales,
} from "@/lib/prefs/registro";

/** Equivale a src/repos/preferencias.py, pero con el registro como autoridad. */

export type Preferencias = Record<ClavePref, string>;

/**
 * Preferencias efectivas para un usuario: las globales, pisadas por las suyas.
 * Toda clave ausente cae al valor por defecto del registro, asi que el
 * resultado nunca tiene huecos.
 */
export async function resolverPreferencias(
  usuarioId?: number,
): Promise<Preferencias> {
  const [globales, propias] = await Promise.all([
    prisma.preferencia.findMany(),
    usuarioId
      ? prisma.usuarioPreferencia.findMany({ where: { usuarioId } })
      : Promise.resolve([]),
  ]);

  const valores = Object.fromEntries(
    Object.values(PREFS).map((p) => [p.clave, p.valorDefault]),
  ) as Preferencias;

  for (const g of globales) {
    if (g.clave in valores) valores[g.clave as ClavePref] = g.valor;
  }
  for (const p of propias) {
    if (p.clave in valores) valores[p.clave as ClavePref] = p.valor;
  }
  return valores;
}

export async function obtenerPreferenciaGlobal(clave: ClavePref): Promise<string> {
  const fila = await prisma.preferencia.findUnique({ where: { clave } });
  return fila?.valor ?? PREFS[clave].valorDefault;
}

/** Escribe claves globales. El filtrado por rol se hace ANTES, en la accion. */
export async function guardarPreferenciasGlobales(
  valores: Record<string, string>,
) {
  const entradas = Object.entries(valores);
  if (entradas.length === 0) return;
  await prisma.$transaction(
    entradas.map(([clave, valor]) =>
      prisma.preferencia.upsert({
        where: { clave },
        create: { clave, valor },
        update: { valor },
      }),
    ),
  );
}

export async function guardarPreferenciasDeUsuario(
  usuarioId: number,
  valores: Record<string, string>,
) {
  const entradas = Object.entries(valores);
  if (entradas.length === 0) return;
  await prisma.$transaction(
    entradas.map(([clave, valor]) =>
      prisma.usuarioPreferencia.upsert({
        where: { usuarioId_clave: { usuarioId, clave } },
        create: { usuarioId, clave, valor },
        update: { valor },
      }),
    ),
  );
}

/** Siembra las claves globales que falten. Idempotente. */
export async function sembrarPreferenciasFaltantes() {
  const existentes = new Set(
    (await prisma.preferencia.findMany({ select: { clave: true } })).map(
      (p) => p.clave,
    ),
  );
  const faltantes = defaultsGlobales().filter((d) => !existentes.has(d.clave));
  if (faltantes.length) await prisma.preferencia.createMany({ data: faltantes });
  return faltantes.length;
}
