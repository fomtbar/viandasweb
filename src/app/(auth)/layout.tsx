import type { ReactNode } from "react";
import Image from "next/image";

/**
 * Layout de las pantallas de acceso: centrado y SIN navegacion.
 * Que no haya nav es intencional: mientras el cambio de contrasena inicial
 * este pendiente, no debe haber ningun camino a otra pantalla.
 */
export default function LayoutAuth({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-lienzo p-4">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          {/* El PNG viene con fondo blanco opaco, no transparente. Sobre el
              gris del lienzo quedaba un cuadrado suelto: redondeado y con
              borde lee como icono de aplicacion. En el header no hace falta,
              ahi el panel ya es blanco. */}
          <Image
            src="/logo.png"
            alt="TBAR"
            width={64}
            height={64}
            priority
            className="mx-auto mb-3 h-16 w-16 rounded-xl border border-linea shadow-sm"
          />
          <h1 className="text-xl font-bold tracking-tight text-tinta">
            {process.env.NEXT_PUBLIC_APP_NAME ?? "Sistema de Viandas"}
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">
            Pedido de viandas para personal en overtime
          </p>
        </header>
        {children}
      </div>
    </main>
  );
}
