import { useId, useState } from 'react'
import { Banner, Button } from '@/core/ui'
import type { ResultadoConfirmar } from '../data/confirmacionTraslado'
import type { Momento } from '../domain'

export interface EstadoParaConfirmar {
  tomadas: number
  total: number
  fallidas: number
  /** Las fotos están todas tomadas y subidas: lo que hace falta para confirmar. */
  todasSubidas: boolean
}

export interface ConfirmarDespachoProps {
  momento: Momento
  estado: EstadoParaConfirmar
  onConfirmar: () => Promise<ResultadoConfirmar>
  /** Se confirmó o se descartó: ya no hay nada más que hacer en esta pantalla. */
  onTerminado: (resultado: Extract<ResultadoConfirmar, { tipo: 'confirmada' | 'descartada' }>) => void
}

/**
 * «Confirmar salida» / «Confirmar entrega» (E4-02). No sube nada: las fotos ya están arriba. Se habilita
 * cuando están todas subidas, y dice qué falta mientras no. Si el servidor no la acepta, muestra por qué
 * y ofrece reintentar: repetirla es seguro.
 */
export function ConfirmarDespacho({ momento, estado, onConfirmar, onTerminado }: ConfirmarDespachoProps) {
  const [confirmando, setConfirmando] = useState(false)
  const [rechazo, setRechazo] = useState<Extract<ResultadoConfirmar, { tipo: 'fallida' | 'incompleta' }> | null>(null)
  const idAyuda = useId()

  const falta = estado.todasSubidas
    ? null
    : estado.tomadas < estado.total
      ? `Faltan ${estado.total - estado.tomadas} ${estado.total - estado.tomadas === 1 ? 'foto' : 'fotos'} por tomar.`
      : estado.fallidas > 0
        ? 'Reintenta las fotos que no se pudieron subir.'
        : 'Esperando que terminen de subir las fotos…'
  const nombre = momento === 'salida' ? 'Confirmar salida' : 'Confirmar entrega'

  async function pulsar() {
    setConfirmando(true)
    setRechazo(null)
    try {
      const resultado = await onConfirmar()
      if (resultado.tipo === 'confirmada' || resultado.tipo === 'descartada') onTerminado(resultado)
      else setRechazo(resultado)
    } finally {
      setConfirmando(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {rechazo && (
        <Banner tono="danger">
          {rechazo.mensaje}
          {rechazo.tipo === 'incompleta' && (
            <ul className="mt-1 list-disc pl-5">
              {rechazo.problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Banner>
      )}
      {falta && (
        <p id={idAyuda} className="text-sm text-ink-2">
          {falta}
        </p>
      )}
      <Button className="w-full" disabled={!estado.todasSubidas || confirmando} aria-describedby={falta ? idAyuda : undefined} onClick={() => void pulsar()}>
        {confirmando ? 'Confirmando…' : rechazo?.tipo === 'fallida' ? `Reintentar: ${nombre.toLowerCase()}` : nombre}
      </Button>
    </div>
  )
}
