/**
 * Registro de preferencias.
 *
 * DEUDA TECNICA QUE ESTO CIERRA: en la app Tkinter, cualquier GL abria
 * "Config." y `_guardar_prefs()` escribia las 6 claves globales. El readonly
 * de mail_to era solo visual (admin.py:651-658). Aca la autoridad es este
 * registro, del lado del servidor: si una clave llega en un form y el rol no
 * la puede editar, se descarta en silencio.
 *
 * `ambito` decide DONDE se guarda:
 *   global  -> tabla `preferencias`         (una fila por clave, compartida)
 *   usuario -> tabla `usuario_preferencias` (una fila por usuario+clave)
 */

export const MAIL_SUBJECT_DEFAULT =
  "Pedido de viandas - {fecha} - {sector_solicitante}";

// Literal exacto de C:\proyectosDev\viandas\src\db.py (MAIL_BODY_DEFAULT).
export const MAIL_BODY_DEFAULT = `Buenos días,

Solicitamos {cantidad} viandas para personal en overtime.

Fecha de solicitud: {fecha}
Retiro: {retiro}

Solicitante:
  Apellido y nombre: {sol_apellido_nombre}
  Legajo: {sol_legajo}
  Posición: {sol_cargo}
  Sector: {sol_sector}

Motivo: {motivo}

Personal que retira ({cantidad}):
{lista_personas}

Saludos.`;

export type Ambito = "global" | "usuario";
export type Rol = "gl" | "admin";
export type TipoPref = "texto" | "textoLargo" | "email" | "booleano" | "entero" | "opcion";

export interface DefinicionPref {
  clave: string;
  ambito: Ambito;
  /** Roles que pueden escribirla. Los GL leen todas las globales igual. */
  editablePor: Rol[];
  tipo: TipoPref;
  valorDefault: string;
  etiqueta: string;
  ayuda?: string;
  opciones?: readonly { valor: string; etiqueta: string }[];
}

export const PREFS = {
  mail_to: {
    clave: "mail_to",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "email",
    valorDefault: "overtimesolicitud@gmail.com",
    etiqueta: "Destinatario principal (Para)",
    ayuda: "Varias direcciones separadas por ; o ,",
  },
  mail_cc: {
    clave: "mail_cc",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "texto",
    valorDefault: "",
    etiqueta: "CC por defecto",
    ayuda: "Varias direcciones separadas por ; o ,",
  },
  mail_subject_template: {
    clave: "mail_subject_template",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "texto",
    valorDefault: MAIL_SUBJECT_DEFAULT,
    etiqueta: "Plantilla del asunto",
  },
  mail_body_template: {
    clave: "mail_body_template",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "textoLargo",
    valorDefault: MAIL_BODY_DEFAULT,
    etiqueta: "Plantilla del cuerpo",
  },
  mail_lista_formato: {
    clave: "mail_lista_formato",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "opcion",
    valorDefault: "tabla",
    etiqueta: "Formato de la lista en el mail HTML",
    opciones: [
      { valor: "tabla", etiqueta: "Tabla" },
      { valor: "texto", etiqueta: "Lista numerada" },
    ],
  },
  mail_metodo_default: {
    clave: "mail_metodo_default",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "opcion",
    valorDefault: "mailto",
    etiqueta: "Método de envío por defecto",
    ayuda: "Con qué se ofrece abrir el mail cuando entra en el límite del mailto.",
    opciones: [
      { valor: "mailto", etiqueta: "Cliente de correo (mailto)" },
      { valor: "gmail", etiqueta: "Gmail en el navegador" },
    ],
  },
  empresa_nombre: {
    clave: "empresa_nombre",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "texto",
    valorDefault: "",
    etiqueta: "Nombre de la empresa",
  },
  ot_validacion_modo: {
    clave: "ot_validacion_modo",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "opcion",
    valorDefault: "advertir",
    etiqueta: "Validación contra ventanas de overtime",
    opciones: [
      { valor: "off", etiqueta: "No validar" },
      { valor: "advertir", etiqueta: "Advertir (no bloquea)" },
      { valor: "bloquear", etiqueta: "Pedir confirmación" },
    ],
  },
  pedido_dias_futuro_max: {
    clave: "pedido_dias_futuro_max",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "entero",
    valorDefault: "30",
    etiqueta: "Días hacia adelante que se puede pedir",
  },
  pedido_permitir_fecha_pasada: {
    clave: "pedido_permitir_fecha_pasada",
    ambito: "global",
    editablePor: ["admin"],
    tipo: "booleano",
    valorDefault: "false",
    etiqueta: "Permitir pedir para una fecha ya pasada",
  },
  mail_cc_propio: {
    clave: "mail_cc_propio",
    ambito: "usuario",
    editablePor: ["gl", "admin"],
    tipo: "texto",
    valorDefault: "",
    etiqueta: "Mi CC (se suma al CC por defecto)",
    ayuda: "Se agrega al CC en todos tus pedidos.",
  },
} as const satisfies Record<string, DefinicionPref>;

export type ClavePref = keyof typeof PREFS;

export const CLAVES_GLOBALES = Object.values(PREFS)
  .filter((p) => p.ambito === "global")
  .map((p) => p.clave) as ClavePref[];

export const CLAVES_USUARIO = Object.values(PREFS)
  .filter((p) => p.ambito === "usuario")
  .map((p) => p.clave) as ClavePref[];

export function esClaveConocida(clave: string): clave is ClavePref {
  return Object.prototype.hasOwnProperty.call(PREFS, clave);
}

/**
 * Filtra un conjunto de entradas dejando SOLO las claves que ese rol puede
 * escribir. Todo lo demas se descarta sin avisar: es la defensa contra un
 * form manipulado desde el navegador.
 */
export function filtrarPorRol(
  entradas: Record<string, string>,
  rol: Rol,
): { globales: Record<string, string>; propias: Record<string, string> } {
  const globales: Record<string, string> = {};
  const propias: Record<string, string> = {};

  for (const [clave, valor] of Object.entries(entradas)) {
    if (!esClaveConocida(clave)) continue;
    const def: DefinicionPref = PREFS[clave];
    if (!def.editablePor.includes(rol)) continue;
    if (def.ambito === "global") globales[clave] = valor;
    else propias[clave] = valor;
  }

  return { globales, propias };
}

/** Valores por defecto de todas las claves globales, para sembrar la tabla. */
export function defaultsGlobales(): { clave: string; valor: string }[] {
  return Object.values(PREFS)
    .filter((p) => p.ambito === "global")
    .map((p) => ({ clave: p.clave, valor: p.valorDefault }));
}
