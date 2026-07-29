import { requireAdmin } from "@/lib/auth/guards";
import { obtenerCargos } from "@/server/catalogos";
import { TablaCargos } from "./TablaCargos";

export const dynamic = "force-dynamic";

export default async function PaginaCargos() {
  await requireAdmin();
  const cargos = await obtenerCargos(false);
  return <TablaCargos cargos={cargos} />;
}
