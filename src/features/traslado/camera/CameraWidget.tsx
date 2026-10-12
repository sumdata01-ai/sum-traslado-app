import { useEffect, useMemo, useRef, useState } from 'react'
import { Banner, Button } from '@/core/ui'
import { CameraSession, type FotoEnRevision } from './cameraSession'
import type { FotoCapturada, ResultadoCaptura } from './captureFrame'
import type { EstadoCamara } from './estadoCamara'
import { fotoDesdeArchivo } from './fotoDeArchivo'
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
  /**
   * Ofrece «Elegir de la galería» (T12). La foto elegida se convierte al mismo JPEG verificado que la de la
   * cámara y pasa por la misma revisión «Usar / Descartar». Sirve también cuando la cámara no está disponible.
   */
  permitirGaleria?: boolean
  /** Solo para sustituir la conversión en las pruebas. Por defecto, {@link fotoDesdeArchivo}. */
  convertirArchivo?: (archivo: File) => Promise<ResultadoCaptura>
  /**
   * Avisa cuando hay una foto de la galería procesándose o en revisión: el formulario bloquea el cambio de
   * zona mientras tanto, igual que con la cámara.
   */
  onGaleriaOcupada?: (ocupada: boolean) => void
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
export function CameraWidget({
  sesion: sesionRecibida,
  crearSesion,
  onCapturada,
  onUsar,
  guia,
  disparoDeshabilitado,
  permitirGaleria = false,
  convertirArchivo = (archivo) => fotoDesdeArchivo(archivo),
  onGaleriaOcupada,
}: CameraWidgetProps) {
  const { sesion, estado, error, requiereGesto, foto: fotoDeCamara, errorCaptura } = useCameraSession(
    () => sesionRecibida ?? crearSesion?.() ?? new CameraSession(),
  )
  const videoRef = useRef<HTMLVideoElement>(null)
  const entradaRef = useRef<HTMLInputElement>(null)

  // La foto elegida de la galería (T12): vive aquí y no en la sesión de la cámara, porque tiene que poder
  // usarse también cuando la cámara no está disponible.
  const [deGaleria, setDeGaleria] = useState<{ foto: FotoCapturada; url: string } | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [errorGaleria, setErrorGaleria] = useState<string | null>(null)
  const galeriaOcupada = procesando || deGaleria !== null
  const foto = useMemo<FotoEnRevision | null>(
    () => fotoDeCamara ?? (deGaleria ? { ...deGaleria.foto, urlVistaPrevia: deGaleria.url } : null),
    [fotoDeCamara, deGaleria],
  )

  // «Usar» puede tardar (guardar en disco): mientras tanto no se admite otro toque ni repetir.
  const usandoRef = useRef(false)
  const [guardando, setGuardando] = useState(false)
  // El fallo se asocia a la foto concreta: al cambiar de foto deja de mostrarse sin tener que borrarlo.
  const [falloAlUsar, setFalloAlUsar] = useState<{ paraFoto: string; mensaje: string } | null>(null)

  useEffect(() => {
    onGaleriaOcupada?.(galeriaOcupada)
  }, [galeriaOcupada, onGaleriaOcupada])

  // La URL de la vista previa de la galería se suelta al descartar, al usar y al desmontar.
  const urlGaleriaRef = useRef<string | null>(null)
  useEffect(() => {
    urlGaleriaRef.current = deGaleria?.url ?? null
  }, [deGaleria])
  useEffect(() => () => {
    if (urlGaleriaRef.current) URL.revokeObjectURL(urlGaleriaRef.current)
  }, [])

  const soltarGaleria = () =>
    setDeGaleria((actual) => {
      if (actual) URL.revokeObjectURL(actual.url)
      return null
    })

  const elegirArchivo = async (archivo: File) => {
    setProcesando(true)
    setErrorGaleria(null)
    try {
      const resultado = await convertirArchivo(archivo)
      if (!resultado.ok) {
        setErrorGaleria(resultado.error.message)
        return
      }
      setDeGaleria({ foto: resultado.foto, url: URL.createObjectURL(resultado.foto.blob) })
      onCapturada?.(resultado.foto)
    } catch {
      setErrorGaleria('No se pudo usar ese archivo. Elige otra foto.')
    } finally {
      setProcesando(false)
    }
  }

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
    // La protección contra toques accidentales es de la cámara; una foto de la galería se eligió a propósito.
    if (!foto || !onUsar || usandoRef.current || (!deGaleria && !sesion.toquePermitidoEnRevision())) return
    usandoRef.current = true
    setGuardando(true)
    setFalloAlUsar(null)
    try {
      await onUsar(foto)
      if (deGaleria) soltarGaleria()
      else sesion.cerrarRevisionSiSigue()
    } catch (causa) {
      setFalloAlUsar({ paraFoto: foto.urlVistaPrevia, mensaje: mensajeParaElOperario(causa) })
    } finally {
      usandoRef.current = false
      setGuardando(false)
    }
  }

  const textoSobreElVideo = TEXTO_SOBRE_EL_VIDEO[estado]
  const mostrarGuia = estado === 'lista' && guia !== undefined && !deGaleria
  const enRevision = estado === 'revisando' || deGaleria !== null
  const puedeElegir = permitirGaleria && !enRevision && !procesando && estado !== 'capturando' && !disparoDeshabilitado

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
      {errorGaleria && <Banner tono="danger">{errorGaleria}</Banner>}
      {procesando && (
        <p role="status" className="text-sm text-ink-2">
          Preparando la foto…
        </p>
      )}
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
      {enRevision ? (
        <div key="revision" className="flex gap-3">
          {onUsar && (
            <Button className="flex-1" disabled={guardando} onClick={() => void usar()}>
              {guardando ? 'Guardando…' : 'Usar'}
            </Button>
          )}
          <Button className="flex-1" variante="secundario" disabled={guardando} onClick={() => (deGaleria ? soltarGaleria() : sesion.repetir())}>
            {deGaleria ? 'Descartar' : 'Repetir'}
          </Button>
        </div>
      ) : (
        <Button key="disparar" disabled={estado !== 'lista' || disparoDeshabilitado || procesando} onClick={disparar}>
          Tomar foto
        </Button>
      )}

      {permitirGaleria && (
        <>
          {/* Sin `capture`: abre la galería (y deja elegir «Tomar foto» o archivos, según el sistema). Se
              vacía el valor después de leerlo para poder elegir otra vez la misma foto. */}
          <input
            ref={entradaRef}
            type="file"
            accept="image/*"
            hidden
            tabIndex={-1}
            onChange={(evento) => {
              const archivo = evento.target.files?.[0]
              evento.target.value = ''
              if (archivo) void elegirArchivo(archivo)
            }}
          />
          {!enRevision && (
            <Button key="galeria" variante="secundario" disabled={!puedeElegir} onClick={() => entradaRef.current?.click()}>
              Elegir de la galería
            </Button>
          )}
        </>
      )}
    </div>
  )
}
