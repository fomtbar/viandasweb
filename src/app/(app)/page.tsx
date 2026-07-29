import { requireGl } from "@/lib/auth/guards";
import { Alerta } from "@/components/ui";
import { PedidoShell } from "@/components/pedido/PedidoShell";
import {
  obtenerEmpleadosParaSeleccion,
  obtenerSectores,
  obtenerCargos,
} from "@/server/catalogos";
import { obtenerMotivos } from "@/server/motivos";
import { resolverPreferencias } from "@/server/preferencias";
import { obtenerVentanasValidables } from "@/server/overtime";
import { formatearFechaIso, hoyEnZona } from "@/lib/tiempo";
import type { VentanaOt } from "@/components/pedido/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaNuevoPedido({
  searchParams,
}: {
  searchParams: Promise<{ password?: string }>;
}) {
  const usuario = await requireGl();
  const { password } = await searchParams;

  const [empleados, sectores, cargos, motivos, prefs, ventanas] =
    await Promise.all([
      obtenerEmpleadosParaSeleccion(),
      obtenerSectores(),
      obtenerCargos(),
      obtenerMotivos(),
      resolverPreferencias(usuario.id),
      obtenerVentanasValidables(),
    ]);

  // El CC propio del GL se suma al CC global, si lo configuró.
  const cc = [prefs.mail_cc.trim(), prefs.mail_cc_propio.trim()]
    .filter(Boolean)
    .join("; ");

  // Las ventanas se aplanan a rangos sueltos para que el aviso del cliente use
  // exactamente la misma comparación que la validación del servidor.
  const ventanasPlanas: VentanaOt[] = ventanas.flatMap((v) =>
    v.rangos.map((r) => ({
      orden: v.orden,
      etiqueta: `Ventana ${v.orden}`,
      desdeMin: r.desdeMin,
      hastaMin: r.hastaMin,
    })),
  );

  const sector = usuario.sectorDefault ?? usuario.empleado.sector;

  return (
    <div className="space-y-4">
      {password === "cambiada" && (
        <Alerta tono="exito">Su contraseña se actualizó correctamente.</Alerta>
      )}

      <PedidoShell
        empleados={empleados}
        sectores={sectores.map((s) => ({ id: s.id, nombre: s.nombre }))}
        cargos={cargos.map((c) => c.descripcion ?? c.codigo)}
        motivos={motivos.map((m) => ({ id: m.id, texto: m.texto }))}
        sectorDefaultId={usuario.sectorDefaultId ?? usuario.empleado.sectorId ?? null}
        destinatariosTo={prefs.mail_to}
        destinatariosCc={cc}
        fechaHoy={formatearFechaIso(hoyEnZona())}
        solicitante={{
          legajo: usuario.legajo,
          apellidoNombre: usuario.empleado.apellidoNombre,
          cargo:
            usuario.empleado.cargo?.descripcion ??
            usuario.empleado.cargo?.codigo ??
            "",
          sector: sector?.nombre ?? "",
        }}
        plantillaAsunto={prefs.mail_subject_template}
        plantillaCuerpo={prefs.mail_body_template}
        ventanasOt={ventanasPlanas}
        modoValidacionOt={prefs.ot_validacion_modo}
        permitirGmail={prefs.mail_metodo_default === "gmail"}
      />
    </div>
  );
}
