"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Alerta, Boton } from "@/components/ui";
import type { Resultado } from "@/app/(app)/admin/acciones";

/**
 * Andamiaje comun de las grillas de administracion: cabecera, filas, y un
 * unico lugar donde se muestra el resultado de la ultima operacion.
 *
 * A diferencia de la app Tkinter (seleccionar fila -> editar en un panel
 * aparte -> Guardar), aca cada fila se edita en el lugar. Con 66 sectores el
 * ida y vuelta al panel era la mayor parte del trabajo.
 */
export function TablaCatalogo({
  columnas,
  children,
  encabezado,
}: {
  columnas: string[];
  children: ReactNode;
  encabezado?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      {encabezado}
      <div className="overflow-x-auto rounded-lg border border-linea bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linea-fuerte bg-lienzo text-left text-xs uppercase tracking-wide text-tinta-suave">
              {columnas.map((c) => (
                <th key={c} className="px-3 py-2 font-semibold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Botón de guardar de una fila, con el aviso de resultado al lado. */
export function BotonFila({
  onGuardar,
  etiqueta = "Guardar",
  variante = "secundario",
  confirmar,
}: {
  onGuardar: () => Promise<Resultado>;
  etiqueta?: string;
  variante?: "secundario" | "peligro";
  confirmar?: string;
}) {
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Boton
        variante={variante}
        disabled={procesando}
        onClick={() => {
          if (confirmar && !window.confirm(confirmar)) return;
          iniciar(async () => setEstado(await onGuardar()));
        }}
      >
        {procesando ? "…" : etiqueta}
      </Boton>
      {estado && (
        <span
          className={`text-xs ${estado.ok ? "text-exito" : "text-error"}`}
          role={estado.ok ? "status" : "alert"}
        >
          {estado.ok ? estado.mensaje : estado.error}
        </span>
      )}
    </div>
  );
}

export function AvisoOperacion({ estado }: { estado: Resultado | null }) {
  if (!estado) return null;
  return (
    <Alerta tono={estado.ok ? "exito" : "error"}>
      {estado.ok ? estado.mensaje : estado.error}
    </Alerta>
  );
}
