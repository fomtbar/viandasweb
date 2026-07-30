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

export interface DatosEdicionPersona {
  /** Puede diferir del actual: es el unico campo que se puede renumerar. */
  legajo: number;
  apellidoNombre: string;
  sectorId: number | null;
  cargoId: number | null;
  turnoId: number | null;
  email: string | null;
  sectorDefaultId: number | null;
  esGl: boolean;
  esAdmin: boolean;
  /** Vale para la nomina Y para la cuenta: es la baja. */
  activo: boolean;
}

export type MotivoEdicion = "sin-empleado" | "legajo-en-uso";

/**
 * Edicion completa de una persona: nomina y cuenta a la vez.
 *
 * Es una sola operacion y no dos porque la pantalla tiene un unico formulario
 * por persona. Reemplaza al par actualizarEmpleado + actualizar del usuario,
 * que se pisaban entre si.
 *
 * Sobre renumerar el legajo, que es la parte delicada: TRES claves foraneas
 * apuntan a viandas_empleados.legajo (la cuenta y las dos de viandas_pedidos)
 * y las tres son ON UPDATE NO ACTION, asi que un UPDATE del legajo es
 * imposible en cualquier orden. Tampoco se arregla con cascadas: viandas_
 * pedidos tiene dos FK a la misma tabla y SQL Server rechaza la segunda con
 * el error 1785 ("multiple cascade paths").
 *
 * Por eso se hace al reves: se crea la fila destino, se repuntan los hijos y
 * recien entonces se borra la de origen. En cada paso la integridad
 * referencial se sostiene sola y no hace falta tocar el esquema.
 */
export async function actualizarPersona(
  legajoActual: number,
  datos: DatosEdicionPersona,
): Promise<{ ok: true } | { ok: false; motivo: MotivoEdicion }> {
  const empleado = await prisma.empleado.findUnique({
    where: { legajo: legajoActual },
    select: {
      esExterno: true,
      creadoAt: true,
      usuario: { select: { debeCambiarPassword: true } },
    },
  });
  if (!empleado) return { ok: false, motivo: "sin-empleado" };

  const renumera = datos.legajo !== legajoActual;
  if (renumera) {
    const ocupado = await prisma.empleado.findUnique({
      where: { legajo: datos.legajo },
      select: { legajo: true },
    });
    if (ocupado) return { ok: false, motivo: "legajo-en-uso" };
  }

  // La contrasena inicial ES el legajo. Si todavia no la cambio y le movemos
  // el numero, se queda sin forma de adivinarla: se rehashea al nuevo.
  // Fuera de la transaccion porque bcrypt tarda ~60 ms.
  const rehashear =
    renumera && empleado.usuario !== null && empleado.usuario.debeCambiarPassword;
  const passwordHash = rehashear ? await hashPassword(String(datos.legajo)) : null;

  const camposEmpleado = {
    apellidoNombre: datos.apellidoNombre,
    sectorId: datos.sectorId,
    cargoId: datos.cargoId,
    turnoId: datos.turnoId,
    activo: datos.activo,
  };
  const camposCuenta = {
    email: datos.email,
    sectorDefaultId: datos.sectorDefaultId,
    esGl: datos.esGl,
    esAdmin: datos.esAdmin,
    activo: datos.activo,
    ...(passwordHash ? { passwordHash } : {}),
  };

  await prisma.$transaction(async (tx) => {
    if (!renumera) {
      await tx.empleado.update({
        where: { legajo: legajoActual },
        data: camposEmpleado,
      });
      // updateMany y no update: la nomina importada tiene empleados sin
      // cuenta, y update lanzaria si no encuentra la fila.
      await tx.usuario.updateMany({
        where: { legajo: legajoActual },
        data: camposCuenta,
      });
      return;
    }

    // 1. El destino primero, para que los hijos tengan a donde apuntar.
    //    `id` es IDENTITY y cambia: no lo referencia nadie, todas las FK a
    //    esta tabla van por legajo. creadoAt y esExterno se copian para que
    //    la fila no parezca recien dada de alta.
    await tx.empleado.create({
      data: {
        legajo: datos.legajo,
        esExterno: empleado.esExterno,
        creadoAt: empleado.creadoAt,
        ...camposEmpleado,
      },
    });

    // 2. Los hijos.
    await tx.usuario.updateMany({
      where: { legajo: legajoActual },
      data: { legajo: datos.legajo, ...camposCuenta },
    });
    await tx.pedido.updateMany({
      where: { solicitanteLegajo: legajoActual },
      data: { solicitanteLegajo: datos.legajo },
    });
    await tx.pedido.updateMany({
      where: { canceladoPorLegajo: legajoActual },
      data: { canceladoPorLegajo: datos.legajo },
    });

    // viandas_pedido_items NO se toca a proposito: guarda el legajo como
    // parte de un snapshot historico, sin FK, y muestra lo que era cierto el
    // dia del pedido. Ver AGENTS.md.

    // 3. Y ahora si, el origen queda sin nadie apuntandolo.
    await tx.empleado.delete({ where: { legajo: legajoActual } });
  });

  return { ok: true };
}

/**
 * Reactivacion desde la fila de un empleado dado de baja.
 *
 * Es el unico camino de vuelta: quien esta de baja no aparece en la grilla
 * normal y no tiene panel de edicion, asi que no puede pasar por
 * actualizarPersona(). Deja la cuenta como estaba a proposito, porque darle
 * acceso de nuevo es una decision aparte: el admin la toma despues, editando
 * la fila que acaba de reaparecer.
 *
 * La baja, en cambio, ya no vive aca: la hace actualizarPersona() con
 * activo=false, que apaga nomina y cuenta juntas.
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
