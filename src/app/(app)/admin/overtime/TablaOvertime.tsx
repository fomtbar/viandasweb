"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alerta, Boton, Entrada } from "@/components/ui";
import {
  TablaCatalogo,
  BotonFila,
  AvisoOperacion,
} from "@/components/admin/TablaCatalogo";
import {
  actualizarVentanaOt,
  crearVentanaOt,
  type Resultado,
} from "@/app/(app)/admin/acciones";

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
  const vacia = { orden: "", otPrevio: "", turnoHorario: "", otPosterior: "" };
  const [nueva, setNueva] = useState(vacia);
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();
  const router = useRouter();

  function cambiar(campo: keyof typeof vacia, valor: string) {
    setNueva((n) => ({ ...n, [campo]: valor }));
  }

  function agregar() {
    iniciar(async () => {
      const resultado = await crearVentanaOt({
        orden: Number(nueva.orden) || 0,
        otPrevio: nueva.otPrevio,
        turnoHorario: nueva.turnoHorario,
        otPosterior: nueva.otPosterior,
      });
      setEstado(resultado);
      if (resultado.ok) {
        setNueva(vacia);
        router.refresh();
      }
    });
  }

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

          <div className="flex flex-wrap items-end gap-2">
            <CampoAlta
              id="ventana-orden"
              etiqueta="Orden"
              ancho="w-24"
              valor={nueva.orden}
              onChange={(v) => cambiar("orden", v)}
            />
            <CampoAlta
              id="ventana-previo"
              etiqueta="OT previo"
              valor={nueva.otPrevio}
              onChange={(v) => cambiar("otPrevio", v)}
            />
            <CampoAlta
              id="ventana-turno"
              etiqueta="Horario del turno"
              valor={nueva.turnoHorario}
              onChange={(v) => cambiar("turnoHorario", v)}
            />
            <CampoAlta
              id="ventana-posterior"
              etiqueta="OT posterior"
              valor={nueva.otPosterior}
              onChange={(v) => cambiar("otPosterior", v)}
            />
            <Boton
              onClick={agregar}
              disabled={
                procesando ||
                (!nueva.otPrevio.trim() && !nueva.otPosterior.trim())
              }
            >
              {procesando ? "Agregando…" : "Agregar ventana"}
            </Boton>
          </div>
          <AvisoOperacion estado={estado} />
        </div>
      }
    >
      {ventanas.map((v) => (
        <Fila key={v.id} ventana={v} />
      ))}
    </TablaCatalogo>
  );
}

/** Campo del formulario de alta. Son cuatro y todos se ven igual. */
function CampoAlta({
  id,
  etiqueta,
  valor,
  onChange,
  ancho = "min-w-40 flex-1",
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  ancho?: string;
}) {
  return (
    <div className={ancho}>
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
      >
        {etiqueta}
      </label>
      <Entrada
        id={id}
        value={valor}
        maxLength={40}
        className="mt-1"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
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
