import { useMemo } from 'react'
import { Banner, Button } from '@/core/ui'
import { MAX_VINES_CONSULTA, NOTA_PENDIENTE, type ResultadoVin, TEXTO_PENDIENTE, leerVines, resumirConsulta } from '../domain'
import { EsqueletoTraslados } from './EsqueletoTraslados'
import { ListaMovil, TablaTraslados, type ListaProps } from './ListasDeTraslados'
import type { EstadoConsulta } from './useConsultaVines'

export interface ConsultaMasivaProps {
  texto: string
  onTexto: (texto: string) => void
  estado: EstadoConsulta
  /** Se llama con los VIN válidos, sin repetidos y en el orden pegado. */
  onConsultar: (vines: string[]) => void
  onLimpiar: () => void
  ahora: Date
  onAbrir: ListaProps['onAbrir']
}

/** Los primeros VIN no válidos, para que se vea qué corregir sin llenar la pantalla. */
function resumenDeInvalidos(invalidos: readonly string[]): string {
  const vistos = invalidos.slice(0, 5).join(', ')
  return invalidos.length > 5 ? `${vistos} y ${invalidos.length - 5} más` : vistos
}

/** Un VIN que todavía no está en el plan de despacho: sin datos que mostrar, solo decir que falta información. */
function FilaPendiente({ vin }: { vin: string }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-line py-3.5">
      <span className="min-w-[13.5rem] text-base font-semibold break-all text-primary-deep">VIN {vin}</span>
      <span className="inline-block rounded-lg bg-warning-soft px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap text-warning-ink">{TEXTO_PENDIENTE}</span>
      <span className="text-sm text-ink-2">{NOTA_PENDIENTE}</span>
    </li>
  )
}

/**
 * La consulta masiva: se pegan los VIN y se ve el estado de cada uno. Solo cuentan las órdenes en tránsito o ya entregadas
 * (de cualquier fecha); todo lo demás sale como «Pendiente de información». Lo escrito se lee aquí mismo, antes de
 * consultar: se dice cuántos VIN son, cuáles no tienen forma de VIN y si se pasa del máximo.
 */
export function ConsultaMasiva({ texto, onTexto, estado, onConsultar, onLimpiar, ahora, onAbrir }: ConsultaMasivaProps) {
  const lectura = useMemo(() => leerVines(texto), [texto])
  const { vines, invalidos, repetidos } = lectura
  const demasiados = vines.length > MAX_VINES_CONSULTA
  const puedeConsultar = vines.length > 0 && !demasiados && !estado.consultando
  const hayAlgo = texto.trim() !== '' || estado.resultados !== null

  const disponibles = useMemo(() => (estado.resultados ?? []).flatMap((r: ResultadoVin) => (r.informacion === 'disponible' ? [r.traslado] : [])), [estado.resultados])
  const pendientes = useMemo(() => (estado.resultados ?? []).flatMap((r: ResultadoVin) => (r.informacion === 'pendiente' ? [r.vin] : [])), [estado.resultados])
  const resumen = resumirConsulta(estado.resultados ?? [])

  return (
    <section aria-label="Consulta masiva de VIN" className="mt-6">
      <label htmlFor="vines-a-consultar" className="block text-sm font-semibold text-ink-1">
        VIN a consultar
      </label>
      <p id="ayuda-vines" className="mt-1 text-sm text-ink-2">
        Pega los VIN, uno por línea o separados por coma o espacio (sirve copiar una columna de Excel). Máximo {MAX_VINES_CONSULTA} por consulta.
      </p>
      <textarea
        id="vines-a-consultar"
        aria-describedby="ayuda-vines"
        value={texto}
        onChange={(evento) => onTexto(evento.target.value)}
        rows={6}
        placeholder={'LVTDD24B6VDX00231\nKMHJB81B1PU123456'}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="mt-2 block min-h-32 w-full resize-y rounded-control border border-line-strong bg-surface p-3 font-mono text-base text-ink-1 placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />

      <div className="mt-3 flex flex-col gap-2">
        {vines.length > 0 && (
          <p role="status" className="text-sm text-ink-2">
            {vines.length === 1 ? '1 VIN para consultar' : `${vines.length} VIN para consultar`}
            {repetidos > 0 && (repetidos === 1 ? ' (1 repetido se consulta una sola vez)' : ` (${repetidos} repetidos se consultan una sola vez)`)}
          </p>
        )}
        {invalidos.length > 0 && (
          <Banner tono="warning">
            {invalidos.length === 1 ? 'Este texto no tiene forma de VIN y no se consultará: ' : `Estos ${invalidos.length} textos no tienen forma de VIN y no se consultarán: `}
            {resumenDeInvalidos(invalidos)}. Un VIN tiene 17 letras y números, sin I, O ni Q.
          </Banner>
        )}
        {demasiados && (
          <Banner tono="danger">
            Son {vines.length} VIN y el máximo por consulta es {MAX_VINES_CONSULTA}. Quita {vines.length - MAX_VINES_CONSULTA} para poder consultar.
          </Banner>
        )}
        {estado.error && <Banner tono="danger">{estado.error}</Banner>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button disabled={!puedeConsultar} onClick={() => onConsultar(vines)}>
          {estado.consultando ? 'Consultando…' : 'Consultar'}
        </Button>
        <Button variante="secundario" disabled={!hayAlgo || estado.consultando} onClick={onLimpiar}>
          Limpiar
        </Button>
      </div>

      {/* Mientras llega el primer resultado se dibuja el esqueleto; si ya hay un resultado anterior, se conserva hasta que llegue el nuevo. */}
      {estado.consultando && estado.resultados === null && (
        <div className="mt-8">
          <EsqueletoTraslados mensaje="Consultando los VIN…" filas={3} />
        </div>
      )}

      {estado.resultados !== null && (
        <div className="mt-8">
          <p role="status" className="text-base font-semibold text-ink-1">
            {resumen.total === 1 ? '1 VIN consultado' : `${resumen.total} VIN consultados`}: {resumen.conInformacion} con información y {resumen.pendientes} pendientes de información.
          </p>
          {estado.descartados > 0 && (
            <Banner tono="warning" className="mt-3">
              {estado.descartados === 1 ? 'Un resultado no se pudo mostrar porque llegó con datos inválidos.' : `${estado.descartados} resultados no se pudieron mostrar porque llegaron con datos inválidos.`} Avisa a soporte.
            </Banner>
          )}

          {disponibles.length > 0 && (
            <div className="mt-5">
              <h2 className="text-lg font-bold text-primary-deep">Con información ({disponibles.length})</h2>
              <TablaTraslados traslados={disponibles} ahora={ahora} onAbrir={onAbrir} />
              <ListaMovil traslados={disponibles} ahora={ahora} onAbrir={onAbrir} />
            </div>
          )}

          {pendientes.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-primary-deep">Pendientes de información ({pendientes.length})</h2>
              <p className="mt-1 text-sm text-ink-2">Todavía no están en tránsito ni entregados: aún no pasan a estar en el plan de despacho.</p>
              <ul aria-label="VIN pendientes de información" className="m-0 mt-2 list-none border-t border-line p-0">
                {pendientes.map((vin) => (
                  <FilaPendiente key={vin} vin={vin} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
