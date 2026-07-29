import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";

/**
 * Config de conexion a partir de variables sueltas y NO de una connection
 * string. Es deliberado: la contrasena viaja como propiedad de un objeto JS,
 * asi que un ';' o un '{' en ella no rompen nada. La DATABASE_URL sigue
 * existiendo, pero solo la usa el CLI de Prisma (migrate/studio) via
 * prisma.config.ts.
 */
function configuracionMssql() {
  const requerida = (nombre: string): string => {
    const valor = process.env[nombre];
    if (!valor) {
      throw new Error(
        `Falta la variable de entorno ${nombre}. Revisa .env (dev) o infraestructura/.env (Docker).`,
      );
    }
    return valor;
  };

  return {
    server: requerida("DB_HOST"),
    port: Number(process.env.DB_PUERTO ?? 1433),
    database: requerida("DB_NOMBRE"),
    user: requerida("DB_USUARIO"),
    password: requerida("DB_PASSWORD"),
    options: {
      encrypt: true,
      // Los SQL Server internos usan certificado autofirmado.
      trustServerCertificate: (process.env.DB_TRUST_CERT ?? "true") === "true",
      // Sin esto, mssql devuelve las fechas en la zona del proceso y las
      // columnas DATE se corren un dia.
      useUTC: true,
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
    connectionTimeout: 20_000,
    requestTimeout: 30_000,
  };
}

// En dev, Next recarga los modulos en cada cambio. Sin el singleton en
// globalThis cada recarga abre un pool nuevo y SQL Server termina rechazando
// conexiones.
const globalParaPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function crearCliente() {
  return new PrismaClient({
    adapter: new PrismaMssql(configuracionMssql()),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalParaPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = prisma;
}
