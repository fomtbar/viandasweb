/**
 * Sustitucion de marcadores en las plantillas de correo.
 *
 * DEUDA QUE CIERRA: la app Tkinter usaba str.format() sobre una plantilla que
 * el admin puede editar libremente (builder.py). Una sola llave suelta o mal
 * escrita levantaba KeyError; en el preview quedaba atrapado por un except
 * silencioso, asi que el usuario veia el texto viejo sin entender por que.
 *
 * Aca una llave desconocida se deja tal cual y NUNCA se lanza.
 */

export const PLACEHOLDERS_VALIDOS = [
  "fecha",
  "retiro",
  "cantidad",
  "sol_apellido_nombre",
  "sol_legajo",
  "sol_cargo",
  "sol_sector",
  "motivo",
  "lista_personas",
  "sector_solicitante",
] as const;

export type Placeholder = (typeof PLACEHOLDERS_VALIDOS)[number];

export function renderPlantilla(
  plantilla: string,
  valores: Record<string, string | number>,
): string {
  return plantilla.replace(/\{(\w+)\}/g, (coincidencia, clave: string) =>
    clave in valores ? String(valores[clave]) : coincidencia,
  );
}

/**
 * Marcadores usados en la plantilla que no existen. Sirve para avisarle al
 * admin al guardar, sin bloquearlo.
 */
export function placeholdersDesconocidos(
  plantilla: string,
  validos: readonly string[] = PLACEHOLDERS_VALIDOS,
): string[] {
  const usados = [...plantilla.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return [...new Set(usados.filter((u) => !validos.includes(u)))];
}
