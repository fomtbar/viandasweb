"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boton,
  CampoConEtiqueta,
  Entrada,
  Panel,
  Seleccion,
} from "@/components/ui";
import { AvisoOperacion, BotonFila } from "@/components/admin/TablaCatalogo";
import { normalizar } from "@/lib/texto";
import {
  actualizarEmpleadoAccion,
  actualizarUsuario,
  cambiarActivoEmpleadoAccion,
  crearPersonaAccion,
  crearUsuarioDeLegajo,
  resetearPasswordUsuario,
  sincronizarNominaAccion,
  type Resultado,
} from "@/app/(app)/admin/acciones";

interface FilaUsuario {
  legajo: number;
  apellidoNombre: string;
  empleadoActivo: boolean;
  sectorId: number | null;
  cargoId: number | null;
  turnoId: number | null;
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

interface Opcion {
  id: number;
  nombre: string;
}

interface OpcionCargo extends Opcion {
  esLider: boolean;
}

type Filtro = "todos" | "con-cuenta" | "sin-cuenta" | "gl" | "admin" | "baja";

export function TablaUsuarios({
  usuarios,
  sectores,
  cargos,
  turnos,
  miUsuarioLegajo,
}: {
  usuarios: FilaUsuario[];
  sectores: Opcion[];
  cargos: OpcionCargo[];
  turnos: Opcion[];
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
      // Los dados de baja solo aparecen bajo su propio filtro: si no, la
      // grilla mezclaria gente que ya no esta en la planta.
      if (filtro === "baja") {
        if (u.empleadoActivo) return false;
      } else {
        if (!u.empleadoActivo) return false;
        if (filtro === "con-cuenta" && u.usuarioId === null) return false;
        if (filtro === "sin-cuenta" && u.usuarioId !== null) return false;
        if (filtro === "gl" && !u.esGl) return false;
        if (filtro === "admin" && !u.esAdmin) return false;
      }
      if (!q) return true;
      return (
        normalizar(u.apellidoNombre).includes(q) ||
        String(u.legajo).includes(q) ||
        normalizar(u.sectorNombre).includes(q) ||
        normalizar(u.email ?? "").includes(q)
      );
    });
  }, [usuarios, busquedaDiferida, filtro]);

  const enNomina = usuarios.filter((u) => u.empleadoActivo);
  const conCuenta = enNomina.filter((u) => u.usuarioId !== null).length;
  const deBaja = usuarios.length - enNomina.length;

  function sincronizar() {
    iniciar(async () => {
      setEstado(await sincronizarNominaAccion());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <FormularioAlta
        sectores={sectores}
        cargos={cargos}
        turnos={turnos}
        onCreado={(legajo) => {
          // La grilla corta en 300 filas y ordena por apellido: sin esto, la
          // persona recien dada de alta casi nunca queda a la vista.
          setBusqueda(String(legajo));
          setFiltro("todos");
          router.refresh();
        }}
      />

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
              <option value="baja">Dados de baja</option>
            </Seleccion>
          </div>

          {/* No importa nomina de ninguna fuente externa: crea la cuenta de
              acceso a los empleados que todavia no tengan una. */}
          <Boton variante="secundario" onClick={sincronizar} disabled={procesando}>
            {procesando ? "Creando…" : "Crear cuentas faltantes"}
          </Boton>
        </div>

        <p className="mt-2 text-sm text-tinta-suave tabular">
          {visibles.length} de {enNomina.length} en la nómina · {conCuenta} con
          cuenta · {enNomina.length - conCuenta} sin cuenta
          {deBaja > 0 && ` · ${deBaja} de baja`}
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
                cargos={cargos}
                turnos={turnos}
                esMiCuenta={u.legajo === miUsuarioLegajo}
                onCambio={() => router.refresh()}
                onResultado={setEstado}
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

/**
 * Alta de una persona nueva.
 *
 * Crea empleado + cuenta siempre. Sin rol GL ni administrador la cuenta existe
 * pero no puede iniciar sesion, que es justamente lo que se quiere para el
 * personal que solo tiene que aparecer en el buscador de viandas.
 */
function FormularioAlta({
  sectores,
  cargos,
  turnos,
  onCreado,
}: {
  sectores: Opcion[];
  cargos: OpcionCargo[];
  turnos: Opcion[];
  onCreado: (legajo: number) => void;
}) {
  const vacio = {
    legajo: "",
    apellidoNombre: "",
    sectorId: "",
    cargoId: "",
    turnoId: "",
    email: "",
    esGl: false,
    esAdmin: false,
  };

  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(vacio);
  const [estado, setEstado] = useState<Resultado | null>(null);
  const [procesando, iniciar] = useTransition();

  function cambiar<K extends keyof typeof vacio>(campo: K, valor: (typeof vacio)[K]) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  /** El rol se propone desde el cargo, igual que al crear cuentas en lote. */
  function elegirCargo(valor: string) {
    const cargo = cargos.find((c) => String(c.id) === valor);
    setDatos((d) => ({ ...d, cargoId: valor, esGl: cargo?.esLider ?? d.esGl }));
  }

  function guardar() {
    const legajo = Number(datos.legajo);
    iniciar(async () => {
      const resultado = await crearPersonaAccion(datos);
      setEstado(resultado);
      if (resultado.ok) {
        setDatos(vacio);
        onCreado(legajo);
      }
    });
  }

  if (!abierto) {
    return (
      <Panel className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-tinta-suave">
            ¿Entró alguien nuevo a la planta? Agregalo a la nómina para que
            aparezca en el buscador de personal.
          </p>
          <Boton onClick={() => setAbierto(true)}>Nueva persona</Boton>
        </div>
      </Panel>
    );
  }

  return (
    <Panel className="p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nueva persona</h2>
        <Boton
          variante="secundario"
          onClick={() => {
            setAbierto(false);
            setEstado(null);
          }}
        >
          Cancelar
        </Boton>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <CampoConEtiqueta etiqueta="Legajo" htmlFor="alta-legajo">
          <Entrada
            id="alta-legajo"
            type="number"
            min={1}
            value={datos.legajo}
            onChange={(e) => cambiar("legajo", e.target.value)}
          />
        </CampoConEtiqueta>

        <CampoConEtiqueta
          etiqueta="Apellido y nombre"
          htmlFor="alta-nombre"
          ayuda="Como tiene que figurar en el pedido."
        >
          <Entrada
            id="alta-nombre"
            maxLength={150}
            value={datos.apellidoNombre}
            onChange={(e) => cambiar("apellidoNombre", e.target.value)}
          />
        </CampoConEtiqueta>

        <CampoConEtiqueta etiqueta="Email" htmlFor="alta-email">
          <Entrada
            id="alta-email"
            type="email"
            maxLength={200}
            value={datos.email}
            onChange={(e) => cambiar("email", e.target.value)}
          />
        </CampoConEtiqueta>

        <CampoConEtiqueta etiqueta="Sector" htmlFor="alta-sector">
          <Seleccion
            id="alta-sector"
            value={datos.sectorId}
            onChange={(e) => cambiar("sectorId", e.target.value)}
          >
            <option value="">(Sin definir)</option>
            {sectores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Seleccion>
        </CampoConEtiqueta>

        <CampoConEtiqueta
          etiqueta="Cargo"
          htmlFor="alta-cargo"
          ayuda="Los cargos de líder proponen el rol GL."
        >
          <Seleccion
            id="alta-cargo"
            value={datos.cargoId}
            onChange={(e) => elegirCargo(e.target.value)}
          >
            <option value="">(Sin definir)</option>
            {cargos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Seleccion>
        </CampoConEtiqueta>

        <CampoConEtiqueta etiqueta="Turno" htmlFor="alta-turno">
          <Seleccion
            id="alta-turno"
            value={datos.turnoId}
            onChange={(e) => cambiar("turnoId", e.target.value)}
          >
            <option value="">(Sin definir)</option>
            {turnos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </Seleccion>
        </CampoConEtiqueta>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-linea pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={datos.esGl}
            onChange={(e) => cambiar("esGl", e.target.checked)}
          />
          Puede pedir viandas (GL)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={datos.esAdmin}
            onChange={(e) => cambiar("esAdmin", e.target.checked)}
          />
          Administrador
        </label>
        <p className="text-xs text-tinta-suave">
          Sin ninguno de los dos, la persona queda en la nómina pero no puede
          iniciar sesión.
        </p>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Boton onClick={guardar} disabled={procesando}>
          {procesando ? "Guardando…" : "Dar de alta"}
        </Boton>
        <span className="text-xs text-tinta-suave">
          La contraseña inicial es el número de legajo.
        </span>
      </div>

      <div className="mt-2">
        <AvisoOperacion estado={estado} />
      </div>
    </Panel>
  );
}

function Fila({
  usuario,
  sectores,
  cargos,
  turnos,
  esMiCuenta,
  onCambio,
  onResultado,
}: {
  usuario: FilaUsuario;
  sectores: Opcion[];
  cargos: OpcionCargo[];
  turnos: Opcion[];
  esMiCuenta: boolean;
  onCambio: () => void;
  /**
   * Para las operaciones que hacen desaparecer la fila (baja, reactivacion):
   * el aviso del propio boton se desmontaria junto con ella, asi que el
   * mensaje se manda al panel de arriba, que siempre esta.
   */
  onResultado: (resultado: Resultado) => void;
}) {
  const [email, setEmail] = useState(usuario.email ?? "");
  const [sectorId, setSectorId] = useState(usuario.sectorDefaultId);
  const [esGl, setEsGl] = useState(usuario.esGl);
  const [esAdmin, setEsAdmin] = useState(usuario.esAdmin);
  const [activo, setActivo] = useState(usuario.activo);
  const [editando, setEditando] = useState(false);

  const sinCuenta = usuario.usuarioId === null;
  const deBaja = !usuario.empleadoActivo;

  if (deBaja) {
    return (
      <tr
        data-testid={`usuario-${usuario.legajo}`}
        className="border-b border-linea text-tinta-tenue last:border-0"
      >
        <td className="px-3 py-1.5 tabular">{usuario.legajo}</td>
        <td className="px-3 py-1.5">
          <span className="line-through">{usuario.apellidoNombre}</span>
          <span className="block text-xs">{usuario.cargoNombre}</span>
        </td>
        <td className="px-3 py-1.5 text-xs" colSpan={5}>
          Dado de baja en la nómina. No aparece en el buscador de personal y su
          cuenta está desactivada.
        </td>
        <td className="px-3 py-1.5">
          <BotonFila
            etiqueta="Reactivar"
            confirmar={`¿Reactivar a ${usuario.apellidoNombre} en la nómina? La cuenta queda desactivada hasta que le asignes un rol.`}
            onGuardar={async () => {
              const r = await cambiarActivoEmpleadoAccion(usuario.legajo, true);
              if (r.ok) {
                onResultado(r);
                onCambio();
              }
              return r;
            }}
          />
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr
        data-testid={`usuario-${usuario.legajo}`}
        className={`border-b border-linea last:border-0 ${
          sinCuenta ? "bg-lienzo/60 text-tinta-tenue" : ""
        } ${editando ? "border-b-0" : ""}`}
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
          <div className="flex flex-wrap items-center gap-2">
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
              <>
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
                  <span className="text-xs text-tinta-tenue">
                    clave inicial pendiente
                  </span>
                )}
              </>
            )}
            <Boton variante="secundario" onClick={() => setEditando((v) => !v)}>
              {editando ? "Cerrar" : "Editar datos"}
            </Boton>
          </div>
        </td>
      </tr>

      {editando && (
        <FilaEdicionEmpleado
          usuario={usuario}
          sectores={sectores}
          cargos={cargos}
          turnos={turnos}
          esMiCuenta={esMiCuenta}
          onCambio={onCambio}
          onResultado={onResultado}
        />
      )}
    </>
  );
}

/**
 * Datos de la nomina (no de la cuenta): nombre, sector, cargo y turno.
 *
 * Va en una fila aparte y no como columnas nuevas porque la grilla ya tiene
 * ocho y un ancho minimo de 1100px.
 */
function FilaEdicionEmpleado({
  usuario,
  sectores,
  cargos,
  turnos,
  esMiCuenta,
  onCambio,
  onResultado,
}: {
  usuario: FilaUsuario;
  sectores: Opcion[];
  cargos: OpcionCargo[];
  turnos: Opcion[];
  esMiCuenta: boolean;
  onCambio: () => void;
  onResultado: (resultado: Resultado) => void;
}) {
  const [apellidoNombre, setApellidoNombre] = useState(usuario.apellidoNombre);
  const [sectorId, setSectorId] = useState(usuario.sectorId);
  const [cargoId, setCargoId] = useState(usuario.cargoId);
  const [turnoId, setTurnoId] = useState(usuario.turnoId);

  return (
    <tr
      data-testid={`empleado-edicion-${usuario.legajo}`}
      className="border-b border-linea bg-lienzo/40 last:border-0"
    >
      <td colSpan={8} className="px-3 py-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CampoConEtiqueta
            etiqueta="Apellido y nombre"
            htmlFor={`edit-nombre-${usuario.legajo}`}
          >
            <Entrada
              id={`edit-nombre-${usuario.legajo}`}
              maxLength={150}
              value={apellidoNombre}
              onChange={(e) => setApellidoNombre(e.target.value)}
            />
          </CampoConEtiqueta>

          <CampoConEtiqueta
            etiqueta="Sector"
            htmlFor={`edit-sector-${usuario.legajo}`}
          >
            <Seleccion
              id={`edit-sector-${usuario.legajo}`}
              value={sectorId ?? ""}
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
          </CampoConEtiqueta>

          <CampoConEtiqueta
            etiqueta="Cargo"
            htmlFor={`edit-cargo-${usuario.legajo}`}
          >
            <Seleccion
              id={`edit-cargo-${usuario.legajo}`}
              value={cargoId ?? ""}
              onChange={(e) =>
                setCargoId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">(Sin definir)</option>
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Seleccion>
          </CampoConEtiqueta>

          <CampoConEtiqueta
            etiqueta="Turno"
            htmlFor={`edit-turno-${usuario.legajo}`}
          >
            <Seleccion
              id={`edit-turno-${usuario.legajo}`}
              value={turnoId ?? ""}
              onChange={(e) =>
                setTurnoId(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">(Sin definir)</option>
              {turnos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
            </Seleccion>
          </CampoConEtiqueta>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <BotonFila
            etiqueta="Guardar datos"
            onGuardar={async () => {
              const r = await actualizarEmpleadoAccion({
                legajo: usuario.legajo,
                apellidoNombre,
                sectorId,
                cargoId,
                turnoId,
              });
              // El panel queda abierto a proposito: al cerrarlo se desmontaria
              // el aviso del boton y nadie veria la confirmacion.
              if (r.ok) onCambio();
              return r;
            }}
          />
          {!esMiCuenta && (
            <BotonFila
              etiqueta="Dar de baja"
              variante="peligro"
              confirmar={`¿Dar de baja a ${usuario.apellidoNombre}? Deja de aparecer en el buscador de personal y su cuenta se desactiva. El historial de pedidos se conserva.`}
              onGuardar={async () => {
                const r = await cambiarActivoEmpleadoAccion(usuario.legajo, false);
                if (r.ok) {
                  onResultado(r);
                  onCambio();
                }
                return r;
              }}
            />
          )}
        </div>
      </td>
    </tr>
  );
}
