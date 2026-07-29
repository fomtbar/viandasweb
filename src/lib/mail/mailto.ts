/**
 * Armado del enlace mailto: y control de su limite de tamano.
 *
 * El limite es el problema central de esta pantalla. Medido sobre los datos
 * reales: el cuerpo mas largo guardado es de 752 caracteres para 3 personas.
 * La cabecera fija son ~430 y cada persona suma ~55. Despues de codificar la
 * URL el texto crece alrededor de 1,5x (cada salto de linea pasa a %0D%0A).
 *
 *   3 personas  -> ~1.150 caracteres   ok
 *   8 personas  -> ~1.600              al limite
 *  12 personas  -> ~1.950              se trunca
 *  30 personas  -> ~3.500              inservible
 *
 * Los topes duros: ShellExecute de Windows corta en 2.083 y Outlook alrededor
 * de 2.048, ambos SIN AVISAR. Por eso se mide antes de intentar abrirlo.
 */

export const LIMITE_MAILTO = 1800;

/** Umbral a partir del cual conviene avisar que el mail va a quedar largo. */
export const UMBRAL_AVISO_MAILTO = Math.floor(LIMITE_MAILTO * 0.85);

export interface DatosMail {
  para: string;
  cc?: string;
  asunto: string;
  cuerpo: string;
}

/** Separa una lista de direcciones escrita con ';' o ','. */
export function separarDirecciones(texto: string | undefined | null): string[] {
  return (texto ?? "")
    .split(/[;,]/)
    .map((d) => d.trim())
    .filter(Boolean);
}

export function construirMailto({ para, cc, asunto, cuerpo }: DatosMail): string {
  const destinatarios = separarDirecciones(para).map(encodeURIComponent).join(",");

  const parametros = new URLSearchParams();
  const copias = separarDirecciones(cc);
  if (copias.length) parametros.set("cc", copias.join(","));
  parametros.set("subject", asunto);
  // CRLF: varios clientes de Windows colapsan el cuerpo en una sola linea si
  // solo reciben \n.
  parametros.set("body", cuerpo.replace(/\r?\n/g, "\r\n"));

  // URLSearchParams codifica el espacio como '+', que en el cuerpo de un
  // mailto: aparece literalmente como signo mas.
  const query = parametros.toString().replace(/\+/g, "%20");

  return `mailto:${destinatarios}?${query}`;
}

export function excedeLimite(url: string): boolean {
  return url.length > LIMITE_MAILTO;
}

/**
 * Abre el cliente de correo. Tiene que invocarse DENTRO del gesto del usuario.
 *
 * Se usa un <a> temporal y no window.open (los bloqueadores de ventanas
 * emergentes lo cancelan) ni location.href (deja la pagina en estado de
 * "navegando" en algunos navegadores).
 */
export function abrirMailto(url: string): void {
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.rel = "noopener";
  enlace.style.display = "none";
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}
