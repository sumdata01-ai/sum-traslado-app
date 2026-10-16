import { describe, expect, it } from 'vitest'
import {
  MAX_DIAS_RANGO,
  PRESETS_FECHA,
  diaDeLima,
  diasDelRango,
  errorDeRango,
  esDiaValido,
  etiquetaDeRango,
  presetDeRango,
  rangoDePreset,
  sumarDias,
  trasladoEnRango,
} from './fechas'

const HOY = '2026-10-16'

describe('diaDeLima', () => {
  it('es el día de Lima (UTC-5), no el de UTC: a las 22:00 de Lima en UTC ya es el día siguiente', () => {
    expect(diaDeLima(Date.parse('2026-10-17T03:00:00Z'))).toBe('2026-10-16') // 22:00 del 16 en Lima
    expect(diaDeLima(Date.parse('2026-10-17T04:59:59Z'))).toBe('2026-10-16') // 23:59:59 del 16
    expect(diaDeLima(Date.parse('2026-10-17T05:00:00Z'))).toBe('2026-10-17') // 00:00 del 17
  })

  it('cruza el fin de mes y de año', () => {
    expect(diaDeLima(Date.parse('2027-01-01T04:00:00Z'))).toBe('2026-12-31')
    expect(diaDeLima(Date.parse('2026-03-01T04:00:00Z'))).toBe('2026-02-28')
  })
})

describe('esDiaValido', () => {
  it.each(['2026-10-16', '2024-02-29', '2026-12-31'])('«%s» es un día', (dia) => expect(esDiaValido(dia)).toBe(true))
  it.each(['', '2026-10', '2026-13-01', '2026-02-30', '2025-02-29', '16/10/2026', 'hoy', '2026-1-5'])('«%s» no lo es', (dia) =>
    expect(esDiaValido(dia)).toBe(false),
  )
})

describe('sumarDias y diasDelRango', () => {
  it('suma y resta días cruzando meses y años', () => {
    expect(sumarDias('2026-10-16', -1)).toBe('2026-10-15')
    expect(sumarDias('2026-10-01', -1)).toBe('2026-09-30')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(sumarDias('2026-02-27', 2)).toBe('2026-03-01')
  })

  it('cuenta el primer y el último día', () => {
    expect(diasDelRango({ desde: '2026-10-16', hasta: '2026-10-16' })).toBe(1)
    expect(diasDelRango({ desde: '2026-10-12', hasta: '2026-10-16' })).toBe(5)
    expect(diasDelRango({ desde: '2026-02-28', hasta: '2026-03-01' })).toBe(2)
  })
})

describe('rangoDePreset', () => {
  it('Hoy y Ayer son un solo día', () => {
    expect(rangoDePreset('hoy', HOY)).toEqual({ desde: '2026-10-16', hasta: '2026-10-16' })
    expect(rangoDePreset('ayer', HOY)).toEqual({ desde: '2026-10-15', hasta: '2026-10-15' })
  })

  it('Últimos 7 días incluye hoy: abarca 7 días, no 8', () => {
    const r = rangoDePreset('ultimos7', HOY)
    expect(r).toEqual({ desde: '2026-10-10', hasta: '2026-10-16' })
    expect(diasDelRango(r)).toBe(7)
  })

  it('Últimos 30 días incluye hoy: abarca 30 días, no 31', () => {
    const r = rangoDePreset('ultimos30', HOY)
    expect(r).toEqual({ desde: '2026-09-17', hasta: '2026-10-16' })
    expect(diasDelRango(r)).toBe(30)
  })

  it('ningún preset pasa del máximo que acepta el servidor', () => {
    for (const { valor } of PRESETS_FECHA) expect(diasDelRango(rangoDePreset(valor, HOY))).toBeLessThanOrEqual(MAX_DIAS_RANGO)
  })
})

describe('presetDeRango', () => {
  it('reconoce cada preset visto desde hoy', () => {
    for (const { valor } of PRESETS_FECHA) expect(presetDeRango(rangoDePreset(valor, HOY), HOY)).toBe(valor)
  })

  it('un rango propio no es ningún preset', () => {
    expect(presetDeRango({ desde: '2026-10-12', hasta: '2026-10-16' }, HOY)).toBeNull()
  })

  it('un día que fue «hoy» pasa a ser «ayer» al cambiar el día', () => {
    expect(presetDeRango({ desde: '2026-10-16', hasta: '2026-10-16' }, '2026-10-17')).toBe('ayer')
  })
})

describe('errorDeRango (las mismas reglas que el servidor)', () => {
  it('un rango bueno no tiene error, ni siquiera de un solo día o de justo 90 días', () => {
    expect(errorDeRango('2026-10-12', '2026-10-16', HOY)).toBeNull()
    expect(errorDeRango(HOY, HOY, HOY)).toBeNull()
    expect(errorDeRango('2026-07-19', HOY, HOY)).toBeNull() // 90 días
  })

  it('pide las dos fechas, y reales', () => {
    expect(errorDeRango('', HOY, HOY)).toBe('Elige las dos fechas.')
    expect(errorDeRango(HOY, '', HOY)).toBe('Elige las dos fechas.')
    expect(errorDeRango('2026-02-30', HOY, HOY)).toBe('Elige las dos fechas.')
  })

  it('el inicio no puede ser posterior al fin', () => {
    expect(errorDeRango('2026-10-16', '2026-10-15', HOY)).toBe('La fecha de inicio no puede ser posterior a la de fin.')
  })

  it('el fin no puede ser futuro', () => {
    expect(errorDeRango('2026-10-16', '2026-10-17', HOY)).toBe('La fecha de fin no puede ser futura.')
  })

  it('no pasa de 90 días', () => {
    expect(errorDeRango('2026-07-18', HOY, HOY)).toBe(`El rango no puede pasar de ${MAX_DIAS_RANGO} días.`) // 91 días
  })
})

describe('etiquetaDeRango', () => {
  it('un preset se llama como el preset', () => {
    for (const { valor, etiqueta } of PRESETS_FECHA) expect(etiquetaDeRango(rangoDePreset(valor, HOY), HOY)).toBe(etiqueta)
  })

  it('un rango propio del mismo mes se escribe «12–16 oct 2026»', () => {
    expect(etiquetaDeRango({ desde: '2026-10-12', hasta: '2026-10-16' }, '2026-10-20')).toBe('12–16 oct 2026')
  })

  it('un solo día propio se escribe con su fecha', () => {
    expect(etiquetaDeRango({ desde: '2026-10-05', hasta: '2026-10-05' }, '2026-10-20')).toBe('5 oct 2026')
  })

  it('un rango entre meses o entre años dice los dos extremos', () => {
    expect(etiquetaDeRango({ desde: '2026-09-28', hasta: '2026-10-03' }, '2026-10-20')).toBe('28 sep – 3 oct 2026')
    expect(etiquetaDeRango({ desde: '2025-12-30', hasta: '2026-01-02' }, '2026-01-20')).toBe('30 dic 2025 – 2 ene 2026')
  })
})

describe('trasladoEnRango', () => {
  const DIA = { desde: '2026-10-15', hasta: '2026-10-15' }
  // 15 oct en Lima va de las 05:00 UTC del 15 a las 04:59 UTC del 16.
  const camino = (salida: string | null) => ({ etapa: 'en_camino' as const, salidaRegistrada: salida, entregadoEn: null })
  const entregado = (salida: string | null, entrega: string | null) => ({ etapa: 'entregado' as const, salidaRegistrada: salida, entregadoEn: entrega })

  it('un traslado en camino cuenta si su salida fue ese día', () => {
    expect(trasladoEnRango(camino('2026-10-15T12:40:00Z'), DIA)).toBe(true)
    expect(trasladoEnRango(camino('2026-10-14T12:40:00Z'), DIA)).toBe(false)
    expect(trasladoEnRango(camino('2026-10-16T12:40:00Z'), DIA)).toBe(false)
  })

  it('un entregado cuenta si salió ese día O si se entregó ese día', () => {
    expect(trasladoEnRango(entregado('2026-10-15T13:00:00Z', '2026-10-15T16:00:00Z'), DIA)).toBe(true)
    expect(trasladoEnRango(entregado('2026-10-14T13:00:00Z', '2026-10-15T16:00:00Z'), DIA)).toBe(true) // salió antes, se entregó ese día
    expect(trasladoEnRango(entregado('2026-10-15T13:00:00Z', '2026-10-16T16:00:00Z'), DIA)).toBe(true) // salió ese día, se entregó después
    expect(trasladoEnRango(entregado('2026-10-13T13:00:00Z', '2026-10-14T16:00:00Z'), DIA)).toBe(false)
  })

  it('usa el día de Lima, no el de UTC, en los dos extremos del día', () => {
    expect(trasladoEnRango(camino('2026-10-15T04:59:59Z'), DIA)).toBe(false) // 23:59:59 del 14 en Lima
    expect(trasladoEnRango(camino('2026-10-15T05:00:00Z'), DIA)).toBe(true) // 00:00 del 15
    expect(trasladoEnRango(camino('2026-10-16T04:59:59Z'), DIA)).toBe(true) // 23:59:59 del 15
    expect(trasladoEnRango(camino('2026-10-16T05:00:00Z'), DIA)).toBe(false) // 00:00 del 16
  })

  it('un rango de varios días incluye ambos extremos', () => {
    const rango = { desde: '2026-10-12', hasta: '2026-10-14' }
    expect(trasladoEnRango(camino('2026-10-12T15:00:00Z'), rango)).toBe(true)
    expect(trasladoEnRango(camino('2026-10-14T15:00:00Z'), rango)).toBe(true)
    expect(trasladoEnRango(camino('2026-10-11T15:00:00Z'), rango)).toBe(false)
    expect(trasladoEnRango(camino('2026-10-15T15:00:00Z'), rango)).toBe(false)
  })

  it('nunca cuenta lo que está en planta ni lo anulado, tenga o no fechas', () => {
    expect(trasladoEnRango({ etapa: 'en_planta', salidaRegistrada: null, entregadoEn: null }, DIA)).toBe(false)
    expect(trasladoEnRango({ etapa: 'en_planta', salidaRegistrada: '2026-10-15T12:00:00Z', entregadoEn: null }, DIA)).toBe(false)
    expect(trasladoEnRango({ etapa: 'anulado', salidaRegistrada: '2026-10-15T12:00:00Z', entregadoEn: null }, DIA)).toBe(false)
  })

  it('sin fechas, o con una fecha ilegible, no cuenta (en vez de fallar)', () => {
    expect(trasladoEnRango(camino(null), DIA)).toBe(false)
    expect(trasladoEnRango(entregado(null, null), DIA)).toBe(false)
    expect(trasladoEnRango(camino('no es una fecha'), DIA)).toBe(false)
    expect(trasladoEnRango(entregado('no es una fecha', '2026-10-15T16:00:00Z'), DIA)).toBe(true) // la otra fecha sí vale
  })
})
