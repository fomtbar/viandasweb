import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Alta, edicion y baja de personal.
 *
 * El caso central es el modelo de acceso: la cuenta se crea SIEMPRE, pero
 * quien no tiene rol GL ni administrador no puede iniciar sesion. Es lo que
 * permite tener en la nomina a gente a la que solo se le pide una vianda.
 */

const prisma = new PrismaClient({
  adapter: new PrismaMssql({
    server: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PUERTO ?? 14330),
    database: process.env.DB_NOMBRE ?? "viandas",
    user: process.env.DB_USUARIO ?? "sa",
    password: process.env.DB_PASSWORD ?? "",
    options: { encrypt: true, trustServerCertificate: true },
  }),
});

const ADMIN = 5169;
const CLAVE = "viandas-e2e-2026";
/** Fuera del rango de legajos reales para no pisar a nadie de la nomina. */
const NUEVO = 999111;
/** Destino de la prueba de renumeracion. Tambien fuera de rango. */
const RENUMERADO = 999112;
const NOMBRE = "PRUEBA E2E, PERSONA";

async function limpiar() {
  // Los dos legajos: la prueba de renumeracion deja a la persona en el
  // segundo, y sin esto la siguiente alta chocaria con el empleado que quedo.
  const enJuego = [NUEVO, RENUMERADO];

  // Los pedidos van primero: su FK a empleados es NO ACTION y bloquearia el
  // borrado del empleado. Los pedido_items se van en cascada con su pedido.
  await prisma.pedido.deleteMany({
    where: {
      OR: [
        { solicitanteLegajo: { in: enJuego } },
        { canceladoPorLegajo: { in: enJuego } },
      ],
    },
  });
  await prisma.usuario.deleteMany({ where: { legajo: { in: enJuego } } });
  await prisma.empleado.deleteMany({ where: { legajo: { in: enJuego } } });
}

test.beforeAll(async () => {
  await limpiar();
  await prisma.usuario.update({
    where: { legajo: ADMIN },
    data: {
      passwordHash: await bcrypt.hash(CLAVE, 10),
      debeCambiarPassword: false,
      passwordActualizadoAt: new Date(),
    },
  });
});

// Cada prueba da de alta el mismo legajo: sin esto, la segunda en adelante
// chocaria con la persona que dejo la anterior.
test.beforeEach(limpiar);

test.afterAll(async () => {
  await limpiar();
  await prisma.usuario.update({
    where: { legajo: ADMIN },
    data: {
      passwordHash: await bcrypt.hash(String(ADMIN), 10),
      debeCambiarPassword: true,
      passwordActualizadoAt: null,
      esAdmin: true,
      esGl: true,
      activo: true,
    },
  });
  await prisma.$disconnect();
});

async function ingresarAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(ADMIN));
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();
}

async function altaDePrueba(page: Page, { conRol }: { conRol: boolean }) {
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: "Nueva persona", exact: true }).click();
  await page.getByLabel("Legajo", { exact: true }).fill(String(NUEVO));
  await page.getByLabel("Apellido y nombre", { exact: true }).fill(NOMBRE);
  if (conRol) {
    await page.getByLabel("Puede pedir viandas (GL)").check();
  }
  await page.getByRole("button", { name: "Dar de alta" }).click();

  // El alta revalida la home, que reconstruye el buscador con los 800+
  // empleados: contra `next dev` eso se pasa holgadamente de los 5 s que el
  // expect espera por defecto. Se aguarda a que el boton salga de "Guardando…".
  await expect(page.getByRole("button", { name: "Dar de alta" })).toBeEnabled({
    timeout: 60_000,
  });
}

/**
 * Cierra el panel de alta.
 *
 * Abierto ocupa ~500 px y empuja la grilla debajo del pliegue: con el viewport
 * de 720 px de Playwright, la primera fila queda justo detras del <thead>
 * sticky y sus botones se vuelven inclicables ("subtree intercepts pointer
 * events"). Es lo que hacen los ojos de cualquiera antes de tocar la grilla.
 *
 * OJO: "Cancelar" limpia el aviso del alta, asi que va DESPUES de comprobarlo.
 */
async function cerrarPanelAlta(page: Page) {
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("button", { name: "Nueva persona", exact: true })).toBeVisible();
}

test("alta sin rol: queda en la nómina pero no puede iniciar sesión", async ({
  page,
}) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: false });

  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();

  // Se creo el empleado Y la cuenta, aunque sin rol.
  const empleado = await prisma.empleado.findUnique({ where: { legajo: NUEVO } });
  const usuario = await prisma.usuario.findUnique({ where: { legajo: NUEVO } });
  expect(empleado?.apellidoNombre).toBe(NOMBRE);
  expect(empleado?.activo).toBe(true);
  expect(usuario).not.toBeNull();
  expect(usuario!.esGl).toBe(false);
  expect(usuario!.esAdmin).toBe(false);
  expect(usuario!.debeCambiarPassword).toBe(true);

  // Aparece en la grilla.
  await expect(page.getByTestId(`usuario-${NUEVO}`)).toBeVisible();

  // Con la contrasena correcta (su legajo) el sistema lo rechaza por rol.
  // Hay que soltar la sesion del admin: con la cookie puesta, /login redirige
  // al inicio y no existe el formulario.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(NUEVO));
  await page.getByLabel("Contraseña").fill(String(NUEVO));
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(
    page.getByText("Solo GLs y administradores pueden acceder al sistema."),
  ).toBeVisible();
});

test("al marcarlo GL puede entrar y le exige cambiar la clave", async ({ page }) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: true });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();

  const usuario = await prisma.usuario.findUnique({ where: { legajo: NUEVO } });
  expect(usuario!.esGl).toBe(true);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(NUEVO));
  await page.getByLabel("Contraseña").fill(String(NUEVO));
  await page.getByRole("button", { name: "Ingresar" }).click();

  // debeCambiarPassword lo desvia antes de dejarlo operar.
  await expect(page).toHaveURL(/\/cambiar-password/);
});

test("editar los datos del empleado los cambia en la nómina", async ({ page }) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: true });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();
  await cerrarPanelAlta(page);

  const sector = await prisma.sector.findFirst({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });

  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Editar datos" }).click();
  const edicion = page.getByTestId(`empleado-edicion-${NUEVO}`);
  await expect(edicion).toBeVisible();

  await edicion.getByLabel("Apellido y nombre", { exact: true }).fill("PRUEBA E2E, EDITADA");
  // exact: el panel tiene "Sector" y "Sector por defecto", y getByLabel hace
  // coincidencia parcial: sin esto matchea los dos y falla por strict mode.
  await edicion.getByLabel("Sector", { exact: true }).selectOption(String(sector!.id));
  await edicion.getByRole("button", { name: "Guardar datos" }).click();

  // Como el alta, esto revalida la home con toda la nomina: en dev tarda.
  await expect(
    page.getByTestId("alerta").filter({ hasText: "Datos actualizados." }),
  ).toBeVisible({ timeout: 60_000 });

  const despues = await prisma.empleado.findUnique({ where: { legajo: NUEVO } });
  expect(despues!.apellidoNombre).toBe("PRUEBA E2E, EDITADA");
  expect(despues!.sectorId).toBe(sector!.id);
});

test("cambiar el legajo se lleva la cuenta y los pedidos, pero no el snapshot", async ({
  page,
}) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: true });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();

  // Un pedido suyo, con un item que lo incluye. Es lo que distingue las dos
  // reglas: el pedido tiene FK y sigue al legajo; el item es un snapshot
  // historico sin FK y se queda con el numero viejo.
  const pedido = await prisma.pedido.create({
    data: {
      fechaSolicitud: new Date(Date.UTC(2026, 0, 1)),
      retiroDesdeMin: 600,
      solicitanteLegajo: NUEVO,
      cantidadViandas: 1,
      motivo: "Overtime",
      destinatariosTo: "e2e@example.com",
      asunto: "e2e",
      cuerpo: "e2e",
      items: {
        create: [{ legajo: NUEVO, apellidoNombre: NOMBRE, sectorNombre: "-" }],
      },
    },
  });

  await page.reload();
  await page.getByLabel("Buscar").fill(String(NUEVO));
  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Editar datos" }).click();
  const edicion = page.getByTestId(`empleado-edicion-${NUEVO}`);
  await edicion.getByLabel("Legajo", { exact: true }).fill(String(RENUMERADO));
  await edicion.getByRole("button", { name: "Guardar datos" }).click();

  await expect(
    page.getByTestId("alerta").filter({ hasText: `pasó de ${NUEVO} a ${RENUMERADO}` }),
  ).toBeVisible({ timeout: 60_000 });

  // El viejo no existe en ninguna de las dos tablas...
  expect(await prisma.empleado.findUnique({ where: { legajo: NUEVO } })).toBeNull();
  expect(await prisma.usuario.findUnique({ where: { legajo: NUEVO } })).toBeNull();

  // ...la cuenta y los datos se conservaron en el legajo nuevo...
  const empleado = await prisma.empleado.findUnique({ where: { legajo: RENUMERADO } });
  const usuario = await prisma.usuario.findUnique({ where: { legajo: RENUMERADO } });
  expect(empleado!.apellidoNombre).toBe(NOMBRE);
  expect(usuario).not.toBeNull();
  expect(usuario!.esGl).toBe(true);

  // ...el pedido lo siguió...
  const despues = await prisma.pedido.findUnique({
    where: { id: pedido.id },
    include: { items: true },
  });
  expect(despues!.solicitanteLegajo).toBe(RENUMERADO);
  // ...y el item se quedó donde estaba, que es la regla de pedido_items.
  expect(despues!.items[0]!.legajo).toBe(NUEVO);

  // La contrasena inicial ES el legajo: al renumerar, se rehashea al nuevo.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(RENUMERADO));
  await page.getByLabel("Contraseña").fill(String(RENUMERADO));
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/cambiar-password/);
});

test("un legajo ya usado por otra persona se rechaza con un mensaje claro", async ({
  page,
}) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: true });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();
  await cerrarPanelAlta(page);

  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Editar datos" }).click();
  const edicion = page.getByTestId(`empleado-edicion-${NUEVO}`);
  // El legajo del administrador, que obviamente existe.
  await edicion.getByLabel("Legajo", { exact: true }).fill(String(ADMIN));
  await edicion.getByRole("button", { name: "Guardar datos" }).click();

  await expect(page.getByText(/ya está en uso por otra persona/)).toBeVisible({
    timeout: 60_000,
  });
  // El modal sigue abierto, con lo cargado, para poder corregirlo.
  await expect(edicion).toBeVisible();
  expect(await prisma.empleado.findUnique({ where: { legajo: NUEVO } })).not.toBeNull();
});

test("la edición abre un modal y se cierra con Escape sin guardar", async ({ page }) => {
  await ingresarAdmin(page);
  await page.goto("/admin/usuarios");

  const filas = page.locator('tr[data-testid^="usuario-"]');
  await filas.nth(0).getByRole("button", { name: "Editar datos" }).click();

  // Con el modal abierto no hay dos ediciones posibles: es uno solo y tapa
  // la grilla. Por eso ya no hace falta deshabilitar el resto de las filas.
  const modal = page.getByRole("dialog");
  await expect(modal).toHaveCount(1);

  const nombre = modal.getByLabel("Apellido y nombre", { exact: true });
  const original = await nombre.inputValue();
  await nombre.fill("NO SE DEBE GUARDAR");
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);

  // Y al reabrir, el cambio descartado no quedó.
  await filas.nth(0).getByRole("button", { name: "Editar datos" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Apellido y nombre", { exact: true }),
  ).toHaveValue(original);
});

test("desmarcar Activo lo saca de la grilla y desactiva su cuenta; se puede reactivar", async ({
  page,
}) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: true });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();
  await cerrarPanelAlta(page);

  page.on("dialog", (d) => d.accept());

  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Editar datos" }).click();
  const edicion = page.getByTestId(`empleado-edicion-${NUEVO}`);
  // "Activo" ES la baja: apaga la nomina y la cuenta juntas.
  await edicion.getByRole("checkbox", { name: /activo/ }).uncheck();
  await edicion.getByRole("button", { name: "Guardar datos" }).click();
  // El aviso sale en el panel de arriba Y en el boton: se apunta al del panel,
  // que es el que sobrevive a que la fila desaparezca de la vista.
  await expect(
    page.getByTestId("alerta").filter({ hasText: /dado de baja/ }),
  ).toBeVisible({ timeout: 60_000 });

  const empleado = await prisma.empleado.findUnique({ where: { legajo: NUEVO } });
  const usuario = await prisma.usuario.findUnique({ where: { legajo: NUEVO } });
  expect(empleado!.activo).toBe(false);
  // La baja arrastra la cuenta: si no, seguiria entrando despues de irse.
  expect(usuario!.activo).toBe(false);

  // Ya no esta en la vista normal, pero si bajo el filtro de bajas.
  await page.reload();
  await expect(page.getByTestId(`usuario-${NUEVO}`)).toHaveCount(0);
  await page.getByLabel("Mostrar").selectOption("baja");
  await expect(page.getByTestId(`usuario-${NUEVO}`)).toBeVisible();

  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Reactivar" }).click();
  await expect(
    page.getByTestId("alerta").filter({ hasText: /reactivado/ }),
  ).toBeVisible({ timeout: 60_000 });

  const reactivado = await prisma.empleado.findUnique({ where: { legajo: NUEVO } });
  expect(reactivado!.activo).toBe(true);
});

test("un legajo repetido no crea un duplicado", async ({ page }) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: false });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();

  // Segunda alta con el mismo legajo.
  await altaDePrueba(page, { conRol: false });
  await expect(page.getByText(`El legajo ${NUEVO} ya está en uso.`)).toBeVisible();

  expect(await prisma.empleado.count({ where: { legajo: NUEVO } })).toBe(1);
});
