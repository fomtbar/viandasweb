"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alerta, AreaTexto, Boton, CampoConEtiqueta } from "@/components/ui";
import { cancelar } from "@/app/(app)/historial/acciones";

export function BotonCancelar({ pedidoId }: { pedidoId: number }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [procesando, iniciar] = useTransition();
  const router = useRouter();

  function confirmar() {
    setError(null);
    iniciar(async () => {
      const resultado = await cancelar(pedidoId, motivo);
      if (!resultado.ok) {
        setError(resultado.error ?? "No se pudo cancelar el pedido.");
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  if (!abierto) {
    return (
      <Boton variante="peligro" onClick={() => setAbierto(true)}>
        Cancelar pedido
      </Boton>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cancelar pedido"
    >
      <div className="w-full max-w-md rounded-lg border border-linea bg-panel p-5 shadow-lg">
        <h2 className="text-base font-semibold">Cancelar el pedido Nº {pedidoId}</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Queda registrado quién lo cancela y cuándo. El correo que ya se haya
          enviado no se retira: avisá por otro medio si hace falta.
        </p>

        <div className="mt-4 space-y-3">
          {error && <Alerta tono="error">{error}</Alerta>}
          <CampoConEtiqueta
            etiqueta="Motivo de la cancelación"
            htmlFor="motivo-cancelacion"
            ayuda="Opcional, pero ayuda a entender el historial."
          >
            <AreaTexto
              id="motivo-cancelacion"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </CampoConEtiqueta>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Boton
            variante="secundario"
            onClick={() => setAbierto(false)}
            disabled={procesando}
          >
            Volver
          </Boton>
          <Boton variante="peligro" onClick={confirmar} disabled={procesando}>
            {procesando ? "Cancelando…" : "Confirmar cancelación"}
          </Boton>
        </div>
      </div>
    </div>
  );
}
