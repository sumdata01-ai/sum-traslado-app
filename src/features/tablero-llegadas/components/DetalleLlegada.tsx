import { Button, cx } from '@/core/ui'
import { type LlegadaTablero, type PuntoFicha, esquemaDeUbicacion, horaLima, metros, nombreConductor, numero, resumenDeLlegada, textoDemora, usuarioConductor } from '../domain'

export interface DetalleLlegadaProps {
  llegada: LlegadaTablero
  /** La ficha de su punto, para saber dónde está el centro y dibujar la dirección. Puede faltar. */
  punto: PuntoFicha | null
  onCerrar: () => void
}

const LADO = 360

function Fila({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt className="text-ink-3">{rotulo}</dt>
      <dd className="text-right font-bold tabular-nums">{valor}</dd>
    </>
  )
}

/**
 * Todo lo que el sistema supo de una llegada (HU-4): un resumen en lenguaje llano de su estado, los tiempos (hora de Lima) y un
 * **esquema, no un mapa**, de dónde escaneó: el centro del punto, el círculo del radio y la posición del teléfono con su círculo
 * de precisión. Las coordenadas solo se ven aquí.
 */
export function DetalleLlegada({ llegada, punto, onCerrar }: DetalleLlegadaProps) {
  const esquema = esquemaDeUbicacion({
    lado: LADO,
    radioM: llegada.punto.radioM,
    distanciaM: llegada.distanciaM,
    precisionM: llegada.precisionM,
    centro: punto ? { latitud: punto.latitud, longitud: punto.longitud } : null,
    telefono: { latitud: llegada.latitud, longitud: llegada.longitud },
  })
  const medio = LADO / 2
  const alt = `Esquema: el teléfono estaba a ${metros(llegada.distanciaM)} del centro del punto, el ${Math.round(llegada.pctRadio)} por ciento del radio de ${llegada.punto.radioM} metros.`

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3">
            {llegada.punto.nombre} · turno {llegada.turno}
          </p>
          <h2 className="mt-0.5 text-[22px] font-bold">{nombreConductor(llegada.conductor)}</h2>
          <p className="mt-0.5 text-sm text-ink-3">{usuarioConductor(llegada.conductor)}</p>
        </div>
        <Button variante="secundario" data-cerrar onClick={onCerrar}>
          Cerrar
        </Button>
      </div>

      <p className={cx('rounded-ficha px-4 py-3.5 text-[15px] leading-relaxed', llegada.flag ? 'bg-warning-soft text-warning-ink' : 'bg-success-soft text-success-ink')}>
        {resumenDeLlegada(llegada)}
      </p>

      <section aria-label="Tiempos">
        <h3 className="mb-2 text-base font-bold">Tiempos (hora de Lima)</h3>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[15px]">
          <Fila rotulo="Hora oficial (del QR)" valor={horaLima(llegada.horaOficial)} />
          <Fila rotulo="Recibida por el servidor" valor={horaLima(llegada.horaRecepcion)} />
          <Fila rotulo="Demora" valor={textoDemora(llegada.demoraS)} />
          <Fila rotulo="Pasos de antigüedad" valor={String(llegada.pasos)} />
          <Fila rotulo="Step del QR" valor={String(llegada.step)} />
        </dl>
        <p className="mt-2 text-[13px] text-ink-3">
          El turno sigue el orden de la hora de <strong>recepción</strong>, no el de la hora del QR.
        </p>
      </section>

      <section aria-label="Dónde escaneó">
        <h3 className="mb-2 text-base font-bold">Dónde escaneó</h3>
        <svg viewBox={`0 0 ${LADO} ${LADO}`} role="img" aria-label={alt} className="mx-auto block w-full max-w-[360px] rounded-ficha border border-line bg-surface-2">
          <circle cx={medio} cy={medio} r={esquema.radioPx} fill="#eaf2ff" stroke="#1f4f8e" strokeWidth="2" strokeDasharray="6 4" />
          <line x1={medio} y1={medio} x2={esquema.x} y2={esquema.y} stroke="#64748b" strokeWidth="1.5" />
          <circle cx={esquema.x} cy={esquema.y} r={esquema.precisionPx} fill="rgba(31,79,142,.14)" stroke="#1f4f8e" strokeWidth="1.5" />
          <circle cx={esquema.x} cy={esquema.y} r="6" fill="#1f4f8e" />
          <circle cx={medio} cy={medio} r="5" fill="#0f2a5e" />
          <text x={medio + 10} y={medio - 4} fontSize="12" fontWeight="700" fill="#0f2a5e">
            Centro
          </text>
          <text x={medio} y="22" textAnchor="middle" fontSize="12" fill="#334155">
            Radio del punto: {numero(llegada.punto.radioM)} m
          </text>
          <text x={medio} y={LADO - 14} textAnchor="middle" fontSize="12" fill="#334155">
            Círculo claro: precisión del teléfono ({metros(llegada.precisionM)})
          </text>
        </svg>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[15px]">
          <Fila rotulo="Distancia al centro" valor={`${metros(llegada.distanciaM)}, ${Math.round(llegada.pctRadio)} % del radio`} />
          <Fila rotulo="Precisión del teléfono" valor={`${metros(llegada.precisionM)}, máx. ${numero(llegada.punto.precisionMaxM)} m`} />
          <Fila rotulo="Coordenadas" valor={`${llegada.latitud.toFixed(6).replace('.', ',')}, ${llegada.longitud.toFixed(6).replace('.', ',')}`} />
        </dl>
        <p className="mt-2 text-[13px] text-ink-3">
          Esquema, no un mapa real: la dirección sale del rumbo entre el centro y el teléfono
          {esquema.direccion === 'desconocida' ? ' (aquí no se supo el centro del punto, así que la dirección no es real)' : ''}. Las coordenadas solo se ven en este
          detalle.
        </p>
      </section>
    </div>
  )
}
