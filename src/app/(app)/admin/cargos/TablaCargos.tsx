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
  actualizarCargo,
  crearCargo,
  type Resultado,
} from "@/app/(app)/admin/acciones";

interface Cargo {
  id: number;
  codigo: string;
  descripcion: string | null;
  esLider: boolean;
  activo: boolean;
}

export function TablaCargos({ cargos }: { cargos: Cargo[] }) {
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [esLider, setEsLider] = useState(false);
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();
  const router = useRouter();

  function agregar() {
    iniciar(async () => {
      const resultado = await crearCargo(codigo, descripcion, esLider);
      setEstado(resultado);
      if (resultado.ok) {
        setCodigo("");
        setDescripcion("");
        setEsLider(false);
        router.refresh();
      }
    });
  }

  return (
    <TablaCatalogo
      columnas={["Código", "Descripción", "Es líder (GL)", "Activo", ""]}
      encabezado={
        <div className="space-y-2">
          <Alerta tono="info">
            <strong>Es líder</strong> define el rol de GL de las cuentas que se
            creen a partir de ahora (al crear un usuario o al sincronizar la
            nómina). No cambia el rol de las cuentas que ya existen: eso se
            edita en Usuarios.
          </Alerta>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <label
                htmlFor="cargo-codigo"
                className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
              >
                Código
              </label>
              <Entrada
                id="cargo-codigo"
                value={codigo}
                maxLength={30}
                className="mt-1 font-mono"
                onChange={(e) => setCodigo(e.target.value)}
              />
            </div>
            <div className="min-w-56 flex-1">
              <label
                htmlFor="cargo-descripcion"
                className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
              >
                Descripción
              </label>
              <Entrada
                id="cargo-descripcion"
                value={descripcion}
                maxLength={120}
                className="mt-1"
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={esLider}
                onChange={(e) => setEsLider(e.target.checked)}
              />
              Es líder
            </label>
            <Boton onClick={agregar} disabled={procesando || !codigo.trim()}>
              {procesando ? "Agregando…" : "Agregar"}
            </Boton>
          </div>
          {/* El codigo se pasa a mayusculas en el servidor: es la clave del
              catalogo y despues no se puede editar. */}
          <AvisoOperacion estado={estado} />
        </div>
      }
    >
      {cargos.map((c) => (
        <Fila key={c.id} cargo={c} />
      ))}
    </TablaCatalogo>
  );
}

function Fila({ cargo }: { cargo: Cargo }) {
  const [descripcion, setDescripcion] = useState(cargo.descripcion ?? "");
  const [esLider, setEsLider] = useState(cargo.esLider);
  const [activo, setActivo] = useState(cargo.activo);

  return (
    <tr data-testid={`cargo-${cargo.codigo}`} className="border-b border-linea last:border-0">
      {/* El codigo es la clave del catalogo importado: no se edita. */}
      <td className="px-3 py-1.5 font-mono text-xs">{cargo.codigo}</td>
      <td className="px-3 py-1.5">
        <Entrada
          value={descripcion}
          aria-label={`Descripción de ${cargo.codigo}`}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          aria-label={`${cargo.codigo} es líder`}
          checked={esLider}
          onChange={(e) => setEsLider(e.target.checked)}
        />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          aria-label={`${cargo.codigo} activo`}
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
      </td>
      <td className="px-3 py-1.5">
        <BotonFila
          onGuardar={() => actualizarCargo(cargo.id, descripcion, esLider, activo)}
        />
      </td>
    </tr>
  );
}
