import "server-only";
import { prisma } from "@/lib/prisma";
import type { VentanaValidable } from "@/lib/overtime/validar";

export function obtenerVentanas(soloActivas = true) {
  return prisma.overtimeVentana.findMany({
    where: soloActivas ? { activo: true } : undefined,
    orderBy: { orden: "asc" },
  });
}

/**
 * Ventanas listas para validar: se arma la lista de rangos descartando los
 * que no se pudieron parsear (quedaron en NULL al importar o al editarlos).
 */
export async function obtenerVentanasValidables(): Promise<VentanaValidable[]> {
  const filas = await obtenerVentanas();
  return filas.map((v) => {
    const rangos = [];
    if (v.otPrevioDesdeMin !== null && v.otPrevioHastaMin !== null) {
      rangos.push({ desdeMin: v.otPrevioDesdeMin, hastaMin: v.otPrevioHastaMin });
    }
    if (v.otPosteriorDesdeMin !== null && v.otPosteriorHastaMin !== null) {
      rangos.push({
        desdeMin: v.otPosteriorDesdeMin,
        hastaMin: v.otPosteriorHastaMin,
      });
    }
    return { orden: v.orden, rangos };
  });
}
