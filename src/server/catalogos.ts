import "server-only";
import { prisma } from "@/lib/prisma";

/** Equivale a src/repos/catalogos.py y src/repos/empleados.py de la app Tkinter. */

export function obtenerSectores(soloActivos = true) {
  return prisma.sector.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { nombre: "asc" },
  });
}

export function obtenerCargos(soloActivos = true) {
  return prisma.cargo.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { codigo: "asc" },
  });
}

export function obtenerTurnos(soloActivos = true) {
  return prisma.turno.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { nombre: "asc" },
  });
}

/** Fila de la grilla de personal, ya aplanada para viajar al cliente. */
export interface EmpleadoParaSeleccion {
  legajo: number;
  apellidoNombre: string;
  sectorId: number | null;
  sectorNombre: string;
  cargoNombre: string;
}

/**
 * Toda la nomina activa, en una sola consulta.
 *
 * Se manda entera al cliente (806 filas, ~55 KB antes de comprimir) porque el
 * filtrado y la busqueda tienen que ser instantaneos y, sobre todo, porque la
 * seleccion sobrevive a los cambios de filtro: con paginado del lado del
 * servidor esa regla se vuelve muy incomoda de sostener.
 */
export async function obtenerEmpleadosParaSeleccion(): Promise<
  EmpleadoParaSeleccion[]
> {
  const filas = await prisma.empleado.findMany({
    where: { activo: true },
    select: {
      legajo: true,
      apellidoNombre: true,
      sectorId: true,
      sector: { select: { nombre: true } },
      cargo: { select: { descripcion: true, codigo: true } },
    },
    orderBy: { apellidoNombre: "asc" },
  });

  return filas.map((e) => ({
    legajo: e.legajo,
    apellidoNombre: e.apellidoNombre,
    sectorId: e.sectorId,
    sectorNombre: e.sector?.nombre ?? "-",
    cargoNombre: e.cargo?.descripcion ?? e.cargo?.codigo ?? "-",
  }));
}
