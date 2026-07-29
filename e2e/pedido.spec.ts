import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Fase 4: generacion del pedido y del correo.
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

/** Pedidos creados por las pruebas, para borrarlos al final. */
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
});

test.afterAll(async () => {
  // Por marca de agua y no por la lista: una prueba puede crear pedidos que
  // nunca llegue a consultar, y si no se borran quedan sueltos en la base.
  void creados;
  await prisma.pedidoItem.deleteMany({ where: { pedido: { id: { gt: marcaDeAgua } } } });
  await prisma.pedido.deleteMany({ where: { id: { gt: marcaDeAgua } } });
  await prisma.motivo.deleteMany({ where: { texto: { startsWith: "E2E " } } });
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
  // Los mailto: no tienen manejador en el navegador de prueba; sin esto la
  // navegacion a un protocolo desconocido ensucia la consola.
  await page.addInitScript(() => {
    (window as unknown as { __mailtos: string[] }).__mailtos = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith("mailto:")) {
        (window as unknown as { __mailtos: string[] }).__mailtos.push(this.href);
        return;
      }
      return clickOriginal.call(this);
    };
  });

  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(LEGAJO));
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();
}

const filas = (page: Page) => page.locator('[role="row"][aria-selected]');
const mailtos = (page: Page) =>
  page.evaluate(() => (window as unknown as { __mailtos: string[] }).__mailtos);

/** Ultimo pedido del solicitante, para verificar contra la base. */
async function ultimoPedido() {
  const p = await prisma.pedido.findFirst({
    where: { solicitanteLegajo: LEGAJO },
    orderBy: { id: "desc" },
    include: { items: true },
  });
  if (p && !creados.includes(p.id)) creados.push(p.id);
  return p;
}

test("un pedido chico abre el cliente de correo y queda enviado", async ({ page }) => {
  await ingresar(page);

  for (let i = 0; i < 3; i++) await filas(page).nth(i).click();
  await page.getByLabel("Retiro desde").fill("1100");

  // La vista previa se arma sola con la plantilla real.
  await expect(page.getByLabel("Asunto")).toHaveValue(/^Pedido de viandas - \d{2}\/\d{2}\/\d{4} - /);
  await expect(page.getByLabel("Cuerpo del correo")).toHaveValue(/Solicitamos 3 viandas/);
  await expect(page.getByLabel("Cuerpo del correo")).toHaveValue(/Retiro: 11:00/);

  await page.getByRole("button", { name: "Generar mail" }).click();
  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido Nº" })).toBeVisible();

  // Se abrio el correo y no el modal de respaldo.
  expect((await mailtos(page)).length).toBe(1);
  expect((await mailtos(page))[0]).toContain("mailto:overtimesolicitud%40gmail.com");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const pedido = await ultimoPedido();
  expect(pedido!.estado).toBe("enviado");
  expect(pedido!.metodoEnvio).toBe("mailto");
  expect(pedido!.cantidadViandas).toBe(3);
  expect(pedido!.items).toHaveLength(3);
  expect(pedido!.retiroDesdeMin).toBe(660);

  // El formulario se reinicia, como en la app original.
  await expect(page.getByLabel("Retiro desde")).toHaveValue("");
  await expect(page.getByText(/Marcados: 0/)).toBeVisible();
});

test("un pedido grande no intenta el mailto y ofrece el borrador .eml", async ({ page }) => {
  await ingresar(page);

  await page.getByLabel("Sector").selectOption("");
  // 30 personas: la URL se pasaria del limite de Windows.
  for (let i = 0; i < 30; i++) await filas(page).nth(i).click();
  await page.getByLabel("Retiro desde").fill("1100");

  // Antes de generar ya avisa que va largo.
  await expect(page.getByTestId("alerta").filter({ hasText: "Correo largo" })).toBeVisible();

  await page.getByRole("button", { name: "Generar mail" }).click();

  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("demasiado largo");
  await expect(modal).toContainText("30 personas");
  // No se intento abrir el correo.
  expect((await mailtos(page)).length).toBe(0);

  // El pedido ya quedo guardado, en borrador hasta que se elija como enviarlo.
  const pedido = await ultimoPedido();
  expect(pedido!.cantidadViandas).toBe(30);
  expect(pedido!.estado).toBe("borrador");

  // Descargar el borrador lo marca como enviado por .eml.
  const descarga = page.waitForEvent("download");
  await modal.getByRole("link", { name: "Descargar borrador" }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe(`pedido-${pedido!.id}.eml`);

  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido Nº" })).toBeVisible();
  const actualizado = await prisma.pedido.findUnique({ where: { id: pedido!.id } });
  expect(actualizado!.estado).toBe("enviado");
  expect(actualizado!.metodoEnvio).toBe("eml");
});

test("el .eml es un borrador editable, con acentos y sin inyeccion de HTML", async ({
  page,
}) => {
  // El asunto por defecto es ASCII puro, asi que para ejercitar la
  // codificacion RFC 2047 hay que meterle acentos a proposito.
  const plantillaOriginal = await prisma.preferencia.findUnique({
    where: { clave: "mail_subject_template" },
  });
  await prisma.preferencia.update({
    where: { clave: "mail_subject_template" },
    data: { valor: "Pedido de viandas – {fecha} – PRODUCCIÓN" },
  });

  await ingresar(page);

  // Un externo con marcado en el nombre: en la app Tkinter esto se
  // interpolaba crudo en el HTML del correo.
  await page.getByRole("button", { name: "+ Agregar externo" }).click();
  await page
    .getByLabel("Apellido y nombre *")
    .fill('<script>alert(1)</script> Ñandú Adrián');
  await page.getByRole("button", { name: "Agregar", exact: true }).click();

  await page.getByLabel("Retiro desde").fill("1100");
  await page.getByLabel("Motivo").selectOption("__nuevo__");
  await page.getByLabel("Nuevo motivo").fill("E2E PRODUCCIÓN");
  await page.getByRole("button", { name: "Generar mail" }).click();
  await expect(page.getByTestId("alerta").filter({ hasText: "Pedido Nº" })).toBeVisible();

  const pedido = await ultimoPedido();

  const respuesta = await page.request.get(`/api/pedidos/${pedido!.id}/eml`);
  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()["content-type"]).toContain("message/rfc822");
  expect(respuesta.headers()["content-disposition"]).toContain(
    `filename="pedido-${pedido!.id}.eml"`,
  );

  const eml = await respuesta.text();
  // Outlook lo abre en modo redaccion gracias a esta cabecera.
  expect(eml).toContain("X-Unsent: 1");
  // El asunto con acentos va codificado, si no se ve "PedÃ­do".
  expect(eml).toMatch(/Subject: =\?UTF-8\?B\?/);
  expect(eml).toContain("multipart/alternative");

  // El nombre del externo aparece escapado en la parte HTML.
  const frontera = /boundary="([^"]+)"/.exec(eml)![1];
  const partes = eml.split(`--${frontera}`);
  const html = Buffer.from(
    partes[2].split("\r\n\r\n").slice(1).join("").replace(/\r\n/g, ""),
    "base64",
  ).toString("utf8");
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("Ñandú Adrián");

  // Y el motivo nuevo quedo registrado con su primer uso.
  const motivo = await prisma.motivo.findUnique({ where: { texto: "E2E PRODUCCIÓN" } });
  expect(motivo?.usos).toBe(1);

  await prisma.preferencia.update({
    where: { clave: "mail_subject_template" },
    data: { valor: plantillaOriginal!.valor },
  });
});

test("un GL no puede bajarse el borrador de un pedido ajeno", async ({ page }) => {
  await ingresar(page);

  // Pedido del legajo 132, no del que esta logueado.
  const ajeno = await prisma.pedido.findFirst({
    where: { solicitanteLegajo: { not: LEGAJO } },
  });
  test.skip(!ajeno, "no hay pedidos de otro solicitante");

  // El usuario de prueba es admin, asi que primero se le quita ese rol.
  await prisma.usuario.update({ where: { legajo: LEGAJO }, data: { esAdmin: false } });
  try {
    await page.reload();
    const respuesta = await page.request.get(`/api/pedidos/${ajeno!.id}/eml`);
    expect(respuesta.status()).toBe(404);
  } finally {
    await prisma.usuario.update({ where: { legajo: LEGAJO }, data: { esAdmin: true } });
  }
});

test("acumula todos los errores de validacion en un solo aviso", async ({ page }) => {
  await ingresar(page);

  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("99");
  await page.getByLabel("Para").fill("");
  await page.getByRole("button", { name: "Generar mail" }).click();

  const error = page.locator('[data-testid="alerta"][data-tono="error"]');
  await expect(error).toContainText("Datos incompletos");
  await expect(error).toContainText("Hora 'Desde' inválida");
  await expect(error).toContainText("Falta el destinatario");
});

test("rechaza un rango horario incoherente", async ({ page }) => {
  await ingresar(page);

  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("1100");
  await page.getByLabel("Usar un rango horario").check();
  await page.getByLabel("Hasta").fill("1100");
  await page.getByRole("button", { name: "Generar mail" }).click();

  await expect(page.locator('[data-testid="alerta"][data-tono="error"]')).toContainText(
    "no puede ser igual",
  );
});

test("una plantilla con un marcador invalido no rompe la vista previa", async ({
  page,
}) => {
  const original = await prisma.preferencia.findUnique({
    where: { clave: "mail_body_template" },
  });
  await prisma.preferencia.update({
    where: { clave: "mail_body_template" },
    data: { valor: "Pedido de {cantidad} para {sector_que_no_existe}." },
  });

  try {
    await ingresar(page);
    await filas(page).first().click();
    await page.getByLabel("Retiro desde").fill("1100");

    // El marcador desconocido queda literal en vez de reventar.
    await expect(page.getByLabel("Cuerpo del correo")).toHaveValue(
      "Pedido de 1 para {sector_que_no_existe}.",
    );
  } finally {
    await prisma.preferencia.update({
      where: { clave: "mail_body_template" },
      data: { valor: original!.valor },
    });
  }
});

test("el cuerpo editado a mano no se pisa solo", async ({ page }) => {
  await ingresar(page);

  await filas(page).first().click();
  await page.getByLabel("Retiro desde").fill("1100");

  const cuerpo = page.getByLabel("Cuerpo del correo");
  await cuerpo.fill("Texto escrito a mano por el GL.");
  await expect(page.getByText("Editado a mano")).toBeVisible();

  // Cambiar la seleccion ya no lo regenera.
  await filas(page).nth(1).click();
  await expect(cuerpo).toHaveValue("Texto escrito a mano por el GL.");

  // Pero el boton de regenerar sí.
  await page.getByRole("button", { name: "Regenerar" }).click();
  await expect(cuerpo).toHaveValue(/Solicitamos 2 viandas/);
  await expect(page.getByText("Editado a mano")).toHaveCount(0);
});
