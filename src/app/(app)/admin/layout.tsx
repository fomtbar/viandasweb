import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

const SOLAPAS = [
  { href: "/admin/usuarios", etiqueta: "Usuarios" },
  { href: "/admin/sectores", etiqueta: "Sectores" },
  { href: "/admin/cargos", etiqueta: "Cargos" },
  { href: "/admin/motivos", etiqueta: "Motivos" },
  { href: "/admin/overtime", etiqueta: "Ventanas OT" },
  { href: "/admin/preferencias", etiqueta: "Preferencias" },
];

/**
 * El guard vive en el layout para que cubra TODA la seccion: cualquier ruta
 * nueva bajo /admin queda protegida sin que haya que acordarse de nada.
 */
export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Administración</h1>
        <nav className="mt-2 flex flex-wrap gap-1 border-b border-linea">
          {SOLAPAS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-t px-3 py-2 text-sm text-tinta-suave hover:bg-panel hover:text-tinta"
            >
              {s.etiqueta}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
