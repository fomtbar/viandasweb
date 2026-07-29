import { requireAdmin } from "@/lib/auth/guards";
import { listarUsuariosAdmin } from "@/server/admin";
import { obtenerSectores } from "@/server/catalogos";
import { TablaUsuarios } from "./TablaUsuarios";

export const dynamic = "force-dynamic";

export default async function PaginaUsuarios() {
  const admin = await requireAdmin();
  const [usuarios, sectores] = await Promise.all([
    listarUsuariosAdmin(),
    obtenerSectores(),
  ]);

  return (
    <TablaUsuarios
      usuarios={usuarios.map((u) => ({
        ...u,
        ultimoLoginAt: u.ultimoLoginAt ? u.ultimoLoginAt.toISOString() : null,
      }))}
      sectores={sectores.map((s) => ({ id: s.id, nombre: s.nombre }))}
      miUsuarioLegajo={admin.legajo}
    />
  );
}
