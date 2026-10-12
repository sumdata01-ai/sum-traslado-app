import { useEffect, useRef, useState } from 'react'
import { Banner, Button } from '@/core/ui'
import { CameraSession, EscanerCodigos, type DecodificadorCodigos, crearDecodificadorZxing, useCameraSession } from '../camera'
import type { EstadoCamara } from '../camera/estadoCamara'
import { extraerVin } from '../domain'

export interface EscanerVinProps {
  /** El VIN leído, ya extraído del texto del código. Se llama una vez. */
  onDetectado: (vin: string) => void
  onCerrar: () => void
  /** Solo para sustituir la sesión de cámara en las pruebas. */
  crearSesion?: () => CameraSession
  /** Solo para sustituir el lector en las pruebas. Por defecto carga `@zxing/browser` al abrir. */
  cargarDecodificador?: () => Promise<DecodificadorCodigos>
  /** Solo para sustituir el lienzo (jsdom no dibuja) en las pruebas. */
  crearLienzo?: () => HTMLCanvasElement
}

const TEXTO_SOBRE_EL_VIDEO: Partial<Record<EstadoCamara, string>> = {
  inactiva: 'Cámara apagada',
  sinSoporte: 'Cámara no disponible',
  solicitando: 'Pidiendo acceso a la cámara…',
  iniciando: 'Iniciando la cámara…',
  suspendida: 'Cámara en pausa',
  error: 'Cámara no disponible',
}

/**
 * Escáner de VIN por QR o código de barras (O-05), a pantalla completa. Abre la cámara, lee hasta
 * encontrar un código y entrega el VIN; no consulta al servidor. Cierra la cámara al leer, al cerrar
 * y al desmontarse: nunca queda una cámara abierta detrás.
 */
export function EscanerVin({ onDetectado, onCerrar, crearSesion, cargarDecodificador = crearDecodificadorZxing, crearLienzo }: EscanerVinProps) {
  const { sesion, estado, error, requiereGesto } = useCameraSession(() => crearSesion?.() ?? new CameraSession())
  const videoRef = useRef<HTMLVideoElement>(null)
  const dialogoRef = useRef<HTMLDivElement>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  // Los avisos al padre van por una referencia: así el lector no se reinicia si el padre vuelve a dibujarse.
  const alDetectar = useRef(onDetectado)
  const alCerrar = useRef(onCerrar)
  useEffect(() => {
    alDetectar.current = onDetectado
    alCerrar.current = onCerrar
  }, [onDetectado, onCerrar])

  // La cámara se abre al mostrarse y se suelta al irse.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    sesion.conectarVideo(video)
    void sesion.abrir()
    return () => sesion.cerrar()
  }, [sesion])

  // El foco entra al diálogo y, al cerrarlo, vuelve a quien lo abrió. Escape lo cierra.
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    dialogoRef.current?.querySelector('button')?.focus() // «Cerrar» es el primer botón
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alCerrar.current()
    }
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('keydown', alTeclear)
      anterior?.focus?.()
    }
  }, [])

  // Con la cámara lista, se lee. Si la cámara se pausa, se para; al reanudar, se vuelve a empezar.
  useEffect(() => {
    if (estado !== 'lista') return
    const video = sesion.video
    if (!video) return
    let cancelado = false
    let escaner: EscanerCodigos | null = null

    cargarDecodificador().then(
      (decodificador) => {
        if (cancelado) return
        escaner = new EscanerCodigos({
          video,
          decodificador,
          crearLienzo,
          alLeer: (texto) => {
            const vin = extraerVin(texto)
            if (vin !== '') alDetectar.current(vin)
          },
          alFallar: () => setFallo('No se pudo leer el código. Cierra el escáner y vuelve a intentar.'),
        })
        escaner.iniciar()
      },
      () => {
        if (!cancelado) setFallo('No se pudo preparar el lector de códigos. Revisa tu conexión y vuelve a intentar.')
      },
    )

    return () => {
      cancelado = true
      escaner?.detener()
    }
  }, [estado, sesion, cargarDecodificador, crearLienzo])

  const textoSobreElVideo = TEXTO_SOBRE_EL_VIDEO[estado]

  return (
    <div ref={dialogoRef} role="dialog" aria-modal="true" aria-label="Escanear VIN" className="fixed inset-0 z-50 flex flex-col gap-3 bg-ink-1 p-4 text-surface">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Escanear VIN</h2>
        <Button variante="secundario" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-ficha bg-black">
        <video ref={videoRef} playsInline muted autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover">
          <track kind="captions" />
        </video>
        {estado === 'lista' && (
          <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 h-40 w-[80%] max-w-xs -translate-x-1/2 -translate-y-1/2 rounded-ficha border-[3px] border-surface/90" />
        )}
        {textoSobreElVideo && <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm">{textoSobreElVideo}</p>}
      </div>

      {(estado === 'sinSoporte' || estado === 'error') && error && <Banner tono="danger">{error.message}</Banner>}
      {fallo && <Banner tono="danger">{fallo}</Banner>}
      {estado === 'error' && error?.reintentable && (
        <Button variante="secundario" onClick={() => void sesion.reintentar()}>
          {requiereGesto ? 'Iniciar la cámara' : 'Reintentar'}
        </Button>
      )}
      {estado === 'suspendida' &&
        (requiereGesto ? (
          <Button variante="secundario" onClick={() => void sesion.reintentar()}>
            Tocar para reactivar la cámara
          </Button>
        ) : (
          <Banner tono="warning">Reactivando la cámara…</Banner>
        ))}

      <p className="text-center text-sm">Apunta al QR o código de barras del VIN</p>
    </div>
  )
}
