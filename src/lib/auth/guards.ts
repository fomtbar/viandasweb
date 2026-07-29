import "server-only";
import { redirect } from "next/navigation";
import { leerSesion, type PayloadSesion } from "@/lib/auth/sesion";
import {
  obtenerUsuarioPorId,
  tieneAcceso,
  type UsuarioCompleto,
} from "@/server/usuarios";

/**
 * Guards de autorizacion (runtime Node: tocan Prisma, no pueden correr en Edge).
 *
 * El middleware hace un filtro barato en el borde, pero LA AUTORIDAD ES ESTO:
 * toda pagina protegida y toda server action arranca por aca.
 */

/** Solo verifica que haya una sesion firmada. No consulta la base. */
export async function requireSesion(): Promise<PayloadSesion> {
  const sesion = await leerSesion();
  if (!sesion) redirect("/login");
  return sesion;
}

/**
 * Para todo lo que lea o escriba datos: revalida contra la base.
 *
 * El JWT dura 8 horas, asi que sin esto una baja, un cambio de rol o un reset
 * de contrasena no surtirian efecto hasta que la sesion expire.
 */
export async function requireUsuarioFresco(): Promise<UsuarioCompleto> {
  const sesion = await requireSesion();

  // OJO: aca NO se puede borrar la cookie. Next solo permite mutar cookies
  // desde una server action o un route handler, y esto corre dentro de un
  // Server Component: llamar a destruirSesion() lanzaria y devolveria un 500
  // en vez de la redireccion. El borrado lo hace el middleware al ver el
  // parametro ?motivo= en /login (ver src/middleware.ts).
  const usuario = await obtenerUsuarioPorId(sesion.uid);
  if (!usuario || !tieneAcceso(usuario)) {
    redirect("/login?motivo=sin-acceso");
  }

  // Si un admin reseteo la contrasena (o el propio usuario la cambio en otro
  // navegador), las sesiones emitidas antes de ese instante dejan de valer.
  const pwdAt = Math.floor((usuario.passwordActualizadoAt?.getTime() ?? 0) / 1000);
  if (pwdAt > (sesion.pwdAt ?? 0)) {
    redirect("/login?motivo=password-cambiada");
  }

  if (usuario.debeCambiarPassword) redirect("/cambiar-password");

  return usuario;
}

/** GL o admin: es el permiso base para operar el sistema. */
export const requireGl = requireUsuarioFresco;

export async function requireAdmin(): Promise<UsuarioCompleto> {
  const usuario = await requireUsuarioFresco();
  // Se manda al inicio en vez de mostrar un 403: no hay razon para confirmarle
  // a un GL que la seccion de administracion existe.
  if (!usuario.esAdmin) redirect("/");
  return usuario;
}
