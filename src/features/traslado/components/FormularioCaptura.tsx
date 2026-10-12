import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type EstadoAlmacenamiento, consultarAlmacenamiento } from '@/core/storage/persistencia'
import { Banner, SectionHeader } from '@/core/ui'
import { CameraSession, CameraWidget, type FotoCapturada, type ResultadoCaptura, useCameraSession } from '../camera'
import type { FotoStorePort } from '../data/fotoStorePort'
import type { SubidaFotos } from '../data/subidaFotos'
import type { Momento, Zona } from '../domain'
import { ContadorFotos } from './ContadorFotos'
import { FichaZona } from './FichaZona'
import { useFormularioCaptura } from './useFormularioCaptura'

export interface FormularioCapturaProps {
  momento: Momento
  ordenId: number
  store: FotoStorePort
  /** Quien sube las fotos al almacenamiento al tomarlas. Sin él solo se guardan en el teléfono. */
  subidas?: SubidaFotos
  /** Una sesión de cámara ya creada (por ejemplo, para observarla desde fuera). */
  sesion?: CameraSession
  /** Solo para sustituir la sesión en las pruebas. Se ignora si llega `sesion`. */
  crearSesion?: () => CameraSession
  onCapturada?: (foto: FotoCapturada) => void
  /** Solo para sustituir la conversión de la foto elegida de la galería en las pruebas. */
  convertirArchivo?: (archivo: File) => Promise<ResultadoCaptura>
  /** Lo que va al pie, bajo las zonas (por ejemplo, «Confirmar salida»). Recibe cómo van las fotos. */
  pie?: (estado: { tomadas: number; total: number; fallidas: number; todasSubidas: boolean }) => ReactNode
  /**
   * Al abrir el formulario se pide al navegador que conserve los datos y se mide el espacio libre.
   * Solo se sustituye en las pruebas. Nunca bloquea: a lo sumo avisa de poco espacio.
   */
  comprobarAlmacenamiento?: () => Promise<EstadoAlmacenamiento>
}

const TITULO: Record<Momento, string> = { salida: 'Fotos de la salida', entrega: 'Fotos de la entrega' }

/**
 * Formulario de captura de un momento de una orden: la cámara con la guía de la zona activa, el
 * contador `n/total` y una ficha por zona.
 *
 * Una foto se guarda en la zona que estaba activa **cuando se tomó**, y las fichas se bloquean
 * mientras hay una foto en captura o en revisión: así no puede acabar en otra zona por un toque
 * suelto.
 */
export function FormularioCaptura({
  momento,
  ordenId,
  store,
  subidas,
  sesion: sesionRecibida,
  crearSesion,
  onCapturada,
  convertirArchivo,
  pie,
  comprobarAlmacenamiento,
}: FormularioCapturaProps) {
  const { formulario, zonas, zonaActiva, tomadas, total, completo, cargando, errorCarga, zonasARetomar, subidas: nSubidas, fallidas, todasSubidas } =
    useFormularioCaptura({ momento, ordenId, store, subidas })
  const { sesion, estado } = useCameraSession(() => sesionRecibida ?? crearSesion?.() ?? new CameraSession())

  // Se consulta una sola vez al abrir el formulario. El resultado no bloquea nada.
  const [consultar] = useState(() => comprobarAlmacenamiento ?? consultarAlmacenamiento)
  const [almacenamiento, setAlmacenamiento] = useState<EstadoAlmacenamiento | null>(null)
  useEffect(() => {
    let vigente = true
    consultar()
      .then((estadoAlmacenamiento) => {
        if (vigente) setAlmacenamiento(estadoAlmacenamiento)
      })
      .catch(() => undefined) // la consulta es informativa: si falla, el formulario sigue igual
    return () => {
      vigente = false
    }
  }, [consultar])

  const zonaDeLaFoto = useRef<Zona | null>(null)
  const [galeriaOcupada, setGaleriaOcupada] = useState(false)
  const fichasBloqueadas = estado === 'capturando' || estado === 'revisando' || galeriaOcupada
  const vistaDeLaActiva = zonas.find((z) => z.zona === zonaActiva)

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader contador={total}>{TITULO[momento]}</SectionHeader>
      <ContadorFotos tomadas={tomadas} total={total} />
      {subidas && (
        <p aria-live="polite" className="text-sm text-ink-2">
          {nSubidas}/{total} fotos subidas
        </p>
      )}

      {almacenamiento?.espacioBajo && (
        <Banner tono="warning">Queda poco espacio en el dispositivo. Libera espacio antes de tomar las fotos.</Banner>
      )}
      {cargando && <p role="status" className="text-sm text-ink-2">Leyendo las fotos guardadas…</p>}
      {errorCarga && <Banner tono="danger">{errorCarga}</Banner>}
      {zonasARetomar.length > 0 && (
        <Banner tono="danger">
          Hay fotos que no se guardaron al cerrarse la página y hay que volver a tomarlas:{' '}
          {zonas
            .filter((z) => zonasARetomar.includes(z.zona))
            .map((z) => z.etiqueta)
            .join(', ')}
          .
        </Banner>
      )}
      {subidas && fallidas > 0 && (
        <Banner tono="danger">
          {fallidas === 1 ? 'Una foto no se pudo subir.' : `${fallidas} fotos no se pudieron subir.`} Pulsa «Reintentar» en la zona marcada.
        </Banner>
      )}
      {completo && !subidas && <Banner tono="success">Las {total} fotos están tomadas. Toca una zona para repetirla.</Banner>}
      {todasSubidas && <Banner tono="success">Las {total} fotos están subidas. Toca una zona para repetirla.</Banner>}

      <CameraWidget
        sesion={sesion}
        guia={vistaDeLaActiva ? { etiqueta: vistaDeLaActiva.etiqueta } : undefined}
        disparoDeshabilitado={zonaActiva === null}
        permitirGaleria
        convertirArchivo={convertirArchivo}
        onGaleriaOcupada={setGaleriaOcupada}
        onCapturada={(foto) => {
          zonaDeLaFoto.current = zonaActiva
          onCapturada?.(foto)
        }}
        onUsar={(foto) => formulario.guardar(foto, zonaDeLaFoto.current ?? undefined)}
      />

      <ul aria-label="Zonas a fotografiar" className="flex flex-col gap-2">
        {zonas.map((vista) => (
          <li key={vista.zona}>
            <FichaZona
              vista={vista}
              activa={vista.zona === zonaActiva}
              deshabilitada={fichasBloqueadas}
              conSubida={!!subidas}
              onReintentar={() => formulario.reintentarSubida(vista.zona)}
              onSeleccionar={() => formulario.seleccionarZona(vista.zona)}
            />
          </li>
        ))}
      </ul>

      {pie?.({ tomadas, total, fallidas, todasSubidas })}
    </section>
  )
}
