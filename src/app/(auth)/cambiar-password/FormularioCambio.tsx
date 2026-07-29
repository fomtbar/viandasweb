"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { cambiarPassword, type EstadoCambio } from "./acciones";
import {
  Boton,
  CampoConEtiqueta,
  Entrada,
  ListaErrores,
  Panel,
} from "@/components/ui";
import { LARGO_MINIMO_PASSWORD } from "@/lib/validacion/esquemas";

const ESTADO_INICIAL: EstadoCambio = { errores: [] };

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" disabled={pending} className="w-full">
      {pending ? "Guardando…" : "Guardar contraseña"}
    </Boton>
  );
}

export function FormularioCambio({ forzado }: { forzado: boolean }) {
  const [estado, accion] = useActionState(cambiarPassword, ESTADO_INICIAL);

  return (
    <Panel className="p-6">
      <form action={accion} className="space-y-4">
        <ListaErrores errores={estado.errores} />

        <CampoConEtiqueta
          etiqueta="Contraseña actual"
          htmlFor="actual"
          ayuda={forzado ? "Es su número de legajo." : undefined}
        >
          <Entrada
            id="actual"
            name="actual"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
          />
        </CampoConEtiqueta>

        <CampoConEtiqueta
          etiqueta="Nueva contraseña"
          htmlFor="nueva"
          ayuda={`Mínimo ${LARGO_MINIMO_PASSWORD} caracteres. No puede ser su legajo.`}
        >
          <Entrada
            id="nueva"
            name="nueva"
            type="password"
            autoComplete="new-password"
            required
          />
        </CampoConEtiqueta>

        <CampoConEtiqueta etiqueta="Repetir nueva contraseña" htmlFor="confirmacion">
          <Entrada
            id="confirmacion"
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            required
          />
        </CampoConEtiqueta>

        <BotonGuardar />

        {/* Sin salida mientras el cambio sea obligatorio. */}
        {!forzado && (
          <Link
            href="/"
            className="block text-center text-sm text-acento hover:underline"
          >
            Cancelar
          </Link>
        )}
      </form>
    </Panel>
  );
}
