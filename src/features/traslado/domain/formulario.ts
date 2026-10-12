import { type Momento, type Zona, zonasDe } from './zonas'

/**
 * Qué zona sigue en el formulario de captura.
 *
 * Avanza desde `despuesDe` en el orden del formulario y da la vuelta al final, así que si el
 * operario repite una zona del medio, el formulario sigue por los huecos que le faltan. Devuelve
 * `null` cuando todas las zonas del momento ya tienen foto.
 *
 * Una zona de `tomadas` que no pertenece al momento (por ejemplo una de placa en la entrega) no
 * cuenta: solo importan las del formulario. Un `despuesDe` desconocido empieza desde el principio.
 */
export function siguienteZonaSinFoto(momento: Momento, tomadas: ReadonlySet<Zona>, despuesDe?: Zona | null): Zona | null {
  const zonas = zonasDe(momento)
  const inicio = despuesDe ? zonas.indexOf(despuesDe) + 1 : 0
  for (let paso = 0; paso < zonas.length; paso++) {
    const zona = zonas[(inicio + paso) % zonas.length]
    if (zona && !tomadas.has(zona)) return zona
  }
  return null
}

/** `3/6`: fotos tomadas sobre el total que pide el momento. */
export function textoContador(tomadas: number, total: number): string {
  return `${tomadas}/${total}`
}
