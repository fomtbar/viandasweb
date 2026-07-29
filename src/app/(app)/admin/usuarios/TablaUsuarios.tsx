"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Boton, Entrada, Panel, Seleccion } from "@/components/ui";
import { AvisoOperacion, BotonFila } from "@/components/admin/TablaCatalogo";
import { normalizar } from "@/lib/texto";
import {
  actualizarUsuario,
  crearUsuarioDeLegajo,
  resetearPasswordUsuario,
  sincronizarNominaAccion,
  type Resultado,
} from "@/app/(app)/admin/acciones";

interface FilaUsuario {
  legajo: number;
  apellidoNombre: string;
  usuarioId: number | null;
  email: string | null;
  sectorNombre: string;
  sectorDefaultId: number | null;
  cargoNombre: string;
  esGl: boolean;
  esAdmin: boolean;
  activo: boolean;
  ultimoLoginAt: string | null;
  debeCambiarPassword: boolean;
}

interface Sector {
  id: number;
  nombre: string;
}

type Filtro = "todos" | "con-cuenta" | "sin-cuenta" | "gl" | "admin";

export function TablaUsuarios({
  usuarios,
  sectores,
  miUsuarioLegajo,
}: {
  usuarios: FilaUsuario[];
  sectores: Sector[];
  miUsuarioLegajo: number;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();
  const router = useRouter();

  const busquedaDiferida = useDeferredValue(busqueda);

  const visibles = useMemo(() => {
    const q = normalizar(busquedaDiferida.trim());
    return usuarios.filter((u) => {
      if (filtro === "con-cuenta" && u.usuarioId === null) return false;
      if (filtro === "sin-cuenta" && u.usuarioId !== null) return false;
      if (filtro === "gl" && !u.esGl) return false;
      if (filtro === "admin" && !u.esAdmin) return false;
      if (!q) return true;
      return (
        normalizar(u.apellidoNombre).includes(q) ||
        String(u.legajo).includes(q) ||
        normalizar(u.sectorNombre).includes(q) ||
        normalizar(u.email ?? "").includes(q)
      );
    });
  }, [usuarios, busquedaDiferida, filtro]);

  const conCuenta = usuarios.filter((u) => u.usuarioId !== null).length;
  const sinCuenta = usuarios.length - conCuenta;

  function sincronizar() {
    iniciar(async () => {
      setEstado(await sincronizarNominaAccion());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Panel className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <label
              htmlFor="buscar-usuario"
              className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
            >
              Buscar
            </label>
            <Entrada
              id="buscar-usuario"
              className="mt-1"
              placeholder="Nombre, legajo, sector o email"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <div className="min-w-44">
            <label
              htmlFor="filtro-usuario"
              className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave"
            >
              Mostrar
            </label>
            <Seleccion
              id="filtro-usuario"
              className="mt-1"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
            >
              <option value="todos">Todos</option>
              <option value="con-cuenta">Con cuenta</option>
              <option value="sin-cuenta">Sin cuenta</option>
              <option value="gl">Solo GLs</option>
              <option value="admin">Solo administradores</option>
            </Seleccion>
          </div>

          <Boton variante="secundario" onClick={sincronizar} disabled={procesando}>
            {procesando ? "Sincronizando…" : "Sincronizar nómina"}
          </Boton>
        </div>

        <p className="mt-2 text-sm text-tinta-suave tabular">
          {visibles.length} de {usuarios.length} empleados · {conCuenta} con cuenta ·{" "}
          {sinCuenta} sin cuenta
        </p>

        <div className="mt-2">
          <AvisoOperacion estado={estado} />
        </div>
      </Panel>

      <div className="overflow-x-auto rounded-lg border border-linea bg-panel">
        <table className="w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="border-b border-linea-fuerte bg-lienzo text-left text-xs uppercase tracking-wide text-tinta-suave">
              <th className="px-3 py-2 font-semibold">Legajo</th>
              <th className="px-3 py-2 font-semibold">Apellido y nombre</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">Sector por defecto</th>
              <th className="px-3 py-2 font-semibold">GL</th>
              <th className="px-3 py-2 font-semibold">Admin</th>
              <th className="px-3 py-2 font-semibold">Activo</th>
              <th className="px-3 py-2 font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.slice(0, 300).map((u) => (
              <Fila
                key={u.legajo}
                usuario={u}
                sectores={sectores}
                esMiCuenta={u.legajo === miUsuarioLegajo}
                onCambio={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
        {visibles.length > 300 && (
          <p className="border-t border-linea p-3 text-sm text-tinta-suave">
            Se muestran los primeros 300. Afiná la búsqueda para ver el resto.
          </p>
        )}
      </div>
    </div>
  );
}

function Fila({
  usuario,
  sectores,
  esMiCuenta,
  onCambio,
}: {
  usuario: FilaUsuario;
  sectores: Sector[];
  esMiCuenta: boolean;
  onCambio: () => void;
}) {
  const [email, setEmail] = useState(usuario.email ?? "");
  const [sectorId, setSectorId] = useState(usuario.sectorDefaultId);
  const [esGl, setEsGl] = useState(usuario.esGl);
  const [esAdmin, setEsAdmin] = useState(usuario.esAdmin);
  const [activo, setActivo] = useState(usuario.activo);

  const sinCuenta = usuario.usuarioId === null;

  return (
    <tr
      data-testid={`usuario-${usuario.legajo}`}
      className={`border-b border-linea last:border-0 ${
        sinCuenta ? "bg-lienzo/60 text-tinta-tenue" : ""
      }`}
    >
      <td className="px-3 py-1.5 tabular">{usuario.legajo}</td>
      <td className="px-3 py-1.5">
        <span className={sinCuenta ? "" : "font-medium"}>
          {usuario.apellidoNombre}
        </span>
        <span className="block text-xs text-tinta-tenue">{usuario.cargoNombre}</span>
      </td>

      {sinCuenta ? (
        <>
          <td className="px-3 py-1.5 text-xs" colSpan={5}>
            Sin cuenta de acceso.
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-1.5">
            <Entrada
              value={email}
              type="email"
              aria-label={`Email de ${usuario.apellidoNombre}`}
              onChange={(e) => setEmail(e.target.value)}
            />
          </td>
          <td className="px-3 py-1.5">
            <Seleccion
              value={sectorId ?? ""}
              aria-label={`Sector por defecto de ${usuario.apellidoNombre}`}
              onChange={(e) =>
                setSectorId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">(Sin definir)</option>
              {sectores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Seleccion>
          </td>
          <td className="px-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} es GL`}
              checked={esGl}
              onChange={(e) => setEsGl(e.target.checked)}
            />
          </td>
          <td className="px-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} es administrador`}
              checked={esAdmin}
              disabled={esMiCuenta}
              title={esMiCuenta ? "No puede quitarse su propio rol" : undefined}
              onChange={(e) => setEsAdmin(e.target.checked)}
            />
          </td>
          <td className="px-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} activo`}
              checked={activo}
              disabled={esMiCuenta}
              onChange={(e) => setActivo(e.target.checked)}
            />
          </td>
        </>
      )}

      <td className="px-3 py-1.5">
        {sinCuenta ? (
          <BotonFila
            etiqueta="Crear cuenta"
            onGuardar={async () => {
              const r = await crearUsuarioDeLegajo(usuario.legajo);
              if (r.ok) onCambio();
              return r;
            }}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <BotonFila
              onGuardar={() =>
                actualizarUsuario({
                  usuarioId: usuario.usuarioId!,
                  email,
                  sectorDefaultId: sectorId,
                  esGl,
                  esAdmin,
                  activo,
                })
              }
            />
            <BotonFila
              etiqueta="Resetear clave"
              confirmar={`¿Restablecer la contraseña de ${usuario.apellidoNombre} a su número de legajo? Se cerrarán sus sesiones abiertas.`}
              onGuardar={() => resetearPasswordUsuario(usuario.usuarioId!)}
            />
            {usuario.debeCambiarPassword && (
              <span className="text-xs text-tinta-tenue">clave inicial pendiente</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
