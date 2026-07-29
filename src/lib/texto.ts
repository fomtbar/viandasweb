/**
 * Normaliza para buscar: sin acentos y en minusculas.
 *
 * Con esto, escribir "adrian" encuentra "Kishimoto Adrián Gustavo". La app
 * Tkinter no lo hacia (usaba LIKE con collation sensible a acentos), asi que
 * es una mejora gratuita. Ademas deja la busqueda del lado del cliente, sin
 * depender de la collation del SQL Server de turno.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    // Marcas diacriticas combinantes que NFD deja separadas de la letra base.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
