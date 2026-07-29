import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { requireUsuarioFresco } from "@/lib/auth/guards";
import { cerrarSesion } from "../(auth)/login/acciones";
import { formatearFechaDdMmYyyy, hoyEnZona } from "@/lib/tiempo";

export const dynamic = "force-dynamic";

/**
 * Layout de la aplicacion. El guard esta aca y no solo en el middleware:
 * el middleware valida la firma del JWT, pero esto revalida contra la base,
 * asi que una baja o un cambio de rol surten efecto en el acto.
 */
export default async function LayoutApp({ children }: { children: ReactNode }) {
  const usuario = await requireUsuarioFresco();
  const sector = usuario.sectorDefault ?? usuario.empleado.sector;
  const cargo =
    usuario.empleado.cargo?.descripcion ?? usuario.empleado.cargo?.codigo ?? null;

  return (
    // Alto exacto de la ventana: la pagina NO scrollea. El scroll vive dentro
    // de <main>, y los listados se lo quedan para que sus cabeceras no se
    // vayan de pantalla (ver TablaCatalogo).
    <div className="flex h-screen flex-col bg-lienzo">
      <header className="shrink-0 border-b border-linea bg-panel">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          {/* priority: es lo unico por encima del pliegue en todas las
              pantallas, y sin esto parpadea en cada navegacion. */}
          <Image
            src="/logo.png"
            alt="TBAR"
            width={32}
            height={32}
            priority
            className="h-8 w-8 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-semibold text-tinta">
                {usuario.esAdmin ? "Admin" : "GL"}: {usuario.empleado.apellidoNombre}
              </span>
              <span className="text-tinta-suave">
                {cargo && ` · ${cargo}`}
                {sector && ` · ${sector.nombre}`}
              </span>
            </p>
            <p className="text-xs text-tinta-tenue tabular">
              Legajo {usuario.legajo} · Hoy: {formatearFechaDdMmYyyy(hoyEnZona())}
            </p>
          </div>

          <nav className="flex items-center gap-1 text-sm">
            <EnlaceNav href="/">Nuevo pedido</EnlaceNav>
            <EnlaceNav href="/historial">Historial</EnlaceNav>
            <EnlaceNav href="/config">Config.</EnlaceNav>
            {usuario.esAdmin && <EnlaceNav href="/admin">Admin</EnlaceNav>}
            <EnlaceNav href="/cambiar-password?voluntario=1">Cambiar clave</EnlaceNav>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded px-2.5 py-1.5 text-tinta-suave hover:bg-lienzo hover:text-tinta"
              >
                Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      {/* min-h-0 es imprescindible: sin el, un hijo flex crece con su
          contenido en vez de scrollear, y el h-screen de arriba no sirve.
          overflow-y-auto y no overflow-hidden para que las pantallas que no
          manejan su propio scroll (pedido, config) sigan funcionando igual. */}
      <main className="mx-auto min-h-0 w-full max-w-[1600px] flex-1 overflow-y-auto p-4">
        {children}
      </main>
    </div>
  );
}

function EnlaceNav({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-2.5 py-1.5 text-tinta-suave hover:bg-lienzo hover:text-tinta"
    >
      {children}
    </Link>
  );
}
