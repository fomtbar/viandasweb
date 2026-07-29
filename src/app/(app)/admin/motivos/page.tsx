import { requireAdmin } from "@/lib/auth/guards";
import { obtenerMotivos } from "@/server/motivos";
import { TablaMotivos } from "./TablaMotivos";

export const dynamic = "force-dynamic";

export default async function PaginaMotivos() {
  await requireAdmin();
  const motivos = await obtenerMotivos(false);
  return (
    <TablaMotivos
      motivos={motivos.map((m) => ({ id: m.id, texto: m.texto, usos: m.usos }))}
    />
  );
}
