"use client";

import { useState } from "react";
import {
  Boton,
  CampoConEtiqueta,
  Entrada,
  ListaErrores,
} from "@/components/ui";
import type { ItemSeleccionado, OpcionSector } from "./tipos";

/**
 * Alta de una persona externa, ad hoc para este pedido.
 *
 * Igual que en la app Tkinter: NO se persiste en `empleados`, solo viaja en
 * pedido_items con es_externo=1. Sector y cargo aceptan texto libre porque
 * pueden no existir en los catalogos; vacios se guardan como "-".
 */
export function DialogoExterno({
  sectores,
  cargos,
  onAgregar,
  onCerrar,
}: {
  sectores: OpcionSector[];
  cargos: string[];
  onAgregar: (item: ItemSeleccionado) => void;
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [legajo, setLegajo] = useState("");
  const [sector, setSector] = useState("");
  const [cargo, setCargo] = useState("");
  const [errores, setErrores] = useState<string[]>([]);

  function confirmar() {
    const problemas: string[] = [];
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) problemas.push("Ingrese el apellido y nombre.");
    if (legajo.trim() && !/^\d+$/.test(legajo.trim())) {
      problemas.push("El legajo son solo números.");
    }
    if (problemas.length) {
      setErrores(problemas);
      return;
    }

    onAgregar({
      // crypto.randomUUID y no el id() de CPython que usaba la app Tkinter
      // (app.py:353), que podia reciclarse y colisionar entre externos.
      clave: `ext_${crypto.randomUUID()}`,
      legajo: legajo.trim() ? Number(legajo.trim()) : null,
      apellidoNombre: nombreLimpio,
      sectorNombre: sector.trim() || "-",
      cargoNombre: cargo.trim() || "-",
      esExterno: true,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Agregar persona externa"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCerrar();
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-linea bg-panel p-5 shadow-lg">
        <h2 className="text-base font-semibold">Agregar persona externa</h2>
        <p className="mt-1 text-xs text-tinta-suave">
          Para quien no figura en la nómina. Solo queda registrada en este pedido.
        </p>

        <div className="mt-4 space-y-3">
          <ListaErrores errores={errores} />

          <CampoConEtiqueta etiqueta="Apellido y nombre *" htmlFor="ext-nombre">
            <Entrada
              id="ext-nombre"
              value={nombre}
              autoFocus
              onChange={(e) => setNombre(e.target.value)}
            />
          </CampoConEtiqueta>

          <CampoConEtiqueta etiqueta="Legajo (opcional)" htmlFor="ext-legajo">
            <Entrada
              id="ext-legajo"
              value={legajo}
              inputMode="numeric"
              className="tabular"
              onChange={(e) => setLegajo(e.target.value)}
            />
          </CampoConEtiqueta>

          <CampoConEtiqueta
            etiqueta="Sector"
            htmlFor="ext-sector"
            ayuda="Puede elegir uno de la lista o escribir otro."
          >
            <Entrada
              id="ext-sector"
              list="lista-sectores"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            />
            <datalist id="lista-sectores">
              {sectores.map((s) => (
                <option key={s.id} value={s.nombre} />
              ))}
            </datalist>
          </CampoConEtiqueta>

          <CampoConEtiqueta etiqueta="Cargo" htmlFor="ext-cargo">
            <Entrada
              id="ext-cargo"
              list="lista-cargos"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
            />
            <datalist id="lista-cargos">
              {cargos.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </CampoConEtiqueta>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton onClick={confirmar}>Agregar</Boton>
        </div>
      </div>
    </div>
  );
}
