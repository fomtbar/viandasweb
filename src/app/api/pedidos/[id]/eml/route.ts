import { NextResponse } from "next/server";
import { requireGl } from "@/lib/auth/guards";
import { obtenerPedidoParaUsuario } from "@/server/pedidos";
import { resolverPreferencias } from "@/server/preferencias";
import { generarEml } from "@/lib/mail/eml";
import { armarCuerpoHtml, type ContextoMail } from "@/lib/mail/constructor";
import { formatearFechaDdMmYyyy } from "@/lib/tiempo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Descarga el pedido como borrador .eml.
 *
 * Es la salida cuando el mailto: se pasa del limite de Windows. Outlook abre
 * el archivo en modo redaccion (gracias a X-Unsent) con todo cargado y sin
 * limite de tamano.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const usuario = await requireGl();
  const { id } = await params;
  const pedidoId = Number(id);

  if (!Number.isInteger(pedidoId)) {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // La pertenencia va dentro de la consulta: un GL no puede bajarse el
  // borrador de un pedido ajeno cambiando el numero de la URL.
  const pedido = await obtenerPedidoParaUsuario(pedidoId, {
    legajo: usuario.legajo,
    esAdmin: usuario.esAdmin,
  });
  if (!pedido) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  const prefs = await resolverPreferencias(usuario.id);

  const contexto: ContextoMail = {
    fecha: formatearFechaDdMmYyyy(pedido.fechaSolicitud),
    retiroDesdeMin: pedido.retiroDesdeMin,
    retiroHastaMin: pedido.retiroHastaMin,
    motivo: pedido.motivo,
    solicitante: {
      legajo: pedido.solicitanteLegajo,
      apellidoNombre: pedido.solicitante.apellidoNombre,
      cargo:
        usuario.empleado.cargo?.descripcion ?? usuario.empleado.cargo?.codigo ?? "",
      sector: (usuario.sectorDefault ?? usuario.empleado.sector)?.nombre ?? "",
    },
    personas: pedido.items.map((i) => ({
      legajo: i.legajo,
      apellidoNombre: i.apellidoNombre,
      sectorNombre: i.sectorNombre ?? "-",
    })),
  };

  const eml = generarEml({
    para: pedido.destinatariosTo,
    cc: pedido.destinatariosCc ?? undefined,
    asunto: pedido.asunto,
    // El cuerpo de texto es el que el GL dejo guardado (pudo editarlo).
    cuerpoTexto: pedido.cuerpo,
    cuerpoHtml: armarCuerpoHtml(
      contexto,
      prefs.mail_body_template,
      prefs.mail_lista_formato === "texto" ? "texto" : "tabla",
    ),
    fecha: pedido.creadoAt,
  });

  return new NextResponse(eml, {
    headers: {
      "Content-Type": "message/rfc822; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedido-${pedido.id}.eml"`,
      "Cache-Control": "no-store",
    },
  });
}
