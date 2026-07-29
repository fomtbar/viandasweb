"use server";

import { revalidatePath } from "next/cache";
import { requireGl } from "@/lib/auth/guards";
import { cancelarPedido } from "@/server/pedidos";

export interface EstadoCancelacion {
  ok: boolean;
  error?: string;
}

/**
 * Cancela un pedido.
 *
 * DEUDAS QUE CIERRA: la app Tkinter dejaba cancelar cualquier pedido visible,
 * sin mirar el rol ni el estado previo, y no guardaba quien ni cuando.
 */
export async function cancelar(
  pedidoId: number,
  motivo: string,
): Promise<EstadoCancelacion> {
  const usuario = await requireGl();

  const ok = await cancelarPedido(
    pedidoId,
    { legajo: usuario.legajo, esAdmin: usuario.esAdmin },
    motivo.trim() || null,
  );

  if (!ok) {
    // Un solo mensaje para "ya estaba cancelado" y "no es tuyo": distinguirlos
    // le confirmaria a un GL que existe un pedido ajeno con ese numero.
    return {
      ok: false,
      error: "No se pudo cancelar: el pedido ya estaba cancelado o no está disponible.",
    };
  }

  revalidatePath("/historial");
  revalidatePath(`/historial/${pedidoId}`);
  return { ok: true };
}
