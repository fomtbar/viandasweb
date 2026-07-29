import Link from "next/link";
import { requireGl } from "@/lib/auth/guards";
import { listarPedidos } from "@/server/pedidos";
import { Panel } from "@/components/ui";
import { EstadoPedido } from "@/components/historial/EstadoPedido";
import { formatearFechaDdMmYyyy, minutosAHhmm } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

/** Cabecera pegada arriba: el fondo y la línea van en el <th>, no en el <tr>. */
const ENCABEZADO =
  "bg-lienzo px-3 py-2 font-semibold shadow-[inset_0_-1px_0_var(--color-linea-fuerte)]";

export default async function PaginaHistorial() {
  const usuario = await requireGl();

  // El filtrado por rol lo hace la consulta, no la vista.
  const pedidos = await listarPedidos({
    legajo: usuario.legajo,
    esAdmin: usuario.esAdmin,
  });

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Historial de pedidos</h1>
        <p className="text-sm text-tinta-suave">
          {usuario.esAdmin
            ? `${pedidos.length} pedidos de toda la planta`
            : `${pedidos.length} pedidos generados por usted`}
        </p>
      </div>

      <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {pedidos.length === 0 ? (
          <p className="p-6 text-sm text-tinta-suave">
            Todavía no hay pedidos.{" "}
            <Link href="/" className="text-acento hover:underline">
              Generar el primero
            </Link>
            .
          </p>
        ) : (
          // Scroll interno para que la cabecera no se vaya: el historial es el
          // otro listado que crece sin techo (ver TablaCatalogo).
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs uppercase tracking-wide text-tinta-suave">
                  <th className={ENCABEZADO}>Nº</th>
                  <th className={ENCABEZADO}>Fecha</th>
                  <th className={ENCABEZADO}>Retiro</th>
                  <th className={ENCABEZADO}>Cant.</th>
                  {usuario.esAdmin && <th className={ENCABEZADO}>Solicitante</th>}
                  <th className={ENCABEZADO}>Motivo</th>
                  <th className={ENCABEZADO}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b border-linea last:border-0 hover:bg-lienzo ${
                      p.estado === "cancelado" ? "text-tinta-tenue" : ""
                    }`}
                  >
                    <td className="px-3 py-2 tabular">
                      <Link
                        href={`/historial/${p.id}`}
                        className="font-medium text-acento hover:underline"
                      >
                        {p.id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular">
                      {formatearFechaDdMmYyyy(p.fechaSolicitud)}
                    </td>
                    <td className="px-3 py-2 tabular">
                      {minutosAHhmm(p.retiroDesdeMin)}
                      {p.retiroHastaMin !== null &&
                        ` a ${minutosAHhmm(p.retiroHastaMin)}`}
                    </td>
                    <td className="px-3 py-2 tabular">{p.cantidadViandas}</td>
                    {usuario.esAdmin && (
                      <td className="px-3 py-2">{p.solicitante.apellidoNombre}</td>
                    )}
                    <td className="max-w-72 truncate px-3 py-2">{p.motivo}</td>
                    <td className="px-3 py-2">
                      <EstadoPedido estado={p.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
