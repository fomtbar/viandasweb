import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma 7 ya no carga el .env automaticamente: sin esto, migrate/studio
// fallan con "datasource url is undefined" al correr fuera de Docker.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // En Docker las variables ya vienen del entorno; no hay .env en disco.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: path.join("prisma", "migrations"),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
