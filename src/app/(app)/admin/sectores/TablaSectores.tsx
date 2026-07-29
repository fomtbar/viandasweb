"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Entrada } from "@/components/ui";
import {
  TablaCatalogo,
  BotonFila,
  AvisoOperacion,
} from "@/components/admin/TablaCatalogo";
import {
  actualizarSector,
  crearSector,
  type Resultado,
} from "@/app/(app)/admin/acciones";

interface Sector {
  id: number;
  nombre: string;
  activo: boolean;
}

export function TablaSectores({ sectores }: { sectores: Sector[] }) {
  const [nuevo, setNuevo] = useState("");
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();
  const router = useRouter();

  function agregar() {
    iniciar(async () => {
      const resultado = await crearSector(nuevo);
      setEstado(resultado);
      if (resultado.ok) {
        setNuevo("");
        router.refresh();
      }
    });
  }

  return (
    <TablaCatalogo
      columnas={["Nombre", "Activo", ""]}
      encabezado={
        <div className="space-y-2">
          <p className="text-sm text-tinta-suave">
            Un sector inactivo deja de aparecer en el filtro de la pantalla de
            pedido, pero los pedidos anteriores lo conservan.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <label
                htmlFor="sector-nuevo"
                className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
              >
                Agregar sector
              </label>
              <Entrada
                id="sector-nuevo"
                value={nuevo}
                maxLength={120}
                className="mt-1"
                onChange={(e) => setNuevo(e.target.value)}
              />
            </div>
            <Boton onClick={agregar} disabled={procesando || !nuevo.trim()}>
              {procesando ? "Agregando…" : "Agregar"}
            </Boton>
          </div>
          <AvisoOperacion estado={estado} />
        </div>
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
