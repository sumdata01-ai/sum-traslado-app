import { cx } from '@/core/ui'
import { type ResumenDia, type SenalesDia, nombreConductor, numero, usuarioConductor } from '../domain'

export interface ResumenDelDiaProps {
  resumen: ResumenDia
  senales: SenalesDia
  /** Mientras llega algo nuevo se ve lo anterior, atenuado. */
  atenuado: boolean
  onVerConFlag: () => void
  onVerRechazados: () => void
  onVerVencidos: () => void
}

const TARJETA = 'flex flex-col gap-1.5 rounded-ficha border border-line bg-surface p-4 text-left'
const TARJETA_TOCABLE = 'min-h-11 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

/**
 * Las cuatro tarjetas del día y las dos señales para revisar (HU-1 y HU-3). Las cuatro tarjetas tienen **el mismo estilo claro**
 * (borde fino, sin franjas de color a los lados): lo que distingue a «Con flag» y «Códigos rechazados» es su texto y el color de su número. Los números salen **del servicio**, no de las
 * filas que se ven: un día con más filas que el tope de la lista sigue contando todo. «Con flag» y «Códigos rechazados» abren su
 * lista; las señales no acusan a nadie, son una cuenta de lo ya guardado.
 */
export function ResumenDelDia({ resumen, senales, atenuado, onVerConFlag, onVerRechazados, onVerVencidos }: ResumenDelDiaProps) {
  const desglose = resumen.porPunto.map((p) => `${p.nombre}: ${p.total}`).join(' · ')
  const repetidos = senales.qrVencidoRepetido
  return (
    <div className={cx('flex flex-col gap-4 transition-opacity', atenuado && 'opacity-60')} aria-busy={atenuado}>
      <section aria-label="Resumen del día" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className={TARJETA}>
          <span className="text-sm font-semibold text-ink-2">Llegadas</span>
          <span className="text-[40px] leading-none font-extrabold tabular-nums">{resumen.total}</span>
          <span className="min-h-[18px] text-[13px] text-ink-3">{desglose || 'Sin llegadas'}</span>
        </div>

        <button type="button" onClick={onVerConFlag} className={cx(TARJETA, TARJETA_TOCABLE)}>
          <span className="text-sm font-semibold text-ink-2">Con flag</span>
          <span className="text-[40px] leading-none font-extrabold text-warning-ink tabular-nums">{resumen.conFlag}</span>
          <span className="text-[13px] text-ink-3">El QR tenía más de 60 s al recibirse. Toca para ver cuáles.</span>
        </button>

        <button type="button" onClick={onVerRechazados} className={cx(TARJETA, TARJETA_TOCABLE)}>
          <span className="text-sm font-semibold text-ink-2">Códigos rechazados</span>
          <span className="text-[40px] leading-none font-extrabold text-danger-ink tabular-nums">{resumen.rechazados}</span>
          <span className="text-[13px] text-ink-3">Toca para ver el motivo de cada uno.</span>
        </button>

        <div className={TARJETA}>
          <span className="text-sm font-semibold text-ink-2">Demora mediana</span>
          <span className="text-[40px] leading-none font-extrabold tabular-nums">{numero(resumen.medianaDemoraS)} s</span>
          <span className="text-[13px] text-ink-3">Del QR a la recepción</span>
        </div>
      </section>

      <section aria-label="Señales para revisar" className="flex flex-col gap-3 rounded-ficha border border-line bg-surface p-4">
        <div>
          <h2 className="text-[17px] font-bold">Señales para revisar</h2>
          <p className="mt-1 text-[13px] text-ink-3">Las señales no acusan a nadie: son una cuenta de lo ya guardado.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={onVerConFlag}
            className="flex min-h-16 items-center gap-3.5 rounded-ficha border border-warning bg-warning-soft px-4 py-3 text-left text-warning-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="min-w-9 text-[30px] font-extrabold tabular-nums">{senales.conFlag}</span>
            <span className="text-sm font-semibold">
              Llegadas con flag
              <span className="block font-medium">Ver la lista filtrada</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onVerVencidos}
            className="flex min-h-16 items-center gap-3.5 rounded-ficha border border-warning bg-warning-soft px-4 py-3 text-left text-warning-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <span className="min-w-9 text-[30px] font-extrabold tabular-nums">{repetidos.length}</span>
            <span className="text-sm font-semibold">
              QR vencido, repetido
              <span className="block font-medium">
                {repetidos.length > 0
                  ? repetidos.map((r) => `${usuarioConductor(r.conductor) || nombreConductor(r.conductor)} (${r.veces} veces)`).join(', ')
                  : 'Ningún conductor'}
              </span>
            </span>
          </button>
        </div>
      </section>
    </div>
  )
}
