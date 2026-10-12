import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/core/http/ApiError'
import { AuthCookie, type AlmacenLike } from './authCookie'
import { tieneAcceso } from './sesion'
import { AlmacenMemoria, crearServidorFalso, json, numeroDeToken } from './testing/servidorFalso'

function montar(opciones: { candado?: <T>(t: () => Promise<T>) => Promise<T>; almacen?: AlmacenLike | AlmacenMemoria } = {}) {
  const servidor = crearServidorFalso()
  const almacen = opciones.almacen ?? new AlmacenMemoria()
  const solicitar = vi.fn(servidor.solicitar)
  const auth = new AuthCookie({ solicitar, almacen, candado: opciones.candado ?? ((tarea) => tarea()) })
  return { servidor, almacen: almacen as AlmacenMemoria, solicitar, auth }
}

const estado = (auth: AuthCookie) => auth.getSnapshot().estado

describe('AC1 · login válido', () => {
  it('queda con sesión, con el token solo en memoria y sin el token en el navegador', async () => {
    const { auth, almacen } = montar()

    const resultado = await auth.login('usuario.prueba', 'buena')

    expect(resultado).toEqual({ ok: true })
    expect(estado(auth)).toBe('activa')
    expect(auth.getSnapshot().sesion).toEqual({
      idUsuario: 7, // sale del token
      usuario: 'usuario.prueba',
      nombre: 'OPERARIO PRUEBA',
      role: 'operario',
      area: 'secado',
      allowedApps: ['traslado'],
    })
    expect(numeroDeToken(auth.getToken())).toBe(1)
    // En el navegador solo hay metadatos: ni el token ni la cookie.
    expect(almacen.volcado()).not.toContain(auth.getToken()!)
    expect(almacen.volcado()).not.toContain('cookie-')
    expect(almacen.volcado()).toContain('operario')
  })

  it('manda las credenciales por /api/login con credenciales incluidas, y recorta el usuario', async () => {
    const { auth, solicitar } = montar()
    await auth.login('  usuario.prueba  ', 'buena')

    const [path, init] = solicitar.mock.calls[0] ?? []
    expect(path).toBe('/api/login')
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' })
    expect(JSON.parse(String(init?.body))).toEqual({ username: 'usuario.prueba', password: 'buena' })
  })
})

describe('AC2 · credenciales inválidas', () => {
  it('un login fallido llega con HTTP 200 y success false: se muestra el mensaje del servidor y no se guarda nada', async () => {
    const { auth, almacen } = montar()

    const resultado = await auth.login('usuario.prueba', 'mala')

    expect(resultado).toEqual({ ok: false, motivo: 'credenciales', mensaje: 'Usuario o contrasena incorrectos' })
    expect(estado(auth)).toBe('restaurando') // no avanzó: sigue como estaba
    expect(auth.getToken()).toBeNull()
    expect(almacen.datos.size).toBe(0)
  })

  it('sin red lo dice, sin confundirlo con una contraseña mala', async () => {
    const { auth, servidor } = montar()
    servidor.sinRed = true

    expect(await auth.login('usuario.prueba', 'buena')).toEqual({ ok: false, motivo: 'red', mensaje: 'Sin conexión al backend o internet.' })
  })

  it('con el límite de intentos (429) avisa que espere', async () => {
    const solicitar = vi.fn(async () => json(429, { detail: 'rate limit' }))
    const auth = new AuthCookie({ solicitar, almacen: new AlmacenMemoria() })
    expect(await auth.login('a', 'b')).toEqual({ ok: false, motivo: 'limite', mensaje: 'Demasiados intentos. Intenta en unos momentos.' })
  })

  it('un error del servidor no se hace pasar por una contraseña mala', async () => {
    const solicitar = vi.fn(async () => json(500, { detail: 'Error interno' }))
    const auth = new AuthCookie({ solicitar, almacen: new AlmacenMemoria() })
    expect(await auth.login('a', 'b')).toMatchObject({ ok: false, motivo: 'servidor', mensaje: 'Error interno' })
  })

  it('una respuesta de éxito sin token o sin rol se rechaza', async () => {
    for (const cuerpo of [{ success: true, role: 'operario', allowed_apps: [] }, { success: true, token: 'x', allowed_apps: [] }]) {
      const auth = new AuthCookie({ solicitar: async () => json(200, cuerpo), almacen: new AlmacenMemoria() })
      expect(await auth.login('a', 'b')).toMatchObject({ ok: false, motivo: 'servidor' })
      expect(auth.getToken()).toBeNull()
    }
  })

  it('con usuario o contraseña vacíos ni siquiera llama al servidor', async () => {
    const { auth, solicitar } = montar()
    expect(await auth.login('   ', 'buena')).toMatchObject({ ok: false, mensaje: 'Escribe tu usuario y contraseña.' })
    expect(await auth.login('usuario.prueba', '')).toMatchObject({ ok: false })
    expect(solicitar).not.toHaveBeenCalled()
  })

  it('una segunda pulsación mientras el login sigue en curso no manda otra petición (el límite es de 10 por minuto)', async () => {
    const { auth, servidor } = montar()

    const [a, b] = await Promise.all([auth.login('usuario.prueba', 'buena'), auth.login('usuario.prueba', 'buena')])

    expect(servidor.llamadas.login).toBe(1)
    expect(a).toEqual(b)
  })
})

describe('AC3 · quién puede usar Traslado', () => {
  it('tieneAcceso depende de allowed_apps', async () => {
    const { auth, servidor } = montar()
    servidor.perfil.apps = ['inspeccion']
    await auth.login('usuario.prueba', 'buena')

    expect(estado(auth)).toBe('activa') // hay sesión…
    expect(tieneAcceso(auth.getSnapshot().sesion)).toBe(false) // …pero no para esta aplicación
    expect(tieneAcceso(auth.getSnapshot().sesion, 'inspeccion')).toBe(true)
  })

  it('sin sesión o con una lista vacía no hay acceso', () => {
    expect(tieneAcceso(null)).toBe(false)
    expect(tieneAcceso({ idUsuario: 1, usuario: 'x', nombre: null, role: 'operario', area: null, allowedApps: [] })).toBe(false)
  })
})

describe('AC4 · restaurar la sesión al recargar', () => {
  it('con una cookie válida vuelve a tener sesión sin pedir credenciales, y recupera el usuario de los metadatos', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')

    // «Recarga»: otra instancia, el mismo navegador (cookie y almacenamiento).
    const recargada = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    expect(estado(recargada)).toBe('restaurando')
    await recargada.restaurar()

    expect(estado(recargada)).toBe('activa')
    expect(recargada.getSnapshot().sesion?.usuario).toBe('usuario.prueba') // el refresh no lo trae
    expect(numeroDeToken(recargada.getToken())).toBe(2)
    expect(servidor.llamadas.login).toBe(1)
  })

  it('sin cookie válida queda sin sesión y borra los metadatos', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.ponerCookie(null)

    const recargada = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    await recargada.restaurar()

    expect(estado(recargada)).toBe('sinSesion')
    expect(recargada.getToken()).toBeNull()
    expect(almacen.datos.size).toBe(0)
  })

  it('sin red pero sabiendo quién es: «sinConexion», sin cerrar la sesión; al volver la red se recupera', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true

    const recargada = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    await recargada.restaurar()

    expect(estado(recargada)).toBe('sinConexion')
    expect(recargada.getSnapshot().sesion?.usuario).toBe('usuario.prueba')
    expect(recargada.getToken()).toBeNull()
    expect(almacen.datos.size).toBeGreaterThan(0) // no se tocó nada

    servidor.sinRed = false
    await recargada.restaurar()
    expect(estado(recargada)).toBe('activa')
  })

  it('sin red y sin saber quién es: va al login', async () => {
    const { auth, servidor } = montar()
    servidor.sinRed = true
    await auth.restaurar()
    expect(estado(auth)).toBe('sinSesion')
  })

  it('el modo estricto de React restaura dos veces a la vez: una sola llamada al servidor, y la sesión sobrevive', async () => {
    const { auth, servidor } = montar()
    await auth.login('usuario.prueba', 'buena')
    const recargada = new AuthCookie({ solicitar: servidor.solicitar, almacen: new AlmacenMemoria(), candado: (t) => t() })

    await Promise.all([recargada.restaurar(), recargada.restaurar()])

    expect(servidor.llamadas.refresh).toBe(1)
    expect(estado(recargada)).toBe('activa')
  })

  it('dos restauraciones a la vez con un logout pendiente mandan un solo logout al servidor', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true
    await auth.logout()
    servidor.sinRed = false
    const reabierta = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    const logoutsAntes = servidor.llamadas.logout

    await Promise.all([reabierta.restaurar(), reabierta.restaurar()])

    expect(servidor.llamadas.logout).toBe(logoutsAntes + 1)
    expect(estado(reabierta)).toBe('sinSesion')
  })

  it('metadatos corruptos en el navegador se descartan sin romper', async () => {
    const { servidor, almacen } = montar()
    almacen.datos.set('sum-traslado:sesion', '{esto no es json')
    servidor.sinRed = true

    const auth = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    await auth.restaurar()

    expect(estado(auth)).toBe('sinSesion')
    expect(almacen.datos.has('sum-traslado:sesion')).toBe(false)
  })
})

describe('refresh: un solo vuelo y sin cerrar la sesión por un problema del servidor', () => {
  it('varios refrescos a la vez comparten una sola llamada: si no, el servidor rechazaría la segunda cookie', async () => {
    const { auth, servidor } = montar()
    await auth.login('usuario.prueba', 'buena')

    const resultados = await Promise.all([auth.refrescarSesion(), auth.refrescarSesion(), auth.refrescarSesion()])

    expect(resultados).toEqual(['ok', 'ok', 'ok'])
    expect(servidor.llamadas.refresh).toBe(1)
    expect(estado(auth)).toBe('activa')
  })

  it('la cookie rota en cada refresco y el token nuevo reemplaza al anterior', async () => {
    const { auth, servidor } = montar()
    await auth.login('usuario.prueba', 'buena')
    const antes = servidor.cookie()

    await auth.refrescarSesion()

    expect(servidor.cookie()).not.toBe(antes)
    expect(numeroDeToken(auth.getToken())).toBe(2)
  })

  it('dos pestañas refrescando a la vez: con el candado ambas siguen con sesión; sin él la segunda la pierde', async () => {
    const servidor = crearServidorFalso()
    const abrirPestana = (candado: <T>(t: () => Promise<T>) => Promise<T>) =>
      new AuthCookie({ solicitar: servidor.solicitar, almacen: new AlmacenMemoria(), candado })

    // Con un candado compartido (como Web Locks entre pestañas).
    let cola: Promise<unknown> = Promise.resolve()
    const candadoCompartido = <T>(tarea: () => Promise<T>): Promise<T> => {
      const resultado = cola.then(tarea)
      cola = resultado.catch(() => undefined)
      return resultado
    }
    const primera = abrirPestana(candadoCompartido)
    const segunda = abrirPestana(candadoCompartido)
    await primera.login('usuario.prueba', 'buena')
    expect(await Promise.all([primera.refrescarSesion(), segunda.refrescarSesion()])).toEqual(['ok', 'ok'])

    // Sin candado: las dos mandan la misma cookie y el servidor rechaza la segunda.
    const suelta1 = abrirPestana((t) => t())
    const suelta2 = abrirPestana((t) => t())
    await suelta1.login('usuario.prueba', 'buena')
    const sinCandado = await Promise.all([suelta1.refrescarSesion(), suelta2.refrescarSesion()])
    expect(sinCandado.sort()).toEqual(['expirada', 'ok'])
  })

  it('el refresco pasa por el candado una vez por refresco', async () => {
    let usosDelCandado = 0
    const candado = <T,>(tarea: () => Promise<T>): Promise<T> => {
      usosDelCandado++
      return tarea()
    }
    const { auth } = montar({ candado })
    await auth.login('usuario.prueba', 'buena')

    await Promise.all([auth.refrescarSesion(), auth.refrescarSesion()])
    await auth.refrescarSesion()

    expect(usosDelCandado).toBe(2)
  })

  it.each([
    [401, 'expirada'],
    [429, 'sin_conexion'],
    [500, 'sin_conexion'],
    [503, 'sin_conexion'],
  ] as const)('el servidor responde %i → %s', async (codigo, esperado) => {
    const { auth, servidor } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.codigoRefresh = codigo

    expect(await auth.refrescarSesion()).toBe(esperado)
  })

  it('un 429 o un 500 en el refresco NO cierran la sesión', async () => {
    const { auth, servidor } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.codigoRefresh = 429

    await auth.refrescarSesion()

    expect(estado(auth)).toBe('activa')
    expect(numeroDeToken(auth.getToken())).toBe(1)
  })

  it('sin red el refresco no cierra la sesión', async () => {
    const { auth, servidor } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true

    expect(await auth.refrescarSesion()).toBe('sin_conexion')
    expect(estado(auth)).toBe('activa')
  })

  it('si el supervisor cambió el rol o las apps, el refresco lo recoge y lo guarda', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.perfil = { role: 'operario', area: 'despacho', apps: ['traslado', 'inspeccion'] }

    await auth.refrescarSesion()

    expect(auth.getSnapshot().sesion).toMatchObject({ area: 'despacho', allowedApps: ['traslado', 'inspeccion'], usuario: 'usuario.prueba' })
    expect(almacen.volcado()).toContain('despacho')
  })

  it('un 200 sin sesión (success false) cuenta como expirada', async () => {
    const auth = new AuthCookie({ solicitar: async () => json(200, { success: false }), almacen: new AlmacenMemoria(), candado: (t) => t() })
    expect(await auth.refrescarSesion()).toBe('expirada')
  })
})

describe('AC5 · cerrar sesión', () => {
  it('avisa al servidor, borra el token y los metadatos y queda sin sesión', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')

    await auth.logout()

    expect(servidor.llamadas.logout).toBe(1)
    expect(estado(auth)).toBe('sinSesion')
    expect(auth.getSnapshot().sesion).toBeNull()
    expect(auth.getToken()).toBeNull()
    expect(almacen.datos.size).toBe(0)
    expect(servidor.cookieVigente()).toBeNull()
  })

  it('tras el logout, restaurar no recupera la sesión', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    await auth.logout()

    const otra = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    await otra.restaurar()

    expect(estado(otra)).toBe('sinSesion')
  })

  it('sin red borra igual lo local y deja constancia de que el logout quedó pendiente', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true

    await auth.logout()

    expect(estado(auth)).toBe('sinSesion')
    expect(auth.getToken()).toBeNull()
    expect(almacen.datos.has('sum-traslado:sesion')).toBe(false)
    expect(almacen.datos.get('sum-traslado:logout-pendiente')).toBe('1')
  })

  it('con un logout pendiente, al abrir NO restaura la sesión aunque la cookie siga viva, y lo reintenta', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true
    await auth.logout()
    servidor.sinRed = false // vuelve la red; la cookie sigue viva en el navegador
    expect(servidor.cookieVigente()).not.toBeNull()

    const reabierta = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    await reabierta.restaurar()

    expect(estado(reabierta)).toBe('sinSesion')
    expect(reabierta.getToken()).toBeNull()
    expect(servidor.llamadas.refresh).toBe(0) // no intentó recuperar la sesión
    expect(servidor.cookieVigente()).toBeNull() // el logout pendiente por fin llegó
    expect(almacen.datos.has('sum-traslado:logout-pendiente')).toBe(false)
  })

  it('si sigue sin red al abrir, el logout sigue pendiente y tampoco se restaura', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true
    await auth.logout()

    const reabierta = new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (t) => t() })
    await reabierta.restaurar()

    expect(estado(reabierta)).toBe('sinSesion')
    expect(almacen.datos.get('sum-traslado:logout-pendiente')).toBe('1')
  })

  it('un login nuevo cancela el logout pendiente', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')
    servidor.sinRed = true
    await auth.logout()
    servidor.sinRed = false

    await auth.login('usuario.prueba', 'buena')

    expect(almacen.datos.has('sum-traslado:logout-pendiente')).toBe(false)
    expect(estado(auth)).toBe('activa')
  })

  it('limpiarSesion (la llamada que hace el cliente HTTP al expirar) borra todo lo local sin avisar al servidor', async () => {
    const { auth, servidor, almacen } = montar()
    await auth.login('usuario.prueba', 'buena')

    auth.limpiarSesion()

    expect(estado(auth)).toBe('sinSesion')
    expect(auth.getToken()).toBeNull()
    expect(almacen.datos.size).toBe(0)
    expect(servidor.llamadas.logout).toBe(0)
  })
})

describe('almacenamiento del navegador', () => {
  it('si no se puede escribir (datos del sitio bloqueados), la sesión funciona igual en memoria', async () => {
    const almacen = new AlmacenMemoria()
    almacen.lanza = true
    const { auth } = montar({ almacen })

    expect(await auth.login('usuario.prueba', 'buena')).toEqual({ ok: true })
    expect(estado(auth)).toBe('activa')
    expect(numeroDeToken(auth.getToken())).toBe(1)
    await expect(auth.logout()).resolves.toBeUndefined()
    expect(estado(auth)).toBe('sinSesion')
  })
})

describe('suscripción', () => {
  it('avisa de los cambios, la foto del estado solo cambia cuando algo cambia, y quien se da de baja deja de recibir avisos', async () => {
    const { auth } = montar()
    const aviso = vi.fn()
    const baja = auth.suscribir(aviso)
    const antes = auth.getSnapshot()
    expect(auth.getSnapshot()).toBe(antes)

    await auth.login('usuario.prueba', 'buena')
    expect(aviso).toHaveBeenCalled()
    expect(auth.getSnapshot()).not.toBe(antes)

    baja()
    aviso.mockClear()
    await auth.logout()
    expect(aviso).not.toHaveBeenCalled()
  })

  it('limpiar una sesión que ya está limpia no avisa de nada', () => {
    const { auth } = montar()
    auth.limpiarSesion()
    const aviso = vi.fn()
    auth.suscribir(aviso)
    auth.limpiarSesion()
    expect(aviso).not.toHaveBeenCalled()
  })

  it('un error de red al pedir el login conserva el mensaje del cliente HTTP', async () => {
    const solicitar = vi.fn(async () => {
      throw new ApiError('Mensaje propio del cliente')
    })
    const auth = new AuthCookie({ solicitar, almacen: new AlmacenMemoria() })
    expect(await auth.login('a', 'b')).toEqual({ ok: false, motivo: 'red', mensaje: 'Mensaje propio del cliente' })
  })
})
