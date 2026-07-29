"use client";

import { memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ItemSeleccionado } from "./tipos";

/**
 * Grilla de personal. Cada fila se marca haciendo clic en cualquier parte,
 * igual que el Treeview de la app Tkinter.
 *
 * Se virtualiza porque son 806 filas de 5 celdas: renderizarlas todas hace
 * que cada tecla del buscador se sienta lenta en las PCs de planta.
 */

const ALTO_FILA = 32;

export interface FilaPersona {
  clave: string;
  legajo: number | null;
  apellidoNombre: string;
  sectorNombre: string;
  cargoNombre: string;
  esExterno: boolean;
}

const Fila = memo(function Fila({
  fila,
  seleccionada,
  desplazamiento,
  onToggle,
}: {
  fila: FilaPersona;
  seleccionada: boolean;
  desplazamiento: number;
  onToggle: (clave: string) => void;
}) {
  return (
    <div
      role="row"
      aria-selected={seleccionada}
      onClick={() => onToggle(fila.clave)}
      style={{ transform: `translateY(${desplazamiento}px)`, height: ALTO_FILA }}
      className={[
        "absolute inset-x-0 top-0 flex cursor-pointer items-center gap-2 border-b border-linea px-2 text-sm",
        seleccionada ? "bg-exito-tenue" : "hover:bg-lienzo",
        fila.esExterno ? "text-aviso" : "",
      ].join(" ")}
    >
      <span className="w-6 shrink-0 text-center" aria-hidden>
        {seleccionada ? "✓" : ""}
      </span>
      <span className="w-16 shrink-0 tabular text-tinta-suave">
        {fila.legajo ?? "—"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {fila.apellidoNombre}
      </span>
      <span className="w-32 shrink-0 truncate text-tinta-suave">
        {fila.cargoNombre}
      </span>
      <span className="w-44 shrink-0 truncate text-tinta-suave">
        {fila.sectorNombre}
      </span>
      <span className="w-16 shrink-0 text-xs text-tinta-tenue">
        {fila.esExterno ? "Externo" : ""}
      </span>
    </div>
  );
});

export function SelectorPersonas({
  filas,
  seleccion,
  onToggle,
}: {
  filas: FilaPersona[];
  seleccion: Map<string, ItemSeleccionado>;
  onToggle: (clave: string) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);

  const virtualizador = useVirtualizer({
    count: filas.length,
    getScrollElement: () => contenedor.current,
    estimateSize: () => ALTO_FILA,
    overscan: 12,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Encabezado fijo, alineado con las columnas de las filas. */}
      <div
        role="row"
        className="flex items-center gap-2 border-b border-linea-fuerte bg-lienzo px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-tinta-suave"
      >
        <span className="w-6 shrink-0" />
        <span className="w-16 shrink-0">Legajo</span>
        <span className="min-w-0 flex-1">Apellido y nombre</span>
        <span className="w-32 shrink-0">Cargo</span>
        <span className="w-44 shrink-0">Sector</span>
        <span className="w-16 shrink-0">Tipo</span>
      </div>

      <div
        ref={contenedor}
        role="grid"
        aria-label="Personal"
        className="min-h-0 flex-1 overflow-auto"
      >
        {filas.length === 0 ? (
          <p className="p-4 text-sm text-tinta-suave">
            No hay personas que coincidan con el filtro.
          </p>
        ) : (
          <div
            style={{ height: virtualizador.getTotalSize() }}
            className="relative w-full"
          >
            {virtualizador.getVirtualItems().map((virtual) => {
              const fila = filas[virtual.index];
              return (
                <Fila
                  key={fila.clave}
                  fila={fila}
                  seleccionada={seleccion.has(fila.clave)}
                  desplazamiento={virtual.start}
                  onToggle={onToggle}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
