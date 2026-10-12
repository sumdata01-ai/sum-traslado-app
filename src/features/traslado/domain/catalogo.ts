/**
 * Placas y proveedores para el formulario de salida (O-04). Los nombres siguen el contrato de
 * `GET /mobile/traslado/catalogos`.
 */
export interface OpcionCatalogo {
  id: number
  /** El código de la placa o el nombre del proveedor. */
  nombre: string
  /** Solo las placas lo traen: `disponible`, `en_uso`… Se muestra, no decide nada. */
  estado: string | null
}

export interface Catalogos {
  placas: OpcionCatalogo[]
  proveedores: OpcionCatalogo[]
}

/**
 * Sin separadores y en mayúsculas: `eeb-577` → `EEB577`. **La misma regla que el backend** (migración
 * 028): `PR-045`, `pr 045` y `PR045` son la misma placa. Si el filtro fuera más estricto que el
 * servidor, el operario no encontraría una placa que sí existe y concluiría que su equipo está
 * desactualizado.
 */
export const canonizarCodigo = (texto: string): string => texto.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * ¿Coincide la opción con lo que se escribió? Compara **solo el nombre**, nunca el rótulo que se
 * muestra: la lista pinta `EEB577 · afuera`, y buscar sobre ese texto haría que escribir «afuera»
 * devolviera media flota.
 */
export function coincideConFiltro(opcion: Pick<OpcionCatalogo, 'nombre'>, filtro: string): boolean {
  const consulta = canonizarCodigo(filtro)
  if (consulta === '') return true
  return canonizarCodigo(opcion.nombre).includes(consulta)
}

export const filtrarOpciones = <T extends Pick<OpcionCatalogo, 'nombre'>>(opciones: readonly T[], filtro: string): T[] =>
  opciones.filter((opcion) => coincideConFiltro(opcion, filtro))

/**
 * Lo que se muestra: el nombre, y el estado solo cuando NO es el normal. **Como texto, no como
 * color:** en el pañol, con una mano ocupada, leer «EEB577 · afuera» es más rápido que interpretar un
 * color, y quien no distingue colores lo lee igual.
 */
export function rotuloDeOpcion({ nombre, estado }: Pick<OpcionCatalogo, 'nombre' | 'estado'>): string {
  if (estado === null || estado === 'disponible') return nombre
  return `${nombre} · ${estado === 'en_uso' ? 'afuera' : estado}`
}
