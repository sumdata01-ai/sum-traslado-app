import { useEffect, useState, useSyncExternalStore } from 'react'
import { FormularioCaptura, type OpcionesFormulario } from '../data/formularioCaptura'

/**
 * Un formulario por componente. Lee del almacén las fotos que ya había al montarse y suelta las
 * miniaturas al desmontarse. Las opciones solo se usan al crearlo: para otra orden u otro
 * momento hay que montar un componente nuevo (con otra `key`).
 */
export function useFormularioCaptura(opciones: OpcionesFormulario) {
  const [formulario] = useState(() => new FormularioCaptura(opciones))

  useEffect(() => {
    void formulario.cargar()
    return () => formulario.liberar()
  }, [formulario])

  const instantanea = useSyncExternalStore(formulario.suscribir, formulario.getSnapshot)
  return { formulario, ...instantanea }
}
