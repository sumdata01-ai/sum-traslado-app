// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { ESPACIO_MINIMO_BYTES, type StorageManagerLike, consultarAlmacenamiento } from './persistencia'

const MB = 1024 * 1024

function storage(parcial: Partial<StorageManagerLike> = {}): StorageManagerLike {
  return {
    persisted: vi.fn(async () => false),
    persist: vi.fn(async () => true),
    estimate: vi.fn(async () => ({ usage: 10 * MB, quota: 1000 * MB })),
    ...parcial,
  }
}

describe('consultarAlmacenamiento (AC6)', () => {
  it('pide la persistencia y mide el espacio', async () => {
    const s = storage()
    const estado = await consultarAlmacenamiento(s)

    expect(s.persist).toHaveBeenCalledTimes(1)
    expect(estado).toEqual({ soportado: true, persistente: true, usoBytes: 10 * MB, cuotaBytes: 1000 * MB, espacioBajo: false })
  })

  it('si el navegador ya prometió conservar los datos, no vuelve a pedirlo', async () => {
    const s = storage({ persisted: vi.fn(async () => true) })
    const estado = await consultarAlmacenamiento(s)
    expect(s.persist).not.toHaveBeenCalled()
    expect(estado.persistente).toBe(true)
  })

  it('un «false» de persist() no bloquea: se informa y el resto sigue', async () => {
    const estado = await consultarAlmacenamiento(storage({ persist: vi.fn(async () => false) }))
    expect(estado.persistente).toBe(false)
    expect(estado.soportado).toBe(true)
    expect(estado.espacioBajo).toBe(false)
  })

  it('avisa de poco espacio cuando queda menos del mínimo', async () => {
    const s = storage({ estimate: vi.fn(async () => ({ usage: 960 * MB, quota: 1000 * MB })) }) // quedan 40 MB
    expect((await consultarAlmacenamiento(s)).espacioBajo).toBe(true)
  })

  it.each([
    ['justo en el mínimo', 950, false],
    ['un poco por debajo', 951, true],
    ['holgado', 100, false],
    ['sin nada libre', 1000, true],
  ])('%s (usados %i MB de 1000 MB) → espacioBajo %s', async (_nombre, usadosMb, esperado) => {
    const s = storage({ estimate: vi.fn(async () => ({ usage: usadosMb * MB, quota: 1000 * MB })) })
    expect((await consultarAlmacenamiento(s)).espacioBajo).toBe(esperado)
  })

  it('el mínimo se puede cambiar', async () => {
    const s = storage({ estimate: vi.fn(async () => ({ usage: 900 * MB, quota: 1000 * MB })) })
    expect((await consultarAlmacenamiento(s, 200 * MB)).espacioBajo).toBe(true)
    expect(ESPACIO_MINIMO_BYTES).toBe(50 * MB)
  })

  it('un navegador sin navigator.storage devuelve un estado conservador', async () => {
    expect(await consultarAlmacenamiento(undefined)).toEqual({
      soportado: false,
      persistente: false,
      usoBytes: null,
      cuotaBytes: null,
      espacioBajo: false,
    })
  })

  it('si persist() lanza, no lanza hacia arriba y se toma como no persistente', async () => {
    const s = storage({ persist: vi.fn(async () => Promise.reject(new Error('no permitido'))) })
    const estado = await consultarAlmacenamiento(s)
    expect(estado.persistente).toBe(false)
    expect(estado.cuotaBytes).toBe(1000 * MB) // la estimación sigue funcionando
  })

  it('si estimate() lanza, no se sabe el espacio y NO se avisa de poco espacio sin motivo', async () => {
    const s = storage({ estimate: vi.fn(async () => Promise.reject(new Error('no disponible'))) })
    const estado = await consultarAlmacenamiento(s)
    expect(estado).toMatchObject({ usoBytes: null, cuotaBytes: null, espacioBajo: false })
  })

  it('una estimación incompleta (sin cuota) no dispara el aviso', async () => {
    const s = storage({ estimate: vi.fn(async () => ({ usage: 5 * MB })) })
    expect(await consultarAlmacenamiento(s)).toMatchObject({ usoBytes: 5 * MB, cuotaBytes: null, espacioBajo: false })
  })

  it('un navegador con storage a medias (sin persisted, persist ni estimate) tampoco rompe', async () => {
    expect(await consultarAlmacenamiento({})).toEqual({ soportado: true, persistente: false, usoBytes: null, cuotaBytes: null, espacioBajo: false })
  })
})
