import "server-only";
import { prisma } from "@/lib/prisma";
import { registrarUsoMotivo } from "./motivos";

/** Equivale a src/repos/pedidos.py. */

export interface DatosNuevoPedido {
  fechaSolicitud: Date;
  retiroDesdeMin: number;
  retiroHastaMin: number | null;
  solicitanteLegajo: number;
  motivo: string;
  destinatariosTo: string;
  destinatariosCc: string | null;
  asunto: string;
  cuerpo: string;
  fueraDeVentanaOt: boolean;
  items: {
    legajo: number | null;
    apellidoNombre: string;
    sectorNombre: string;
    cargoNombre: string;
    esExterno: boolean;
  }[];
}

/**
 * Crea el pedido, sus items y el uso del motivo en UNA sola transaccion.
 *
 * En la app Tkinter el registro del motivo corria fuera de la transaccion
 * (motivos.py:16), asi que un pedido que fallaba dejaba igual el motivo creado
 * y el contador de usos incrementado.
 *
 * Nace en estado 'borrador' y pasa a 'enviado' cuando el navegador confirma
 * que abrio el correo. La version original guardaba 'enviado' antes de
 * intentar el envio, asi que el historial mentia si el mail nunca se abria.
 */
export async function crearPedidoEnBorrador(datos: DatosNuevoPedido) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedido.create({
      data: {
        fechaSolicitud: datos.fechaSolicitud,
        retiroDesdeMin: datos.retiroDesdeMin,
        retiroHastaMin: datos.retiroHastaMin,
        solicitanteLegajo: datos.solicitanteLegajo,
        cantidadViandas: datos.items.length,
        motivo: datos.motivo,
        destinatariosTo: datos.destinatariosTo,
        destinatariosCc: datos.destinatariosCc,
        asunto: datos.asunto,
        cuerpo: datos.cuerpo,
        estado: "borrador",
        metodoEnvio: "mailto",
        fueraDeVentanaOt: datos.fueraDeVentanaOt,
      },
    });

    await tx.pedidoItem.createMany({
      data: datos.items.map((i) => ({ pedidoId: pedido.id, ...i })),
    });

    await registrarUsoMotivo(tx, datos.motivo);

    return pedido;
  });
}

/**
 * Marca el pedido como efectivamente despachado.
 * El `where` incluye la pertenencia: no alcanza con conocer el id.
 */
export async function marcarEnviado(
  id: number,
  metodo: string,
  legajoSolicitante: number | null,
) {
  const { count } = await prisma.pedido.updateMany({
    where: {
      id,
      estado: "borrador",
      ...(legajoSolicitante === null ? {} : { solicitanteLegajo: legajoSolicitante }),
    },
    data: { estado: "enviado", metodoEnvio: metodo },
  });
  return count > 0;
}

export interface UsuarioParaConsulta {
  legajo: number;
  esAdmin: boolean;
}

/** Un GL ve solo los suyos; el admin, todos. */
export function listarPedidos(usuario: UsuarioParaConsulta) {
  return prisma.pedido.findMany({
    where: usuario.esAdmin ? {} : { solicitanteLegajo: usuario.legajo },
    include: { solicitante: { select: { apellidoNombre: true } } },
    orderBy: { creadoAt: "desc" },
  });
}

/**
 * Detalle de un pedido.
 *
 * DEUDA QUE CIERRA (IDOR): la app Tkinter traia TODOS los pedidos y filtraba
 * por id en el cliente (historial.py:119). En web eso seria acceder al pedido
 * de cualquiera con solo cambiar el numero en la URL. Aca la pertenencia va
 * dentro del `where`, no en un `if` posterior.
 */
export function obtenerPedidoParaUsuario(id: number, usuario: UsuarioParaConsulta) {
  return prisma.pedido.findFirst({
    where: {
      id,
      ...(usuario.esAdmin ? {} : { solicitanteLegajo: usuario.legajo }),
    },
    include: {
      items: { orderBy: { id: "asc" } },
      solicitante: { select: { apellidoNombre: true } },
      canceladoPor: { select: { apellidoNombre: true } },
    },
  });
}

/**
 * Cancela un pedido dejando registro de quien y cuando.
 *
 * El estado previo va en el `where`: asi dos pestanas abiertas no pueden
 * cancelar dos veces, y se puede distinguir "no existe" de "ya estaba
 * cancelado" segun el count. La version original no controlaba ni el rol ni
 * el estado, y no guardaba nada de la cancelacion.
 */
export async function cancelarPedido(
  id: number,
  usuario: UsuarioParaConsulta,
  motivo: string | null,
) {
  const { count } = await prisma.pedido.updateMany({
    where: {
      id,
      estado: { not: "cancelado" },
      ...(usuario.esAdmin ? {} : { solicitanteLegajo: usuario.legajo }),
    },
    data: {
      estado: "cancelado",
      canceladoAt: new Date(),
      canceladoPorLegajo: usuario.legajo,
      cancelacionMotivo: motivo,
    },
  });
  return count > 0;
}
