"use client";

import { useState } from "react";
import { Alerta, Boton } from "@/components/ui";
import { abrirMailto, construirMailto, separarDirecciones } from "@/lib/mail/mailto";

/**
 * Salidas cuando el pedido es demasiado grande para un mailto:.
 *
 * Windows corta la URL en 2.083 caracteres y Outlook alrededor de 2.048, los
 * dos SIN AVISAR: el correo se abriria con la lista de personas cortada por la
 * mitad. Por eso, en vez de intentarlo igual, se ofrecen tres caminos.
 */
export function ModalFallbackMail({
  pedidoId,
  cantidad,
  para,
  cc,
  asunto,
  cuerpo,
  permitirGmail,
  onResuelto,
  onCerrar,
}: {
  pedidoId: number;
  cantidad: number;
  para: string;
  cc: string;
  asunto: string;
  cuerpo: string;
  permitirGmail: boolean;
  onResuelto: (metodo: string) => void;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState<"no" | "si" | "manual">("no");

  async function copiarYAbrir() {
    let exito = false;
    try {
      // navigator.clipboard NO existe sirviendo por http://<ip>:3100 (exige
      // contexto seguro; localhost es la unica excepcion). En produccion, que
      // es exactamente ese caso, siempre cae al plan B.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(cuerpo);
        exito = true;
      }
    } catch {
      exito = false;
    }

    if (!exito) {
      // Plan B: textarea temporal + execCommand, que sigue andando sin HTTPS.
      const area = document.createElement("textarea");
      area.value = cuerpo;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try {
        exito = document.execCommand("copy");
      } catch {
        exito = false;
      }
      area.remove();
    }

    setCopiado(exito ? "si" : "manual");
    if (exito) {
      abrirMailto(construirMailto({ para, cc, asunto, cuerpo: "" }));
      onResuelto("portapapeles");
    }
  }

  function abrirGmail() {
    const url = new URL("https://mail.google.com/mail/");
    url.searchParams.set("view", "cm");
    url.searchParams.set("fs", "1");
    url.searchParams.set("to", separarDirecciones(para).join(","));
    if (separarDirecciones(cc).length) {
      url.searchParams.set("cc", separarDirecciones(cc).join(","));
    }
    url.searchParams.set("su", asunto);
    url.searchParams.set("body", cuerpo);
    window.open(url.toString(), "_blank", "noopener");
    onResuelto("gmail");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="El correo es demasiado largo"
    >
      <div className="w-full max-w-lg rounded-lg border border-linea bg-panel p-5 shadow-lg">
        <h2 className="text-base font-semibold">
          El pedido quedó demasiado largo para abrirlo directamente
        </h2>
        <p className="mt-2 text-sm text-tinta-suave">
          Son {cantidad} personas y Windows corta los correos abiertos así, sin
          avisar. El pedido <strong>ya quedó guardado</strong> (Nº {pedidoId});
          elegí cómo enviarlo.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded border border-acento/30 bg-acento-tenue p-3">
            <p className="text-sm font-semibold text-acento-fuerte">
              Descargar el borrador (recomendado)
            </p>
            <p className="mt-1 text-xs text-tinta-suave">
              Se baja un archivo .eml. Al abrirlo, Outlook lo muestra listo para
              enviar, con todo cargado y sin recortes.
            </p>
            <a
              href={`/api/pedidos/${pedidoId}/eml`}
              download
              onClick={() => onResuelto("eml")}
              className="mt-2 inline-flex items-center rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:bg-acento-fuerte"
            >
              Descargar borrador
            </a>
          </div>

          <div className="rounded border border-linea p-3">
            <p className="text-sm font-semibold">Copiar el texto y abrir el correo</p>
            <p className="mt-1 text-xs text-tinta-suave">
              Se abre el correo con destinatario y asunto, y el cuerpo se pega
              con Ctrl+V.
            </p>
            <Boton variante="secundario" className="mt-2" onClick={copiarYAbrir}>
              Copiar y abrir
            </Boton>
            {copiado === "si" && (
              <Alerta tono="exito" className="mt-2">
                Texto copiado. Pegalo con Ctrl+V en el cuerpo del correo.
              </Alerta>
            )}
            {copiado === "manual" && (
              <div className="mt-2 space-y-1">
                <Alerta tono="aviso">
                  El navegador no permitió copiar automáticamente. Seleccioná el
                  texto y copialo con Ctrl+C.
                </Alerta>
                <textarea
                  readOnly
                  value={cuerpo}
                  rows={6}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded border border-linea-fuerte p-2 font-mono text-xs"
                />
              </div>
            )}
          </div>

          {permitirGmail && (
            <div className="rounded border border-linea p-3">
              <p className="text-sm font-semibold">Abrir en Gmail</p>
              <p className="mt-1 text-xs text-tinta-suave">
                Se abre una pestaña con el mensaje armado.
              </p>
              <Boton variante="secundario" className="mt-2" onClick={abrirGmail}>
                Abrir en Gmail
              </Boton>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Boton variante="secundario" onClick={onCerrar}>
            Cerrar
          </Boton>
        </div>
      </div>
    </div>
  );
}
