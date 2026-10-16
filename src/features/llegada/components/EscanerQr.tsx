import { useEffect, useRef, useState } from 'react'
import { Banner, Button } from '@/core/ui'
import { CameraSession, EscanerCodigos, type DecodificadorCodigos, crearDecodificadorZxing, useCameraSession } from '@/features/traslado/camera'
import type { EstadoCamara } from '@/features/traslado/camera/estadoCamara'

export interface EscanerQrProps {
  /** El texto del QR, **tal cual** lo leyó la cámara (sin recortar ni cambiar mayúsculas). Se llama una vez. */
  onDetectado: (texto: string) => void
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
 * El visor que lee el QR de la tablet. Abre la cámara al mostrarse, lee hasta encontrar un código, entrega **el texto crudo** y se
 * detiene; la cámara se suelta al desmontarse, así que nunca queda una abierta detrás. A diferencia del escáner de VIN, **no
 * normaliza nada**: el código del QR distingue mayúsculas y el servidor es estricto.
 */
export function EscanerQr({ onDetectado, crearSesion, cargarDecodificador = crearDecodificadorZxing, crearLienzo }: EscanerQrProps) {
  const { sesion, estado, error, requiereGesto } = useCameraSession(() => crearSesion?.() ?? new CameraSession())
  const videoRef = useRef<HTMLVideoElement>(null)
  const [fallo, setFallo] = useState<string | null>(null)

  // El aviso al padre va por una referencia: así el lector no se reinicia si el padre vuelve a dibujarse.
  const alDetectar = useRef(onDetectado)
  useEffect(() => {
    alDetectar.current = onDetectado
  }, [onDetectado])

  // La cámara se abre al mostrarse y se suelta al irse.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    sesion.conectarVideo(video)
    void sesion.abrir()
    return () => sesion.cerrar()
  }, [sesion])

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
          alLeer: (texto) => alDetectar.current(texto),
          alFallar: () => setFallo('No se pudo leer el código. Sal de esta pantalla y vuelve a intentar.'),
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
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-ficha bg-black text-surface">
        <video ref={videoRef} playsInline muted autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover">
          <track kind="captions" />
        </video>
        {estado === 'lista' && (
          <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-ficha border-[3px] border-surface/90" />
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

      <p className="text-center text-sm text-ink-2">Apunta al QR de la tablet</p>
    </div>
  )
}
