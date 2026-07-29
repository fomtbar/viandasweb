/**
 * Escapado de HTML.
 *
 * DEUDA QUE CIERRA: el builder de la app Tkinter (mail/builder.py:_lista_html)
 * interpolaba el nombre directo en el HTML. Como el nombre de una persona
 * externa es texto libre que carga el propio GL, alcanzaba con escribir
 * "<script>..." para inyectar marcado en el mail.
 */
export function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
