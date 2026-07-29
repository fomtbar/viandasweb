import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Healthcheck del contenedor. Comprueba que la app responde Y que llega a la
 * base: un contenedor arriba con la DB caida no sirve de nada.
 *
 * Reporta cookieSecure a proposito: si el login entra en bucle, lo primero
 * que hay que mirar es si quedo en true sirviendo por HTTP.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const inicio = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      dbMs: Date.now() - inicio,
      cookieSecure: process.env.COOKIE_SECURE === "true",
      tz: process.env.TZ ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "error",
        db: "error",
        detalle: e instanceof Error ? e.message : String(e),
        cookieSecure: process.env.COOKIE_SECURE === "true",
      },
      { status: 503 },
    );
  }
}
