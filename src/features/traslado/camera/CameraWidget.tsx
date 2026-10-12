import { useEffect, useRef, useState } from 'react'
import { Banner, Button } from '@/core/ui'
import { CameraSession, type FotoEnRevision } from './cameraSession'
import type { FotoCapturada } from './captureFrame'
import type { EstadoCamara } from './estadoCamara'
import { useCameraSession } from './useCameraSession'

export interface CameraWidgetProps {
  /** Una sesión ya creada (la usa el formulario para saber en qué estado está la cámara). */
  sesion?: CameraSession
  /** Solo para sustituir la sesión en las pruebas. Se ignora si llega `sesion`. */
  crearSesion?: () => CameraSession
  /** Se llama cuando una captura salió bien y la foto queda en revisión. */
  onCapturada?: (foto: FotoCapturada) => void
  /**
   * Habilita el botón «Usar». Debe guardar la foto y rechazar si no pudo: en ese caso la foto sigue
   * en revisión y el operario puede reintentar o repetir. Sin esta función solo se ofrece «Repetir».
   */
  onUsar?: (foto: FotoEnRevision) => Promise<void> | void
  /** Nombre de la zona a fotografiar: se muestra como guía sobre el video. */
  guia?: { etiqueta: string }
  /** Bloquea el disparo aunque la cámara esté lista (por ejemplo, con todas las zonas tomadas). */
  disparoDeshabilitado?: boolean
}

const TEXTO_SOBRE_EL_VIDEO: Partial<Record<EstadoCamara, string>> = {
  inactiva: 'Cámara apagada',
  sinSoporte: 'Cámara no disponible',
  solicitando: 'Pidiendo acceso a la cámara…',
  iniciando: 'Iniciando la cámara…',
  suspendida: 'Cámara en pausa',
  error: 'Cámara no disponible',
}

const MENSAJE_NO_SE_GUARDO = 'No se pudo guardar la foto. Vuelve a intentar o repítela.'

/**
 * Si el error trae un `mensajeParaElOperario` (por ejemplo «Espacio insuficiente…»), se muestra ese;
 * si no, el genérico. El widget no conoce de dónde viene el error.
 */
function mensajeParaElOperario(causa: unknown): string {
  if (typeof causa === 'object' && causa !== null && 'mensajeParaElOperario' in causa) {
    const mensaje = causa.mensajeParaElOperario
    if (typeof mensaje === 'string' && mensaje) return mensaje
  }
  return MENSAJE_NO_SE_GUARDO
}

/**
 * Widget de cámara dentro de la página. Abre la cámara al montarse y la suelta al desmontarse.
 * El disparo solo está habilitado cuando hay un frame válido (`lista`); tras una captura correcta
 * se muestra la foto y se ofrece usarla o repetirla.
 */
export function CameraWidget({ sesion: sesionRecibida, crearSesion, onCapturada, onUsar, guia, disparoDeshabilitado }: CameraWidgetProps) {
  const { sesion, estado, error, requiereGesto, foto, errorCaptura } = useCameraSession(
    () => sesionRecibida ?? crearSesion?.() ?? new CameraSession(),
  )
  const videoRef = useRef<HTMLVideoElement>(null)

  // «Usar» puede tardar (guardar en disco): mientras tanto no se admite otro toque ni repetir.
  const usandoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  // El fallo se asocia a la foto concreta: al cambiar de foto deja de mostrarse sin tener que borrarlo.
  const [falloAlUsar, setFalloAlUsar] = useState<{ paraFoto: string; mensaje: string } | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    sesion.conectarVideo(video)
    void sesion.abrir()
    return () => sesion.cerrar()
  }, [sesion])

  const reintentar = () => void sesion.reintentar()

  const disparar = () => {
    void sesion.capturar().then((resultado) => {
      if (resultado?.ok) onCapturada?.(resultado.foto)
    })
  }

  const usar = async () => {
    if (!foto || !onUsar || usandoRef.current || !sesion.toquePermitidoEnRevision()) return
    usandoRef.current = true
    setGuardando(true)
    setFalloAlUsar(null)
    try {
      await onUsar(foto)
      sesion.cerrarRevisionSiSigue()
    } catch (causa) {
      setFalloAlUsar({ paraFoto: foto.urlVistaPrevia, mensaje: mensajeParaElOperario(causa) })
    } finally {
      usandoRef.current = false
      setGuardando(false)
    }
  }

  const textoSobreElVideo = TEXTO_SOBRE_EL_VIDEO[estado]
  const mostrarGuia = estado === 'lista' && guia !== undefined

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-ficha bg-ink-1">
        <video ref={videoRef} playsInline muted autoPlay aria-label="Vista de la cámara" className="h-full w-full object-cover">
          <track kind="captions" />
        </video>
        {foto && (
          <img
            src={foto.urlVistaPrevia}
            alt="Foto tomada, pendiente de revisión"
            className="absolute inset-0 h-full w-full bg-ink-1 object-cover"
          />
        )}
        {mostrarGuia && (
          <>
            <div aria-hidden="true" className="pointer-events-none absolute inset-3 rounded-ficha border-2 border-dashed border-surface/70" />
            <p className="pointer-events-none absolute inset-x-0 top-5 text-center">
              <span className="rounded-chip bg-ink-1/80 px-3 py-1 text-sm font-bold text-surface">{guia.etiqueta}</span>
            </p>
          </>
        )}
        {textoSobreElVideo && (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-surface">{textoSobreElVideo}</p>
        )}
      </div>

      {(estado === 'sinSoporte' || estado === 'error') && error && <Banner tono="danger">{error.message}</Banner>}
      {errorCaptura && <Banner tono="danger">{errorCaptura.message}</Banner>}
      {foto && falloAlUsar?.paraFoto === foto.urlVistaPrevia && <Banner tono="danger">{falloAlUsar.mensaje}</Banner>}

      {estado === 'error' && error?.reintentable && (
        <Button variante="secundario" onClick={reintentar}>
          {requiereGesto ? 'Iniciar la cámara' : 'Reintentar'}
        </Button>
      )}

      {estado === 'suspendida' &&
        (requiereGesto ? (
          <>
            <Banner tono="warning">La cámara se pausó.</Banner>
            <Button variante="secundario" onClick={reintentar}>
              Tocar para reactivar la cámara
            </Button>
          </>
        ) : (
          <Banner tono="warning">Reactivando la cámara…</Banner>
        ))}

      {/* Las `key` distintas son necesarias: sin ellas React reutiliza el mismo botón físico y un doble
          toque sobre «Tomar foto» pulsaría «Repetir» sobre la foto recién tomada. */}
      {estado === 'revisando' ? (
        <div key="revision" className="flex gap-3">
          {onUsar && (
            <Button className="flex-1" disabled={guardando} onClick={() => void usar()}>
              {guardando ? 'Guardando…' : 'Usar'}
            </Button>
          )}
          <Button className="flex-1" variante="secundario" disabled={guardando} onClick={() => sesion.repetir()}>
            Repetir
          </Button>
        </div>
      ) : (
        <Button key="disparar" disabled={estado !== 'lista' || disparoDeshabilitado} onClick={disparar}>
          Tomar foto
        </Button>
      )}
    </div>
  )
}
