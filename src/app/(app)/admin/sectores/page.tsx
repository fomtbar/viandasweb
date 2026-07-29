import { requireAdmin } from "@/lib/auth/guards";
import { obtenerSectores } from "@/server/catalogos";
import { TablaSectores } from "./TablaSectores";

export const dynamic = "force-dynamic";

export default async function PaginaSectores() {
  await requireAdmin();
  // Incluye los inactivos: desde acá se los vuelve a habilitar.
  const sectores = await obtenerSectores(false);
  return <TablaSectores sectores={sectores} />;
}
