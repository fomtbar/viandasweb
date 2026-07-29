import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** Equivale a src/repos/motivos.py. */

/**
 * Motivo por defecto de la pantalla de pedido.
 *
 * Rareza heredada de la app Tkinter (app.py:248-258): "Overtime" NO esta entre
 * los motivos sembrados, pero la UI lo inyecta al principio del combo y lo deja
 * seleccionado. Recien aparece en la tabla `motivos` despues del primer pedido
 * que lo use. Se conserva el comportamiento.
 */
export const MOTIVO_DEFAULT = "Overtime";

/** Opcion del combo que habilita el campo de texto libre. */
export const OPCION_NUEVO_MOTIVO = "__nuevo__";

export function obtenerMotivos(soloActivos = true) {
  return prisma.motivo.findMany({
    where: soloActivos ? { activo: true } : undefined,
    // Los mas usados primero: es el orden del combo en la app original.
    orderBy: [{ usos: "desc" }, { texto: "asc" }],
  });
}

/**
 * Suma un uso al motivo y lo crea si no existia.
 *
 * Recibe el cliente de transaccion a proposito: en la app Tkinter esto corria
 * FUERA de la transaccion del pedido (motivos.py:16), asi que un pedido que
 * fallaba dejaba igual el motivo creado y el contador incrementado.
 */
export function registrarUsoMotivo(tx: Prisma.TransactionClient, texto: string) {
  const limpio = texto.trim();
  if (!limpio) return Promise.resolve(null);
  return tx.motivo.upsert({
    where: { texto: limpio },
    create: { texto: limpio, usos: 1 },
    update: { usos: { increment: 1 } },
  });
}
