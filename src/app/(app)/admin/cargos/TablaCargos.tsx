"use client";

import { useState } from "react";
import { Alerta, Entrada } from "@/components/ui";
import { TablaCatalogo, BotonFila } from "@/components/admin/TablaCatalogo";
import { actualizarCargo } from "@/app/(app)/admin/acciones";

interface Cargo {
  id: number;
  codigo: string;
  descripcion: string | null;
  esLider: boolean;
  activo: boolean;
}

export function TablaCargos({ cargos }: { cargos: Cargo[] }) {
  return (
    <TablaCatalogo
      columnas={["Código", "Descripción", "Es líder (GL)", "Activo", ""]}
      encabezado={
        <Alerta tono="info">
          <strong>Es líder</strong> define el rol de GL de las cuentas que se
          creen a partir de ahora (al crear un usuario o al sincronizar la
          nómina). No cambia el rol de las cuentas que ya existen: eso se edita
          en Usuarios.
        </Alerta>
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
