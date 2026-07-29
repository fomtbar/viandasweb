"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useTransition,
} from "react";
import {
  Alerta,
  AreaTexto,
  Boton,
  CampoConEtiqueta,
  Entrada,
  ListaErrores,
  Panel,
  Seleccion,
} from "@/components/ui";
import { HoraInput } from "@/components/ui/HoraInput";
import { normalizar } from "@/lib/texto";
import {
  formatearFechaDdMmYyyy,
  hhmmAMinutos,
  minutosAHhmm,
  parseFechaIso,
} from "@/lib/tiempo";
import {
  armarAsunto,
  armarCuerpoTexto,
  type ContextoMail,
} from "@/lib/mail/constructor";
import {
  abrirMailto,
  construirMailto,
  excedeLimite,
  LIMITE_MAILTO,
  UMBRAL_AVISO_MAILTO,
} from "@/lib/mail/mailto";
import { minutoEnRango } from "@/lib/overtime/parse";
import { SelectorPersonas, type FilaPersona } from "./SelectorPersonas";
import { DialogoExterno } from "./DialogoExterno";
import { ModalFallbackMail } from "./ModalFallbackMail";
import { crearPedido, marcarPedidoEnviado } from "@/app/(app)/acciones";
import type {
  ClaveItem,
  DatosSolicitante,
  ItemSeleccionado,
  OpcionMotivo,
  OpcionSector,
  VentanaOt,
} from "./tipos";
import type { EmpleadoParaSeleccion } from "@/server/catalogos";

const MOTIVO_DEFAULT = "Overtime";
const OPCION_NUEVO = "__nuevo__";

// ── Estado de la seleccion ───────────────────────────────────

interface EstadoPedido {
  /**
   * LA fuente de verdad de la seleccion.
   *
   * Vive aca y nunca en el DOM ni en la fila renderizada. Por eso cambiar el
   * sector o escribir en el buscador solo cambia QUE se muestra, jamas que
   * esta marcado: es lo que permite armar un pedido con gente de varios
   * sectores, igual que el _sel_map de la app Tkinter.
   */
  seleccion: Map<ClaveItem, ItemSeleccionado>;
  externos: ItemSeleccionado[];
  filtroSectorId: number | null;
  busqueda: string;
}

type Accion =
  | { tipo: "alternar"; item: ItemSeleccionado }
  | { tipo: "marcarVisibles"; items: ItemSeleccionado[] }
  | { tipo: "desmarcarVisibles"; claves: ClaveItem[] }
  | { tipo: "agregarExterno"; item: ItemSeleccionado }
  | { tipo: "filtrarSector"; sectorId: number | null }
  | { tipo: "buscar"; texto: string }
  | { tipo: "limpiar" };

function reducir(estado: EstadoPedido, accion: Accion): EstadoPedido {
  switch (accion.tipo) {
    case "alternar": {
      const seleccion = new Map(estado.seleccion);
      if (seleccion.has(accion.item.clave)) seleccion.delete(accion.item.clave);
      else seleccion.set(accion.item.clave, accion.item);
      return { ...estado, seleccion };
    }
    case "marcarVisibles": {
      const seleccion = new Map(estado.seleccion);
      for (const item of accion.items) seleccion.set(item.clave, item);
      return { ...estado, seleccion };
    }
    case "desmarcarVisibles": {
      const seleccion = new Map(estado.seleccion);
      for (const clave of accion.claves) seleccion.delete(clave);
      return { ...estado, seleccion };
    }
    case "agregarExterno": {
      const seleccion = new Map(estado.seleccion);
      seleccion.set(accion.item.clave, accion.item);
      return {
        ...estado,
        seleccion,
        externos: [...estado.externos, accion.item],
      };
    }
    case "filtrarSector":
      return { ...estado, filtroSectorId: accion.sectorId };
    case "buscar":
      return { ...estado, busqueda: accion.texto };
    case "limpiar":
      return { ...estado, seleccion: new Map(), externos: [] };
    default:
      return estado;
  }
}

// ── Componente ───────────────────────────────────────────────

export function PedidoShell({
  empleados,
  sectores,
  cargos,
  motivos,
  sectorDefaultId,
  destinatariosTo,
  destinatariosCc,
  fechaHoy,
  solicitante,
  plantillaAsunto,
  plantillaCuerpo,
  ventanasOt,
  modoValidacionOt,
  permitirGmail,
}: {
  empleados: EmpleadoParaSeleccion[];
  sectores: OpcionSector[];
  cargos: string[];
  motivos: OpcionMotivo[];
  sectorDefaultId: number | null;
  destinatariosTo: string;
  destinatariosCc: string;
  fechaHoy: string;
  solicitante: DatosSolicitante;
  plantillaAsunto: string;
  plantillaCuerpo: string;
  ventanasOt: VentanaOt[];
  modoValidacionOt: string;
  permitirGmail: boolean;
}) {
  const [estado, despachar] = useReducer(reducir, {
    seleccion: new Map(),
    externos: [],
    filtroSectorId: sectorDefaultId,
    busqueda: "",
  });

  const [mostrarExterno, setMostrarExterno] = useState(false);
  const [fecha, setFecha] = useState(fechaHoy);
  const [horaDesde, setHoraDesde] = useState("");
  const [usaRango, setUsaRango] = useState(false);
  const [horaHasta, setHoraHasta] = useState("");
  const [motivoElegido, setMotivoElegido] = useState(MOTIVO_DEFAULT);
  const [motivoNuevo, setMotivoNuevo] = useState("");
  const [para, setPara] = useState(destinatariosTo);
  const [cc, setCc] = useState(destinatariosCc);

  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  /**
   * Si el GL toco el cuerpo a mano, dejamos de pisarselo.
   *
   * En la app Tkinter la vista previa se regeneraba entera ante cualquier
   * cambio, asi que las ediciones manuales se perdian sin aviso.
   */
  const [cuerpoEditado, setCuerpoEditado] = useState(false);

  const [errores, setErrores] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [confirmarFueraVentana, setConfirmarFueraVentana] = useState(false);
  const [fallback, setFallback] = useState<{ pedidoId: number } | null>(null);
  const [enviando, iniciarEnvio] = useTransition();

  const busquedaDiferida = useDeferredValue(estado.busqueda);

  /**
   * REGLA HEREDADA (app.py:206): si hay texto de busqueda, el filtro de sector
   * SE IGNORA y se busca en toda la nomina. Es deliberado: permite encontrar a
   * alguien de otro sector sin perder lo que ya estaba marcado.
   */
  const filasVisibles = useMemo<FilaPersona[]>(() => {
    const q = normalizar(busquedaDiferida.trim());

    const base = q
      ? empleados
      : empleados.filter(
          (e) =>
            estado.filtroSectorId === null || e.sectorId === estado.filtroSectorId,
        );

    const filtrados = q
      ? base.filter(
          (e) =>
            normalizar(e.apellidoNombre).includes(q) ||
            String(e.legajo).includes(q),
        )
      : base;

    const deNomina: FilaPersona[] = filtrados.map((e) => ({
      clave: `emp_${e.legajo}`,
      legajo: e.legajo,
      apellidoNombre: e.apellidoNombre,
      sectorNombre: e.sectorNombre,
      cargoNombre: e.cargoNombre,
      esExterno: false,
    }));

    const externos: FilaPersona[] = estado.externos.map((x) => ({
      clave: x.clave,
      legajo: x.legajo,
      apellidoNombre: x.apellidoNombre,
      sectorNombre: x.sectorNombre,
      cargoNombre: x.cargoNombre,
      esExterno: true,
    }));

    // Van PRIMERO, al reves que en la app Tkinter, que los agregaba al final.
    // Con la lista en "(Todos)" quedarian en la fila 807 y, como la tabla es
    // virtualizada, ni siquiera estarian en el DOM: quien acaba de agregar a
    // alguien no veria ninguna confirmacion sin scrollear hasta el fondo.
    return [...externos, ...deNomina];
  }, [empleados, estado.externos, estado.filtroSectorId, busquedaDiferida]);

  const itemDeFila = (fila: FilaPersona): ItemSeleccionado => ({
    clave: fila.clave as ClaveItem,
    legajo: fila.legajo,
    apellidoNombre: fila.apellidoNombre,
    sectorNombre: fila.sectorNombre,
    cargoNombre: fila.cargoNombre,
    esExterno: fila.esExterno,
  });

  const todosVisiblesMarcados =
    filasVisibles.length > 0 &&
    filasVisibles.every((f) => estado.seleccion.has(f.clave as ClaveItem));

  function alternarTodos() {
    if (todosVisiblesMarcados) {
      despachar({
        tipo: "desmarcarVisibles",
        claves: filasVisibles.map((f) => f.clave as ClaveItem),
      });
    } else {
      despachar({ tipo: "marcarVisibles", items: filasVisibles.map(itemDeFila) });
    }
  }

  const seleccionados = useMemo(
    () => [...estado.seleccion.values()],
    [estado.seleccion],
  );
  const cantidad = seleccionados.length;

  const motivoFinal =
    motivoElegido === OPCION_NUEVO ? motivoNuevo.trim() : motivoElegido;

  const opcionesMotivo = useMemo(() => {
    const textos = motivos.map((m) => m.texto);
    // "Overtime" se inyecta al principio aunque no exista en la base: es el
    // default historico de la app Tkinter y recien se persiste al usarlo.
    return textos.includes(MOTIVO_DEFAULT) ? textos : [MOTIVO_DEFAULT, ...textos];
  }, [motivos]);

  const desdeMin = hhmmAMinutos(horaDesde);
  const hastaMin = usaRango ? hhmmAMinutos(horaHasta) : null;

  // ── Vista previa ──
  // Se calcula con las MISMAS funciones puras que usa el servidor al guardar,
  // asi lo que se ve es exactamente lo que se manda.
  const contexto = useMemo<ContextoMail | null>(() => {
    const f = parseFechaIso(fecha);
    if (!f || desdeMin === null) return null;
    return {
      fecha: formatearFechaDdMmYyyy(f),
      retiroDesdeMin: desdeMin,
      retiroHastaMin: hastaMin,
      motivo: motivoFinal,
      solicitante,
      personas: seleccionados.map((s) => ({
        legajo: s.legajo,
        apellidoNombre: s.apellidoNombre,
        sectorNombre: s.sectorNombre,
      })),
    };
  }, [fecha, desdeMin, hastaMin, motivoFinal, solicitante, seleccionados]);

  useEffect(() => {
    if (!contexto) return;
    setAsunto(armarAsunto(contexto, plantillaAsunto));
    if (!cuerpoEditado) {
      setCuerpo(armarCuerpoTexto(contexto, plantillaCuerpo));
    }
  }, [contexto, plantillaAsunto, plantillaCuerpo, cuerpoEditado]);

  function regenerarPreview() {
    if (!contexto) return;
    setAsunto(armarAsunto(contexto, plantillaAsunto));
    setCuerpo(armarCuerpoTexto(contexto, plantillaCuerpo));
    setCuerpoEditado(false);
  }

  // ── Aviso preventivo de longitud ──
  const largoUrl = useMemo(() => {
    if (!cuerpo) return 0;
    return construirMailto({ para, cc, asunto, cuerpo }).length;
  }, [para, cc, asunto, cuerpo]);

  const mailLargo = largoUrl > UMBRAL_AVISO_MAILTO;

  // ── Aviso de ventana de overtime ──
  const fueraDeVentana = useMemo(() => {
    if (modoValidacionOt === "off" || desdeMin === null || ventanasOt.length === 0) {
      return false;
    }
    return !ventanasOt.some((v) =>
      minutoEnRango(desdeMin, { desdeMin: v.desdeMin, hastaMin: v.hastaMin }),
    );
  }, [desdeMin, ventanasOt, modoValidacionOt]);

  function limpiarFormulario() {
    despachar({ tipo: "limpiar" });
    setHoraDesde("");
    setUsaRango(false);
    setHoraHasta("");
    setMotivoElegido(MOTIVO_DEFAULT);
    setMotivoNuevo("");
    setAsunto("");
    setCuerpo("");
    setCuerpoEditado(false);
    setConfirmarFueraVentana(false);
    setFecha(fechaHoy);
  }

  function generar() {
    setErrores([]);
    setAviso(null);
    setExito(null);

    iniciarEnvio(async () => {
      const resultado = await crearPedido({
        fechaIso: fecha,
        retiroDesdeMin: desdeMin,
        usaRango,
        retiroHastaMin: hastaMin,
        motivo: motivoFinal,
        destinatariosTo: para,
        destinatariosCc: cc,
        asunto,
        cuerpo,
        items: seleccionados.map((s) => ({
          legajo: s.legajo,
          apellidoNombre: s.apellidoNombre,
          sectorNombre: s.sectorNombre,
          cargoNombre: s.cargoNombre,
          esExterno: s.esExterno,
        })),
        confirmoFueraDeVentana: confirmarFueraVentana,
      });

      if (!resultado.ok) {
        setErrores(resultado.errores);
        if (resultado.requiereConfirmacion) setConfirmarFueraVentana(true);
        return;
      }

      const pedidoId = resultado.pedidoId!;
      const url = construirMailto({ para, cc, asunto, cuerpo });

      if (excedeLimite(url)) {
        // No se intenta abrirlo: Windows lo cortaria sin avisar.
        setFallback({ pedidoId });
        return;
      }

      abrirMailto(url);
      await marcarPedidoEnviado(pedidoId, "mailto");
      setExito(`Pedido Nº ${pedidoId} generado. Se abrió su cliente de correo.`);
      if (resultado.avisoOt) setAviso(resultado.avisoOt);
      limpiarFormulario();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(380px,1fr)]">
      {/* ── Panel izquierdo: seleccion de personal ── */}
      <Panel className="flex h-[calc(100vh-9rem)] flex-col overflow-hidden">
        <div className="space-y-3 border-b border-linea p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-44 flex-1">
              <CampoConEtiqueta etiqueta="Sector" htmlFor="filtro-sector">
                <Seleccion
                  id="filtro-sector"
                  value={estado.filtroSectorId ?? ""}
                  disabled={estado.busqueda.trim().length > 0}
                  onChange={(e) =>
                    despachar({
                      tipo: "filtrarSector",
                      sectorId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                >
                  <option value="">(Todos)</option>
                  {sectores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Seleccion>
              </CampoConEtiqueta>
            </div>

            <div className="min-w-44 flex-1">
              <CampoConEtiqueta etiqueta="Buscar" htmlFor="buscar">
                <Entrada
                  id="buscar"
                  value={estado.busqueda}
                  placeholder="Nombre o legajo"
                  onChange={(e) =>
                    despachar({ tipo: "buscar", texto: e.target.value })
                  }
                />
              </CampoConEtiqueta>
            </div>
          </div>

          {estado.busqueda.trim() && (
            <p className="text-xs text-tinta-suave">
              Buscando en toda la nómina: el filtro de sector queda en pausa.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Boton variante="secundario" onClick={alternarTodos}>
              {todosVisiblesMarcados ? "Desmarcar todos" : "Marcar todos"}
            </Boton>
            <Boton variante="secundario" onClick={() => setMostrarExterno(true)}>
              + Agregar externo
            </Boton>
            <span className="ml-auto text-sm text-tinta-suave tabular">
              Marcados: <strong className="text-tinta">{cantidad}</strong> /{" "}
              {filasVisibles.length}
            </span>
          </div>
        </div>

        <SelectorPersonas
          filas={filasVisibles}
          seleccion={estado.seleccion as Map<string, ItemSeleccionado>}
          onToggle={(clave) => {
            const fila = filasVisibles.find((f) => f.clave === clave);
            if (fila) despachar({ tipo: "alternar", item: itemDeFila(fila) });
          }}
        />
      </Panel>

      {/* ── Panel derecho: datos del pedido ── */}
      <Panel className="flex h-[calc(100vh-9rem)] flex-col overflow-y-auto p-4">
        <h2 className="text-base font-semibold">Datos del pedido</h2>

        <div className="mt-4 space-y-4">
          {exito && <Alerta tono="exito">{exito}</Alerta>}
          {aviso && <Alerta tono="aviso">{aviso}</Alerta>}
          <ListaErrores errores={errores} />

          <CampoConEtiqueta etiqueta="Fecha de solicitud" htmlFor="fecha">
            <Entrada
              id="fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
            />
          </CampoConEtiqueta>

          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <CampoConEtiqueta etiqueta="Retiro desde" htmlFor="hora-desde">
                  <HoraInput
                    id="hora-desde"
                    valor={horaDesde}
                    onChange={setHoraDesde}
                    invalido={horaDesde.length > 0 && desdeMin === null}
                  />
                </CampoConEtiqueta>
              </div>
              <div className="flex-1">
                <CampoConEtiqueta etiqueta="Hasta" htmlFor="hora-hasta">
                  <HoraInput
                    id="hora-hasta"
                    valor={horaHasta}
                    onChange={setHoraHasta}
                    disabled={!usaRango}
                    invalido={usaRango && horaHasta.length > 0 && hastaMin === null}
                  />
                </CampoConEtiqueta>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-tinta-suave">
              <input
                type="checkbox"
                checked={usaRango}
                onChange={(e) => {
                  setUsaRango(e.target.checked);
                  if (!e.target.checked) setHoraHasta("");
                }}
              />
              Usar un rango horario
            </label>
          </div>

          {fueraDeVentana && (
            <Alerta tono="aviso" titulo="Fuera de las ventanas de overtime">
              El retiro {minutosAHhmm(desdeMin!)} no cae en ninguna ventana
              habilitada
              {ventanasOt.length > 0 && (
                <>
                  {" "}
                  ({ventanasOt
                    .map((v) => `${minutosAHhmm(v.desdeMin)}–${minutosAHhmm(v.hastaMin)}`)
                    .join(", ")})
                </>
              )}
              .{" "}
              {modoValidacionOt === "bloquear"
                ? "Deberá confirmarlo al generar."
                : "Puede continuar igual."}
            </Alerta>
          )}

          <CampoConEtiqueta etiqueta="Motivo" htmlFor="motivo">
            <Seleccion
              id="motivo"
              value={motivoElegido}
              onChange={(e) => setMotivoElegido(e.target.value)}
            >
              {opcionesMotivo.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OPCION_NUEVO}>[ Nuevo motivo… ]</option>
            </Seleccion>
          </CampoConEtiqueta>

          {motivoElegido === OPCION_NUEVO && (
            <CampoConEtiqueta etiqueta="Nuevo motivo" htmlFor="motivo-nuevo">
              <Entrada
                id="motivo-nuevo"
                value={motivoNuevo}
                autoFocus
                onChange={(e) => setMotivoNuevo(e.target.value)}
              />
            </CampoConEtiqueta>
          )}

          <CampoConEtiqueta etiqueta="Para" htmlFor="para">
            <Entrada id="para" value={para} onChange={(e) => setPara(e.target.value)} />
          </CampoConEtiqueta>

          <CampoConEtiqueta etiqueta="CC" htmlFor="cc">
            <Entrada id="cc" value={cc} onChange={(e) => setCc(e.target.value)} />
          </CampoConEtiqueta>

          <CampoConEtiqueta etiqueta="Asunto" htmlFor="asunto">
            <Entrada
              id="asunto"
              value={asunto}
              onChange={(e) => setAsunto(e.target.value)}
            />
          </CampoConEtiqueta>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="block text-xs font-semibold uppercase tracking-wide text-tinta-suave">
                Cuerpo del correo
              </span>
              <button
                type="button"
                onClick={regenerarPreview}
                className="text-xs text-acento hover:underline"
              >
                Regenerar
              </button>
            </div>
            <AreaTexto
              aria-label="Cuerpo del correo"
              rows={10}
              value={cuerpo}
              onChange={(e) => {
                setCuerpo(e.target.value);
                setCuerpoEditado(true);
              }}
              className="font-mono text-xs"
            />
            {cuerpoEditado && (
              <p className="text-xs text-tinta-suave">
                Editado a mano: no se va a regenerar solo.
              </p>
            )}
          </div>

          {mailLargo && (
            <Alerta tono="aviso">
              Correo largo ({largoUrl} de {LIMITE_MAILTO} caracteres). Si se pasa
              del límite se va a ofrecer descargar el borrador.
            </Alerta>
          )}

          {confirmarFueraVentana && (
            <label className="flex items-start gap-2 rounded border border-aviso/30 bg-aviso-tenue p-2 text-sm">
              <input
                type="checkbox"
                checked={confirmarFueraVentana}
                onChange={(e) => setConfirmarFueraVentana(e.target.checked)}
              />
              Confirmo el horario aunque esté fuera de las ventanas de overtime.
            </label>
          )}
        </div>

        <div className="mt-auto border-t border-linea pt-4">
          <p className="text-sm text-tinta-suave">
            Cantidad de viandas:{" "}
            <strong className="text-tinta tabular">{cantidad}</strong>
          </p>
          <Boton
            className="mt-2 w-full"
            onClick={generar}
            disabled={enviando || cantidad === 0}
          >
            {enviando ? "Generando…" : "Generar mail"}
          </Boton>
        </div>
      </Panel>

      {mostrarExterno && (
        <DialogoExterno
          sectores={sectores}
          cargos={cargos}
          onCerrar={() => setMostrarExterno(false)}
          onAgregar={(item) => {
            despachar({ tipo: "agregarExterno", item });
            setMostrarExterno(false);
          }}
        />
      )}

      {fallback && (
        <ModalFallbackMail
          pedidoId={fallback.pedidoId}
          cantidad={cantidad}
          para={para}
          cc={cc}
          asunto={asunto}
          cuerpo={cuerpo}
          permitirGmail={permitirGmail}
          onResuelto={async (metodo) => {
            await marcarPedidoEnviado(fallback.pedidoId, metodo);
            setExito(`Pedido Nº ${fallback.pedidoId} generado.`);
            setFallback(null);
            limpiarFormulario();
          }}
          onCerrar={() => {
            setFallback(null);
            limpiarFormulario();
          }}
        />
      )}
    </div>
  );
}
