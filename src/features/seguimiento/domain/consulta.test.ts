// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MAX_VINES_CONSULTA, leerVines, resumirConsulta, type ResultadoVin } from '.'

const A = 'LVTDD24B6VDX00231'
const B = 'KMHJB81B1PU123456'
const C = 'JTDBR32E102345678'

describe('leer la lista pegada', () => {
  it('uno por línea', () => expect(leerVines(`${A}\n${B}\n${C}`).vines).toEqual([A, B, C]))

  it('separados por coma, punto y coma, espacio o tabulador (una columna de Excel llega con saltos de línea y tabuladores)', () => {
    expect(leerVines(`${A}, ${B};${C}`).vines).toEqual([A, B, C])
    expect(leerVines(`${A}\t${B}   ${C}`).vines).toEqual([A, B, C])
    expect(leerVines(`${A}\r\n${B}\r\n`).vines).toEqual([A, B])
  })

  it('pasa a mayúsculas y quita los espacios de alrededor', () => {
    expect(leerVines(`  ${A.toLowerCase()}  \n ${B} `).vines).toEqual([A, B])
  })

  it('los repetidos se consultan una sola vez, en el orden en que aparecieron, y se cuentan', () => {
    const l = leerVines(`${B}\n${A}\n${B.toLowerCase()}\n${B}`)
    expect(l.vines).toEqual([B, A])
    expect(l.repetidos).toBe(2)
  })

  it('aparta lo que no tiene forma de VIN: muy corto, muy largo, con I, O o Q, o con signos', () => {
    const l = leerVines(`${A} ABC123 ${A}X LVTDD24B6VDX0023I LVTDD24B6VDX0023O LVTDD24B6VDX0023Q LVTDD24B6VD#00231`)
    expect(l.vines).toEqual([A])
    expect(l.invalidos).toEqual(['ABC123', `${A}X`, 'LVTDD24B6VDX0023I', 'LVTDD24B6VDX0023O', 'LVTDD24B6VDX0023Q', 'LVTDD24B6VD#00231'])
  })

  it('un VIN de 16 o de 18 caracteres no es un VIN', () => {
    expect(leerVines(A.slice(1)).invalidos).toEqual([A.slice(1)])
    expect(leerVines(`${A}9`).invalidos).toEqual([`${A}9`])
    expect(leerVines(A.slice(1)).vines).toEqual([])
  })

  it('lo no válido repetido se lista una vez y no cuenta como repetido', () => {
    const l = leerVines('abc abc ABC')
    expect(l.invalidos).toEqual(['ABC'])
    expect(l.repetidos).toBe(0)
  })

  it('texto vacío o solo separadores: nada que consultar', () => {
    for (const texto of ['', '   ', '\n\n', ' , ; ']) expect(leerVines(texto)).toEqual({ vines: [], invalidos: [], repetidos: 0 })
  })

  it('el máximo es el mismo del servidor: 200', () => expect(MAX_VINES_CONSULTA).toBe(200))
})

describe('resumir la consulta', () => {
  const traslado = { idOrden: 1, vin: A, marca: null, modelo: null, color: null, destino: null, etapa: 'en_camino', salidaRegistrada: null, entregadoEn: null, entregaEstimada: false } as const
  const resultados: ResultadoVin[] = [
    { vin: A, informacion: 'disponible', traslado },
    { vin: B, informacion: 'pendiente' },
    { vin: C, informacion: 'pendiente' },
  ]

  it('cuenta los que tienen información y los pendientes', () => expect(resumirConsulta(resultados)).toEqual({ total: 3, conInformacion: 1, pendientes: 2 }))
  it('sin resultados, todo en cero', () => expect(resumirConsulta([])).toEqual({ total: 0, conInformacion: 0, pendientes: 0 }))
})
