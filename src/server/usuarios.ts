import "server-only";
import { prisma } from "@/lib/prisma";
import type { PayloadSesion } from "@/lib/auth/sesion";

/**
 * Capa de datos de usuarios. Equivale a src/repos/usuarios.py de la app
 * Tkinter. Ningun componente consulta Prisma directamente.
 */

/** Usuario con los datos de nomina necesarios para armar la sesion. */
export type UsuarioCompleto = NonNullable<
  Awaited<ReturnType<typeof obtenerUsuarioPorLegajo>>
>;

const INCLUDE_NOMINA = {
  empleado: { include: { cargo: true, sector: true } },
  sectorDefault: true,
} as const;

export function obtenerUsuarioPorLegajo(legajo: number) {
  return prisma.usuario.findUnique({
    where: { legajo },
    include: INCLUDE_NOMINA,
  });
}

export function obtenerUsuarioPorId(id: number) {
  return prisma.usuario.findUnique({
    where: { id },
    include: INCLUDE_NOMINA,
  });
}

/** Solo GLs y administradores entran al sistema. Igual que auth.tiene_acceso(). */
export function tieneAcceso(u: { esGl: boolean; esAdmin: boolean; activo: boolean }) {
  return u.activo && (u.esGl || u.esAdmin);
}

/** Traduce el usuario de base al payload que viaja en la cookie. */
export function aPayloadSesion(u: UsuarioCompleto): PayloadSesion {
  // El sector que se muestra y se usa como filtro por defecto es el del
  // usuario si lo tiene; si no, el de su legajo en la nomina.
  const sector = u.sectorDefault ?? u.empleado.sector;
  return {
    uid: u.id,
    legajo: u.legajo,
    nombre: u.empleado.apellidoNombre,
    sectorId: sector?.id ?? null,
    sectorNombre: sector?.nombre ?? null,
    cargo: u.empleado.cargo?.descripcion ?? u.empleado.cargo?.codigo ?? null,
    esGl: u.esGl,
    esAdmin: u.esAdmin,
    debeCambiar: u.debeCambiarPassword,
    pwdAt: Math.floor((u.passwordActualizadoAt?.getTime() ?? 0) / 1000),
  };
}

export function registrarLogin(id: number) {
  return prisma.usuario.update({
    where: { id },
    data: { ultimoLoginAt: new Date() },
  });
}

export function actualizarPassword(id: number, passwordHash: string) {
  return prisma.usuario.update({
    where: { id },
    data: {
      passwordHash,
      debeCambiarPassword: false,
      passwordActualizadoAt: new Date(),
    },
  });
}
