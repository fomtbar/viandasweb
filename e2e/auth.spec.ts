import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Fase 2 en un navegador de verdad: el formulario, la cookie httpOnly y el
 * cambio de clave forzado.
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

/** Deja al usuario como recien importado: clave = legajo y cambio pendiente. */
async function reiniciarUsuario(legajo: number) {
  await prisma.usuario.update({
    where: { legajo },
    data: {
      passwordHash: await bcrypt.hash(String(legajo), 10),
      debeCambiarPassword: true,
      passwordActualizadoAt: null,
    },
  });
}

const LEGAJO_GL = 132;

test.afterAll(async () => {
  await reiniciarUsuario(LEGAJO_GL);
  await prisma.$disconnect();
});

test("rechaza credenciales incorrectas sin revelar si el legajo existe", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO_GL));
  await page.getByLabel("Contraseña").fill("clave-que-no-es");
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page.getByTestId("alerta")).toContainText("Legajo o contraseña incorrectos");
  await expect(page).toHaveURL(/\/login/);

  // Un legajo inexistente devuelve exactamente el mismo mensaje.
  await page.getByLabel("Legajo").fill("99999999");
  await page.getByLabel("Contraseña").fill("cualquiera");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByTestId("alerta")).toContainText("Legajo o contraseña incorrectos");
});

test("un legajo sin rol de GL ni admin recibe el mensaje explicito", async ({ page }) => {
  const sinAcceso = await prisma.usuario.findFirst({
    where: { esGl: false, esAdmin: false },
  });
  test.skip(!sinAcceso, "no hay usuarios sin rol en la base");

  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(sinAcceso!.legajo));
  await page.getByLabel("Contraseña").fill(String(sinAcceso!.legajo));
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page.getByTestId("alerta")).toContainText(
    "Solo GLs y administradores pueden acceder al sistema.",
  );
});

test("primer ingreso: obliga a cambiar la clave y no deja salir", async ({ page, context }) => {
  await reiniciarUsuario(LEGAJO_GL);

  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO_GL));
  await page.getByLabel("Contraseña").fill(String(LEGAJO_GL));
  await page.getByRole("button", { name: "Ingresar" }).click();

  await expect(page).toHaveURL(/\/cambiar-password/);
  await expect(page.getByText("Es su primer ingreso")).toBeVisible();
  // Sin escapatoria mientras sea obligatorio.
  await expect(page.getByRole("link", { name: "Cancelar" })).toHaveCount(0);

  // Navegar a mano a otra pantalla rebota de vuelta.
  await page.goto("/historial");
  await expect(page).toHaveURL(/\/cambiar-password/);

  // La cookie de sesion no es accesible desde JavaScript.
  const cookies = await context.cookies();
  const sesion = cookies.find((c) => c.name === "viandas_sesion");
  expect(sesion?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("viandas_sesion");

  const error = page.locator('[data-testid="alerta"][data-tono="error"]');

  // Repetir el legajo como clave nueva no pasa. Con los legajos reales
  // (3 o 4 digitos) el que corta es el largo minimo; la regla explicita
  // "no puede ser su legajo" queda como respaldo para legajos mas largos.
  await page.getByLabel("Contraseña actual").fill(String(LEGAJO_GL));
  await page.getByLabel("Nueva contraseña", { exact: true }).fill(String(LEGAJO_GL));
  await page.getByLabel("Repetir nueva contraseña").fill(String(LEGAJO_GL));
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(error).toContainText("al menos 8 caracteres");

  // Dos veces distinto tampoco.
  await page.getByLabel("Contraseña actual").fill(String(LEGAJO_GL));
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("viandas-2026");
  await page.getByLabel("Repetir nueva contraseña").fill("viandas-2027");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(error).toContainText("no coinciden");

  // Con la contrasena actual equivocada tampoco.
  await page.getByLabel("Contraseña actual").fill("no-es-la-actual");
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("viandas-2026");
  await page.getByLabel("Repetir nueva contraseña").fill("viandas-2026");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(error).toContainText("La contraseña actual no es correcta");

  // Ahora una valida: entra a la aplicacion.
  await page.getByLabel("Contraseña actual").fill(String(LEGAJO_GL));
  await page.getByLabel("Nueva contraseña", { exact: true }).fill("viandas-2026");
  await page.getByLabel("Repetir nueva contraseña").fill("viandas-2026");
  await page.getByRole("button", { name: "Guardar contraseña" }).click();

  await expect(page).toHaveURL(/\/\?password=cambiada/);
  await expect(page.getByText("Su contraseña se actualizó correctamente")).toBeVisible();

  // Y el encabezado de la aplicacion ya muestra la sesion.
  await expect(
    page.locator("header").getByText(new RegExp(`Legajo ${LEGAJO_GL}`)),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
});

test("un GL no ve ni alcanza la seccion de administracion", async ({ page }) => {
  await prisma.usuario.update({
    where: { legajo: LEGAJO_GL },
    data: {
      passwordHash: await bcrypt.hash("viandas-2026", 10),
      debeCambiarPassword: false,
      passwordActualizadoAt: new Date(),
    },
  });

  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO_GL));
  await page.getByLabel("Contraseña").fill("viandas-2026");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);

  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page).toHaveURL(/localhost:3100\/$/);
});

test("cerrar sesion borra la cookie y vuelve al login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO_GL));
  await page.getByLabel("Contraseña").fill("viandas-2026");
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/localhost:3100\/$/);

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
