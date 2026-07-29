"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireGl } from "@/lib/auth/guards";
import {
  crearPedidoEnBorrador,
  marcarEnviado,
} from "@/server/pedidos";
import { obtenerVentanasValidables } from "@/server/overtime";
import { resolverPreferencias } from "@/server/preferencias";
import { validarRetiro } from "@/lib/overtime/validar";
import {
  armarAsunto,
  armarCuerpoTexto,
  type ContextoMail,
} from "@/lib/mail/constructor";
import {
  duracionRango,
  formatearFechaDdMmYyyy,
  hoyEnZona,
  parseFechaIso,
} from "@/lib/tiempo";

const EsquemaItem = z.object({
  legajo: z.number().int().positive().nullable(),
  apellidoNombre: z.string().trim().min(1).max(150),
  sectorNombre: z.string().trim().max(120),
  cargoNombre: z.string().trim().max(120),
  esExterno: z.boolean(),
});

const EsquemaCrearPedido = z.object({
  fechaIso: z.string(),
  retiroDesdeMin: z.number().int().min(0).max(1439).nullable(),
  usaRango: z.boolean(),
  retiroHastaMin: z.number().int().min(0).max(1439).nullable(),
  motivo: z.string().max(200),
  destinatariosTo: z.string().max(500),
  destinatariosCc: z.string().max(500),
  asunto: z.string().max(300),
  cuerpo: z.string(),
  items: z.array(EsquemaItem).max(500),
  confirmoFueraDeVentana: z.boolean().optional(),
});

export interface ResultadoCrearPedido {
  ok: boolean;
  errores: string[];
  pedidoId?: number;
  /** Aviso no bloqueante cuando el retiro cae fuera de ventana de overtime. */
  avisoOt?: string | null;
  /** true cuando el modo de validacion exige confirmar explicitamente. */
  requiereConfirmacion?: boolean;
}

export async function crearPedido(entrada: unknown): Promise<ResultadoCrearPedido> {
  const usuario = await requireGl();

  const parseado = EsquemaCrearPedido.safeParse(entrada);
  if (!parseado.success) {
    return { ok: false, errores: ["Los datos del pedido no son válidos."] };
  }
  const datos = parseado.data;

  // ── Validacion acumulada ──
  // Todos los problemas juntos y no de a uno, como el messagebox unico de la
  // app Tkinter (app.py:411-438).
  const errores: string[] = [];

  if (datos.items.length === 0) {
    errores.push("No hay personas marcadas para retirar.");
  }
  if (datos.retiroDesdeMin === null) {
    errores.push("Hora 'Desde' inválida (use HH:MM).");
  }
  if (datos.usaRango && datos.retiroHastaMin === null) {
    errores.push("Hora 'Hasta' inválida (use HH:MM).");
  }
  if (!datos.destinatariosTo.trim()) {
    errores.push("Falta el destinatario (Para).");
  }
  if (!datos.motivo.trim()) {
    errores.push("Ingrese un motivo.");
  }

  const fecha = parseFechaIso(datos.fechaIso);
  if (!fecha) errores.push("La fecha de solicitud no es válida.");

  // NUEVO: la app original no validaba la coherencia del rango.
  if (datos.retiroDesdeMin !== null && datos.retiroHastaMin !== null) {
    const duracion = duracionRango(datos.retiroDesdeMin, datos.retiroHastaMin);
    if (duracion === 0) {
      errores.push("La hora 'Hasta' no puede ser igual a 'Desde'.");
    } else if (duracion > 720) {
      errores.push(
        "El rango de retiro supera las 12 horas. Verifique 'Desde' y 'Hasta'.",
      );
    }
  }

  const prefs = await resolverPreferencias(usuario.id);

  // Ventana de fechas admitida (MEJORA: antes siempre era hoy).
  if (fecha) {
    const hoy = hoyEnZona();
    const dias = Math.round((fecha.getTime() - hoy.getTime()) / 86_400_000);
    const maximo = Number(prefs.pedido_dias_futuro_max) || 30;
    if (dias < 0 && prefs.pedido_permitir_fecha_pasada !== "true") {
      errores.push("No se puede pedir para una fecha anterior a hoy.");
    }
    if (dias > maximo) {
      errores.push(`No se puede pedir con más de ${maximo} días de anticipación.`);
    }
  }

  if (errores.length) return { ok: false, errores };

  // ── Ventanas de overtime ──
  const ventanas = await obtenerVentanasValidables();
  const modo = prefs.ot_validacion_modo;
  const chequeo =
    modo === "off"
      ? { enVentana: true, ventana: null, mensaje: null }
      : validarRetiro(datos.retiroDesdeMin!, ventanas);

  if (!chequeo.enVentana && modo === "bloquear" && !datos.confirmoFueraDeVentana) {
    return {
      ok: false,
      errores: [chequeo.mensaje!],
      requiereConfirmacion: true,
    };
  }

  // ── Asunto y cuerpo ──
  // El GL puede haberlos editado a mano; en ese caso se respeta lo que dejo,
  // igual que en la app original. Si vinieron vacios se regeneran.
  const contexto: ContextoMail = {
    fecha: formatearFechaDdMmYyyy(fecha!),
    retiroDesdeMin: datos.retiroDesdeMin!,
    retiroHastaMin: datos.usaRango ? datos.retiroHastaMin : null,
    motivo: datos.motivo.trim(),
    solicitante: {
      legajo: usuario.legajo,
      apellidoNombre: usuario.empleado.apellidoNombre,
      cargo:
        usuario.empleado.cargo?.descripcion ?? usuario.empleado.cargo?.codigo ?? "",
      sector:
        (usuario.sectorDefault ?? usuario.empleado.sector)?.nombre ?? "",
    },
    personas: datos.items.map((i) => ({
      legajo: i.legajo,
      apellidoNombre: i.apellidoNombre,
      sectorNombre: i.sectorNombre,
    })),
  };

  const asunto = datos.asunto.trim() || armarAsunto(contexto, prefs.mail_subject_template);
  const cuerpo = datos.cuerpo.trim() || armarCuerpoTexto(contexto, prefs.mail_body_template);

  const pedido = await crearPedidoEnBorrador({
    fechaSolicitud: fecha!,
    retiroDesdeMin: datos.retiroDesdeMin!,
    retiroHastaMin: datos.usaRango ? datos.retiroHastaMin : null,
    solicitanteLegajo: usuario.legajo,
    motivo: datos.motivo.trim(),
    destinatariosTo: datos.destinatariosTo.trim(),
    destinatariosCc: datos.destinatariosCc.trim() || null,
    asunto,
    cuerpo,
    fueraDeVentanaOt: !chequeo.enVentana,
    items: datos.items,
  });

  revalidatePath("/historial");

  return {
    ok: true,
    errores: [],
    pedidoId: pedido.id,
    avisoOt: chequeo.mensaje,
  };
}

const METODOS = ["mailto", "eml", "gmail", "portapapeles"] as const;

/** Confirma que el correo se llego a abrir: 'borrador' -> 'enviado'. */
export async function marcarPedidoEnviado(
  pedidoId: number,
  metodo: string,
): Promise<{ ok: boolean }> {
  const usuario = await requireGl();
  const metodoValido = (METODOS as readonly string[]).includes(metodo)
    ? metodo
    : "mailto";
  const ok = await marcarEnviado(
    pedidoId,
    metodoValido,
    usuario.esAdmin ? null : usuario.legajo,
  );
  revalidatePath("/historial");
  return { ok };
}
