/** Tipos compartidos entre la pantalla de pedido y el servidor. */

/** Clave estable de una fila seleccionada. */
export type ClaveItem = `emp_${number}` | `ext_${string}`;

/**
 * Persona incluida en un pedido. Es un snapshot: el sector y el cargo viajan
 * como texto porque se guardan asi en pedido_items (permite externos que no
 * existen en la nomina).
 */
export interface ItemSeleccionado {
  clave: ClaveItem;
  legajo: number | null;
  apellidoNombre: string;
  sectorNombre: string;
  cargoNombre: string;
  esExterno: boolean;
}

export interface OpcionSector {
  id: number;
  nombre: string;
}

export interface OpcionMotivo {
  id: number;
  texto: string;
}

export interface DatosSolicitante {
  legajo: number;
  apellidoNombre: string;
  cargo: string;
  sector: string;
}

/** Ventana de overtime ya lista para validar del lado del cliente. */
export interface VentanaOt {
  orden: number;
  etiqueta: string;
  desdeMin: number;
  hastaMin: number;
}
