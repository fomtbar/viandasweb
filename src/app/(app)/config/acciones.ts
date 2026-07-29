"use server";

import { revalidatePath } from "next/cache";
import { requireGl, requireAdmin } from "@/lib/auth/guards";
import { filtrarPorRol, PREFS } from "@/lib/prefs/registro";
import { placeholdersDesconocidos } from "@/lib/mail/plantilla";
import {
  guardarPreferenciasGlobales,
  guardarPreferenciasDeUsuario,
} from "@/server/preferencias";

export interface EstadoPrefs {
  ok: boolean;
  mensaje?: string;
  avisos?: string[];
  errores?: string[];
}

/** Toma del formulario solo las claves que el registro conoce. */
function entradasDelForm(formData: FormData): Record<string, string> {
  const entradas: Record<string, string> = {};
  for (const clave of Object.keys(PREFS)) {
    const valor = formData.get(clave);
    if (valor !== null) entradas[clave] = String(valor);
    // Un checkbox sin marcar no viaja en el form: se detecta por el campo
    // oculto que lo acompaña.
    else if (formData.get(`__presente_${clave}`) !== null) entradas[clave] = "false";
  }
  return entradas;
}

function avisosDePlantillas(valores: Record<string, string>): string[] {
  const avisos: string[] = [];
  for (const clave of ["mail_subject_template", "mail_body_template"]) {
    const plantilla = valores[clave];
    if (!plantilla) continue;
    const desconocidos = placeholdersDesconocidos(plantilla);
    if (desconocidos.length) {
      avisos.push(
        `La plantilla usa ${desconocidos.map((d) => `{${d}}`).join(", ")}, ` +
          `que no es un marcador válido. Va a aparecer tal cual en el correo.`,
      );
    }
  }
  return avisos;
}

/**
 * Guarda las preferencias que puede tocar un GL.
 *
 * DEUDA QUE CIERRA: en la app Tkinter, "Config." mostraba mail_to como solo
 * lectura pero _guardar_prefs() escribia TODAS las claves globales igual
 * (admin.py:651-658). El readonly era decorativo. Aca la autoridad es
 * filtrarPorRol, del lado del servidor: lo que un GL no puede editar se
 * descarta aunque venga en el formulario.
 */
export async function guardarConfigPropia(
  _previo: EstadoPrefs,
  formData: FormData,
): Promise<EstadoPrefs> {
  const usuario = await requireGl();
  const { globales, propias } = filtrarPorRol(entradasDelForm(formData), "gl");

  // Un GL no tiene ninguna clave global habilitada; si llegara alguna, se
  // ignora en silencio.
  void globales;

  await guardarPreferenciasDeUsuario(usuario.id, propias);
  revalidatePath("/config");
  revalidatePath("/");
  return { ok: true, mensaje: "Tus preferencias se guardaron." };
}

export async function guardarPreferenciasAdmin(
  _previo: EstadoPrefs,
  formData: FormData,
): Promise<EstadoPrefs> {
  await requireAdmin();
  const { globales, propias } = filtrarPorRol(entradasDelForm(formData), "admin");
  void propias;

  const maximo = Number(globales.pedido_dias_futuro_max);
  if (globales.pedido_dias_futuro_max !== undefined && (!Number.isInteger(maximo) || maximo < 0)) {
    return { ok: false, errores: ["Los días de anticipación deben ser un número entero."] };
  }

  await guardarPreferenciasGlobales(globales);
  revalidatePath("/admin/preferencias");
  revalidatePath("/");
  return {
    ok: true,
    mensaje: "Preferencias guardadas.",
    avisos: avisosDePlantillas(globales),
  };
}
