"use client";

import { useState } from "react";
import { Alerta, Entrada } from "@/components/ui";
import { TablaCatalogo, BotonFila } from "@/components/admin/TablaCatalogo";
import { actualizarVentanaOt } from "@/app/(app)/admin/acciones";

interface Ventana {
  id: number;
  orden: number;
  otPrevio: string;
  turnoHorario: string;
  otPosterior: string;
  activo: boolean;
  previoLegible: boolean;
  posteriorLegible: boolean;
}

const MODOS: Record<string, string> = {
  off: "sin validar",
  advertir: "avisando, sin bloquear",
  bloquear: "pidiendo confirmación",
};

/**
 * Ventanas de overtime.
 *
 * Estos datos venian del Excel original y estaban en la base desde el
 * principio, pero NINGUNA pantalla de la app Tkinter los usaba. Acá pasan a
 * validar de verdad el horario de retiro.
 */
export function TablaOvertime({
  ventanas,
  modo,
}: {
  ventanas: Ventana[];
  modo: string;
}) {
  return (
    <TablaCatalogo
      columnas={["Orden", "OT previo", "Horario del turno", "OT posterior", "Activa", ""]}
      encabezado={
        <div className="space-y-2">
          <p className="text-sm text-tinta-suave">
            Franjas en las que se admite el retiro. Formato{" "}
            <code className="rounded bg-lienzo px-1 text-xs">6:00 A 14:34</code>.
            Se admiten franjas que cruzan la medianoche, como{" "}
            <code className="rounded bg-lienzo px-1 text-xs">23:13 A 2:34</code>.
          </p>
          <Alerta tono="info">
            Hoy la validación está <strong>{MODOS[modo] ?? modo}</strong>. Se
            cambia en Preferencias.
          </Alerta>
        </div>
      }
    >
      {ventanas.map((v) => (
        <Fila key={v.id} ventana={v} />
      ))}
    </TablaCatalogo>
  );
}

function Fila({ ventana }: { ventana: Ventana }) {
  const [orden, setOrden] = useState(String(ventana.orden));
  const [previo, setPrevio] = useState(ventana.otPrevio);
  const [turno, setTurno] = useState(ventana.turnoHorario);
  const [posterior, setPosterior] = useState(ventana.otPosterior);
  const [activo, setActivo] = useState(ventana.activo);

  return (
    <tr data-testid={`ventana-${ventana.orden}`} className="border-b border-linea last:border-0">
      <td className="w-20 px-3 py-1.5">
        <Entrada
          value={orden}
          inputMode="numeric"
          aria-label={`Orden de la ventana ${ventana.id}`}
          className="tabular"
          onChange={(e) => setOrden(e.target.value)}
        />
      </td>
      <td className="px-3 py-1.5">
        <Entrada
          value={previo}
          aria-label={`OT previo de la ventana ${ventana.orden}`}
          onChange={(e) => setPrevio(e.target.value)}
        />
        {previo.trim() && !ventana.previoLegible && (
          <p className="mt-0.5 text-xs text-error">No se entiende este horario.</p>
        )}
      </td>
      <td className="px-3 py-1.5">
        {/* Informativo: no participa de la validacion del retiro. */}
        <Entrada
          value={turno}
          aria-label={`Horario del turno ${ventana.orden}`}
          onChange={(e) => setTurno(e.target.value)}
        />
      </td>
      <td className="px-3 py-1.5">
        <Entrada
          value={posterior}
          aria-label={`OT posterior de la ventana ${ventana.orden}`}
          onChange={(e) => setPosterior(e.target.value)}
        />
        {posterior.trim() && !ventana.posteriorLegible && (
          <p className="mt-0.5 text-xs text-error">No se entiende este horario.</p>
        )}
      </td>
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          aria-label={`Ventana ${ventana.orden} activa`}
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
      </td>
      <td className="px-3 py-1.5">
        <BotonFila
          onGuardar={() =>
            actualizarVentanaOt({
              id: ventana.id,
              orden: Number(orden) || 0,
              otPrevio: previo,
              turnoHorario: turno,
              otPosterior: posterior,
              activo,
            })
          }
        />
      </td>
    </tr>
  );
}
