// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DESTINOS_OCULTOS,
  claveMarca,
  contarPorEtapa,
  destinosDe,
  esDestinoOculto,
  filtrarTraslados,
  formatoFecha,
  hitosDe,
  horaDeLima,
  identificadorVehiculo,
  logoDeMarca,
  nombreVehiculo,
  esVisible,
  ordenarTraslados,
  type TrasladoSeguimiento,
} from '.'

const traslado = (extra: Partial<TrasladoSeguimiento> = {}): TrasladoSeguimiento => ({
  idOrden: 1,
  vin: 'LVTDD24B6VDX00231',
  marca: 'Toyota',
  modelo: 'Corolla',
  color: 'Blanco',
  destino: 'Sede Norte',
  etapa: 'en_camino',
  salidaRegistrada: '2026-10-15T12:40:00Z',
  entregadoEn: null,
  entregaEstimada: false,
  ...extra,
})

// 15 oct 2026, 12:00 UTC = 07:00 en Lima.
const AHORA = new Date('2026-10-15T12:00:00Z')

describe('fechas en hora de Lima', () => {
  it('«15 oct, 07:40»: UTC-5, mes corto sin punto y hora de 24 h', () => {
    expect(formatoFecha('2026-10-15T12:40:00Z', { ahora: AHORA })).toBe('15 oct, 07:40')
  })

  it('una salida a las 23:30 de Lima (04:30 UTC del día siguiente) cae en el día de Lima', () => {
    expect(formatoFecha('2026-10-16T04:30:00Z', { ahora: AHORA })).toBe('15 oct, 23:30')
  })

  it('a las 00:05 de Lima la hora es «00:05», no «24:05»', () => {
    expect(formatoFecha('2026-10-15T05:05:00Z', { ahora: AHORA })).toBe('15 oct, 00:05')
  })

  it('sin hora muestra solo la fecha', () => {
    expect(formatoFecha('2026-10-13T20:00:00Z', { conHora: false, ahora: AHORA })).toBe('13 oct')
  })

  it('setiembre se escribe «set», como en Perú', () => {
    expect(formatoFecha('2026-09-30T15:00:00Z', { ahora: AHORA })).toBe('30 set, 10:00')
  })

  it('el año solo aparece si no es el actual', () => {
    expect(formatoFecha('2025-12-31T15:00:00Z', { ahora: AHORA })).toBe('31 dic 2025, 10:00')
  })

  it('una hora con otra zona (-05:00) se convierte igual', () => {
    expect(formatoFecha('2026-10-15T07:40:00-05:00', { ahora: AHORA })).toBe('15 oct, 07:40')
  })

  it('un texto sin zona se lee como UTC, igual en todos los navegadores', () => {
    expect(formatoFecha('2026-10-15T12:40:00', { ahora: AHORA })).toBe('15 oct, 07:40')
  })

  it('el resultado no depende de la zona horaria de la máquina que corre la prueba (ni de la del navegador)', () => {
    const antes = process.env.TZ
    try {
      for (const zona of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Lima']) {
        process.env.TZ = zona
        expect(formatoFecha('2026-10-15T12:40:00Z', { ahora: AHORA }), zona).toBe('15 oct, 07:40')
        expect(formatoFecha('2026-10-15T12:40:00', { ahora: AHORA }), `${zona} (sin zona)`).toBe('15 oct, 07:40')
      }
    } finally {
      if (antes === undefined) delete process.env.TZ
      else process.env.TZ = antes
    }
  })

  it('nulo, vacío o ilegible: null, nunca una fecha inventada', () => {
    expect(formatoFecha(null)).toBeNull()
    expect(formatoFecha('')).toBeNull()
    expect(formatoFecha('ayer')).toBeNull()
  })
})

describe('la hora de la última actualización', () => {
  it('es la hora de Lima (UTC-5), con dos dígitos', () => {
    expect(horaDeLima(Date.parse('2026-10-15T17:10:00Z'))).toBe('12:10')
    expect(horaDeLima(Date.parse('2026-10-15T05:03:00Z'))).toBe('00:03')
  })
  it('cruza la medianoche de Lima, no la de UTC', () => expect(horaDeLima(Date.parse('2026-10-16T04:59:00Z'))).toBe('23:59'))
})

describe('cómo se nombra el vehículo', () => {
  it('el identificador es el VIN completo, sin abreviar', () => expect(identificadorVehiculo('LVTDD24B6VDX00231')).toBe('VIN LVTDD24B6VDX00231'))
  it('un VIN corto también', () => expect(identificadorVehiculo('ABC123')).toBe('VIN ABC123'))
  it('marca y modelo; sin ninguno, «Vehículo»', () => {
    expect(nombreVehiculo({ marca: 'Kia', modelo: 'Sportage' })).toBe('Kia Sportage')
    expect(nombreVehiculo({ marca: null, modelo: 'Sportage' })).toBe('Sportage')
    expect(nombreVehiculo({ marca: null, modelo: null })).toBe('Vehículo')
  })
})

describe('la clave con la que se busca el logo de una marca', () => {
  it('minúsculas, sin tildes ni signos', () => {
    expect(claveMarca('Toyota')).toBe('toyota')
    expect(claveMarca('JETOUR')).toBe('jetour')
    expect(claveMarca('Mercedes-Benz')).toBe('mercedesbenz')
    expect(claveMarca(' Citroën ')).toBe('citroen')
  })
  it('las variantes de Volkswagen del catálogo de SUM son Volkswagen', () => {
    for (const marca of ['VW', 'Volkswagen', 'VW PASAJEROS', 'VWPASAJEROS', 'VW COMERCIALES', 'VW CAMIONES', 'vw pasajeros'])
      expect(claveMarca(marca), marca).toBe('volkswagen')
  })
  it('las demás marcas del catálogo mantienen su nombre', () => {
    expect(claveMarca('JETOUR')).toBe('jetour')
    expect(claveMarca('SOUEAST')).toBe('soueast')
    expect(claveMarca('KYC')).toBe('kyc')
  })
  it('sin marca, no hay clave', () => {
    expect(claveMarca(null)).toBeNull()
    expect(claveMarca('  ')).toBeNull()
    expect(claveMarca('---')).toBeNull()
  })
})

describe('el logo de una marca', () => {
  const logos = { toyota: '/toyota.svg', volkswagen: '/vw.svg' }
  it('se busca por la clave de la marca', () => {
    expect(logoDeMarca(logos, 'Toyota')).toBe('/toyota.svg')
    expect(logoDeMarca(logos, 'TOYOTA')).toBe('/toyota.svg')
    expect(logoDeMarca(logos, 'VW')).toBe('/vw.svg')
  })
  it('sin logo para esa marca, o sin marca, no hay logo (se muestra la inicial)', () => {
    expect(logoDeMarca(logos, 'Jetour')).toBeUndefined()
    expect(logoDeMarca(logos, null)).toBeUndefined()
    expect(logoDeMarca({}, 'Toyota')).toBeUndefined()
  })
})

describe('los conteos de las pestañas', () => {
  it('cuentan cada etapa y el total', () => {
    const lista = [{ etapa: 'en_camino' }, { etapa: 'en_camino' }, { etapa: 'entregado' }, { etapa: 'en_planta' }] as const
    expect(contarPorEtapa(lista)).toEqual({ todos: 4, en_camino: 2, entregado: 1 })
  })
  it('sin traslados, todo en cero', () => expect(contarPorEtapa([])).toEqual({ todos: 0, en_camino: 0, entregado: 0 }))
})

describe('hitos', () => {
  it('salida y entrega, con «—» (null) donde no hay registro', () => {
    expect(hitosDe(traslado(), AHORA)).toEqual([
      { titulo: 'Salida registrada', fecha: '15 oct, 07:40', nota: null },
      { titulo: 'Entrega', fecha: null, nota: null },
    ])
  })

  it('una entrega con hora medida se muestra con hora', () => {
    const [, entrega] = hitosDe(traslado({ etapa: 'entregado', entregadoEn: '2026-10-14T16:20:00Z' }), AHORA)
    expect(entrega).toEqual({ titulo: 'Entrega', fecha: '14 oct, 11:20', nota: null })
  })

  it('una entrega con hora ESTIMADA muestra solo la fecha y avisa que no hay hora', () => {
    const [, entrega] = hitosDe(traslado({ etapa: 'entregado', entregadoEn: '2026-10-13T16:20:00Z', entregaEstimada: true }), AHORA)
    expect(entrega).toEqual({ titulo: 'Entrega', fecha: '13 oct', nota: 'Hora no disponible' })
  })

  it('una fecha ilegible es «sin registro», no «Pendiente»', () => {
    const [salida] = hitosDe(traslado({ salidaRegistrada: 'ayer' }), AHORA)
    expect(salida?.fecha).toBeNull()
  })
})

describe('orden y filtros', () => {
  const lista = [
    traslado({ idOrden: 1, etapa: 'entregado', salidaRegistrada: '2026-10-13T16:00:00Z', entregadoEn: '2026-10-13T20:00:00Z' }),
    traslado({ idOrden: 2, etapa: 'en_planta', salidaRegistrada: null }),
    traslado({ idOrden: 3, etapa: 'en_camino', salidaRegistrada: '2026-10-15T11:00:00Z' }),
    traslado({ idOrden: 4, etapa: 'anulado', salidaRegistrada: null }),
    traslado({ idOrden: 5, etapa: 'en_camino', salidaRegistrada: '2026-10-15T13:00:00Z' }),
  ]

  it('en camino primero (lo más reciente arriba), luego en planta, entregados y anulados', () => {
    expect(ordenarTraslados(lista).map((t) => t.idOrden)).toEqual([5, 3, 2, 1, 4])
  })

  it('no modifica la lista original', () => {
    const copia = [...lista]
    ordenarTraslados(lista)
    expect(lista).toEqual(copia)
  })

  it('«Todos» muestra todo, también lo que está en planta o anulado', () => {
    expect(filtrarTraslados(lista, { etapa: 'todos', texto: '', destino: 'todos' })).toHaveLength(5)
  })

  it('«En camino» y «Entregados» muestran solo esa etapa', () => {
    expect(filtrarTraslados(lista, { etapa: 'en_camino', texto: '', destino: 'todos' }).map((t) => t.idOrden)).toEqual([5, 3])
    expect(filtrarTraslados(lista, { etapa: 'entregado', texto: '', destino: 'todos' }).map((t) => t.idOrden)).toEqual([1])
  })

  it('lo anulado no es visible; lo demás sí', () => {
    expect(lista.filter(esVisible).map((t) => t.idOrden)).toEqual([1, 2, 3, 5])
    expect(esVisible({ etapa: 'anulado' })).toBe(false)
    for (const etapa of ['en_planta', 'en_camino', 'entregado'] as const) expect(esVisible({ etapa })).toBe(true)
  })

  it('los destinos PLANETA y SATELITAL no se muestran, sea cual sea la etapa; los demás sí', () => {
    const lista2 = [
      traslado({ idOrden: 1, destino: 'Sede Norte' }),
      traslado({ idOrden: 2, destino: 'PLANETA', etapa: 'en_camino' }),
      traslado({ idOrden: 3, destino: 'SATELITAL', etapa: 'entregado', entregadoEn: '2026-10-15T16:00:00Z' }),
      traslado({ idOrden: 4, destino: 'Sede Sur' }),
      traslado({ idOrden: 5, destino: 'Satelital', etapa: 'en_planta', salidaRegistrada: null }),
    ]
    expect(lista2.filter(esVisible).map((t) => t.idOrden)).toEqual([1, 4])
    expect(destinosDe(lista2.filter(esVisible))).toEqual(['Sede Norte', 'Sede Sur']) // ni siquiera aparecen en el selector
  })

  it('un traslado sin destino sigue a la vista (se muestra como «Sin destino»)', () => {
    expect(esVisible({ etapa: 'en_camino', destino: null })).toBe(true)
    expect(esVisible({ etapa: 'en_camino' })).toBe(true)
    expect(esVisible({ etapa: 'en_camino', destino: '' })).toBe(true)
  })

  it('un traslado anulado sigue oculto aunque su destino no lo esté', () => {
    expect(esVisible({ etapa: 'anulado', destino: 'Sede Norte' })).toBe(false)
  })

  it('el destino es el nombre ENTERO: ni mayúsculas, ni tildes ni espacios de más lo cambian, pero una parte del nombre no cuenta', () => {
    for (const destino of ['Planeta', 'PLANETA', 'planeta', ' Planeta ', 'Satelital', 'SATELITAL', 'satélital', 'Satélital', 'SATELITAL  ']) {
      expect(esDestinoOculto(destino), destino).toBe(true)
    }
    for (const destino of ['Sede Satelital', 'Planeta Norte', 'Satelital Sur', 'Plane', 'Satelite', 'Sede Planeta', 'SATELITALES']) {
      expect(esDestinoOculto(destino), destino).toBe(false)
    }
    expect(esDestinoOculto(null)).toBe(false)
    expect(esDestinoOculto(undefined)).toBe(false)
    expect(esDestinoOculto('')).toBe(false)
  })

  it('la lista de destinos ocultos es exactamente PLANETA y SATELITAL', () => {
    expect([...DESTINOS_OCULTOS]).toEqual(['PLANETA', 'SATELITAL'])
  })

  it('el destino filtra por nombre exacto', () => {
    const dos = [traslado({ idOrden: 1, destino: 'Sede Norte' }), traslado({ idOrden: 2, destino: 'Sede Sur' })]
    expect(filtrarTraslados(dos, { etapa: 'todos', texto: '', destino: 'Sede Sur' }).map((t) => t.idOrden)).toEqual([2])
  })

  it('el texto busca en VIN, marca, modelo, color y destino, sin mayúsculas ni tildes', () => {
    const v = [
      traslado({ idOrden: 1, vin: 'AAAX00231', marca: 'Kia', modelo: 'Sportage', color: 'Gris', destino: 'Sede Ñandú' }),
      traslado({ idOrden: 2, vin: 'BBBX00999', marca: 'Toyota', modelo: 'Corolla', color: 'Blanco', destino: 'Sede Sur' }),
    ]
    const buscar = (texto: string) => filtrarTraslados(v, { etapa: 'todos', texto, destino: 'todos' }).map((t) => t.idOrden)
    expect(buscar('x00231')).toEqual([1])
    expect(buscar('SPORTAGE')).toEqual([1])
    expect(buscar('blanco')).toEqual([2])
    expect(buscar('nandu')).toEqual([1])
    expect(buscar('kia gris')).toEqual([1]) // todas las palabras
    expect(buscar('kia blanco')).toEqual([]) // una palabra de cada vehículo no alcanza
    expect(buscar('   ')).toEqual([2, 1]) // sin texto no filtra; con la misma salida, el id mayor va primero
  })

  it('los destinos salen sin repetir, ordenados y sin vacíos', () => {
    const v = [traslado({ destino: 'Sede Sur' }), traslado({ destino: 'Sede Norte' }), traslado({ destino: 'Sede Sur' }), traslado({ destino: null })]
    expect(destinosDe(v)).toEqual(['Sede Norte', 'Sede Sur'])
  })
})
