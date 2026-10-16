// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  DIAS_DE_RETENCION,
  MOTIVOS,
  ORDEN_MOTIVOS,
  type IntentoTablero,
  type LlegadaTablero,
  descripcionDeMotivo,
  diaMasViejo,
  esDiaConsultable,
  esquemaDeUbicacion,
  estadoDe,
  filtrarIntentos,
  filtrarLlegadas,
  horaLima,
  horaMinutoLima,
  hoyEnLima,
  metros,
  nombreConductor,
  numero,
  ordenarPorRecepcion,
  resumenDeLlegada,
  sumarDias,
  textoAntiguedad,
  textoDemora,
  textoDia,
  usuarioConductor,
} from '.'

const llegada = (extra: Partial<LlegadaTablero> = {}): LlegadaTablero => ({
  idLlegada: 1,
  turno: 1,
  punto: { idPunto: 1, nombre: 'Patio de llegada', radioM: 100, precisionMaxM: 100 },
  conductor: { idUsuario: 7, username: 'op.demo01', nombre: 'Conductor 01' },
  step: 59_735_722,
  horaOficial: '2026-10-15T12:12:00Z',
  horaRecepcion: '2026-10-15T12:12:09Z',
  demoraS: 9,
  pasos: 0,
  flag: false,
  flags: [],
  latitud: -12.05,
  longitud: -77.05,
  distanciaM: 31.2,
  pctRadio: 31.2,
  precisionM: 8.4,
  ...extra,
})

const intento = (extra: Partial<IntentoTablero> = {}): IntentoTablero => ({
  idIntento: 1,
  horaRecepcion: '2026-10-15T12:40:12Z',
  conductor: { idUsuario: 7, username: 'op.demo05', nombre: 'Conductor 05' },
  punto: { idPunto: 1, nombre: 'Patio de llegada' },
  motivo: 'payload_ilegible',
  etiqueta: 'Texto ilegible',
  antiguedadQrS: null,
  textoInicio: 'WAUZZZ8U1HA004123',
  repeticionesConductorDia: 0,
  ...extra,
})

describe('horaLima', () => {
  it('la hora de Lima (UTC−5) con segundos', () => {
    expect(horaLima('2026-10-15T19:35:00Z')).toBe('14:35:00')
    expect(horaLima('2026-10-15T14:35:09-05:00')).toBe('14:35:09')
  })

  it('el cambio de día de Lima: las 04:59:50 UTC son las 23:59:50 del día anterior', () => {
    expect(horaLima('2026-10-16T04:59:50Z')).toBe('23:59:50')
    expect(horaLima('2026-10-16T05:00:10Z')).toBe('00:00:10')
  })

  it('un texto sin zona se lee como UTC, no como la hora del equipo', () => {
    expect(horaLima('2026-10-15T19:35:00')).toBe('14:35:00')
  })

  it.each([[null], [undefined], [''], ['ayer']])('«%s» no es una hora: «—»', (valor) => {
    expect(horaLima(valor as string | null | undefined)).toBe('—')
  })

  it('horaMinutoLima da horas y minutos', () => {
    expect(horaMinutoLima(Date.parse('2026-10-15T17:10:59Z'))).toBe('12:10')
  })
})

describe('días de Lima', () => {
  it('hoyEnLima es el día de calendario de Lima, no el de UTC', () => {
    expect(hoyEnLima(Date.parse('2026-10-16T03:00:00Z'))).toBe('2026-10-15')
    expect(hoyEnLima(Date.parse('2026-10-16T04:59:59Z'))).toBe('2026-10-15') // 23:59:59 en Lima
    expect(hoyEnLima(Date.parse('2026-10-16T05:00:00Z'))).toBe('2026-10-16') // medianoche de Lima
  })

  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-10-15', 1)).toBe('2026-10-16')
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(sumarDias('2024-03-01', -1)).toBe('2024-02-29')
  })

  it.each([['ayer'], ['2026-02-31'], ['2026-13-01'], ['2026-1-5'], ['']])('sumarDias de «%s» es nulo', (dia) => {
    expect(sumarDias(dia, 1)).toBeNull()
  })

  it('el día más viejo es hoy menos 90 días', () => {
    expect(DIAS_DE_RETENCION).toBe(90)
    expect(diaMasViejo('2026-10-15')).toBe('2026-07-17')
  })

  it('esDiaConsultable: hoy y hace 90 días sí; mañana y hace 91 días no', () => {
    const hoy = '2026-10-15'
    expect(esDiaConsultable(hoy, hoy)).toBe(true)
    expect(esDiaConsultable('2026-07-17', hoy)).toBe(true)
    expect(esDiaConsultable('2026-07-16', hoy)).toBe(false)
    expect(esDiaConsultable('2026-10-16', hoy)).toBe(false)
  })

  it.each([['ayer'], ['2026-02-31'], ['']])('esDiaConsultable rechaza «%s»', (dia) => {
    expect(esDiaConsultable(dia, '2026-10-15')).toBe(false)
  })

  it('textoDia: con año siempre y «hoy» solo para hoy', () => {
    expect(textoDia('2026-10-15', '2026-10-15')).toBe('15 oct 2026 · hoy')
    expect(textoDia('2026-10-14', '2026-10-15')).toBe('14 oct 2026')
    expect(textoDia('2025-12-31', '2026-01-10')).toBe('31 dic 2025')
    expect(textoDia('no', '2026-10-15')).toBe('no')
  })
})

describe('números y tiempos', () => {
  it('metros con coma decimal', () => {
    expect(metros(27.5)).toBe('27,5 m')
    expect(metros(100, 0)).toBe('100 m')
    expect(metros(5.04)).toBe('5,0 m')
    expect(metros(88, 2)).toBe('88,00 m')
  })

  it('numero sin ceros de más', () => {
    expect(numero(12)).toBe('12')
    expect(numero(11.5)).toBe('11,5')
    expect(numero(0)).toBe('0')
    expect(numero(12.04)).toBe('12')
  })

  it.each([
    [0, '0 s'],
    [9, '9 s'],
    [9.4, '9 s'],
    [9.6, '10 s'],
    [60, '60 s'],
    [60.4, '60 s'],
    [61, '1 min 1 s'],
    [71, '1 min 11 s'],
    [140, '2 min 20 s'],
    [559.6, '9 min 20 s'],
    [3600, '60 min 0 s'],
    [-120, '−2 min 0 s'],
    [-5, '−5 s'],
  ])('textoDemora(%s) = «%s»', (s, texto) => {
    expect(textoDemora(s)).toBe(texto)
  })

  it.each([
    [64_920, 'hace 18 h 2 min'],
    [64_950, 'hace 18 h 2 min'],
    [65_040, 'hace 18 h 4 min'],
    [3600, 'hace 1 h 0 min'],
    [840, 'hace 14 min 0 s'],
    [60, 'hace 1 min 0 s'],
    [59, 'hace 59 s'],
    [75, 'hace 1 min 15 s'],
    [45, 'hace 45 s'],
    [0, 'hace 0 s'],
    [-750, 'del futuro (12 min 30 s)'],
  ])('textoAntiguedad(%s) = «%s»', (s, texto) => {
    expect(textoAntiguedad(s)).toBe(texto)
  })
})

describe('el estado de una llegada', () => {
  it('Normal si no tiene flag', () => {
    expect(estadoDe({ flag: false, pasos: 2 })).toEqual({ tono: 'normal', texto: 'Normal' })
  })

  it('con flag lleva el texto OUT_OF_WINDOW y los pasos (en valor absoluto)', () => {
    expect(estadoDe({ flag: true, pasos: 4 })).toEqual({ tono: 'flag', texto: 'OUT_OF_WINDOW · 4 pasos' })
    expect(estadoDe({ flag: true, pasos: -4 })).toEqual({ tono: 'flag', texto: 'OUT_OF_WINDOW · 4 pasos' })
  })

  it('el resumen con flag dice los pasos, la antigüedad y que el conductor lo vio normal', () => {
    const texto = resumenDeLlegada({ flag: true, pasos: 4 })
    expect(texto).toContain('Entró con flag')
    expect(texto).toContain('el QR tenía 4 pasos (2 min 0 s de antigüedad)')
    expect(texto).toContain('El conductor lo vio como una confirmación normal.')
  })

  it('el resumen de un QR del futuro con flag dice los pasos en positivo', () => {
    const texto = resumenDeLlegada({ flag: true, pasos: -4 })
    expect(texto).toContain('el QR tenía 4 pasos (2 min 0 s de antigüedad)')
    expect(texto).not.toContain('-4')
    expect(resumenDeLlegada({ flag: false, pasos: -1 })).toBe('El QR tenía 1 pasos al llegar: dentro de lo normal (hasta 2 pasos, 60 s).')
  })

  it('el resumen de una llegada normal', () => {
    expect(resumenDeLlegada({ flag: false, pasos: 2 })).toBe('El QR tenía 2 pasos al llegar: dentro de lo normal (hasta 2 pasos, 60 s).')
  })
})

describe('el conductor', () => {
  it('el nombre, o el usuario, o el id', () => {
    expect(nombreConductor({ idUsuario: 7, username: 'op.01', nombre: 'Ana Pérez' })).toBe('Ana Pérez')
    expect(nombreConductor({ idUsuario: 7, username: 'op.01', nombre: null })).toBe('op.01')
    expect(nombreConductor({ idUsuario: 7, username: 'op.01', nombre: '   ' })).toBe('op.01')
    expect(nombreConductor({ idUsuario: 7, username: null, nombre: null })).toBe('Usuario 7')
  })

  it('el usuario de la segunda línea', () => {
    expect(usuarioConductor({ username: 'op.01' })).toBe('op.01')
    expect(usuarioConductor({ username: null })).toBe('')
  })
})

describe('los motivos', () => {
  it('cada motivo tiene su etiqueta, su tono y su ayuda (la tabla del spec)', () => {
    expect(Object.keys(MOTIVOS).sort()).toEqual([...ORDEN_MOTIVOS].sort())
    expect(MOTIVOS.payload_ilegible).toMatchObject({ etiqueta: 'Texto ilegible', tono: 'neutro' })
    expect(MOTIVOS.punto_inexistente).toMatchObject({ etiqueta: 'Punto inexistente', tono: 'rojo' })
    expect(MOTIVOS.punto_inactivo).toMatchObject({ etiqueta: 'Punto desactivado', tono: 'ambar' })
    expect(MOTIVOS.codigo_no_coincide).toMatchObject({ etiqueta: 'Código no coincide', tono: 'rojo' })
    expect(MOTIVOS.fuera_de_tope).toMatchObject({ etiqueta: 'QR demasiado viejo', tono: 'ambar' })
    for (const m of Object.values(MOTIVOS)) expect(m.ayuda.length).toBeGreaterThan(20)
  })

  it('un motivo que no se conoce sale como «Otro motivo», sin romper', () => {
    expect(descripcionDeMotivo('motivo_nuevo')).toMatchObject({ etiqueta: 'Otro motivo', tono: 'neutro' })
    expect(descripcionDeMotivo('fuera_de_tope').etiqueta).toBe('QR demasiado viejo')
  })
})

describe('filtrar y ordenar llegadas', () => {
  const lista = [
    llegada({ idLlegada: 1, conductor: { idUsuario: 1, username: 'op.demo01', nombre: 'Ana Pérez' } }),
    llegada({ idLlegada: 2, flag: true, pasos: 4, conductor: { idUsuario: 2, username: 'op.demo02', nombre: 'Luis Gómez' } }),
    llegada({ idLlegada: 3, conductor: { idUsuario: 3, username: 'jperez', nombre: null } }),
  ]

  it('el chip «Con flag» deja solo las que tienen flag', () => {
    expect(filtrarLlegadas(lista, { chip: 'flag', texto: '' }).map((l) => l.idLlegada)).toEqual([2])
    expect(filtrarLlegadas(lista, { chip: 'todas', texto: '' })).toHaveLength(3)
  })

  it('la búsqueda mira el nombre y el usuario, sin distinguir mayúsculas ni espacios de los bordes', () => {
    expect(filtrarLlegadas(lista, { chip: 'todas', texto: '  PÉREZ ' }).map((l) => l.idLlegada)).toEqual([1])
    expect(filtrarLlegadas(lista, { chip: 'todas', texto: 'jperez' }).map((l) => l.idLlegada)).toEqual([3])
    expect(filtrarLlegadas(lista, { chip: 'todas', texto: 'DEMO0' }).map((l) => l.idLlegada)).toEqual([1, 2])
  })

  it('el chip y la búsqueda se combinan', () => {
    expect(filtrarLlegadas(lista, { chip: 'flag', texto: 'ana' })).toEqual([])
    expect(filtrarLlegadas(lista, { chip: 'flag', texto: 'luis' }).map((l) => l.idLlegada)).toEqual([2])
  })

  it('no modifica la lista de entrada', () => {
    const copia = [...lista]
    filtrarLlegadas(lista, { chip: 'flag', texto: 'x' })
    expect(lista).toEqual(copia)
  })

  describe('ordenar por hora de recepción', () => {
    const horas = [
      llegada({ idLlegada: 5, horaRecepcion: '2026-10-15T14:00:00Z' }),
      llegada({ idLlegada: 4, horaRecepcion: '2026-10-15T12:00:00Z' }),
      llegada({ idLlegada: 6, horaRecepcion: '2026-10-15T13:00:00-05:00' }), // 18:00 UTC: se compara el instante, no el texto
    ]

    it('de la más antigua a la más reciente', () => {
      expect(ordenarPorRecepcion(horas, false).map((l) => l.idLlegada)).toEqual([4, 5, 6])
    })

    it('al revés', () => {
      expect(ordenarPorRecepcion(horas, true).map((l) => l.idLlegada)).toEqual([6, 5, 4])
    })

    it('el mismo instante se desempata por id', () => {
      const iguales = [llegada({ idLlegada: 9 }), llegada({ idLlegada: 8 })]
      expect(ordenarPorRecepcion(iguales, false).map((l) => l.idLlegada)).toEqual([8, 9])
      expect(ordenarPorRecepcion(iguales, true).map((l) => l.idLlegada)).toEqual([9, 8])
    })

    it('no modifica la lista de entrada', () => {
      const copia = [...horas]
      ordenarPorRecepcion(horas, true)
      expect(horas).toEqual(copia)
    })
  })
})

describe('filtrar rechazos', () => {
  const lista = [
    intento({ idIntento: 1, motivo: 'payload_ilegible', conductor: { idUsuario: 1, username: 'op.demo05', nombre: 'Conductor 05' } }),
    intento({ idIntento: 2, motivo: 'fuera_de_tope', conductor: { idUsuario: 2, username: 'op.demo07', nombre: 'Conductor 07' } }),
    intento({ idIntento: 3, motivo: 'fuera_de_tope', conductor: { idUsuario: 2, username: 'op.demo07', nombre: 'Conductor 07' } }),
  ]

  it('por motivo (null = todos) conservando el orden', () => {
    expect(filtrarIntentos(lista, { motivo: null, texto: '' }).map((i) => i.idIntento)).toEqual([1, 2, 3])
    expect(filtrarIntentos(lista, { motivo: 'fuera_de_tope', texto: '' }).map((i) => i.idIntento)).toEqual([2, 3])
    expect(filtrarIntentos(lista, { motivo: 'punto_inactivo', texto: '' })).toEqual([])
  })

  it('por conductor, sin distinguir mayúsculas', () => {
    expect(filtrarIntentos(lista, { motivo: null, texto: 'DEMO07' }).map((i) => i.idIntento)).toEqual([2, 3])
    expect(filtrarIntentos(lista, { motivo: 'payload_ilegible', texto: 'demo07' })).toEqual([])
  })
})

describe('esquemaDeUbicacion', () => {
  const base = { lado: 360, radioM: 100, precisionM: 10, centro: { latitud: -12, longitud: -77 } }

  it('un teléfono al norte del centro queda arriba', () => {
    const e = esquemaDeUbicacion({ ...base, distanciaM: 50, telefono: { latitud: -12 + 50 / 111_320, longitud: -77 } })
    expect(e.direccion).toBe('coordenadas')
    expect(e.x).toBe(180)
    expect(e.y).toBeLessThan(180)
  })

  it('al sur queda abajo, al este a la derecha y al oeste a la izquierda', () => {
    const sur = esquemaDeUbicacion({ ...base, distanciaM: 50, telefono: { latitud: -12 - 50 / 111_320, longitud: -77 } })
    expect(sur.y).toBeGreaterThan(180)
    const metroEnLongitud = 1 / (111_320 * Math.cos((12 * Math.PI) / 180))
    const este = esquemaDeUbicacion({ ...base, distanciaM: 50, telefono: { latitud: -12, longitud: -77 + 50 * metroEnLongitud } })
    expect(este.x).toBeGreaterThan(180)
    expect(este.y).toBe(180)
    const oeste = esquemaDeUbicacion({ ...base, distanciaM: 50, telefono: { latitud: -12, longitud: -77 - 50 * metroEnLongitud } })
    expect(oeste.x).toBeLessThan(180)
  })

  it('el rumbo corrige la longitud por la latitud: 50 m al norte y 50 m al este dan una diagonal de 45°', () => {
    const grado = 111_320
    const lat = -60 // lejos del ecuador, donde un grado de longitud mide la mitad que uno de latitud
    const este = 50 / (grado * Math.cos((lat * Math.PI) / 180))
    const e = esquemaDeUbicacion({ ...base, centro: { latitud: lat, longitud: -77 }, distanciaM: 70, telefono: { latitud: lat + 50 / grado, longitud: -77 + este } })
    expect(e.direccion).toBe('coordenadas')
    expect(e.x - 180).toBeCloseTo(180 - e.y, 0) // misma distancia hacia la derecha que hacia arriba
  })

  it('la distancia al centro en el dibujo es proporcional a la del servidor sobre el radio', () => {
    const e = esquemaDeUbicacion({ ...base, distanciaM: 50, telefono: { latitud: -12 + 1 / 111_320, longitud: -77 } })
    const distancia = Math.hypot(e.x - 180, e.y - 180)
    expect(distancia).toBeCloseTo(e.radioPx / 2, 0) // 50 m de 100 m
    expect(e.radioPx).toBeCloseTo(111.6, 1)
  })

  it('el círculo de precisión usa la misma escala y se acota para que no se salga del lienzo', () => {
    const normal = esquemaDeUbicacion({ ...base, distanciaM: 10, precisionM: 50, telefono: { latitud: -12, longitud: -77 + 1e-5 } })
    expect(normal.precisionPx).toBeCloseTo(normal.radioPx / 2, 0)
    const enorme = esquemaDeUbicacion({ ...base, distanciaM: 10, precisionM: 5000, telefono: { latitud: -12, longitud: -77 + 1e-5 } })
    expect(enorme.precisionPx).toBe(162)
  })

  it('sin la ficha del punto no hay dirección: se dibuja al este y se dice', () => {
    const e = esquemaDeUbicacion({ ...base, centro: null, distanciaM: 50, telefono: { latitud: -12.5, longitud: -77.5 } })
    expect(e.direccion).toBe('desconocida')
    expect(e.y).toBe(180)
    expect(e.x).toBeGreaterThan(180)
  })

  it('con las mismas coordenadas que el centro tampoco hay rumbo', () => {
    const e = esquemaDeUbicacion({ ...base, distanciaM: 0, telefono: { latitud: -12, longitud: -77 } })
    expect(e.direccion).toBe('desconocida')
    expect({ x: e.x, y: e.y }).toEqual({ x: 180, y: 180 })
  })

  it('un teléfono fuera del radio se dibuja fuera del círculo', () => {
    const e = esquemaDeUbicacion({ ...base, distanciaM: 150, telefono: { latitud: -12 + 150 / 111_320, longitud: -77 } })
    expect(Math.hypot(e.x - 180, e.y - 180)).toBeGreaterThan(e.radioPx)
  })
})
