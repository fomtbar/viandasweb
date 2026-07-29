import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas end-to-end contra el servidor de desarrollo.
 *
 * Requieren la base cargada con la nomina real (npm run db:import), porque
 * las verificaciones del plan se apoyan en datos concretos: el legajo 5169,
 * los 806 empleados, el sector "MANTENEINCE STAFF".
 *
 *   npm run dev        (en otra terminal)
 *   npm run e2e
 *
 * ESCRIBEN en la base: resetean contrasenas, borran preferencias y crean
 * pedidos. Por eso globalSetup exige PERMITIR_DESTRUCTIVO=si y aborta la
 * corrida entera si el .env no lo declara (ver e2e/guardia.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/guardia.ts",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
