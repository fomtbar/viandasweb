import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import bcrypt from "bcryptjs";

/**
 * Fase 6: administracion y configuracion.
 * El chequeo central es el agujero de permisos de las preferencias.
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
const GL = 132;
const CLAVE = "viandas-e2e-2026";

/** Altas de catálogo que crean las pruebas. Se limpian en el afterAll. */
const SECTOR_E2E = "E2E SECTOR NUEVO";
const CARGO_E2E = "E2ECARGO";
const TURNO_E2E = "E2E TURNO";
const ORDEN_E2E = 99;

test.beforeAll(async () => {
  for (const legajo of [ADMIN, GL]) {
    await prisma.usuario.update({
      where: { legajo },
      data: {
        passwordHash: await bcrypt.hash(CLAVE, 10),
        debeCambiarPassword: false,
        passwordActualizadoAt: new Date(),
      },
    });
  }
});

test.afterAll(async () => {
  for (const legajo of [ADMIN, GL]) {
    await prisma.usuario.update({
      where: { legajo },
      data: {
        passwordHash: await bcrypt.hash(String(legajo), 10),
        debeCambiarPassword: true,
        passwordActualizadoAt: null,
        esAdmin: legajo === ADMIN,
        esGl: true,
        activo: true,
      },
    });
  }
  await prisma.motivo.deleteMany({ where: { texto: { startsWith: "E2E " } } });

  // Acotado a los dos usuarios de prueba: sin el where, esto borraba las
  // preferencias de TODA la nomina. Contra la base real eso es configuracion
  // de gente que no tiene nada que ver con las pruebas.
  await prisma.usuarioPreferencia.deleteMany({
    where: { usuario: { legajo: { in: [ADMIN, GL] } } },
  });

  // Altas de catálogo de las pruebas. Se borran de verdad y no se desactivan
  // porque nada las referencia: se crearon acá y no se les asignó nadie.
  await prisma.sector.deleteMany({ where: { nombre: SECTOR_E2E } });
  await prisma.cargo.deleteMany({ where: { codigo: CARGO_E2E } });
  await prisma.overtimeVentana.deleteMany({ where: { turnoHorario: TURNO_E2E } });

  await prisma.$disconnect();
});

async function ingresar(page: Page, legajo: number) {
  await page.goto("/login");
  await page.getByLabel("Legajo").fill(String(legajo));
  await page.getByLabel("Contraseña").fill(CLAVE);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();
}

test("un GL no puede modificar mail_to aunque le saque el disabled al campo", async ({
  page,
}) => {
  const antes = await prisma.preferencia.findUnique({ where: { clave: "mail_to" } });

  await ingresar(page, GL);
  await page.goto("/config");

  const campo = page.locator("#pref-mail_to");
  await expect(campo).toBeVisible();
  await expect(campo).toBeDisabled();

  // Se saca el disabled desde el navegador, como haria cualquiera con las
  // herramientas de desarrollo, y se envia el formulario igual.
  await campo.evaluate((el: HTMLInputElement) => {
    el.disabled = false;
    el.value = "atacante@ejemplo.com";
  });
  await page
    .locator("form")
    .filter({ has: page.locator("#pref-mail_to") })
    .getByRole("button", { name: "Guardar" })
    .click();

  await expect(page.getByTestId("alerta").filter({ hasText: "guardaron" })).toBeVisible();

  // La preferencia global NO cambio: el servidor descarto la clave.
  const despues = await prisma.preferencia.findUnique({ where: { clave: "mail_to" } });
  expect(despues!.valor).toBe(antes!.valor);
  expect(despues!.valor).not.toBe("atacante@ejemplo.com");
});

test("un GL sí puede guardar su propio CC", async ({ page }) => {
  await ingresar(page, GL);
  await page.goto("/config");

  await page.locator("#pref-mail_cc_propio").fill("mi.copia@ejemplo.com");
  await page
    .locator("form")
    .filter({ has: page.locator("#pref-mail_cc_propio") })
    .getByRole("button", { name: "Guardar" })
    .click();
  await expect(page.getByTestId("alerta").filter({ hasText: "guardaron" })).toBeVisible();

  const usuario = await prisma.usuario.findUnique({ where: { legajo: GL } });
  const propia = await prisma.usuarioPreferencia.findUnique({
    where: { usuarioId_clave: { usuarioId: usuario!.id, clave: "mail_cc_propio" } },
  });
  expect(propia?.valor).toBe("mi.copia@ejemplo.com");

  // Y aparece precargado en el CC de la pantalla de pedido.
  await page.goto("/");
  await expect(page.getByLabel("CC")).toHaveValue(/mi\.copia@ejemplo\.com/);
});

test("el admin edita las preferencias generales y avisa por marcadores inválidos", async ({
  page,
}) => {
  const original = await prisma.preferencia.findUnique({
    where: { clave: "mail_subject_template" },
  });

  await ingresar(page, ADMIN);
  await page.goto("/admin/preferencias");

  await page.locator("#pref-mail_subject_template").fill("Viandas {fecha} {no_existe}");
  await page.getByRole("button", { name: "Guardar" }).click();

  await expect(page.getByTestId("alerta").filter({ hasText: "Preferencias guardadas" })).toBeVisible();
  // Avisa, pero no bloquea.
  await expect(
    page.getByTestId("alerta").filter({ hasText: "{no_existe}" }),
  ).toBeVisible();

  const guardada = await prisma.preferencia.findUnique({
    where: { clave: "mail_subject_template" },
  });
  expect(guardada!.valor).toBe("Viandas {fecha} {no_existe}");

  await prisma.preferencia.update({
    where: { clave: "mail_subject_template" },
    data: { valor: original!.valor },
  });
});

test("crear cuentas faltantes informa que la nómina ya está completa", async ({
  page,
}) => {
  await ingresar(page, ADMIN);
  await page.goto("/admin/usuarios");

  await page.getByRole("button", { name: "Crear cuentas faltantes" }).click();
  await expect(
    page.getByTestId("alerta").filter({ hasText: "ya tiene cuenta" }),
  ).toBeVisible({ timeout: 60_000 });
});

test("un admin no puede quitarse a sí mismo el rol ni desactivarse", async ({ page }) => {
  await ingresar(page, ADMIN);
  await page.goto("/admin/usuarios");
  await page.getByLabel("Buscar").fill(String(ADMIN));

  const fila = page.getByTestId(`usuario-${ADMIN}`);
  await expect(fila.getByRole("checkbox", { name: /es administrador/ })).toBeDisabled();
  await expect(fila.getByRole("checkbox", { name: /activo/ })).toBeDisabled();

  const enBase = await prisma.usuario.findUnique({ where: { legajo: ADMIN } });
  expect(enBase!.esAdmin).toBe(true);
});

test("resetear la contraseña expulsa la sesión abierta de esa persona", async ({
  browser,
}) => {
  const contextoGl = await browser.newContext();
  const paginaGl = await contextoGl.newPage();
  await ingresar(paginaGl, GL);
  await expect(paginaGl.getByRole("heading", { name: "Datos del pedido" })).toBeVisible();

  const contextoAdmin = await browser.newContext();
  const paginaAdmin = await contextoAdmin.newPage();
  await ingresar(paginaAdmin, ADMIN);
  await paginaAdmin.goto("/admin/usuarios");
  await paginaAdmin.getByLabel("Buscar").fill(String(GL));

  paginaAdmin.once("dialog", (d) => d.accept());
  await paginaAdmin
    .getByTestId(`usuario-${GL}`)
    .getByRole("button", { name: "Resetear clave" })
    .click();
  await expect(paginaAdmin.getByText(/Contraseña restablecida/)).toBeVisible();

  // La sesion que ya estaba abierta deja de valer en la siguiente navegacion.
  await paginaGl.goto("/historial");
  await expect(paginaGl).toHaveURL(/\/login/);

  await contextoGl.close();
  await contextoAdmin.close();
});

test("el admin crea y elimina un motivo", async ({ page }) => {
  await ingresar(page, ADMIN);
  await page.goto("/admin/motivos");

  await page.getByLabel("Agregar motivo").fill("E2E MOTIVO NUEVO");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByTestId("alerta").filter({ hasText: "Motivo creado" })).toBeVisible();

  expect(
    await prisma.motivo.findUnique({ where: { texto: "E2E MOTIVO NUEVO" } }),
  ).not.toBeNull();

  // Y aparece en el desplegable de la pantalla de pedido.
  await page.goto("/");
  await expect(page.getByLabel("Motivo")).toContainText("E2E MOTIVO NUEVO");

  await page.goto("/admin/motivos");
  const creado = await prisma.motivo.findUnique({ where: { texto: "E2E MOTIVO NUEVO" } });
  const fila = page.getByTestId(`motivo-${creado!.id}`);
  page.once("dialog", (d) => d.accept());
  await fila.getByRole("button", { name: "Eliminar" }).click();
  // Al testid del panel: hasta que el refresh desmonta la fila, el mismo texto
  // esta dos veces (el aviso del boton y el del encabezado) y sin acotar el
  // localizador Playwright corta por strict mode.
  await expect(
    page.getByTestId("alerta").filter({ hasText: "Motivo eliminado" }),
  ).toBeVisible();

  expect(
    await prisma.motivo.findUnique({ where: { texto: "E2E MOTIVO NUEVO" } }),
  ).toBeNull();
});

test("editar una ventana de overtime cambia la validación del retiro", async ({ page }) => {
  const original = await prisma.overtimeVentana.findFirst({ where: { orden: 1 } });

  await ingresar(page, ADMIN);
  await page.goto("/admin/overtime");

  // Un horario que no se entiende queda marcado y deja de validar.
  await page.getByLabel("OT previo de la ventana 1").fill("de tres a seis");
  await page.getByTestId("ventana-1").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText(/no se entendió el horario/)).toBeVisible();

  const rota = await prisma.overtimeVentana.findFirst({ where: { orden: 1 } });
  expect(rota!.otPrevioDesdeMin).toBeNull();

  // Se restaura y vuelve a parsear.
  await page.reload();
  await page.getByLabel("OT previo de la ventana 1").fill("3:00 A 6:00");
  await page.getByTestId("ventana-1").getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Ventana actualizada")).toBeVisible();

  const sana = await prisma.overtimeVentana.findFirst({ where: { orden: 1 } });
  expect(sana!.otPrevioDesdeMin).toBe(180);
  expect(sana!.otPrevioHastaMin).toBe(360);

  await prisma.overtimeVentana.update({
    where: { id: original!.id },
    data: {
      otPrevio: original!.otPrevio,
      otPrevioDesdeMin: original!.otPrevioDesdeMin,
      otPrevioHastaMin: original!.otPrevioHastaMin,
    },
  });
});

test("el admin crea un sector y aparece en la pantalla de pedido", async ({ page }) => {
  await ingresar(page, ADMIN);
  await page.goto("/admin/sectores");

  await page.getByLabel("Agregar sector").fill(SECTOR_E2E);
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByTestId("alerta").filter({ hasText: "creado" }),
  ).toBeVisible({ timeout: 60_000 });

  const creado = await prisma.sector.findFirst({ where: { nombre: SECTOR_E2E } });
  expect(creado).not.toBeNull();
  expect(creado!.activo).toBe(true);

  // Repetirlo no crea un duplicado.
  await page.getByLabel("Agregar sector").fill(SECTOR_E2E);
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByTestId("alerta").filter({ hasText: "Ya existe un sector" }),
  ).toBeVisible({ timeout: 60_000 });
  expect(await prisma.sector.count({ where: { nombre: SECTOR_E2E } })).toBe(1);

  // Y queda disponible en el filtro de sector de la pantalla de pedido.
  await page.goto("/");
  await expect(page.locator("#filtro-sector")).toContainText(SECTOR_E2E);
});

test("el admin crea un cargo y el código queda en mayúsculas", async ({ page }) => {
  await ingresar(page, ADMIN);
  await page.goto("/admin/cargos");

  // exact en los tres: sin el, "Descripción" tambien matchea los
  // "Descripción de ANALYST" de cada fila y "Es líder" los de la grilla.
  // Se escribe en minuscula a proposito: el servidor lo normaliza.
  await page.getByLabel("Código", { exact: true }).fill(CARGO_E2E.toLowerCase());
  await page.getByLabel("Descripción", { exact: true }).fill("Cargo de prueba E2E");
  await page.getByLabel("Es líder", { exact: true }).check();
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(
    page.getByTestId("alerta").filter({ hasText: "creado" }),
  ).toBeVisible({ timeout: 60_000 });

  const creado = await prisma.cargo.findUnique({ where: { codigo: CARGO_E2E } });
  expect(creado).not.toBeNull();
  expect(creado!.esLider).toBe(true);
  expect(creado!.activo).toBe(true);

  await expect(page.getByTestId(`cargo-${CARGO_E2E}`)).toBeVisible();
});

test("el admin crea una ventana de overtime y se le derivan los minutos", async ({
  page,
}) => {
  await ingresar(page, ADMIN);
  await page.goto("/admin/overtime");

  await page.getByLabel("Orden", { exact: true }).fill(String(ORDEN_E2E));
  await page.getByLabel("OT previo", { exact: true }).fill("3:15 A 5:45");
  await page.getByLabel("Horario del turno", { exact: true }).fill(TURNO_E2E);
  await page.getByRole("button", { name: "Agregar ventana" }).click();
  await expect(
    page.getByTestId("alerta").filter({ hasText: "Ventana creada" }),
  ).toBeVisible({ timeout: 60_000 });

  const creada = await prisma.overtimeVentana.findFirst({
    where: { turnoHorario: TURNO_E2E },
  });
  expect(creada).not.toBeNull();
  // El texto se convierte a minutos desde medianoche: 3:15 = 195, 5:45 = 345.
  expect(creada!.otPrevioDesdeMin).toBe(195);
  expect(creada!.otPrevioHastaMin).toBe(345);
});
