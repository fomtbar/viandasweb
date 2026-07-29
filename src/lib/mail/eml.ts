import { separarDirecciones } from "./mailto";

/**
 * Genera un archivo .eml (RFC 5322) que Outlook abre COMO BORRADOR EDITABLE.
 *
 * Es el reemplazo del mailto: cuando el pedido tiene demasiadas personas.
 * No tiene limite de tamano y conserva el formato HTML.
 *
 * Detalles que hay que acertar o el archivo se abre mal:
 *  - `X-Unsent: 1` es lo que hace que Outlook lo muestre en modo redaccion.
 *    Sin eso lo abre como un mensaje ya recibido, sin boton de enviar.
 *  - El asunto con acentos va codificado segun RFC 2047; si no, Outlook
 *    muestra "PedÃ­do".
 *  - Todas las cabeceras y los separadores de parte terminan en CRLF.
 */

const CRLF = "\r\n";

/** Codifica una cabecera con caracteres no ASCII (RFC 2047, base64). */
export function codificarCabecera(texto: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(texto)) return texto;
  const base64 = Buffer.from(texto, "utf8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

/** base64 partido en lineas de 76 caracteres, como exige el MIME. */
function base64EnLineas(texto: string): string {
  const crudo = Buffer.from(texto, "utf8").toString("base64");
  return (crudo.match(/.{1,76}/g) ?? []).join(CRLF);
}

export interface DatosEml {
  para: string;
  cc?: string;
  asunto: string;
  cuerpoTexto: string;
  cuerpoHtml: string;
  fecha?: Date;
}

export function generarEml({
  para,
  cc,
  asunto,
  cuerpoTexto,
  cuerpoHtml,
  fecha = new Date(),
}: DatosEml): string {
  const frontera = `----=_viandas_${Math.random().toString(36).slice(2, 12)}`;
  const copias = separarDirecciones(cc);

  const cabeceras = [
    "MIME-Version: 1.0",
    `Date: ${fecha.toUTCString()}`,
    `To: ${separarDirecciones(para).join(", ")}`,
    ...(copias.length ? [`Cc: ${copias.join(", ")}`] : []),
    `Subject: ${codificarCabecera(asunto)}`,
    // Sin esto Outlook lo abre como mensaje recibido en vez de borrador.
    "X-Unsent: 1",
    `Content-Type: multipart/alternative; boundary="${frontera}"`,
  ];

  const parteTexto = [
    `--${frontera}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EnLineas(cuerpoTexto),
  ];

  const parteHtml = [
    `--${frontera}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EnLineas(cuerpoHtml),
  ];

  return [
    ...cabeceras,
    "",
    ...parteTexto,
    "",
    ...parteHtml,
    "",
    `--${frontera}--`,
    "",
  ].join(CRLF);
}
