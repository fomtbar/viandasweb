"use server";

import { redirect } from "next/navigation";
import { requireSesion } from "@/lib/auth/guards";
import {
  EsquemaCambioPassword,
  mensajesDeError,
} from "@/lib/validacion/esquemas";
import { hashPassword, verificarPassword } from "@/lib/auth/password";
import { establecerCookieSesion } from "@/lib/auth/sesion";
import {
  obtenerUsuarioPorId,
  actualizarPassword,
  aPayloadSesion,
} from "@/server/usuarios";

export interface EstadoCambio {
  errores: string[];
}

export async function cambiarPassword(
  _previo: EstadoCambio,
  formData: FormData,
): Promise<EstadoCambio> {
  // requireSesion y no requireUsuarioFresco: este es justamente el unico lugar
  // al que puede entrar alguien con debeCambiarPassword en true, y
  // requireUsuarioFresco lo redirigiria aca en bucle.
  const sesion = await requireSesion();

  const parseado = EsquemaCambioPassword.safeParse({
    actual: String(formData.get("actual") ?? ""),
    nueva: String(formData.get("nueva") ?? ""),
    confirmacion: String(formData.get("confirmacion") ?? ""),
  });
  if (!parseado.success) {
    return { errores: mensajesDeError(parseado.error) };
  }
  const { actual, nueva } = parseado.data;

  const usuario = await obtenerUsuarioPorId(sesion.uid);
  if (!usuario) redirect("/login");

  if (!(await verificarPassword(actual, usuario.passwordHash))) {
    return { errores: ["La contraseña actual no es correcta."] };
  }

  // La contrasena inicial de todos es su legajo: si la dejaran igual, el
  // cambio forzado no serviria de nada.
  if (nueva === String(usuario.legajo)) {
    return {
      errores: ["La contraseña no puede ser su número de legajo."],
    };
  }

  await actualizarPassword(usuario.id, await hashPassword(nueva));

  // Se re-emite la cookie: sin esto el payload seguiria diciendo
  // debeCambiar:true (bucle en el middleware) y el pwdAt viejo haria que
  // requireUsuarioFresco expulse al usuario que acaba de cambiarla.
  const actualizado = await obtenerUsuarioPorId(usuario.id);
  if (actualizado) await establecerCookieSesion(aPayloadSesion(actualizado));

  redirect("/?password=cambiada");
}
