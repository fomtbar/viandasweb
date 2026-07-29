import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Fase 7: las mejoras que la app Tkinter no tenia.
 *  - validar el retiro contra las ventanas de overtime
 *  - poder pedir para otra fecha
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

const LEGAJO = 5169;
const CLAVE = "viandas-e2e-2026";
const creados: number[] = [];
/** Ultimo id antes de la suite: todo lo que se cree despues es de las pruebas. */
let marcaDeAgua = 0;

test.beforeAll(async () => {
  marcaDeAgua =
    (await prisma.pedido.findFirst({ orderBy: { id: "desc" }, select: { id: true } }))?.id ?? 0;
  await prisma.usuario.update({
    where: { legajo: LEGAJO },
    data: {
      passwordHash: await bcrypt.hash(CLAVE, 10),
      debeCambiarPassword: false,
      passwordActualizadoAt: new Date(),
    },
  });
  await prisma.preferencia.update({
    where: { clave: "ot_validacion_modo" },
    data: { valor: "advertir" },
  });
});

test.afterAll(async () => {
  // Por marca de agua y no por la lista: una prueba puede crear pedidos que
  // nunca llegue a consultar, y si no se borran quedan sueltos en la base.
  void creados;
  await prisma.pedidoItem.deleteMany({ where: { pedido: { id: { gt: marcaDeAgua } } } });
  await prisma.pedido.deleteMany({ where: { id: { gt: marcaDeAgua } } });
  await prisma.preferencia.update({
    where: { clave: "ot_validacion_modo" },
    data: { valor: "advertir" },
  });
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
  await page.addInitScript(() => {
    (window as unknown as { __mailtos: string[] }).__mailtos = [];
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith("mailto:")) {
        (window as unknown as { __mailtos: string[] }).__mailtos.push(this.href);
      }
    };
  });
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO));
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();
}

const filas = (page: Page) => page.locator('[role="row"][aria-selected]');
const avisoOt = (page: Page) =>
  page.getByTestId("alerta").filter({ hasText: "Fuera de las ventanas de overtime" });

async function ultimoPedido() {
  const p = await prisma.pedido.findFirst({
    where: { solicitanteLegajo: LEGAJO },
    orderBy: { id: "desc" },
  });
  if (p && !creados.includes(p.id)) creados.push(p.id);
  return p;
}

test("un retiro a las 10:00 queda fuera de toda ventana y se avisa", async ({ page }) => {
  await ingresar(page);
  await filas(page).first().click();

  await page.getByLabel("Retiro desde").fill("1000");
  await expect(avisoOt(page)).toBeVisible();
  await expect(avisoOt(page)).toContainText("Puede continuar igual");
});

test("un retiro a la 01:30 NO avisa: cae en la ventana que cruza medianoche", async ({
  page,
}) => {
  await ingresar(page);
  await filas(page).first().click();

  // 01:30 esta dentro de "23:13 A 2:34". Es el caso que valida el algoritmo:
  // con una comparacion ingenua de rangos daria fuera de ventana.
  await page.getByLabel("Retiro desde").fill("0130");
  await expect(avisoOt(page)).toHaveCount(0);
});

test("un retiro a las 04:00 tampoco avisa", async ({ page }) => {
  await ingresar(page);
  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("0400");
  await expect(avisoOt(page)).toHaveCount(0);
});

test("con la validación en advertir, el pedido fuera de ventana se genera igual", async ({
  page,
}) => {
  await ingresar(page);
  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("1000");
  await page.getByRole("button", { name: "Generar mail" }).click();

  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido Nº" })).toBeVisible();

  const pedido = await ultimoPedido();
  expect(pedido!.retiroDesdeMin).toBe(600);
  // Queda registrado para poder revisarlo despues.
  expect(pedido!.fueraDeVentanaOt).toBe(true);
});

test("con la validación en bloquear, hay que confirmar explícitamente", async ({ page }) => {
  await prisma.preferencia.update({
    where: { clave: "ot_validacion_modo" },
    data: { valor: "bloquear" },
  });

  await ingresar(page);
  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("1000");
  await expect(avisoOt(page)).toContainText("Deberá confirmarlo al generar");

  await page.getByRole("button", { name: "Generar mail" }).click();

  const error = page.locator('[data-testid="alerta"][data-tono="error"]');
  await expect(error).toContainText("no cae dentro de ninguna ventana");

  // Aparece la casilla de confirmacion; al aceptarla, ya pasa.
  const confirmacion = page.getByRole("checkbox", { name: /Confirmo el horario/ });
  await expect(confirmacion).toBeChecked();
  await page.getByRole("button", { name: "Generar mail" }).click();
  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido Nº" })).toBeVisible();

  await prisma.preferencia.update({
    where: { clave: "ot_validacion_modo" },
    data: { valor: "advertir" },
  });
});

test("se puede pedir para otra fecha y queda guardada sin correrse un día", async ({
  page,
}) => {
  await ingresar(page);
  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("0400");

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const iso = manana.toISOString().slice(0, 10);
  const [a, m, d] = iso.split("-");

  await page.getByLabel("Fecha de solicitud").fill(iso);
  // El asunto se rearma con la fecha nueva.
  await expect(page.getByLabel("Asunto")).toHaveValue(new RegExp(`${d}/${m}/${a}`));

  await page.getByRole("button", { name: "Generar mail" }).click();
  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido Nº" })).toBeVisible();

  const pedido = await ultimoPedido();
  // La fecha se guarda como DATE en UTC: no puede correrse al dia anterior
  // por la zona horaria de Argentina.
  expect(pedido!.fechaSolicitud.toISOString().slice(0, 10)).toBe(iso);
});

test("rechaza una fecha en el pasado y una demasiado lejana", async ({ page }) => {
  await ingresar(page);
  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("0400");

  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  await page.getByLabel("Fecha de solicitud").fill(ayer.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Generar mail" }).click();

  const error = page.locator('[data-testid="alerta"][data-tono="error"]');
  await expect(error).toContainText("anterior a hoy");

  const lejos = new Date();
  lejos.setDate(lejos.getDate() + 90);
  await page.getByLabel("Fecha de solicitud").fill(lejos.toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Generar mail" }).click();
  await expect(error).toContainText("días de anticipación");
});
