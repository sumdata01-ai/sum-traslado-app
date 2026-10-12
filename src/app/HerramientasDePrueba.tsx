import { useState } from 'react'
import { Button } from '@/core/ui'
import { PruebaCamara } from './PruebaCamara'

/**
 * Herramientas PROVISIONALES al pie de la home: comprueban, desde un teléfono, que la página llegó
 * por HTTPS, que el navegador ofrece cámara y permiten probar el formulario de captura. Se retiran
 * cuando exista el flujo real de salida y entrega (E4).
 */
export function HerramientasDePrueba() {
  const contextoSeguro = window.isSecureContext
  const hayCamara = Boolean(navigator.mediaDevices?.getUserMedia)
  const [probando, setProbando] = useState(false)

  return (
    <details className="mt-8 rounded-ficha border border-line bg-surface p-3.5">
      <summary className="cursor-pointer text-sm font-bold text-ink-2">Herramientas de prueba</summary>
      <div className="mt-3">
        <p className="text-ink-2">Contexto seguro (HTTPS): {contextoSeguro ? 'sí' : 'no'}</p>
        <p className="text-ink-2">Cámara disponible en el navegador: {hayCamara ? 'sí' : 'no'}</p>

        {/* La cámara se abre con un toque, no al cargar la página: así el permiso se pide con un gesto. */}
        <Button className="mt-4 w-full" variante="secundario" onClick={() => setProbando((valor) => !valor)}>
          {probando ? 'Cerrar la prueba de cámara' : 'Probar la cámara'}
        </Button>
        {probando && <PruebaCamara />}
      </div>
    </details>
  )
}
