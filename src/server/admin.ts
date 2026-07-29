import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

/** Consultas y operaciones de la seccion de administracion. */

export interface FilaUsuarioAdmin {
  legajo: number;
  apellidoNombre: string;
  /** Baja logica en la nomina. Un empleado inactivo no figura en el buscador. */
  empleadoActivo: boolean;
  /** Ids crudos: los nombres no sirven para precargar los <select> de edicion. */
  sectorId: number | null;
  cargoId: number | null;
  turnoId: number | null;
  /** null cuando el empleado todavia no tiene cuenta. */
  usuarioId: number | null;
  email: string | null;
  sectorNombre: string;
  sectorDefaultId: number | null;
  cargoNombre: string;
  esGl: boolean;
  esAdmin: boolean;
  activo: boolean;
  ultimoLoginAt: Date | null;
  debeCambiarPassword: boolean;
}

/**
 * TODA la nomina, con cuenta o sin ella y de alta o de baja.
 *
 * Es el mismo criterio que usuarios.py:get_todos() de la app Tkinter: la
 * grilla muestra la nomina completa y marca en gris a quien no tiene usuario,
 * porque desde ahi mismo se le crea la cuenta.
 *
 * Incluye a los dados de baja a proposito: si se filtraran aca, un empleado
 * desactivado desapareceria de la grilla y no habria forma de reactivarlo. El
 * filtrado por estado se hace en la pantalla.
 */
export async function listarUsuariosAdmin(): Promise<FilaUsuarioAdmin[]> {
  const empleados = await prisma.empleado.findMany({
    select: {
      legajo: true,
      apellidoNombre: true,
      activo: true,
      sectorId: true,
      cargoId: true,
      turnoId: true,
      sector: { select: { nombre: true } },
      cargo: { select: { descripcion: true, codigo: true } },
      usuario: {
        select: {
          id: true,
          email: true,
          sectorDefaultId: true,
          esGl: true,
          esAdmin: true,
          activo: true,
          ultimoLoginAt: true,
          debeCambiarPassword: true,
          sectorDefault: { select: { nombre: true } },
        },
      },
    },
    orderBy: { apellidoNombre: "asc" },
  });

  return empleados.map((e) => ({
    legajo: e.legajo,
    apellidoNombre: e.apellidoNombre,
    empleadoActivo: e.activo,
    sectorId: e.sectorId,
    cargoId: e.cargoId,
    turnoId: e.turnoId,
    usuarioId: e.usuario?.id ?? null,
    email: e.usuario?.email ?? null,
    sectorNombre:
      e.usuario?.sectorDefault?.nombre ?? e.sector?.nombre ?? "-",
    sectorDefaultId: e.usuario?.sectorDefaultId ?? null,
    cargoNombre: e.cargo?.descripcion ?? e.cargo?.codigo ?? "-",
    esGl: e.usuario?.esGl ?? false,
    esAdmin: e.usuario?.esAdmin ?? false,
    activo: e.usuario?.activo ?? false,
    ultimoLoginAt: e.usuario?.ultimoLoginAt ?? null,
    debeCambiarPassword: e.usuario?.debeCambiarPassword ?? false,
  }));
}

export interface DatosPersona {
  legajo: number;
  apellidoNombre: string;
  sectorId: number | null;
  cargoId: number | null;
  turnoId: number | null;
  email: string | null;
  esGl: boolean;
  esAdmin: boolean;
}

/**
 * Alta de una persona nueva: empleado + cuenta, siempre las dos.
 *
 * La cuenta se crea aunque no tenga ningun rol. No es un descuido: el acceso
 * lo decide tieneAcceso() = activo && (esGl || esAdmin), asi que alguien sin
 * rol queda en la nomina, se le puede pedir una vianda, pero no entra al
 * sistema. Cuando mas adelante se le marca GL, ya tiene con que ingresar.
 *
 * Reemplaza al unico camino que habia hasta ahora para que alguien entrara a
 * la nomina: el importador de la SQLite, que corrio una sola vez.
 */
export async function crearPersona(datos: DatosPersona) {
  const existente = await prisma.empleado.findUnique({
    where: { legajo: datos.legajo },
    select: { activo: true },
  });
  if (existente) {
    return existente.activo
      ? { ok: false as const, motivo: "legajo-en-uso" as const }
      : { ok: false as const, motivo: "legajo-dado-de-baja" as const };
  }

  // Fuera de la transaccion: bcrypt tarda ~60 ms y no hay razon para
  // sostener la transaccion abierta mientras tanto.
  const passwordHash = await hashPassword(String(datos.legajo));

  await prisma.$transaction(async (tx) => {
    await tx.empleado.create({
      data: {
        legajo: datos.legajo,
        apellidoNombre: datos.apellidoNombre,
        sectorId: datos.sectorId,
        cargoId: datos.cargoId,
        turnoId: datos.turnoId,
        activo: true,
      },
    });
    await tx.usuario.create({
      data: {
        legajo: datos.legajo,
        passwordHash,
        debeCambiarPassword: true,
        email: datos.email,
        sectorDefaultId: datos.sectorId,
        esGl: datos.esGl,
        esAdmin: datos.esAdmin,
        activo: true,
      },
    });
  });

  return { ok: true as const };
}

export async function actualizarEmpleado(
  legajo: number,
  datos: Pick<DatosPersona, "apellidoNombre" | "sectorId" | "cargoId" | "turnoId">,
) {
  const empleado = await prisma.empleado.findUnique({ where: { legajo } });
  if (!empleado) return false;

  await prisma.empleado.update({
    where: { legajo },
    data: {
      apellidoNombre: datos.apellidoNombre,
      sectorId: datos.sectorId,
      cargoId: datos.cargoId,
      turnoId: datos.turnoId,
    },
  });
  return true;
}

/**
 * Baja o reactivacion en la nomina.
 *
 * Al dar de baja se desactiva tambien la cuenta: si no, la persona seguiria
 * entrando al sistema despues de irse de la planta. Al reactivar NO se
 * reactiva la cuenta sola, porque el rol y el acceso son una decision aparte
 * que el admin toma en la grilla.
 *
 * No borra nada: pedido_items guarda nombre, sector y cargo como snapshot, y
 * los pedidos historicos siguen mostrandose igual.
 */
export async function cambiarActivoEmpleado(legajo: number, activo: boolean) {
  const empleado = await prisma.empleado.findUnique({ where: { legajo } });
  if (!empleado) return false;

  await prisma.$transaction(async (tx) => {
    await tx.empleado.update({ where: { legajo }, data: { activo } });
    if (!activo) {
      // updateMany y no update: puede no tener cuenta, y update lanzaria.
      await tx.usuario.updateMany({ where: { legajo }, data: { activo: false } });
    }
  });
  return true;
}

export async function crearCuenta(legajo: number) {
  const empleado = await prisma.empleado.findUnique({
    where: { legajo },
    include: { cargo: true },
  });
  if (!empleado || !empleado.activo) return { ok: false, motivo: "sin-empleado" as const };

  const existente = await prisma.usuario.findUnique({ where: { legajo } });
  if (existente) return { ok: false, motivo: "ya-existe" as const };

  await prisma.usuario.create({
    data: {
      legajo,
      passwordHash: await hashPassword(String(legajo)),
      debeCambiarPassword: true,
      sectorDefaultId: empleado.sectorId,
      // El rol sale del cargo, igual que _sincronizar_gls de la app original.
      esGl: empleado.cargo?.esLider ?? false,
      esAdmin: false,
      activo: true,
    },
  });
  return { ok: true as const };
}

/**
 * Crea las cuentas que falten.
 *
 * Va en lotes porque cada cuenta implica un hash bcrypt (~60 ms): hacer los
 * cientos de una sola vez agotaria el tiempo de la server action.
 */
export async function sincronizarNomina(tamanoLote = 100) {
  const pendientes = await prisma.empleado.findMany({
    where: { activo: true, usuario: null },
    include: { cargo: true },
    orderBy: { legajo: "asc" },
    take: tamanoLote,
  });

  if (pendientes.length === 0) return { creados: 0, restantes: 0 };

  const datos = await Promise.all(
    pendientes.map(async (e) => ({
      legajo: e.legajo,
      passwordHash: await hashPassword(String(e.legajo)),
      debeCambiarPassword: true,
      sectorDefaultId: e.sectorId,
      esGl: e.cargo?.esLider ?? false,
      esAdmin: false,
      activo: true,
    })),
  );
  await prisma.usuario.createMany({ data: datos });

  const restantes = await prisma.empleado.count({
    where: { activo: true, usuario: null },
  });
  return { creados: datos.length, restantes };
}

export async function resetearPassword(usuarioId: number) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) return false;
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: {
      passwordHash: await hashPassword(String(usuario.legajo)),
      debeCambiarPassword: true,
      // Expulsa las sesiones abiertas de esa persona (ver guards).
      passwordActualizadoAt: new Date(),
    },
  });
  return true;
}

export function contarAdminsActivos() {
  return prisma.usuario.count({ where: { esAdmin: true, activo: true } });
}
