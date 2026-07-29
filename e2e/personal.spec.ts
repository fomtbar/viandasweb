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
const NOMBRE = "PRUEBA E2E, PERSONA";

async function limpiar() {
  await prisma.usuario.deleteMany({ where: { legajo: NUEVO } });
  await prisma.empleado.deleteMany({ where: { legajo: NUEVO } });
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

  const sector = await prisma.sector.findFirst({
    where: { activo: true },
    orderBy: { nombre: "asc" },
  });

  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Editar datos" }).click();
  const edicion = page.getByTestId(`empleado-edicion-${NUEVO}`);
  await expect(edicion).toBeVisible();

  await edicion.getByLabel("Apellido y nombre").fill("PRUEBA E2E, EDITADA");
  await edicion.getByLabel("Sector").selectOption(String(sector!.id));
  await edicion.getByRole("button", { name: "Guardar datos" }).click();

  // Como el alta, esto revalida la home con toda la nomina: en dev tarda.
  await expect(page.getByText("Datos del empleado actualizados.")).toBeVisible({
    timeout: 60_000,
  });

  const despues = await prisma.empleado.findUnique({ where: { legajo: NUEVO } });
  expect(despues!.apellidoNombre).toBe("PRUEBA E2E, EDITADA");
  expect(despues!.sectorId).toBe(sector!.id);
});

test("dar de baja lo saca de la grilla y desactiva su cuenta; se puede reactivar", async ({
  page,
}) => {
  await ingresarAdmin(page);
  await altaDePrueba(page, { conRol: true });
  await expect(page.getByText(/quedó en la nómina/)).toBeVisible();

  page.on("dialog", (d) => d.accept());

  await page.getByTestId(`usuario-${NUEVO}`).getByRole("button", { name: "Editar datos" }).click();
  await page
    .getByTestId(`empleado-edicion-${NUEVO}`)
    .getByRole("button", { name: "Dar de baja" })
    .click();
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
