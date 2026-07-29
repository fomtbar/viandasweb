import { requireAdmin } from "@/lib/auth/guards";
import { listarUsuariosAdmin } from "@/server/admin";
import {
  obtenerSectores,
  obtenerCargos,
  obtenerTurnos,
} from "@/server/catalogos";
import { TablaUsuarios } from "./TablaUsuarios";

export const dynamic = "force-dynamic";

export default async function PaginaUsuarios() {
  const admin = await requireAdmin();
  const [usuarios, sectores, cargos, turnos] = await Promise.all([
    listarUsuariosAdmin(),
    obtenerSectores(),
    obtenerCargos(),
    obtenerTurnos(),
  ]);

  return (
    <TablaUsuarios
      usuarios={usuarios.map((u) => ({
        ...u,
        ultimoLoginAt: u.ultimoLoginAt ? u.ultimoLoginAt.toISOString() : null,
      }))}
      sectores={sectores.map((s) => ({ id: s.id, nombre: s.nombre }))}
      // El cargo se muestra por descripcion, pero muchos solo tienen codigo.
      cargos={cargos.map((c) => ({
        id: c.id,
        nombre: c.descripcion ?? c.codigo,
        esLider: c.esLider,
      }))}
      turnos={turnos.map((t) => ({ id: t.id, nombre: t.nombre }))}
      miUsuarioLegajo={admin.legajo}
    />
  );
}
