import { type ReactNode, type Ref, useEffect, useRef, useState } from 'react'
import { Button, cx } from '@/core/ui'
import type { LlegadaApi } from '@/features/llegada/api/llegadaApi'
import { EscanerQr, type EscanerQrProps } from '@/features/llegada/components/EscanerQr'
import { useLlegada } from '@/features/llegada/components/useLlegada'
import { ControladorLlegada, type OpcionesControladorLlegada } from '@/features/llegada/data/controladorLlegada'
import { type ServicioUbicacion, crearUbicacionDelNavegador } from '@/features/llegada/data/ubicacion'
import { textoDeLlegada } from '@/features/llegada/domain'

/** Lo que hace falta para marcar una llegada. La ubicación y el reloj solo se sustituyen en las pruebas. */
export interface ConfigLlegada {
  api: LlegadaApi
  ubicacion?: ServicioUbicacion
  opciones?: Pick<OpcionesControladorLlegada, 'ahora' | 'topeEsperaMs' | 'edadMaximaFixMs'>
}

export interface LlegadaPageProps {
  llegada: ConfigLlegada
  /** Solo para sustituir la cámara y el lector en las pruebas. */
  escaner?: Pick<EscanerQrProps, 'crearSesion' | 'cargarDecodificador' | 'crearLienzo'>
  onVolver: () => void
}

type Tono = 'info' | 'ok' | 'aviso' | 'error'

// El color acompaña al texto del título, nunca lo reemplaza.
const COLORES: Record<Tono, string> = {
  info: 'bg-primary-soft text-primary',
  ok: 'bg-success-soft text-success-ink',
  aviso: 'bg-warning-soft text-warning-ink',
  error: 'bg-danger-soft text-danger-ink',
}

const GLIFOS: Record<Tono, string> = { info: 'i', ok: '✓', aviso: '!', error: '✕' }

const metros = (m: number) => `${Math.round(m)} m`

/**
 * «Marcar llegada» — la pantalla del conductor. Explica para qué se usan la cámara y la ubicación, abre la cámara y, con el primer QR
 * que lee, busca un fix reciente, manda la llegada al servidor y muestra el resultado. Toda la lógica vive en `ControladorLlegada`;
 * aquí solo se dibuja. Es solo con internet: no se guarda el escaneo para enviarlo después.
 */
export function LlegadaPage({ llegada, escaner, onVolver }: LlegadaPageProps) {
  const { controlador, instantanea } = useLlegada(
    () => new ControladorLlegada({ api: llegada.api, ubicacion: llegada.ubicacion ?? crearUbicacionDelNavegador(), ...llegada.opciones }),
  )
  const { etapa } = instantanea
  const tituloRef = useRef<HTMLHeadingElement>(null)

  // Cada pantalla nueva anuncia su título (con el foco) para quien usa un lector de pantalla; el escáner no, porque ahí se mira la cámara.
  useEffect(() => {
    if (etapa !== 'escaneando') tituloRef.current?.focus()
  }, [etapa])

  const escanearDeNuevo = { texto: 'Escanear de nuevo', alTocar: () => controlador.escanearDeNuevo() }

  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold">{etapa === 'confirmada' ? 'Llegada registrada' : 'Marcar llegada'}</h1>
        <Button variante="secundario" tamano="compacto" onClick={onVolver}>
          Volver
        </Button>
      </header>

      {etapa === 'explicacion' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="info"
          titulo="Necesitamos la cámara y tu ubicación"
          texto="La cámara lee el QR de la tablet. La ubicación confirma que estás en el punto de llegada. Tu navegador te pedirá permiso."
          boton={{ texto: 'Permitir cámara y ubicación', alTocar: () => controlador.empezar() }}
        />
      )}

      {etapa === 'escaneando' && <EscanerQr {...escaner} onDetectado={(texto) => controlador.alDetectar(texto)} />}

      {etapa === 'buscandoUbicacion' && (
        <Pantalla tituloRef={tituloRef} cargando titulo="Buscando tu ubicación…" texto="No cierres la pantalla.">
          <BarraDeEspera key={instantanea.esperaId} duracionMs={llegada.opciones?.topeEsperaMs} />
        </Pantalla>
      )}

      {etapa === 'enviando' && <Pantalla tituloRef={tituloRef} cargando titulo="Registrando tu llegada…" texto="No cierres la pantalla." />}

      {etapa === 'esperandoPrecision' && (
        <Pantalla tituloRef={tituloRef} cargando titulo="Esperando una mejor señal de GPS…" texto="Acércate a un lugar despejado.">
          <Datos
            filas={[
              ...(instantanea.precisionActualM !== null ? [['Precisión actual', metros(instantanea.precisionActualM)] as const] : []),
              ...(instantanea.precisionMaxM !== null ? [['Se necesita', `${metros(instantanea.precisionMaxM)} o menos`] as const] : []),
            ]}
          />
          <BarraDeEspera key={instantanea.esperaId} duracionMs={llegada.opciones?.topeEsperaMs} />
        </Pantalla>
      )}

      {etapa === 'confirmada' && instantanea.confirmada && instantanea.confirmadaEn !== null && (
        <Pantalla
          tituloRef={tituloRef}
          tono="ok"
          // Los `flags` del servidor no se muestran y ni siquiera se guardan. El turno sí: es el número del día en este punto, sin estados.
          titulo={instantanea.confirmada.punto}
          boton={{ texto: 'Listo', alTocar: onVolver }}
        >
          <Datos
            filas={[
              ['Tu turno', String(instantanea.confirmada.turno)],
              ['Hora de llegada', textoDeLlegada(instantanea.confirmada.fechaLlegada, instantanea.confirmadaEn)],
              ['Zona horaria', 'Hora de Lima'],
            ]}
          />
        </Pantalla>
      )}

      {etapa === 'codigoInvalido' && (
        <Pantalla tituloRef={tituloRef} tono="error" titulo="El código no es válido." texto="Escanea de nuevo el QR que muestra la tablet." boton={escanearDeNuevo} />
      )}

      {etapa === 'fueraDeZona' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="aviso"
          titulo="Aún no estás en la zona de llegada."
          texto="Acércate al punto y vuelve a intentarlo."
          boton={{ texto: 'Reintentar con mi posición', alTocar: () => controlador.recalcularPosicion() }}
          botonSecundario={escanearDeNuevo}
        />
      )}

      {etapa === 'ubicacionNoDisponible' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="error"
          titulo="No se pudo leer tu ubicación."
          texto="Revisa que el GPS esté activo."
          boton={{ texto: 'Recalcular posición', alTocar: () => controlador.recalcularPosicion() }}
          botonSecundario={escanearDeNuevo}
        />
      )}

      {etapa === 'precisionNoAlcanzada' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="aviso"
          titulo="No se pudo fijar tu ubicación con precisión."
          texto="Muévete a un lugar abierto y reintenta."
          boton={{ texto: 'Reintentar', alTocar: () => controlador.reintentar() }}
          botonSecundario={escanearDeNuevo}
        />
      )}

      {etapa === 'ubicacionDenegada' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="error"
          titulo="Sin permiso de ubicación"
          texto="Sin la ubicación no se puede confirmar la llegada. Permítela para este sitio en los ajustes del navegador y vuelve a intentar."
          boton={{ texto: 'Reintentar', alTocar: () => controlador.reintentarUbicacion() }}
        />
      )}

      {etapa === 'sinPermisoParaLlegada' && (
        <Pantalla tituloRef={tituloRef} tono="error" titulo="No tienes permiso para marcar llegada." texto="Si crees que es un error, avisa a tu supervisor." />
      )}

      {etapa === 'sinRed' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="aviso"
          titulo="Sin conexión"
          texto="Para registrar la llegada hace falta internet. Cuando tengas señal, reintenta."
          boton={{ texto: 'Reintentar', alTocar: () => controlador.reintentar() }}
          botonSecundario={escanearDeNuevo}
        />
      )}

      {etapa === 'sesionVencida' && (
        <Pantalla tituloRef={tituloRef} tono="error" titulo="Tu sesión venció" texto="Inicia sesión de nuevo para marcar tu llegada." />
      )}

      {etapa === 'errorInesperado' && (
        <Pantalla
          tituloRef={tituloRef}
          tono="error"
          titulo="No se pudo registrar la llegada"
          texto="Inténtalo de nuevo."
          boton={{ texto: 'Reintentar', alTocar: () => controlador.reintentar() }}
          botonSecundario={escanearDeNuevo}
        />
      )}
    </main>
  )
}

interface AccionPantalla {
  texto: string
  alTocar: () => void
}

function Pantalla({
  tituloRef,
  tono = 'info',
  cargando = false,
  titulo,
  texto,
  boton,
  botonSecundario,
  children,
}: {
  tituloRef: Ref<HTMLHeadingElement>
  tono?: Tono
  cargando?: boolean
  titulo: string
  texto?: string
  boton?: AccionPantalla
  botonSecundario?: AccionPantalla
  children?: ReactNode
}) {
  return (
    <section className="flex flex-col items-center gap-4 text-center">
      {cargando ? (
        <div aria-hidden="true" className="size-11 animate-spin rounded-full border-4 border-line border-t-primary motion-reduce:animate-none" />
      ) : (
        <div aria-hidden="true" className={cx('flex size-[72px] items-center justify-center rounded-full text-3xl font-bold', COLORES[tono])}>
          {GLIFOS[tono]}
        </div>
      )}
      <h2 ref={tituloRef} tabIndex={-1} className="text-lg font-bold outline-none">
        {titulo}
      </h2>
      {texto && <p className="text-ink-2">{texto}</p>}
      {children && <div className="flex w-full flex-col gap-3">{children}</div>}
      {boton && (
        <Button className="w-full" onClick={boton.alTocar}>
          {boton.texto}
        </Button>
      )}
      {botonSecundario && (
        <Button variante="secundario" className="w-full" onClick={botonSecundario.alTocar}>
          {botonSecundario.texto}
        </Button>
      )}
    </section>
  )
}

/** Las filas «dato: valor» de las pantallas de espera y de confirmación. */
function Datos({ filas }: { filas: ReadonlyArray<readonly [string, string]> }) {
  if (filas.length === 0) return null
  return (
    <dl className="flex w-full flex-col gap-2 rounded-ficha border border-line bg-surface px-3.5 py-3 text-sm">
      {filas.map(([dato, valor]) => (
        <div key={dato} className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-3">{dato}</dt>
          <dd className="text-right font-semibold">{valor}</dd>
        </div>
      ))}
    </dl>
  )
}

/** El tiempo que queda de la espera. Es adorno: el título ya dice qué pasa. Se reinicia con una `key` nueva (empieza otra espera). */
function BarraDeEspera({ duracionMs = 30_000 }: { duracionMs?: number }) {
  const [llena, setLlena] = useState(false)
  useEffect(() => {
    const cuadro = requestAnimationFrame(() => setLlena(true))
    return () => cancelAnimationFrame(cuadro)
  }, [])
  return (
    <div aria-hidden="true" className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full bg-primary" style={{ width: llena ? '100%' : '0%', transition: `width ${duracionMs}ms linear` }} />
    </div>
  )
}
