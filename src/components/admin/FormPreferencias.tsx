"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  Alerta,
  AreaTexto,
  Boton,
  CampoConEtiqueta,
  Entrada,
  ListaErrores,
  Seleccion,
} from "@/components/ui";
import {
  PREFS,
  type ClavePref,
  type DefinicionPref,
  type Rol,
} from "@/lib/prefs/registro";
import type { EstadoPrefs } from "@/app/(app)/config/acciones";

const INICIAL: EstadoPrefs = { ok: false };

function BotonGuardar() {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </Boton>
  );
}

/**
 * Formulario de preferencias.
 *
 * Los campos que el rol no puede editar se muestran deshabilitados, pero eso
 * es solo comodidad visual: quien decide de verdad es filtrarPorRol en el
 * servidor. Quitar el `disabled` desde el navegador no cambia nada.
 */
export function FormPreferencias({
  claves,
  valores,
  rol,
  accion,
}: {
  claves: ClavePref[];
  valores: Record<string, string>;
  rol: Rol;
  accion: (previo: EstadoPrefs, formData: FormData) => Promise<EstadoPrefs>;
}) {
  const [estado, enviar] = useActionState(accion, INICIAL);

  return (
    <form action={enviar} className="space-y-4">
      {estado.ok && estado.mensaje && <Alerta tono="exito">{estado.mensaje}</Alerta>}
      {estado.avisos?.map((a) => (
        <Alerta key={a} tono="aviso">
          {a}
        </Alerta>
      ))}
      <ListaErrores errores={estado.errores ?? []} />

      {claves.map((clave) => {
        // PREFS se declara con `as const satisfies`, asi que cada entrada tiene
        // tipos literales y no expone las propiedades opcionales que no
        // declara. Se ensancha al tipo comun para poder recorrerlas.
        const def: DefinicionPref = PREFS[clave];
        const editable = def.editablePor.includes(rol);
        const valor = valores[clave] ?? def.valorDefault;
        const id = `pref-${clave}`;

        return (
          <CampoConEtiqueta
            key={clave}
            etiqueta={def.etiqueta}
            htmlFor={id}
            ayuda={
              editable
                ? def.ayuda
                : `${def.ayuda ? `${def.ayuda} ` : ""}(solo un administrador puede modificarlo)`
            }
          >
            {def.tipo === "textoLargo" ? (
              <AreaTexto
                id={id}
                name={clave}
                rows={12}
                defaultValue={valor}
                disabled={!editable}
                className="font-mono text-xs"
              />
            ) : def.tipo === "opcion" ? (
              <Seleccion id={id} name={clave} defaultValue={valor} disabled={!editable}>
                {def.opciones?.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Seleccion>
            ) : def.tipo === "booleano" ? (
              <>
                {/* Un checkbox sin marcar no viaja en el form; este campo
                    oculto permite distinguir "false" de "no vino". */}
                <input type="hidden" name={`__presente_${clave}`} value="1" />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    id={id}
                    type="checkbox"
                    name={clave}
                    value="true"
                    defaultChecked={valor === "true"}
                    disabled={!editable}
                  />
                  Habilitado
                </label>
              </>
            ) : (
              <Entrada
                id={id}
                name={clave}
                type={def.tipo === "entero" ? "number" : "text"}
                defaultValue={valor}
                disabled={!editable}
              />
            )}
          </CampoConEtiqueta>
        );
      })}

      <BotonGuardar />
    </form>
  );
}
