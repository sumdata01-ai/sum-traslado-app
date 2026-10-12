import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_AVISO_SESION, CanalBroadcast, CanalStorage, type MensajeSesion, canalDelNavegador, canalMudo, esMensajeSesion } from './canalSesion'

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

const esperarAvisos = () => new Promise((resolver) => setTimeout(resolver, 20))

describe('CanalBroadcast (BroadcastChannel)', () => {
  it('lo que publica una pestaña lo reciben las demás, y ella no', async () => {
    const nombre = `prueba-${crypto.randomUUID()}`
    const pestana1 = new CanalBroadcast(nombre)
    const pestana2 = new CanalBroadcast(nombre)
    const recibidos1: MensajeSesion[] = []
    const recibidos2: MensajeSesion[] = []
    pestana1.escuchar((m) => recibidos1.push(m))
    pestana2.escuchar((m) => recibidos2.push(m))

    pestana1.publicar({ tipo: 'salio' })
    await esperarAvisos()

    expect(recibidos2).toEqual([{ tipo: 'salio' }])
    expect(recibidos1).toEqual([])
    pestana1.cerrar()
    pestana2.cerrar()
  })

  it('dejar de escuchar corta los avisos', async () => {
    const nombre = `prueba-${crypto.randomUUID()}`
    const emisor = new CanalBroadcast(nombre)
    const receptor = new CanalBroadcast(nombre)
    const escucha = vi.fn()
    const baja = receptor.escuchar(escucha)
    baja()

    emisor.publicar({ tipo: 'salio' })
    await esperarAvisos()

    expect(escucha).not.toHaveBeenCalled()
    emisor.cerrar()
    receptor.cerrar()
  })
})

describe('CanalStorage (respaldo por el evento `storage`)', () => {
  const avisoDeOtraPestana = (valor: string | null, clave = CLAVE_AVISO_SESION) =>
    window.dispatchEvent(new StorageEvent('storage', { key: clave, newValue: valor }))

  it('publicar deja el aviso en el almacenamiento, con un sello que cambia cada vez', () => {
    const canal = new CanalStorage(localStorage, window)
    canal.publicar({ tipo: 'salio' })
    const primero = localStorage.getItem(CLAVE_AVISO_SESION)
    canal.publicar({ tipo: 'salio' })
    const segundo = localStorage.getItem(CLAVE_AVISO_SESION)

    expect(JSON.parse(primero!)).toMatchObject({ tipo: 'salio' })
    expect(segundo).not.toBe(primero) // si el valor no cambia, el navegador no avisa a las demás pestañas
  })

  it('recibe lo que otra pestaña dejó en su clave', () => {
    const canal = new CanalStorage(localStorage, window)
    const escucha = vi.fn()
    canal.escuchar(escucha)

    avisoDeOtraPestana(JSON.stringify({ tipo: 'entro', idUsuario: 9, usuario: 'b', sello: 'x' }))

    expect(escucha).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'entro', idUsuario: 9, usuario: 'b' }))
  })

  it('ignora otras claves, valores borrados y lo que no es un aviso', () => {
    const canal = new CanalStorage(localStorage, window)
    const escucha = vi.fn()
    canal.escuchar(escucha)

    avisoDeOtraPestana(JSON.stringify({ tipo: 'salio' }), 'otra-clave')
    avisoDeOtraPestana(null)
    avisoDeOtraPestana('no es json')
    avisoDeOtraPestana(JSON.stringify({ tipo: 'otra-cosa' }))

    expect(escucha).not.toHaveBeenCalled()
  })

  it('con el almacenamiento bloqueado, publicar no lanza', () => {
    const roto = { setItem: () => { throw new Error('bloqueado') } } as unknown as Storage
    expect(() => new CanalStorage(roto, window).publicar({ tipo: 'salio' })).not.toThrow()
  })

  it('dejar de escuchar corta los avisos', () => {
    const canal = new CanalStorage(localStorage, window)
    const escucha = vi.fn()
    canal.escuchar(escucha)()

    avisoDeOtraPestana(JSON.stringify({ tipo: 'salio' }))

    expect(escucha).not.toHaveBeenCalled()
  })
})

describe('canalDelNavegador', () => {
  it('usa BroadcastChannel si existe', () => {
    const canal = canalDelNavegador()
    expect(canal).toBeInstanceOf(CanalBroadcast)
    ;(canal as CanalBroadcast).cerrar()
  })

  it('sin BroadcastChannel usa el evento `storage`', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    expect(canalDelNavegador()).toBeInstanceOf(CanalStorage)
  })

  it('sin ninguno de los dos, un canal mudo que no lanza', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    vi.stubGlobal('localStorage', undefined)
    const canal = canalDelNavegador()
    expect(canal).toBe(canalMudo)
    expect(() => canal.publicar({ tipo: 'salio' })).not.toThrow()
    expect(() => canal.escuchar(() => undefined)()).not.toThrow()
  })
})

describe('esMensajeSesion', () => {
  it('solo acepta los dos tipos de aviso', () => {
    expect(esMensajeSesion({ tipo: 'entro', idUsuario: 1, usuario: 'a' })).toBe(true)
    expect(esMensajeSesion({ tipo: 'salio' })).toBe(true)
    for (const valor of [null, 'salio', 5, {}, { tipo: 'otro' }]) expect(esMensajeSesion(valor)).toBe(false)
  })
})
