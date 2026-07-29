"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import {
  crearCuenta,
  crearPersona,
  actualizarEmpleado,
  cambiarActivoEmpleado,
  resetearPassword,
  sincronizarNomina,
  contarAdminsActivos,
} from "@/server/admin";
import { parseRangoHorario } from "@/lib/overtime/parse";

export interface Resultado {
  ok: boolean;
  mensaje?: string;
  error?: string;
}

// ── Catalogos ────────────────────────────────────────────────

export async function actualizarSector(
  id: number,
  nombre: string,
  activo: boolean,
): Promise<Resultado> {
  await requireAdmin();
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };

  const repetido = await prisma.sector.findFirst({
    where: { nombre: limpio, id: { not: id } },
  });
  if (repetido) return { ok: false, error: "Ya existe otro sector con ese nombre." };

  await prisma.sector.update({ where: { id }, data: { nombre: limpio, activo } });
  revalidatePath("/admin/sectores");
  revalidatePath("/");
  return { ok: true, mensaje: "Sector actualizado." };
}

export async function crearSector(nombre: string): Promise<Resultado> {
  await requireAdmin();
  const limpio = nombre.trim();
  if (!limpio) return { ok: false, error: "El nombre no puede quedar vacío." };
  // 120 es el largo real de la columna.
  if (limpio.length > 120) {
    return { ok: false, error: "El nombre no puede superar los 120 caracteres." };
  }

  const repetido = await prisma.sector.findFirst({ where: { nombre: limpio } });
  if (repetido) {
    return repetido.activo
      ? { ok: false, error: "Ya existe un sector con ese nombre." }
      : {
          ok: false,
          error: `Ya existe un sector "${limpio}" pero está inactivo. Buscalo en la lista y volvé a marcarlo como activo.`,
        };
  }

  await prisma.sector.create({ data: { nombre: limpio, activo: true } });
  revalidatePath("/admin/sectores");
  revalidatePath("/");
  return { ok: true, mensaje: `Sector "${limpio}" creado.` };
}

export async function actualizarCargo(
  id: number,
  descripcion: string,
  esLider: boolean,
  activo: boolean,
): Promise<Resultado> {
  await requireAdmin();
  await prisma.cargo.update({
    where: { id },
    data: { descripcion: descripcion.trim() || null, esLider, activo },
  });
  revalidatePath("/admin/cargos");
  // OJO: cambiar es_lider NO re-propaga a los usuarios existentes; solo afecta
  // a las cuentas que se creen desde ahora. Es el mismo comportamiento que la
  // app Tkinter.
  return { ok: true, mensaje: "Cargo actualizado. Afecta a las cuentas nuevas." };
}

export async function crearCargo(
  codigo: string,
  descripcion: string,
  esLider: boolean,
): Promise<Resultado> {
  await requireAdmin();
  // El codigo es la clave del catalogo y despues NO se edita, igual que en las
  // filas existentes: por eso se valida con cuidado acá.
  const cod = codigo.trim().toUpperCase();
  if (!cod) return { ok: false, error: "El código es obligatorio." };
  if (cod.length > 30) {
    return { ok: false, error: "El código no puede superar los 30 caracteres." };
  }

  const repetido = await prisma.cargo.findUnique({ where: { codigo: cod } });
  if (repetido) return { ok: false, error: `Ya existe el cargo ${cod}.` };

  await prisma.cargo.create({
    data: {
      codigo: cod,
      descripcion: descripcion.trim() || null,
      esLider,
      activo: true,
    },
  });
  revalidatePath("/admin/cargos");
  return {
    ok: true,
    mensaje: esLider
      ? `Cargo ${cod} creado. Las cuentas nuevas con este cargo van a ser GL.`
      : `Cargo ${cod} creado.`,
  };
}

export async function actualizarMotivo(id: number, texto: string): Promise<Resultado> {
  await requireAdmin();
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "El motivo no puede quedar vacío." };

  const repetido = await prisma.motivo.findFirst({
    where: { texto: limpio, id: { not: id } },
  });
  if (repetido) return { ok: false, error: "Ya existe otro motivo con ese texto." };

  await prisma.motivo.update({ where: { id }, data: { texto: limpio } });
  revalidatePath("/admin/motivos");
  return { ok: true, mensaje: "Motivo actualizado." };
}

export async function eliminarMotivo(id: number): Promise<Resultado> {
  await requireAdmin();
  // Borrado fisico, como en la app original. Los pedidos ya generados guardan
  // el texto del motivo, asi que no pierden nada.
  await prisma.motivo.delete({ where: { id } });
  revalidatePath("/admin/motivos");
  return { ok: true, mensaje: "Motivo eliminado." };
}

export async function crearMotivo(texto: string): Promise<Resultado> {
  await requireAdmin();
  const limpio = texto.trim();
  if (!limpio) return { ok: false, error: "Escriba el texto del motivo." };
  const existente = await prisma.motivo.findUnique({ where: { texto: limpio } });
  if (existente) return { ok: false, error: "Ese motivo ya existe." };

  await prisma.motivo.create({ data: { texto: limpio, usos: 0 } });
  revalidatePath("/admin/motivos");
  return { ok: true, mensaje: "Motivo creado." };
}

// ── Ventanas de overtime ─────────────────────────────────────

const EsquemaVentana = z.object({
  id: z.number().int(),
  orden: z.number().int().min(0),
  otPrevio: z.string().max(40),
  turnoHorario: z.string().max(40),
  otPosterior: z.string().max(40),
  activo: z.boolean(),
});

export async function actualizarVentanaOt(entrada: unknown): Promise<Resultado> {
  await requireAdmin();
  const parseado = EsquemaVentana.safeParse(entrada);
  if (!parseado.success) return { ok: false, error: "Datos inválidos." };
  const v = parseado.data;

  // Se reparsean los textos a minutos al guardar: es lo que despues usa la
  // validacion del retiro. Si no se entienden quedan en null y esa ventana
  // simplemente deja de validar.
  const previo = parseRangoHorario(v.otPrevio);
  const posterior = parseRangoHorario(v.otPosterior);

  await prisma.overtimeVentana.update({
    where: { id: v.id },
    data: {
      orden: v.orden,
      otPrevio: v.otPrevio.trim() || null,
      turnoHorario: v.turnoHorario.trim() || null,
      otPosterior: v.otPosterior.trim() || null,
      otPrevioDesdeMin: previo?.desdeMin ?? null,
      otPrevioHastaMin: previo?.hastaMin ?? null,
      otPosteriorDesdeMin: posterior?.desdeMin ?? null,
      otPosteriorHastaMin: posterior?.hastaMin ?? null,
      activo: v.activo,
    },
  });

  revalidatePath("/admin/overtime");
  revalidatePath("/");

  const ilegibles: string[] = [];
  if (v.otPrevio.trim() && !previo) ilegibles.push("OT previo");
  if (v.otPosterior.trim() && !posterior) ilegibles.push("OT posterior");

  return {
    ok: true,
    mensaje: ilegibles.length
      ? `Guardado, pero no se entendió el horario de ${ilegibles.join(" ni ")}. Use el formato "6:00 A 14:34".`
      : "Ventana actualizada.",
  };
}

export async function crearVentanaOt(entrada: unknown): Promise<Resultado> {
  await requireAdmin();
  const parseado = EsquemaVentana.omit({ id: true, activo: true }).safeParse(entrada);
  if (!parseado.success) return { ok: false, error: "Datos inválidos." };
  const v = parseado.data;

  if (!v.otPrevio.trim() && !v.otPosterior.trim()) {
    return {
      ok: false,
      error: "Cargue al menos un horario de OT previo o posterior; si no, la ventana no valida nada.",
    };
  }

  // Mismo criterio que actualizarVentanaOt: los minutos se derivan del texto y
  // quedan en null si no se entiende, con lo cual esa franja deja de validar.
  const previo = parseRangoHorario(v.otPrevio);
  const posterior = parseRangoHorario(v.otPosterior);

  await prisma.overtimeVentana.create({
    data: {
      orden: v.orden,
      otPrevio: v.otPrevio.trim() || null,
      turnoHorario: v.turnoHorario.trim() || null,
      otPosterior: v.otPosterior.trim() || null,
      otPrevioDesdeMin: previo?.desdeMin ?? null,
      otPrevioHastaMin: previo?.hastaMin ?? null,
      otPosteriorDesdeMin: posterior?.desdeMin ?? null,
      otPosteriorHastaMin: posterior?.hastaMin ?? null,
      activo: true,
    },
  });

  revalidatePath("/admin/overtime");
  revalidatePath("/");

  const ilegibles: string[] = [];
  if (v.otPrevio.trim() && !previo) ilegibles.push("OT previo");
  if (v.otPosterior.trim() && !posterior) ilegibles.push("OT posterior");

  return {
    ok: true,
    mensaje: ilegibles.length
      ? `Ventana creada, pero no se entendió el horario de ${ilegibles.join(" ni ")}. Use el formato "6:00 A 14:34".`
      : "Ventana creada.",
  };
}

// ── Usuarios ─────────────────────────────────────────────────

const EsquemaUsuario = z.object({
  usuarioId: z.number().int(),
  email: z.string().max(200),
  sectorDefaultId: z.number().int().nullable(),
  esGl: z.boolean(),
  esAdmin: z.boolean(),
  activo: z.boolean(),
});

export async function actualizarUsuario(entrada: unknown): Promise<Resultado> {
  const admin = await requireAdmin();
  const parseado = EsquemaUsuario.safeParse(entrada);
  if (!parseado.success) return { ok: false, error: "Datos inválidos." };
  const datos = parseado.data;

  const destino = await prisma.usuario.findUnique({ where: { id: datos.usuarioId } });
  if (!destino) return { ok: false, error: "El usuario no existe." };

  // Protecciones para no quedarse sin administradores.
  const seDegrada = destino.esAdmin && (!datos.esAdmin || !datos.activo);
  if (seDegrada) {
    if (destino.id === admin.id) {
      return {
        ok: false,
        error: "No puede quitarse a sí mismo el rol de administrador ni desactivarse.",
      };
    }
    if ((await contarAdminsActivos()) <= 1) {
      return { ok: false, error: "Debe quedar al menos un administrador activo." };
    }
  }

  await prisma.usuario.update({
    where: { id: datos.usuarioId },
    data: {
      email: datos.email.trim() || null,
      sectorDefaultId: datos.sectorDefaultId,
      esGl: datos.esGl,
      esAdmin: datos.esAdmin,
      activo: datos.activo,
    },
  });

  revalidatePath("/admin/usuarios");
  return { ok: true, mensaje: "Usuario actualizado." };
}

// ── Personal (nomina) ────────────────────────────────────────

/** El legajo llega de un <input type="number">: puede venir como string. */
const Legajo = z.coerce.number().int().positive();
/** Los <select> vacios mandan "": se normaliza a null (las FK son nullable). */
const IdOpcional = z
  .union([z.coerce.number().int().positive(), z.literal(""), z.null()])
  .transform((v) => (v === "" || v === null ? null : v));

const EsquemaPersona = z.object({
  legajo: Legajo,
  // 150 es el largo real de la columna apellido_nombre.
  apellidoNombre: z.string().trim().min(1, "requerido").max(150),
  sectorId: IdOpcional,
  cargoId: IdOpcional,
  turnoId: IdOpcional,
  email: z.string().trim().max(200),
  esGl: z.boolean(),
  esAdmin: z.boolean(),
});

export async function crearPersonaAccion(entrada: unknown): Promise<Resultado> {
  await requireAdmin();
  const parseado = EsquemaPersona.safeParse(entrada);
  if (!parseado.success) {
    const primero = parseado.error.issues[0];
    return {
      ok: false,
      error:
        primero?.path[0] === "apellidoNombre"
          ? "El apellido y nombre es obligatorio."
          : "Datos inválidos. Revisá el legajo y los campos cargados.",
    };
  }
  const datos = parseado.data;

  const resultado = await crearPersona({ ...datos, email: datos.email || null });
  if (!resultado.ok) {
    return {
      ok: false,
      error:
        resultado.motivo === "legajo-dado-de-baja"
          ? `El legajo ${datos.legajo} ya existe pero está dado de baja. Buscalo con el filtro "Dados de baja" y reactivalo.`
          : `El legajo ${datos.legajo} ya está en uso.`,
    };
  }

  revalidatePath("/admin/usuarios");
  revalidatePath("/");
  return {
    ok: true,
    mensaje:
      `${datos.apellidoNombre} quedó en la nómina. La contraseña inicial es ${datos.legajo}.` +
      (datos.esGl || datos.esAdmin
        ? ""
        : " Sin rol GL ni administrador no puede iniciar sesión todavía."),
  };
}

const EsquemaEmpleado = EsquemaPersona.pick({
  legajo: true,
  apellidoNombre: true,
  sectorId: true,
  cargoId: true,
  turnoId: true,
});

export async function actualizarEmpleadoAccion(entrada: unknown): Promise<Resultado> {
  await requireAdmin();
  const parseado = EsquemaEmpleado.safeParse(entrada);
  if (!parseado.success) {
    return { ok: false, error: "El apellido y nombre es obligatorio." };
  }
  const { legajo, ...datos } = parseado.data;

  if (!(await actualizarEmpleado(legajo, datos))) {
    return { ok: false, error: "No existe un empleado con ese legajo." };
  }

  revalidatePath("/admin/usuarios");
  // El buscador de personal de la pantalla de pedido muestra nombre y sector.
  revalidatePath("/");
  return { ok: true, mensaje: "Datos del empleado actualizados." };
}

export async function cambiarActivoEmpleadoAccion(
  legajo: number,
  activo: boolean,
): Promise<Resultado> {
  const admin = await requireAdmin();

  if (!activo) {
    if (legajo === admin.legajo) {
      return { ok: false, error: "No puede darse de baja a sí mismo." };
    }
    // La baja arrastra la cuenta: hay que cuidar el mismo invariante que
    // actualizarUsuario, no quedarse sin administradores.
    const destino = await prisma.usuario.findUnique({ where: { legajo } });
    if (destino?.esAdmin && destino.activo && (await contarAdminsActivos()) <= 1) {
      return { ok: false, error: "Debe quedar al menos un administrador activo." };
    }
  }

  if (!(await cambiarActivoEmpleado(legajo, activo))) {
    return { ok: false, error: "No existe un empleado con ese legajo." };
  }

  revalidatePath("/admin/usuarios");
  revalidatePath("/");
  return {
    ok: true,
    mensaje: activo
      ? "Empleado reactivado. Revisá su rol para darle acceso."
      : "Empleado dado de baja. Su cuenta quedó desactivada y su historial se conserva.",
  };
}

export async function crearUsuarioDeLegajo(legajo: number): Promise<Resultado> {
  await requireAdmin();
  const resultado = await crearCuenta(legajo);
  if (!resultado.ok) {
    return {
      ok: false,
      error:
        resultado.motivo === "ya-existe"
          ? "Ese legajo ya tiene cuenta."
          : "No existe un empleado activo con ese legajo.",
    };
  }
  revalidatePath("/admin/usuarios");
  return { ok: true, mensaje: `Cuenta creada. La contraseña inicial es ${legajo}.` };
}

export async function resetearPasswordUsuario(usuarioId: number): Promise<Resultado> {
  await requireAdmin();
  const ok = await resetearPassword(usuarioId);
  if (!ok) return { ok: false, error: "El usuario no existe." };
  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    mensaje:
      "Contraseña restablecida al número de legajo. Las sesiones abiertas de esa persona se cerraron.",
  };
}

export async function sincronizarNominaAccion(): Promise<
  Resultado & { creados?: number; restantes?: number }
> {
  await requireAdmin();
  const { creados, restantes } = await sincronizarNomina();
  revalidatePath("/admin/usuarios");
  return {
    ok: true,
    creados,
    restantes,
    mensaje:
      creados === 0
        ? "Toda la nómina activa ya tiene cuenta."
        : `Se crearon ${creados} cuentas.${restantes > 0 ? ` Faltan ${restantes}: volvé a ejecutarlo.` : ""}`,
  };
}
