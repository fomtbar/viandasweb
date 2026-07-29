import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Fase 5: historial, detalle y cancelacion.
 * Lo central es el aislamiento entre GLs (el IDOR de la app original).
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
const OTRO_GL = 132;
const CLAVE = "viandas-e2e-2026";

let pedidoDelAdmin: number;
let pedidoDelOtro: number;

test.beforeAll(async () => {
  for (const legajo of [ADMIN, OTRO_GL]) {
    await prisma.usuario.update({
      where: { legajo },
      data: {
        passwordHash: await bcrypt.hash(CLAVE, 10),
        debeCambiarPassword: false,
        passwordActualizadoAt: new Date(),
      },
    });
  }

  // Un pedido de cada uno, para verificar que no se cruzan.
  const base = {
    fechaSolicitud: new Date(Date.UTC(2026, 6, 28)),
    retiroDesdeMin: 660,
    retiroHastaMin: null,
    cantidadViandas: 1,
    motivo: "E2E historial",
    destinatariosTo: "destino@x.com",
    destinatariosCc: null,
    asunto: "E2E asunto",
    cuerpo: "E2E cuerpo del correo",
    estado: "enviado",
    metodoEnvio: "mailto",
  };

  pedidoDelAdmin = (
    await prisma.pedido.create({
      data: {
        ...base,
        solicitanteLegajo: ADMIN,
        items: {
          create: [
            {
              legajo: ADMIN,
              apellidoNombre: "Masino Fernando Omar",
              sectorNombre: "MANTENEINCE STAFF",
              cargoNombre: "ANALYST",
              esExterno: false,
            },
          ],
        },
      },
    })
  ).id;

  pedidoDelOtro = (
    await prisma.pedido.create({
      data: {
        ...base,
        solicitanteLegajo: OTRO_GL,
        motivo: "E2E historial ajeno",
        items: {
          create: [
            {
              legajo: null,
              apellidoNombre: "Externo De Prueba",
              sectorNombre: "-",
              cargoNombre: "-",
              esExterno: true,
            },
          ],
        },
      },
    })
  ).id;
});

test.afterAll(async () => {
  const ids = [pedidoDelAdmin, pedidoDelOtro].filter(Boolean);
  await prisma.pedidoItem.deleteMany({ where: { pedidoId: { in: ids } } });
  await prisma.pedido.deleteMany({ where: { id: { in: ids } } });
  await prisma.motivo.deleteMany({ where: { texto: { startsWith: "E2E " } } });
  for (const legajo of [ADMIN, OTRO_GL]) {
    await prisma.usuario.update({
      where: { legajo },
      data: {
        passwordHash: await bcrypt.hash(String(legajo), 10),
        debeCambiarPassword: true,
        passwordActualizadoAt: null,
      },
    });
  }
  await prisma.$disconnect();
});

async function ingresar(page: Page, legajo: number) {
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(legajo));
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();
}

test("el admin ve los pedidos de todos, con la columna de solicitante", async ({ page }) => {
  await ingresar(page, ADMIN);
  await page.goto("/historial");

  await expect(page.getByRole("columnheader", { name: "Solicitante" })).toBeVisible();
  await expect(page.getByRole("link", { name: String(pedidoDelAdmin), exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: String(pedidoDelOtro), exact: true })).toBeVisible();
  await expect(page.getByText("de toda la planta")).toBeVisible();
});

test("un GL ve solo los propios y no la columna de solicitante", async ({ page }) => {
  await ingresar(page, OTRO_GL);
  await page.goto("/historial");

  await expect(page.getByRole("columnheader", { name: "Solicitante" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: String(pedidoDelOtro), exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: String(pedidoDelAdmin), exact: true })).toHaveCount(0);
});

test("el detalle de un pedido ajeno responde 404 y no 403", async ({ page }) => {
  await ingresar(page, OTRO_GL);

  // Es el IDOR de la app Tkinter: alli el detalle traia todos los pedidos y
  // filtraba en el cliente.
  const respuesta = await page.request.get(`/historial/${pedidoDelAdmin}`, {
    maxRedirects: 0,
  });
  expect(respuesta.status()).toBe(404);

  // Y el propio si abre.
  await page.goto(`/historial/${pedidoDelOtro}`);
  await expect(
    page.getByRole("heading", { name: `Pedido Nº ${pedidoDelOtro}` }),
  ).toBeVisible();
});

test("el detalle muestra los datos, las personas y el cuerpo guardado", async ({ page }) => {
  await ingresar(page, OTRO_GL);
  await page.goto(`/historial/${pedidoDelOtro}`);

  await expect(page.getByText("E2E historial ajeno")).toBeVisible();
  await expect(page.getByText("11:00")).toBeVisible();
  await expect(page.getByText("Externo De Prueba")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Externo", exact: true })).toBeVisible();
  // El cuerpo se guardaba desde siempre, pero la app original nunca lo mostraba.
  await expect(page.getByText("E2E cuerpo del correo")).toBeVisible();
});

test("cancelar deja registro de quien y cuando, y no se puede repetir", async ({ page }) => {
  await ingresar(page, OTRO_GL);
  await page.goto(`/historial/${pedidoDelOtro}`);

  await page.getByRole("button", { name: "Cancelar pedido" }).click();
  await page.getByLabel("Motivo de la cancelación").fill("Se suspendió el overtime");
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();

  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido cancelado" })).toBeVisible();
  await expect(page.getByText("Se suspendió el overtime")).toBeVisible();

  const enBase = await prisma.pedido.findUnique({ where: { id: pedidoDelOtro } });
  expect(enBase!.estado).toBe("cancelado");
  expect(enBase!.canceladoPorLegajo).toBe(OTRO_GL);
  expect(enBase!.canceladoAt).not.toBeNull();
  expect(enBase!.cancelacionMotivo).toBe("Se suspendió el overtime");

  // Ya cancelado, el boton desaparece.
  await expect(page.getByRole("button", { name: "Cancelar pedido" })).toHaveCount(0);

  // Y en la grilla queda atenuado.
  await page.goto("/historial");
  await expect(page.getByRole("cell", { name: "Cancelado" })).toBeVisible();
});

test("un GL no puede cancelar el pedido de otro", async ({ page }) => {
  await ingresar(page, OTRO_GL);

  // Se ataca la server action directamente, salteando la interfaz.
  const antes = await prisma.pedido.findUnique({ where: { id: pedidoDelAdmin } });
  expect(antes!.estado).not.toBe("cancelado");

  await page.goto(`/historial/${pedidoDelOtro}`);
  const resultado = await page.evaluate(async (idAjeno) => {
    const res = await fetch(`/historial/${idAjeno}`, { method: "GET" });
    return res.status;
  }, pedidoDelAdmin);
  expect(resultado).toBe(404);

  const despues = await prisma.pedido.findUnique({ where: { id: pedidoDelAdmin } });
  expect(despues!.estado).not.toBe("cancelado");
});
