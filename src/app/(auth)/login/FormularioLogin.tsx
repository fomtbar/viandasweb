"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { iniciarSesion, type EstadoLogin } from "./acciones";
import {
  Boton,
  CampoConEtiqueta,
  Entrada,
  ListaErrores,
  Panel,
} from "@/components/ui";

const ESTADO_INICIAL: EstadoLogin = { errores: [] };

function BotonIngresar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" disabled={pending} className="w-full">
      {pending ? "Ingresando…" : "Ingresar"}
    </Boton>
  );
}

export function FormularioLogin({ destino }: { destino?: string }) {
  const [estado, accion] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    <Panel className="p-6">
      <form action={accion} className="space-y-4">
        <input type="hidden" name="next" value={destino ?? ""} />
        <ListaErrores errores={estado.errores} />

        <CampoConEtiqueta etiqueta="Legajo" htmlFor="legajo">
          <Entrada
            id="legajo"
            name="legajo"
            inputMode="numeric"
            autoComplete="username"
            autoFocus
            required
            defaultValue={estado.legajo}
            className="tabular"
          />
        </CampoConEtiqueta>

        <CampoConEtiqueta
          etiqueta="Contraseña"
          htmlFor="password"
          ayuda="Si es su primer ingreso, la contraseña es su número de legajo."
        >
          <Entrada
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </CampoConEtiqueta>

        <BotonIngresar />
      </form>
    </Panel>
  );
}
