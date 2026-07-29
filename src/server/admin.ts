import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

/** Consultas y operaciones de la seccion de administracion. */

export interface FilaUsuarioAdmin {
  legajo: number;
  apellidoNombre: string;
  /** null cuando el empleado todavia no tiene cuenta. */
  usuarioId: number | null;
  email: string | null;
  sectorNombre: string;
  sectorDefaultId: number | null;
  cargoNombre: string;
  esGl: boolean;
  esAdmin: boolean;
  activo: boolean;
  ultimoLoginAt: Date | null;
  debeCambiarPassword: boolean;
}

/**
 * TODOS los empleados activos, tengan cuenta o no.
 *
 * Es el mismo criterio que usuarios.py:get_todos() de la app Tkinter: la
 * grilla muestra la nomina completa y marca en gris a quien no tiene usuario,
 * porque desde ahi mismo se le crea la cuenta.
 */
export async function listarUsuariosAdmin(): Promise<FilaUsuarioAdmin[]> {
  const empleados = await prisma.empleado.findMany({
    where: { activo: true },
    select: {
      legajo: true,
      apellidoNombre: true,
      sector: { select: { nombre: true } },
      cargo: { select: { descripcion: true, codigo: true } },
      usuario: {
        select: {
          id: true,
          email: true,
          sectorDefaultId: true,
          esGl: true,
          esAdmin: true,
          activo: true,
          ultimoLoginAt: true,
          debeCambiarPassword: true,
          sectorDefault: { select: { nombre: true } },
        },
      },
    },
    orderBy: { apellidoNombre: "asc" },
  });

  return empleados.map((e) => ({
    legajo: e.legajo,
    apellidoNombre: e.apellidoNombre,
    usuarioId: e.usuario?.id ?? null,
    email: e.usuario?.email ?? null,
    sectorNombre:
      e.usuario?.sectorDefault?.nombre ?? e.sector?.nombre ?? "-",
    sectorDefaultId: e.usuario?.sectorDefaultId ?? null,
    cargoNombre: e.cargo?.descripcion ?? e.cargo?.codigo ?? "-",
    esGl: e.usuario?.esGl ?? false,
    esAdmin: e.usuario?.esAdmin ?? false,
    activo: e.usuario?.activo ?? false,
    ultimoLoginAt: e.usuario?.ultimoLoginAt ?? null,
    debeCambiarPassword: e.usuario?.debeCambiarPassword ?? false,
  }));
}

export async function crearCuenta(legajo: number) {
  const empleado = await prisma.empleado.findUnique({
    where: { legajo },
    include: { cargo: true },
  });
  if (!empleado || !empleado.activo) return { ok: false, motivo: "sin-empleado" as const };

  const existente = await prisma.usuario.findUnique({ where: { legajo } });
  if (existente) return { ok: false, motivo: "ya-existe" as const };

  await prisma.usuario.create({
    data: {
      legajo,
      passwordHash: await hashPassword(String(legajo)),
      debeCambiarPassword: true,
      sectorDefaultId: empleado.sectorId,
      // El rol sale del cargo, igual que _sincronizar_gls de la app original.
      esGl: empleado.cargo?.esLider ?? false,
      esAdmin: false,
      activo: true,
    },
  });
  return { ok: true as const };
}

/**
 * Crea las cuentas que falten.
 *
 * Va en lotes porque cada cuenta implica un hash bcrypt (~60 ms): hacer los
 * cientos de una sola vez agotaria el tiempo de la server action.
 */
export async function sincronizarNomina(tamanoLote = 100) {
  const pendientes = await prisma.empleado.findMany({
    where: { activo: true, usuario: null },
    include: { cargo: true },
    orderBy: { legajo: "asc" },
    take: tamanoLote,
  });

  if (pendientes.length === 0) return { creados: 0, restantes: 0 };

  const datos = await Promise.all(
    pendientes.map(async (e) => ({
      legajo: e.legajo,
      passwordHash: await hashPassword(String(e.legajo)),
      debeCambiarPassword: true,
      sectorDefaultId: e.sectorId,
      esGl: e.cargo?.esLider ?? false,
      esAdmin: false,
      activo: true,
    })),
  );
  await prisma.usuario.createMany({ data: datos });

  const restantes = await prisma.empleado.count({
    where: { activo: true, usuario: null },
  });
  return { creados: datos.length, restantes };
}

export async function resetearPassword(usuarioId: number) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) return false;
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      passwordHash: await hashPassword(String(usuario.legajo)),
      debeCambiarPassword: true,
      // Expulsa las sesiones abiertas de esa persona (ver guards).
      passwordActualizadoAt: new Date(),
    },
  });
  return true;
}

export function contarAdminsActivos() {
  return prisma.usuario.count({ where: { esAdmin: true, activo: true } });
}
