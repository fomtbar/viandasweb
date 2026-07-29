"use client";

import { useState } from "react";
import { Entrada } from "@/components/ui";
import { TablaCatalogo, BotonFila } from "@/components/admin/TablaCatalogo";
import { actualizarSector } from "@/app/(app)/admin/acciones";

interface Sector {
  id: number;
  nombre: string;
  activo: boolean;
}

export function TablaSectores({ sectores }: { sectores: Sector[] }) {
  return (
    <TablaCatalogo
      columnas={["Nombre", "Activo", ""]}
      encabezado={
        <p className="text-sm text-tinta-suave">
          Un sector inactivo deja de aparecer en el filtro de la pantalla de
          pedido, pero los pedidos anteriores lo conservan.
        </p>
      }
    >
      {sectores.map((s) => (
        <Fila key={s.id} sector={s} />
      ))}
    </TablaCatalogo>
  );
}

function Fila({ sector }: { sector: Sector }) {
  const [nombre, setNombre] = useState(sector.nombre);
  const [activo, setActivo] = useState(sector.activo);

  return (
    <tr data-testid={`sector-${sector.id}`} className="border-b border-linea last:border-0">
      <td className="px-3 py-1.5">
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </td>
      <td className="px-3 py-1.5">
        <input
          type="checkbox"
          aria-label={`Sector ${sector.nombre} activo`}
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
        />
      </td>
      <td className="px-3 py-1.5">
        <BotonFila onGuardar={() => actualizarSector(sector.id, nombre, activo)} />
      </td>
    </tr>
  );
}
