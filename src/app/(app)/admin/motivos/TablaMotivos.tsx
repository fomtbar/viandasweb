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
  actualizarMotivo,
  crearMotivo,
  eliminarMotivo,
  type Resultado,
} from "@/app/(app)/admin/acciones";

interface Motivo {
  id: number;
  texto: string;
  usos: number;
}

export function TablaMotivos({ motivos }: { motivos: Motivo[] }) {
  const [nuevo, setNuevo] = useState("");
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();
  const router = useRouter();

  function agregar() {
    iniciar(async () => {
      const resultado = await crearMotivo(nuevo);
      setEstado(resultado);
      if (resultado.ok) {
        setNuevo("");
        router.refresh();
      }
    });
  }

  return (
    <TablaCatalogo
      columnas={["Motivo", "Usos", ""]}
      encabezado={
        <div className="space-y-2">
          <p className="text-sm text-tinta-suave">
            Los motivos también se crean solos: cuando un GL escribe uno nuevo
            al generar un pedido, queda registrado acá. El orden del desplegable
            es por cantidad de usos.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1">
              <label
                htmlFor="motivo-nuevo"
                className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
              >
                Agregar motivo
              </label>
              <Entrada
                id="motivo-nuevo"
                value={nuevo}
                className="mt-1"
                onChange={(e) => setNuevo(e.target.value)}
              />
            </div>
            <Boton onClick={agregar} disabled={procesando || !nuevo.trim()}>
              Agregar
            </Boton>
          </div>
          <AvisoOperacion estado={estado} />
        </div>
      }
    >
      {motivos.map((m) => (
        <Fila
          key={m.id}
          motivo={m}
          onEliminado={(resultado) => {
            // El aviso se muestra ACA y no dentro de la fila: al refrescar, la
            // fila borrada se desmonta y se llevaria el mensaje con ella.
            setEstado(resultado);
            router.refresh();
          }}
        />
      ))}
    </TablaCatalogo>
  );
}

function Fila({
  motivo,
  onEliminado,
}: {
  motivo: Motivo;
  onEliminado: (resultado: Resultado) => void;
}) {
  const [texto, setTexto] = useState(motivo.texto);

  return (
    <tr data-testid={`motivo-${motivo.id}`} className="border-b border-linea last:border-0">
      <td className="px-3 py-1.5">
        <Entrada
          value={texto}
          aria-label={`Motivo ${motivo.texto}`}
          onChange={(e) => setTexto(e.target.value)}
        />
      </td>
      <td className="px-3 py-1.5 tabular text-tinta-suave">{motivo.usos}</td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-2">
          <BotonFila onGuardar={() => actualizarMotivo(motivo.id, texto)} />
          <BotonFila
            variante="peligro"
            etiqueta="Eliminar"
            confirmar={`¿Eliminar el motivo "${motivo.texto}"? Los pedidos ya generados conservan su texto.`}
            onGuardar={async () => {
              const r = await eliminarMotivo(motivo.id);
              if (r.ok) onEliminado(r);
              return r;
            }}
          />
        </div>
      </td>
    </tr>
  );
}
