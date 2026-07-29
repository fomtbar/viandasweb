import Link from "next/link";
import { notFound } from "next/navigation";
import { requireGl } from "@/lib/auth/guards";
import { obtenerPedidoParaUsuario } from "@/server/pedidos";
import { Alerta, Boton, Panel } from "@/components/ui";
import { EstadoPedido } from "@/components/historial/EstadoPedido";
import { BotonCancelar } from "@/components/historial/BotonCancelar";
import {
  formatearFechaDdMmYyyy,
  formatearFechaHoraEnZona,
  minutosAHhmm,
} from "@/lib/tiempo";

export const dynamic = "force-dynamic";

export default async function PaginaDetallePedido({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await requireGl();
  const { id } = await params;
  const pedidoId = Number(id);
  if (!Number.isInteger(pedidoId)) notFound();

  // La pertenencia va dentro de la consulta. Si el pedido es de otro, no
  // aparece: se responde 404 y no 403, para no confirmar que existe.
  const pedido = await obtenerPedidoParaUsuario(pedidoId, {
    legajo: usuario.legajo,
    esAdmin: usuario.esAdmin,
  });
  if (!pedido) notFound();

  const cancelado = pedido.estado === "cancelado";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Pedido Nº {pedido.id}</h1>
          <EstadoPedido estado={pedido.estado} />
        </div>
        <Link href="/historial" className="text-sm text-acento hover:underline">
          ← Volver al historial
        </Link>
      </div>

      {cancelado && (
        <Alerta tono="aviso" titulo="Pedido cancelado">
          {pedido.canceladoPor
            ? `Cancelado por ${pedido.canceladoPor.apellidoNombre}`
            : "Cancelado"}
          {pedido.canceladoAt &&
            ` el ${formatearFechaHoraEnZona(pedido.canceladoAt)}`}
          .
          {pedido.cancelacionMotivo && ` Motivo: ${pedido.cancelacionMotivo}`}
        </Alerta>
      )}

      {pedido.estado === "borrador" && (
        <Alerta tono="aviso" titulo="Sin enviar">
          El pedido quedó guardado pero el correo nunca llegó a abrirse.
        </Alerta>
      )}

      {pedido.fueraDeVentanaOt && (
        <Alerta tono="aviso">
          El horario de retiro quedó fuera de las ventanas de overtime.
        </Alerta>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Datos del pedido
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Dato etiqueta="Fecha de solicitud">
              {formatearFechaDdMmYyyy(pedido.fechaSolicitud)}
            </Dato>
            <Dato etiqueta="Retiro">
              {minutosAHhmm(pedido.retiroDesdeMin)}
              {pedido.retiroHastaMin !== null &&
                ` a ${minutosAHhmm(pedido.retiroHastaMin)}`}
            </Dato>
            <Dato etiqueta="Solicitante">
              {pedido.solicitante.apellidoNombre} (legajo {pedido.solicitanteLegajo})
            </Dato>
            <Dato etiqueta="Cantidad">{pedido.cantidadViandas}</Dato>
            <Dato etiqueta="Motivo">{pedido.motivo}</Dato>
            <Dato etiqueta="Para">{pedido.destinatariosTo}</Dato>
            {pedido.destinatariosCc && (
              <Dato etiqueta="CC">{pedido.destinatariosCc}</Dato>
            )}
            <Dato etiqueta="Asunto">{pedido.asunto}</Dato>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-linea pt-4">
            <a href={`/api/pedidos/${pedido.id}/eml`} download>
              <Boton variante="secundario">Descargar borrador (.eml)</Boton>
            </a>
            {!cancelado && <BotonCancelar pedidoId={pedido.id} />}
          </div>
        </Panel>

        <Panel className="p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
            Personal que retira ({pedido.items.length})
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-linea text-left text-xs uppercase text-tinta-suave">
                  <th className="py-1.5 pr-2 font-semibold">Legajo</th>
                  <th className="py-1.5 pr-2 font-semibold">Apellido y nombre</th>
                  <th className="py-1.5 pr-2 font-semibold">Sector</th>
                  <th className="py-1.5 font-semibold">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {pedido.items.map((i) => (
                  <tr key={i.id} className="border-b border-linea last:border-0">
                    <td className="py-1.5 pr-2 tabular text-tinta-suave">
                      {i.legajo ?? "—"}
                    </td>
                    <td className="py-1.5 pr-2">{i.apellidoNombre}</td>
                    <td className="py-1.5 pr-2 text-tinta-suave">
                      {i.sectorNombre ?? "-"}
                    </td>
                    <td className="py-1.5 text-xs text-tinta-tenue">
                      {i.esExterno ? "Externo" : "Nómina"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">
          Cuerpo del correo
        </h2>
        {/* Se guarda tal como quedo al enviarlo. En la app Tkinter tambien se
            guardaba, pero no habia forma de volver a verlo. */}
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-lienzo p-3 font-mono text-xs">
          {pedido.cuerpo}
        </pre>
      </Panel>
    </div>
  );
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-36 shrink-0 text-tinta-suave">{etiqueta}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}
