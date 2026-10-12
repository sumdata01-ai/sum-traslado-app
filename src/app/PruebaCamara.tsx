import { useEffect, useState } from 'react'
import { Button } from '@/core/ui'
import { CameraSession, type FotoCapturada } from '@/features/traslado/camera'
import { FormularioCaptura } from '@/features/traslado/components/FormularioCaptura'
import { FotoStoreDexie } from '@/features/traslado/data/fotoStoreDexie'
import { TrasladoDb } from '@/features/traslado/data/trasladoDb'
import type { Momento } from '@/features/traslado/domain'

/**
 * Pantalla PROVISIONAL de prueba en el teléfono:
 *  - Spike S-01: ¿Safari reabre la cámara sin un toque al volver de segundo plano? Bloquea la
 *    pantalla o cambia de app, vuelve, y mira en la lista cómo cambió el estado.
 *  - T5: el formulario de captura de la salida (6 zonas) o de la entrega (5 zonas).
 *  - P-01: tamaño y peso de la última foto, para juzgar la resolución y la calidad.
 *
 * Las fotos se guardan de verdad en el dispositivo (IndexedDB) y sobreviven a recargar la página,
 * con la orden de prueba 0. No se envían a ningún sitio. La lista de cambios vive solo en pantalla.
 * Se borra cuando exista el flujo real.
 */
export function PruebaCamara() {
  const [sesion] = useState(() => new CameraSession())
  const [almacen] = useState(() => new FotoStoreDexie(new TrasladoDb()))
  const [momento, setMomento] = useState<Momento>('salida')
  const [cambios, setCambios] = useState<string[]>([])
  const [ultima, setUltima] = useState<FotoCapturada | null>(null)

  useEffect(
    () =>
      sesion.suscribir(() => {
        const { estado, requiereGesto } = sesion.getSnapshot()
        const hora = new Date().toLocaleTimeString('es-PE', { hour12: false })
        setCambios((previos) => [...previos.slice(-9), `${hora} · ${estado}${requiereGesto ? ' (pide un toque)' : ''}`])
      }),
    [sesion],
  )

  return (
    <section className="mt-6 flex flex-col gap-3">
      <h2 className="text-base font-bold">Prueba de cámara</h2>
      <p className="text-sm text-ink-2">
        Provisional: toma las fotos del formulario, bloquea la pantalla o cambia de app y vuelve, y mira cómo cambia el estado.
      </p>

      <div role="group" aria-label="Momento del traslado" className="flex gap-2">
        <Button className="flex-1" tamano="compacto" variante={momento === 'salida' ? 'primario' : 'secundario'} aria-pressed={momento === 'salida'} onClick={() => setMomento('salida')}>
          Salida (6)
        </Button>
        <Button className="flex-1" tamano="compacto" variante={momento === 'entrega' ? 'primario' : 'secundario'} aria-pressed={momento === 'entrega'} onClick={() => setMomento('entrega')}>
          Entrega (5)
        </Button>
      </div>

      <FormularioCaptura key={momento} momento={momento} ordenId={0} store={almacen} sesion={sesion} onCapturada={setUltima} />

      <p aria-live="polite" className="text-sm text-ink-2">
        {ultima
          ? `Última foto: ${ultima.ancho}×${ultima.alto} · ${Math.round(ultima.blob.size / 1024)} KB · ${ultima.blob.type}`
          : 'Todavía no se tomó ninguna foto.'}
      </p>
      <ol aria-label="Cambios de estado de la cámara" className="rounded-ficha border border-line bg-surface p-3 font-mono text-xs text-ink-1">
        {cambios.length === 0 ? <li>Sin cambios todavía</li> : cambios.map((c, i) => <li key={`${i}-${c}`}>{c}</li>)}
      </ol>
    </section>
  )
}
