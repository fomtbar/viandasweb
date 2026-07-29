import { requireAdmin } from "@/lib/auth/guards";
import { resolverPreferencias } from "@/server/preferencias";
import { Panel } from "@/components/ui";
import { FormPreferencias } from "@/components/admin/FormPreferencias";
import { guardarPreferenciasAdmin } from "@/app/(app)/config/acciones";
import { CLAVES_GLOBALES } from "@/lib/prefs/registro";
import { PLACEHOLDERS_VALIDOS } from "@/lib/mail/plantilla";

export const dynamic = "force-dynamic";

export default async function PaginaPreferencias() {
  const usuario = await requireAdmin();
  const valores = await resolverPreferencias(usuario.id);

  return (
    <Panel className="p-4">
      <h2 className="text-base font-semibold">Preferencias generales</h2>
      <p className="mt-1 text-sm text-tinta-suave">
        Aplican a todos los GLs. Marcadores disponibles en las plantillas:{" "}
        <code className="rounded bg-lienzo px-1 text-xs">
          {PLACEHOLDERS_VALIDOS.map((p) => `{${p}}`).join(" ")}
        </code>
      </p>

      <div className="mt-4 max-w-2xl">
        <FormPreferencias
          claves={CLAVES_GLOBALES}
          valores={valores}
          rol="admin"
          accion={guardarPreferenciasAdmin}
        />
      </div>
    </Panel>
  );
}
