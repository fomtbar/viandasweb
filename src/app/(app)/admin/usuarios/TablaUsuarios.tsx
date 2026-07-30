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
  actualizarPersonaAccion,
  crearPersonaAccion,
  crearUsuarioDeLegajo,
  reactivarEmpleadoAccion,
  resetearPasswordUsuario,
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
  /**
   * Legajo de la persona que se esta editando en el modal, o null.
   *
   * Vive aca y no en cada fila por dos razones: solo puede haber una edicion
   * abierta, y el modal se monta FUERA de la tabla. Meterlo en un <tr> lo ata
   * al scroll de la grilla, que es justo lo que hacia que al abrir la edicion
   * la fila se perdiera de vista.
   */
  const [legajoEditando, setLegajoEditando] = useState<number | null>(null);
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

  // Se resuelve contra la lista y no se guarda la fila entera en el estado:
  // asi, despues de un router.refresh(), el modal muestra lo que quedo en la
  // base y no una copia vieja. Si la persona desaparece de la grilla (baja o
  // renumeracion), queda undefined y el modal se desmonta solo.
  const editando = usuarios.find((u) => u.legajo === legajoEditando);

  return (
    <div className="flex h-full flex-col gap-3">
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

      <Panel className="shrink-0 p-3">
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

      {/* Con 800 filas esta es la tabla que mas necesita la cabecera fija:
          el scroll es interno y el <thead> queda pegado arriba. Ver el
          comentario de TablaCatalogo sobre por que el fondo va en los <th>. */}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-linea bg-panel">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-xs uppercase tracking-wide text-tinta-suave">
              {[
                "Legajo",
                "Apellido y nombre",
                "Email",
                "Sector por defecto",
                "GL",
                "Admin",
                "Activo",
                "Acciones",
              ].map((c) => (
                <th
                  key={c}
                  className="bg-lienzo px-3 py-2 font-semibold shadow-[inset_0_-1px_0_var(--color-linea-fuerte)]"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.slice(0, 300).map((u) => (
              <Fila
                key={u.legajo}
                usuario={u}
                onEditar={() => setLegajoEditando(u.legajo)}
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

      {editando && (
        <ModalEdicionPersona
          // El key fuerza a remontar (y por lo tanto a releer los valores
          // iniciales) cuando se pasa de una persona a otra sin cerrar.
          key={editando.legajo}
          usuario={editando}
          sectores={sectores}
          cargos={cargos}
          turnos={turnos}
          esMiCuenta={editando.legajo === miUsuarioLegajo}
          onCerrar={() => setLegajoEditando(null)}
          onGuardado={(resultado) => {
            setEstado(resultado);
            setLegajoEditando(null);
            router.refresh();
          }}
        />
      )}
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

/**
 * Una persona de la nomina.
 *
 * La fila es de SOLO LECTURA: todo lo que se puede cambiar vive en el modal de
 * edicion. Antes la fila editaba email, sector y roles con su propio boton de
 * guardar, mientras un panel desplegable editaba nombre, sector, cargo y turno
 * con otro: dos formularios sobre la misma persona y dos maneras de guardar a
 * medias.
 */
function Fila({
  usuario,
  onEditar,
  onCambio,
  onResultado,
}: {
  usuario: FilaUsuario;
  onEditar: () => void;
  onCambio: () => void;
  /**
   * Para las operaciones que hacen desaparecer la fila (baja, reactivacion):
   * el aviso del propio boton se desmontaria junto con ella, asi que el
   * mensaje se manda al panel de arriba, que siempre esta.
   */
  onResultado: (resultado: Resultado) => void;
}) {
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
              const r = await reactivarEmpleadoAccion(usuario.legajo);
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
        <td className="px-3 py-1.5 text-xs" colSpan={5}>
          Sin cuenta de acceso.
        </td>
      ) : (
        <>
          <td className="px-3 py-1.5">
            {usuario.email ?? <span className="text-tinta-tenue">—</span>}
          </td>
          <td className="px-3 py-1.5">{usuario.sectorNombre}</td>
          {/* Los checks quedan deshabilitados en vez de reemplazarse por un
              simbolo: asi conservan su rol accesible y su etiqueta, que es de
              lo que se agarran las pruebas y los lectores de pantalla. */}
          <td className="px-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} es GL`}
              checked={usuario.esGl}
              disabled
              readOnly
            />
          </td>
          <td className="px-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} es administrador`}
              checked={usuario.esAdmin}
              disabled
              readOnly
            />
          </td>
          <td className="px-3 py-1.5">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} activo`}
              checked={usuario.activo}
              disabled
              readOnly
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
          <Boton variante="secundario" onClick={onEditar}>
            Editar datos
          </Boton>
        </div>
      </td>
    </tr>
  );
}

/**
 * El unico formulario de la persona: nomina y cuenta juntas.
 *
 * Va en un modal y no desplegado dentro de la grilla porque el panel inline
 * empujaba las filas y, con 800 personas y scroll interno, la fila que estabas
 * editando se perdia de vista y despues habia que buscarla para cerrarla.
 *
 * De regalo, la exclusividad sale gratis: con el modal abierto no hay otra
 * fila que tocar, asi que no hace falta deshabilitar nada.
 *
 * Dos advertencias sobre los campos:
 *
 *  - "Sector" y "Sector por defecto" NO son lo mismo. El primero es el de la
 *    nomina (donde trabaja) y el segundo el que se le precarga a esta persona
 *    cuando arma un pedido. Se ven parecidos y no lo son.
 *  - "Activo" es la baja: apaga la nomina Y la cuenta. Al desmarcarlo la
 *    persona sale de la grilla y del buscador de personal.
 */
function ModalEdicionPersona({
  usuario,
  sectores,
  cargos,
  turnos,
  esMiCuenta,
  onCerrar,
  onGuardado,
}: {
  usuario: FilaUsuario;
  sectores: Opcion[];
  cargos: OpcionCargo[];
  turnos: Opcion[];
  esMiCuenta: boolean;
  onCerrar: () => void;
  onGuardado: (resultado: Resultado) => void;
}) {
  const [legajo, setLegajo] = useState(String(usuario.legajo));
  const [apellidoNombre, setApellidoNombre] = useState(usuario.apellidoNombre);
  const [sectorId, setSectorId] = useState(usuario.sectorId);
  const [cargoId, setCargoId] = useState(usuario.cargoId);
  const [turnoId, setTurnoId] = useState(usuario.turnoId);
  const [email, setEmail] = useState(usuario.email ?? "");
  const [sectorDefaultId, setSectorDefaultId] = useState(usuario.sectorDefaultId);
  const [esGl, setEsGl] = useState(usuario.esGl);
  const [esAdmin, setEsAdmin] = useState(usuario.esAdmin);
  const [activo, setActivo] = useState(usuario.activo);

  const id = (campo: string) => `edit-${campo}-${usuario.legajo}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Editar a ${usuario.apellidoNombre}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCerrar();
      }}
      // Solo el fondo cierra; un clic adentro no debe descartar lo cargado.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        data-testid={`empleado-edicion-${usuario.legajo}`}
        className="my-auto w-full max-w-4xl rounded-lg border border-linea bg-panel p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{usuario.apellidoNombre}</h2>
            <p className="mt-1 text-xs text-tinta-suave">
              Legajo {usuario.legajo} · {usuario.cargoNombre}
            </p>
          </div>
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CampoConEtiqueta
            etiqueta="Legajo"
            htmlFor={id("legajo")}
            ayuda={
              esMiCuenta
                ? "No puede cambiar su propio legajo."
                : "Lo siguen la cuenta y sus pedidos del historial."
            }
          >
            <Entrada
              id={id("legajo")}
              type="number"
              min={1}
              value={legajo}
              disabled={esMiCuenta}
              onChange={(e) => setLegajo(e.target.value)}
            />
          </CampoConEtiqueta>

          <CampoConEtiqueta etiqueta="Apellido y nombre" htmlFor={id("nombre")}>
            <Entrada
              id={id("nombre")}
              maxLength={150}
              value={apellidoNombre}
              autoFocus
              onChange={(e) => setApellidoNombre(e.target.value)}
            />
          </CampoConEtiqueta>

          <CampoConEtiqueta etiqueta="Email" htmlFor={id("email")}>
            <Entrada
              id={id("email")}
              type="email"
              maxLength={200}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </CampoConEtiqueta>

          <CampoConEtiqueta
            etiqueta="Sector"
            htmlFor={id("sector")}
            ayuda="Dónde trabaja, en la nómina."
          >
            <Seleccion
              id={id("sector")}
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
            etiqueta="Sector por defecto"
            htmlFor={id("sector-defecto")}
            ayuda="El que se le precarga al armar un pedido."
          >
            <Seleccion
              id={id("sector-defecto")}
              value={sectorDefaultId ?? ""}
              onChange={(e) =>
                setSectorDefaultId(e.target.value ? Number(e.target.value) : null)
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

          <CampoConEtiqueta etiqueta="Cargo" htmlFor={id("cargo")}>
            <Seleccion
              id={id("cargo")}
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

          <CampoConEtiqueta etiqueta="Turno" htmlFor={id("turno")}>
            <Seleccion
              id={id("turno")}
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

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-linea pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} es GL`}
              checked={esGl}
              onChange={(e) => setEsGl(e.target.checked)}
            />
            Puede pedir viandas (GL)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} es administrador`}
              checked={esAdmin}
              disabled={esMiCuenta}
              title={esMiCuenta ? "No puede quitarse su propio rol" : undefined}
              onChange={(e) => setEsAdmin(e.target.checked)}
            />
            Administrador
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              aria-label={`${usuario.apellidoNombre} activo`}
              checked={activo}
              disabled={esMiCuenta}
              onChange={(e) => {
                // Desmarcarlo es la baja: se avisa acá y no al guardar, para
                // que quien lo destildó sin querer lo note en el momento.
                if (
                  !e.target.checked &&
                  !window.confirm(
                    `¿Dar de baja a ${usuario.apellidoNombre}? Deja de aparecer en el buscador de personal y su cuenta se desactiva. El historial de pedidos se conserva.`,
                  )
                ) {
                  return;
                }
                setActivo(e.target.checked);
              }}
            />
            Activo (en la nómina y con la cuenta habilitada)
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-linea pt-4">
          <BotonFila
            etiqueta="Guardar datos"
            onGuardar={async () => {
              const r = await actualizarPersonaAccion({
                legajoActual: usuario.legajo,
                legajo,
                apellidoNombre,
                sectorId,
                cargoId,
                turnoId,
                email,
                sectorDefaultId,
                esGl,
                esAdmin,
                activo,
              });
              // Al salir bien el modal se cierra, asi que el aviso del propio
              // boton se desmontaria con el: el mensaje lo muestra el panel de
              // arriba de la grilla, que siempre esta. Los errores, en cambio,
              // se quedan acá, al lado del formulario que hay que corregir.
              if (r.ok) onGuardado(r);
              return r;
            }}
          />
        </div>
      </div>
    </div>
  );
}
