"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { EsquemaLogin, mensajesDeError } from "@/lib/validacion/esquemas";
import {
  verificarLimite,
  registrarFallo,
  limpiarIntentos,
} from "@/lib/auth/limite-intentos";
import { verificarPassword, verificacionSenuelo } from "@/lib/auth/password";
import { establecerCookieSesion, destruirSesion } from "@/lib/auth/sesion";
import {
  obtenerUsuarioPorLegajo,
  tieneAcceso,
  aPayloadSesion,
  registrarLogin,
} from "@/server/usuarios";

export interface EstadoLogin {
  errores: string[];
  legajo?: string;
}

/**
 * Mensaje unico para "no existe", "contrasena mala" y "cuenta desactivada".
 * Distinguirlos le confirmaria a cualquiera que legajos tienen cuenta.
 */
const CREDENCIALES_INVALIDAS = "Legajo o contraseña incorrectos.";

/** Literal de la app Tkinter (login.py). */
const SIN_ACCESO = "Solo GLs y administradores pueden acceder al sistema.";

export async function iniciarSesion(
  _previo: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const crudo = {
    legajo: String(formData.get("legajo") ?? ""),
    password: String(formData.get("password") ?? ""),
  };

  const parseado = EsquemaLogin.safeParse(crudo);
  if (!parseado.success) {
    return { errores: mensajesDeError(parseado.error), legajo: crudo.legajo };
  }

  const { legajo, password } = parseado.data;

  // La IP real viene del proxy si algún día hay uno delante; sin proxy,
  // x-forwarded-for no existe y se usa una constante.
  const cabeceras = await headers();
  const ip =
    cabeceras.get("x-forwarded-for")?.split(",")[0].trim() ??
    cabeceras.get("x-real-ip") ??
    "local";

  const limite = verificarLimite(String(legajo), ip);
  if (limite.bloqueado) {
    return {
      errores: [
        `Demasiados intentos fallidos. Volvé a probar en ${limite.minutosRestantes} minutos.`,
      ],
      legajo: crudo.legajo,
    };
  }

  const usuario = await obtenerUsuarioPorLegajo(legajo);

  if (!usuario) {
    // Se compara igual contra un hash real para no filtrar por tiempo de
    // respuesta que legajos tienen cuenta.
    await verificacionSenuelo(password);
    registrarFallo(String(legajo), ip);
    return { errores: [CREDENCIALES_INVALIDAS], legajo: crudo.legajo };
  }

  if (!(await verificarPassword(password, usuario.passwordHash))) {
    registrarFallo(String(legajo), ip);
    return { errores: [CREDENCIALES_INVALIDAS], legajo: crudo.legajo };
  }

  if (!usuario.activo) {
    registrarFallo(String(legajo), ip);
    return { errores: [CREDENCIALES_INVALIDAS], legajo: crudo.legajo };
  }

  // La contrasena era correcta pero el rol no habilita: aca si conviene ser
  // explicito, si no la persona reintenta creyendo que se equivoco de clave.
  if (!tieneAcceso(usuario)) {
    return { errores: [SIN_ACCESO], legajo: crudo.legajo };
  }

  limpiarIntentos(String(legajo), ip);
  await registrarLogin(usuario.id);
  await establecerCookieSesion(aPayloadSesion(usuario));

  // Se decide el destino ACA, y no se delega en el middleware o en el guard.
  // Si esta accion redirigiera siempre a "/", el guard de esa pagina volveria
  // a redirigir a /cambiar-password: Next renderiza el contenido correcto,
  // pero el router ya fijo "/" en la barra de direcciones y queda una URL que
  // no corresponde a lo que se ve.
  if (usuario.debeCambiarPassword) redirect("/cambiar-password");

  // Destino guardado por el middleware cuando la sesion habia expirado.
  // Solo se aceptan rutas internas: un "next" con http:// seria un open
  // redirect hacia un sitio externo.
  const destino = String(formData.get("next") ?? "");
  const esRutaInterna = destino.startsWith("/") && !destino.startsWith("//");
  redirect(esRutaInterna ? destino : "/");
}

export async function cerrarSesion() {
  await destruirSesion();
  redirect("/login");
}
