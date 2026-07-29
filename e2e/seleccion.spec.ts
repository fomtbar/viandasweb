import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Fase 3: las reglas no obvias de la seleccion de personal, que son las que
 * mas facil se rompen al portar.
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

const LEGAJO = 5169; // admin con sector MANTENEINCE STAFF
const CLAVE = "viandas-e2e-2026";

test.beforeAll(async () => {
  await prisma.usuario.update({
    where: { legajo: LEGAJO },
    data: {
      passwordHash: await bcrypt.hash(CLAVE, 10),
      debeCambiarPassword: false,
      passwordActualizadoAt: new Date(),
    },
  });
});

test.afterAll(async () => {
  await prisma.usuario.update({
    where: { legajo: LEGAJO },
    data: {
      passwordHash: await bcrypt.hash(String(LEGAJO), 10),
      debeCambiarPassword: true,
      passwordActualizadoAt: null,
    },
  });
  await prisma.$disconnect();
});

async function ingresar(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO));
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();
}

/** Lee el contador "Marcados: N / M". */
async function contador(page: Page) {
  const texto = (await page.getByText(/Marcados:/).innerText()).replace(/\s+/g, " ");
  const m = /Marcados: (\d+) \/ (\d+)/.exec(texto);
  return { marcados: Number(m![1]), visibles: Number(m![2]) };
}

const filas = (page: Page) => page.locator('[role="row"][aria-selected]');

test("arranca filtrado por el sector del usuario", async ({ page }) => {
  await ingresar(page);
  await expect(page.getByLabel("Sector")).toHaveValue(/\d+/);
  const { marcados, visibles } = await contador(page);
  expect(marcados).toBe(0);
  // Su sector, no los 806.
  expect(visibles).toBeGreaterThan(0);
  expect(visibles).toBeLessThan(806);
});

test("la seleccion sobrevive al cambio de filtro de sector", async ({ page }) => {
  await ingresar(page);

  // Marca las tres primeras del sector propio.
  for (let i = 0; i < 3; i++) await filas(page).nth(i).click();
  expect((await contador(page)).marcados).toBe(3);

  // Pasa a (Todos): la lista cambia, lo marcado no.
  await page.getByLabel("Sector").selectOption("");
  const todos = await contador(page);
  expect(todos.marcados).toBe(3);
  expect(todos.visibles).toBe(806);

  // Y vuelve.
  await page.getByLabel("Sector").selectOption({ index: 1 });
  expect((await contador(page)).marcados).toBe(3);
});

test("al buscar se ignora el sector y se busca en toda la nomina", async ({ page }) => {
  await ingresar(page);
  const inicial = await contador(page);

  await page.getByLabel("Buscar").fill("adrian");
  await expect(page.getByText("el filtro de sector queda en pausa")).toBeVisible();
  // El combo de sector se deshabilita mientras hay busqueda.
  await expect(page.getByLabel("Sector")).toBeDisabled();

  const buscando = await contador(page);
  expect(buscando.visibles).toBeGreaterThan(0);

  // Encuentra nombres con tilde escribiendo sin tilde.
  await expect(filas(page).first()).toContainText(/Adri[áa]n/i);

  // Y aparece gente de otros sectores, no solo del filtrado.
  const sectoresVistos = new Set<string>();
  const total = await filas(page).count();
  for (let i = 0; i < Math.min(total, 12); i++) {
    sectoresVistos.add(await filas(page).nth(i).innerText());
  }
  expect(sectoresVistos.size).toBeGreaterThan(1);

  // Al borrar la busqueda vuelve el filtro anterior.
  await page.getByLabel("Buscar").fill("");
  await expect(page.getByLabel("Sector")).toBeEnabled();
  expect((await contador(page)).visibles).toBe(inicial.visibles);
});

test("la seleccion tambien sobrevive a la busqueda, permitiendo varios sectores", async ({
  page,
}) => {
  await ingresar(page);

  await filas(page).first().click();
  expect((await contador(page)).marcados).toBe(1);

  await page.getByLabel("Buscar").fill("adrian");
  expect((await contador(page)).marcados).toBe(1);

  // Marca a alguien encontrado por busqueda (probablemente de otro sector).
  await filas(page).first().click();
  expect((await contador(page)).marcados).toBe(2);

  await page.getByLabel("Buscar").fill("");
  expect((await contador(page)).marcados).toBe(2);
});

test("marcar todos alterna sobre lo visible", async ({ page }) => {
  await ingresar(page);
  await page.getByLabel("Sector").selectOption("");

  await page.getByRole("button", { name: "Marcar todos" }).click();
  expect((await contador(page)).marcados).toBe(806);

  await page.getByRole("button", { name: "Desmarcar todos" }).click();
  expect((await contador(page)).marcados).toBe(0);
});

test("agrega una persona externa, queda pre-marcada y visible con cualquier filtro", async ({
  page,
}) => {
  await ingresar(page);

  await page.getByRole("button", { name: "+ Agregar externo" }).click();
  await page.getByLabel("Apellido y nombre *").fill("Pérez Juan (contratista)");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();

  // Pre-marcada.
  expect((await contador(page)).marcados).toBe(1);

  const externa = filas(page).filter({ hasText: "Pérez Juan (contratista)" });
  await expect(externa).toHaveCount(1);
  await expect(externa).toContainText("Externo");
  // Sin legajo ni sector muestra los guiones.
  await expect(externa).toContainText("—");

  // Sigue visible al cambiar de sector y al buscar otra cosa.
  await page.getByLabel("Sector").selectOption("");
  await expect(externa).toHaveCount(1);
  await page.getByLabel("Buscar").fill("zzzz-no-existe");
  await expect(externa).toHaveCount(1);
  expect((await contador(page)).marcados).toBe(1);
});

test("el dialogo de externo valida el nombre y el legajo", async ({ page }) => {
  await ingresar(page);
  await page.getByRole("button", { name: "+ Agregar externo" }).click();

  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByTestId("alerta")).toContainText("Ingrese el apellido y nombre");

  await page.getByLabel("Apellido y nombre *").fill("Alguien");
  await page.getByLabel("Legajo (opcional)").fill("no-numerico");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByTestId("alerta")).toContainText("solo números");
});

test("el campo de hora inserta los dos puntos solo", async ({ page }) => {
  await ingresar(page);
  const desde = page.getByLabel("Retiro desde");
  await desde.fill("1130");
  await expect(desde).toHaveValue("11:30");

  // El campo "Hasta" esta bloqueado hasta habilitar el rango.
  await expect(page.getByLabel("Hasta")).toBeDisabled();
  await page.getByLabel("Usar un rango horario").check();
  await expect(page.getByLabel("Hasta")).toBeEnabled();
  await page.getByLabel("Hasta").fill("1800");
  await expect(page.getByLabel("Hasta")).toHaveValue("18:00");
});

test("el motivo por defecto es Overtime y se puede escribir uno nuevo", async ({ page }) => {
  await ingresar(page);
  await expect(page.getByLabel("Motivo")).toHaveValue("Overtime");

  await page.getByLabel("Motivo").selectOption("__nuevo__");
  await expect(page.getByLabel("Nuevo motivo")).toBeVisible();
  await page.getByLabel("Nuevo motivo").fill("PRUEBA E2E");

  // El motivo escrito a mano llega a la vista previa del correo, que solo se
  // arma cuando ya hay personas marcadas y una hora valida.
  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("1100");
  await expect(page.getByLabel("Cuerpo del correo")).toHaveValue(/Motivo: PRUEBA E2E/);
});
