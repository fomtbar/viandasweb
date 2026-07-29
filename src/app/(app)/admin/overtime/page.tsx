import { requireAdmin } from "@/lib/auth/guards";
import { obtenerVentanas } from "@/server/overtime";
import { obtenerPreferenciaGlobal } from "@/server/preferencias";
import { TablaOvertime } from "./TablaOvertime";

export const dynamic = "force-dynamic";

export default async function PaginaOvertime() {
  await requireAdmin();
  const [ventanas, modo] = await Promise.all([
    obtenerVentanas(false),
    obtenerPreferenciaGlobal("ot_validacion_modo"),
  ]);

  return (
    <TablaOvertime
      modo={modo}
      ventanas={ventanas.map((v) => ({
        id: v.id,
        orden: v.orden,
        otPrevio: v.otPrevio ?? "",
        turnoHorario: v.turnoHorario ?? "",
        otPosterior: v.otPosterior ?? "",
        activo: v.activo,
        previoLegible:
          v.otPrevioDesdeMin !== null && v.otPrevioHastaMin !== null,
        posteriorLegible:
          v.otPosteriorDesdeMin !== null && v.otPosteriorHastaMin !== null,
      }))}
    />
  );
}
