import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cx } from '@/core/ui'
import { type OpcionCatalogo, filtrarOpciones, rotuloDeOpcion } from '../domain'

export interface SelectorCatalogoProps {
  etiqueta: string
  opciones: readonly OpcionCatalogo[]
  /** El id elegido, o `null` si todavía no se eligió. */
  valor: number | null
  /**
   * Cómo se muestra lo elegido cuando la opción no está en `opciones` (por ejemplo, porque el catálogo
   * todavía no se descargó). Si la opción sí está, se usa su rótulo, con el estado en texto.
   */
  textoValor?: string
  onElegir: (opcion: OpcionCatalogo) => void
  /** Explica por qué no hay opciones (por ejemplo, que nunca se descargó el catálogo). */
  textoSinOpciones?: string
  disabled?: boolean
}

/**
 * Selector con filtro por código y lápiz para corregir (O-04, O-04b). Cada campo tiene dos modos:
 *
 * - **Sin elegir:** un selector filtrable. Con 55 placas que se diferencian por un dígito
 *   (`EEB577`, `EEB578`…), escribir tres caracteres es más rápido que recorrer la lista.
 * - **Elegido:** el campo pasa a **solo lectura**, con un **lápiz a su costado**. Un campo que sigue
 *   pareciendo un cuadro de texto no dice que se puede cambiar, y un toque que roza el valor lo
 *   pisaría; el lápiz hace visible la corrección. Tocarlo vuelve al selector con la lista abierta, y si
 *   el operario se va sin elegir, **se conserva lo que había**.
 *
 * Detalles que importan en el teléfono:
 * - La lista mide **como mucho 224 px** (`max-h-56`): cuatro opciones completas y el borde de la quinta.
 *   El corte a la mitad avisa de que hay más para deslizar, y deja a la vista el campo donde se escribe.
 * - El estado va **como texto** («EEB577 · afuera»), no como color.
 * - El filtro compara contra el código, no contra el rótulo (ver `coincideConFiltro`).
 * - El campo mide 16 px (`text-base`): por debajo, Safari en iPhone amplía la página al enfocar.
 * - El lápiz mide 44 × 44 px, el mínimo cómodo para el pulgar.
 */
export function SelectorCatalogo({ etiqueta, opciones, valor, textoValor, onElegir, textoSinOpciones, disabled = false }: SelectorCatalogoProps) {
  const id = useId()
  const idLista = `${id}-lista`
  const idEtiqueta = `${id}-etiqueta`
  const [abierto, setAbierto] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [resaltada, setResaltada] = useState(0)
  /** El operario tocó el lápiz y está corrigiendo. */
  const [corrigiendo, setCorrigiendo] = useState(false)
  /** Al volver al modo de solo lectura, el foco va al lápiz (para quien navega con teclado o lector). */
  const enfocarLapiz = useRef(false)
  const campo = useRef<HTMLInputElement>(null)
  const lapiz = useRef<HTMLButtonElement>(null)

  const elegida = opciones.find((o) => o.id === valor) ?? null
  const textoElegido = elegida ? rotuloDeOpcion(elegida) : (textoValor ?? null)
  const hayElegida = valor !== null && textoElegido !== null
  const enLectura = hayElegida && !corrigiendo

  const visibles = useMemo(() => filtrarOpciones(opciones, filtro), [opciones, filtro])
  const sinCoincidencias = visibles.length === 0

  // Al tocar el lápiz aparece el campo: se le da el foco, que a su vez abre la lista.
  useEffect(() => {
    if (corrigiendo) campo.current?.focus()
  }, [corrigiendo])

  useEffect(() => {
    if (enfocarLapiz.current && enLectura) {
      lapiz.current?.focus()
      enfocarLapiz.current = false
    }
  }, [enLectura])

  function abrir() {
    if (disabled) return
    setAbierto(true)
    setResaltada(0)
  }

  /**
   * Cierra la lista; si había algo elegido, se vuelve a solo lectura **sin cambiar** lo elegido. El foco
   * vuelve al lápiz solo si el operario lo pidió con el teclado (Escape): si salió tocando otro campo,
   * el foco es de ese campo.
   */
  function cerrar(devolverFoco = false) {
    setAbierto(false)
    setFiltro('')
    if (corrigiendo) {
      setCorrigiendo(false)
      enfocarLapiz.current = devolverFoco
    }
  }

  function elegir(opcion: OpcionCatalogo) {
    onElegir(opcion)
    setAbierto(false)
    setFiltro('')
    setCorrigiendo(false)
    enfocarLapiz.current = true
  }

  function alPulsarTecla(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') return cerrar(true)
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      if (!abierto) return abrir()
      const paso = evento.key === 'ArrowDown' ? 1 : -1
      setResaltada((actual) => (visibles.length === 0 ? 0 : (actual + paso + visibles.length) % visibles.length))
      return
    }
    if (evento.key === 'Enter' && abierto) {
      evento.preventDefault()
      const opcion = visibles[resaltada]
      if (opcion) elegir(opcion)
    }
  }

  if (enLectura) {
    return (
      <div role="group" aria-labelledby={idEtiqueta} className="flex flex-col gap-1">
        <span id={idEtiqueta} className="text-sm font-bold text-ink-2">
          {etiqueta}
        </span>
        <div className="flex items-center gap-2">
          <p className="flex min-h-11 min-w-0 flex-1 items-center rounded-control border border-line bg-surface-2 px-4 text-base break-words text-ink-1">
            {textoElegido}
          </p>
          <button
            ref={lapiz}
            type="button"
            disabled={disabled}
            aria-label={`Editar ${etiqueta}`}
            onClick={() => setCorrigiendo(true)}
            className={cx(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface text-primary',
              'hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        </div>
      </div>
    )
  }

  const aviso = opciones.length === 0 ? textoSinOpciones : undefined

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold text-ink-2">
        {etiqueta}
      </label>
      <input
        ref={campo}
        id={id}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && !sinCoincidencias ? `${id}-op-${resaltada}` : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        value={filtro}
        placeholder={corrigiendo && textoElegido ? `Ahora: ${textoElegido}` : 'Escribe para buscar'}
        onFocus={abrir}
        onClick={abrir}
        onBlur={() => cerrar()}
        onChange={(evento) => {
          setFiltro(evento.target.value)
          setAbierto(true)
          setResaltada(0)
        }}
        onKeyDown={alPulsarTecla}
        className={cx(
          'min-h-11 w-full rounded-control border border-line-strong bg-surface px-4 text-base text-ink-1',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      />
      {aviso && <p className="text-xs text-warning-ink">{aviso}</p>}
      {abierto && (
        <ul
          id={idLista}
          role="listbox"
          aria-label={etiqueta}
          // `max-h-56` = 224 px. Con `onMouseDown` se evita que el campo pierda el foco antes del toque.
          className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-ficha border border-line-strong bg-surface shadow-none"
        >
          {sinCoincidencias ? (
            <li role="option" aria-selected={false} aria-disabled="true" className="px-4 py-3 text-sm text-ink-3">
              {opciones.length === 0 ? (textoSinOpciones ?? 'No hay opciones.') : `Ninguna coincide con «${filtro.trim()}».`}
            </li>
          ) : (
            visibles.map((opcion, indice) => (
              <li
                key={opcion.id}
                id={`${id}-op-${indice}`}
                role="option"
                aria-selected={opcion.id === valor}
                onMouseDown={(evento) => evento.preventDefault()}
                onClick={() => elegir(opcion)}
                className={cx(
                  'min-h-11 cursor-pointer px-4 py-3 text-base text-ink-1',
                  indice === resaltada && 'bg-primary-soft',
                  opcion.id === valor && 'font-bold',
                )}
              >
                {rotuloDeOpcion(opcion)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
