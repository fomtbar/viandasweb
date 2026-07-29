import { requireGl } from "@/lib/auth/guards";
import { resolverPreferencias } from "@/server/preferencias";
import { Panel } from "@/components/ui";
import { FormPreferencias } from "@/components/admin/FormPreferencias";
import { guardarConfigPropia } from "./acciones";
import { CLAVES_GLOBALES, CLAVES_USUARIO } from "@/lib/prefs/registro";

export const dynamic = "force-dynamic";

/**
 * Configuracion para cualquier GL: solo lo suyo es editable.
 *
 * Las preferencias generales se muestran para que se entienda de donde salen
 * los destinatarios y el formato del correo, pero deshabilitadas. El bloqueo
 * real esta en el servidor (ver config/acciones.ts).
 */
export default async function PaginaConfig() {
  const usuario = await requireGl();
  const valores = await resolverPreferencias(usuario.id);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Configuración</h1>

      <Panel className="max-w-2xl p-4">
        <h2 className="text-base font-semibold">Mis preferencias</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Solo afectan a los pedidos que generás vos.
        </p>
        <div className="mt-4">
          <FormPreferencias
            claves={CLAVES_USUARIO}
            valores={valores}
            rol="gl"
            accion={guardarConfigPropia}
          />
        </div>
      </Panel>

      <Panel className="max-w-2xl p-4">
        <h2 className="text-base font-semibold">Preferencias generales</h2>
        <p className="mt-1 text-sm text-tinta-suave">
          Las define un administrador. Se muestran para referencia.
        </p>
        <div className="mt-4">
          <FormPreferencias
            claves={CLAVES_GLOBALES}
            valores={valores}
            rol="gl"
            accion={guardarConfigPropia}
          />
        </div>
      </Panel>
    </div>
  );
}
