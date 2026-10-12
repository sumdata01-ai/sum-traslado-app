import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'
import { AuthCookie } from '@/core/auth'
import { AlmacenMemoria, crearBusDePestanas, crearServidorFalso } from '@/core/auth/testing/servidorFalso'
import { ApiError } from '@/core/http/ApiError'
import { crearCatalogoDePrueba, crearIdentificadorDePrueba, crearListaDePrueba, ordenRemota } from '@/features/traslado/data/testing/fakes'
import { App } from './App'

/** La lista de órdenes de una prueba de sesión: sin traslados y sin red de verdad. */
const nuevaLista = () => crearListaDePrueba().lista
const nuevoCatalogo = () => crearCatalogoDePrueba().catalogo
const nuevoIdentificador = () => crearIdentificadorDePrueba().identificador

/** El mismo «navegador» (cookie y almacenamiento) para todas las pestañas y recargas de una prueba. */
function navegador() {
  const servidor = crearServidorFalso()
  const almacen = new AlmacenMemoria()
  const abrirPestana = () => new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (tarea) => tarea() })
  return { servidor, almacen, abrirPestana }
}

const usuario = () => screen.getByLabelText('Usuario')
const clave = () => screen.getByLabelText('Contraseña')
const entrar = () => screen.getByRole('button', { name: 'Entrar' })

async function iniciarSesion(user = 'usuario.prueba', pass = 'buena') {
  await userEvent.type(usuario(), user)
  await userEvent.type(clave(), pass)
  await userEvent.click(entrar())
}

describe('arranque', () => {
  it('mientras comprueba la sesión no muestra el login, y sin sesión acaba mostrándolo', async () => {
    const { abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)

    expect(screen.getByText('Comprobando tu sesión…')).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(screen.queryByText('Comprobando tu sesión…')).not.toBeInTheDocument()
  })

  it('el formulario de login pide el teclado y el autocompletado correctos en un teléfono', async () => {
    const { abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    expect(usuario()).toHaveAttribute('autocomplete', 'username')
    expect(usuario()).toHaveAttribute('autocapitalize', 'none')
    expect(usuario()).toHaveAttribute('autocorrect', 'off')
    expect(usuario()).toHaveAttribute('spellcheck', 'false')
    expect(clave()).toHaveAttribute('type', 'password')
    expect(clave()).toHaveAttribute('autocomplete', 'current-password')
    expect(usuario()).toHaveClass('text-base') // 16 px: Safari no amplía la página al enfocar
  })
})

describe('AC1 · login válido', () => {
  it('lleva a la pantalla de Traslado con el nombre del usuario', async () => {
    const { abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await iniciarSesion()

    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Traslado' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()
  })
})

describe('AC2 · credenciales inválidas', () => {
  it('muestra el mensaje del servidor, conserva el usuario, borra la contraseña y sigue en el login', async () => {
    const { abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await iniciarSesion('usuario.prueba', 'mala')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuario o contrasena incorrectos')
    expect(usuario()).toHaveValue('usuario.prueba')
    expect(clave()).toHaveValue('')
    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
  })

  it('enviar el formulario vacío avisa sin llamar al servidor', async () => {
    const { servidor, abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await userEvent.click(entrar())

    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe tu usuario y contraseña.')
    expect(servidor.llamadas.login).toBe(0)
  })

  it('un doble toque en «Entrar» manda un solo login (el límite es de 10 por minuto)', async () => {
    const { servidor, abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await userEvent.type(usuario(), 'usuario.prueba')
    await userEvent.type(clave(), 'buena')

    await userEvent.dblClick(entrar())

    await screen.findByText('Hola, OPERARIO PRUEBA')
    expect(servidor.llamadas.login).toBe(1)
  })

  it('enviar con la tecla Intro funciona igual', async () => {
    const { abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await userEvent.type(usuario(), 'usuario.prueba')
    await userEvent.type(clave(), 'buena{Enter}')
    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
  })

  it('sin red lo dice, sin confundirlo con una contraseña mala', async () => {
    const { servidor, abrirPestana } = navegador()
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    servidor.sinRed = true

    await iniciarSesion()

    expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  })
})

describe('AC3 · sin acceso a Traslado', () => {
  it('con sesión pero sin «traslado» en allowed_apps ve «Sin acceso», no la pantalla de Traslado', async () => {
    const { servidor, abrirPestana } = navegador()
    servidor.perfil.apps = ['inspeccion']
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await iniciarSesion()

    expect(await screen.findByRole('heading', { name: 'Sin acceso a Traslado' })).toBeInTheDocument()
    expect(screen.getByText(/Sesión iniciada como OPERARIO PRUEBA/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Probar la cámara' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
  })

  it('desde «Sin acceso» se puede cerrar la sesión', async () => {
    const { servidor, abrirPestana } = navegador()
    servidor.perfil.apps = []
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })
})

describe('AC4 · recargar restaura la sesión', () => {
  it('al recargar con la cookie viva vuelve a la pantalla de Traslado sin pasar por el login', async () => {
    const { servidor, abrirPestana } = navegador()
    const primera = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('Hola, OPERARIO PRUEBA')
    primera.unmount()
    // El primer arranque, sin sesión, ya hizo un refresh (devolvió 401: la cookie es HttpOnly y no se puede mirar).
    const antes = { login: servidor.llamadas.login, refresh: servidor.llamadas.refresh }

    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />) // «recarga»: otra instancia, el mismo navegador

    expect(screen.getByText('Comprobando tu sesión…')).toBeInTheDocument()
    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()
    expect(servidor.llamadas.login).toBe(antes.login) // no pidió credenciales
    expect(servidor.llamadas.refresh).toBe(antes.refresh + 1) // un solo refresh para recuperar la sesión
  })

  it('con la sesión caducada al recargar muestra el login', async () => {
    const { servidor, abrirPestana } = navegador()
    const primera = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('Hola, OPERARIO PRUEBA')
    primera.unmount()
    servidor.ponerCookie(null)

    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })

  it('sin red al recargar no manda al login: avisa y deja reintentar, y al volver la red entra', async () => {
    const { servidor, abrirPestana } = navegador()
    const primera = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('Hola, OPERARIO PRUEBA')
    primera.unmount()
    servidor.sinRed = true

    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)

    expect(await screen.findByText(/no hay conexión/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()

    servidor.sinRed = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
  })

  it('el modo estricto de React (monta dos veces) no hace caer la sesión', async () => {
    const { servidor, abrirPestana } = navegador()
    const primera = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('Hola, OPERARIO PRUEBA')
    primera.unmount()

    const refreshAntes = servidor.llamadas.refresh

    const { StrictMode } = await import('react')
    render(
      <StrictMode>
        <App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />
      </StrictMode>,
    )

    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
    // Montar dos veces no son dos refrescos: el segundo habría usado una cookie ya rotada y cerrado la sesión.
    expect(servidor.llamadas.refresh).toBe(refreshAntes + 1)
  })
})

describe('AC5 · cerrar sesión', () => {
  it('lleva al login, avisa al servidor y al recargar no vuelve a entrar', async () => {
    const { servidor, abrirPestana } = navegador()
    const primera = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()

    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(servidor.llamadas.logout).toBe(1)
    primera.unmount()

    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    expect(screen.queryByText(/Hola,/)).not.toBeInTheDocument()
  })
})

describe('las órdenes y la sesión', () => {
  it('muestra las órdenes del servidor al entrar', async () => {
    const { abrirPestana } = navegador()
    const { lista } = crearListaDePrueba(async () => ({ ordenes: [ordenRemota(1, { vin: 'LSCABN3E2VE840638' })], descartadas: 0 }))
    render(<App auth={abrirPestana()} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await iniciarSesion()

    expect(await screen.findByText('LSCABN3E2VE840638')).toBeInTheDocument()
  })

  it('al cerrar la sesión se borran las órdenes guardadas: otra cuenta no debe verlas', async () => {
    const { abrirPestana } = navegador()
    const { lista, cache } = crearListaDePrueba(async () => ({ ordenes: [ordenRemota(1)], descartadas: 0 }))
    render(<App auth={abrirPestana()} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('VIN1')
    expect(cache.filas).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    await screen.findByLabelText('Usuario')
    await waitFor(() => expect(cache.filas).toEqual([]))
    expect(lista.getSnapshot().mias).toEqual([])
    expect(lista.getSnapshot().pool).toEqual([])
  })

  it('cuando la sesión expira, las órdenes también se borran', async () => {
    const { abrirPestana } = navegador()
    const auth = abrirPestana()
    const { lista, cache } = crearListaDePrueba(async () => ({ ordenes: [ordenRemota(1)], descartadas: 0 }))
    render(<App auth={auth} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('VIN1')

    auth.limpiarSesion()

    await screen.findByLabelText('Usuario')
    await waitFor(() => expect(cache.filas).toEqual([]))
  })

  it('un 403 al pedir las órdenes muestra «Sin permiso» y la sesión sigue abierta', async () => {
    const { abrirPestana } = navegador()
    const auth = abrirPestana()
    const { lista } = crearListaDePrueba(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))
    render(<App auth={auth} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await iniciarSesion()

    expect(await screen.findByRole('heading', { name: 'Sin permiso para Traslado' })).toBeInTheDocument()
    expect(auth.getSnapshot().estado).toBe('activa')
    expect(screen.queryByLabelText('Usuario')).not.toBeInTheDocument()
  })

  it('desde «Sin permiso» se puede cerrar la sesión', async () => {
    const { abrirPestana } = navegador()
    const { lista } = crearListaDePrueba(() => Promise.reject(new ApiError('Permisos insuficientes', { status: 403 })))
    render(<App auth={abrirPestana()} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByRole('heading', { name: 'Sin permiso para Traslado' })

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })
})

describe('A-03 · una sola sesión en todas las pestañas', () => {
  /** Dos pestañas del mismo navegador; la lista de la primera pide «las órdenes de quien tiene la sesión». */
  function dosPestanas() {
    const servidor = crearServidorFalso()
    const almacen = new AlmacenMemoria()
    const bus = crearBusDePestanas()
    const abrir = () => new AuthCookie({ solicitar: servidor.solicitar, almacen, candado: (tarea) => tarea(), canal: bus.canal() })
    const pestana1 = abrir()
    const pestana2 = abrir()
    // Cada persona tiene su orden: A la VIN-DE-A, cualquier otra la VIN-DE-<usuario>.
    const { lista, cache, dueno } = crearListaDePrueba(async () => ({
      ordenes: [ordenRemota(1, { vin: `VIN-DE-${pestana1.getSnapshot().sesion?.usuario ?? 'nadie'}`, conductorAsignado: { id: 1, username: 'x', nombreCompleto: null } })],
      descartadas: 0,
    }))
    return { servidor, pestana1, pestana2, lista, cache, dueno }
  }

  it('si en otra pestaña entra otra persona, esta pasa a ella sola y no muestra nada de la anterior', async () => {
    const { pestana1, pestana2, lista, cache, dueno, servidor } = dosPestanas()
    render(<App auth={pestana1} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    expect(await screen.findByText('VIN-DE-usuario.prueba')).toBeInTheDocument()

    await pestana2.login('otra.persona', 'buena')

    expect(await screen.findByText('Hola, NOMBRE DE otra.persona')).toBeInTheDocument()
    expect(await screen.findByText('VIN-DE-otra.persona')).toBeInTheDocument()
    expect(screen.queryByText('VIN-DE-usuario.prueba')).not.toBeInTheDocument()
    expect(screen.queryByText(/OPERARIO PRUEBA/)).not.toBeInTheDocument()
    await waitFor(() => expect(cache.filas.map((o) => o.vin)).toEqual(['VIN-DE-otra.persona']))
    expect(dueno.leer()).toBe(servidor.usuarios.get('otra.persona')?.id)
  })

  it('el filtro que había escrito la persona anterior no queda puesto', async () => {
    const { pestana1, pestana2, lista } = dosPestanas()
    render(<App auth={pestana1} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('VIN-DE-usuario.prueba')
    await userEvent.type(screen.getByLabelText('Filtrar por VIN'), 'ZZZ')

    await pestana2.login('otra.persona', 'buena')

    await screen.findByText('VIN-DE-otra.persona')
    expect(screen.getByLabelText('Filtrar por VIN')).toHaveValue('')
  })

  it('si en otra pestaña se cierra sesión, esta vuelve al login', async () => {
    const { pestana1, pestana2, lista, cache } = dosPestanas()
    render(<App auth={pestana1} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('VIN-DE-usuario.prueba')
    await pestana2.restaurar()

    await pestana2.logout()

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
    await waitFor(() => expect(cache.filas).toEqual([]))
  })

  it('si esta pestaña está en el login y otra inicia sesión, entra sola', async () => {
    const { pestana1, pestana2, lista } = dosPestanas()
    render(<App auth={pestana1} lista={lista} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')

    await pestana2.login('otra.persona', 'buena')

    expect(await screen.findByText('Hola, NOMBRE DE otra.persona')).toBeInTheDocument()
  })
})

describe('sesión que termina mientras se usa', () => {
  it('si el cliente HTTP la da por expirada (limpiarSesion), la pantalla vuelve al login', async () => {
    const { abrirPestana } = navegador()
    const auth = abrirPestana()
    render(<App auth={auth} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByText('Hola, OPERARIO PRUEBA')

    auth.limpiarSesion()

    expect(await screen.findByLabelText('Usuario')).toBeInTheDocument()
  })
})

describe('AC6 · sin bucle de login', () => {
  it('un usuario con un rol que el backend no admitiría igual entra una sola vez: el «sin permiso» lo decide la home (O-01), no el login', async () => {
    const { servidor, abrirPestana } = navegador()
    servidor.perfil.role = 'asistente'
    render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    const refreshTrasElArranque = servidor.llamadas.refresh

    await iniciarSesion()

    expect(await screen.findByText('Hola, OPERARIO PRUEBA')).toBeInTheDocument()
    await waitFor(() => expect(servidor.llamadas.login).toBe(1))
    expect(servidor.llamadas.refresh).toBe(refreshTrasElArranque) // entrar no provoca más refrescos ni vueltas al login
  })
})

describe('accesibilidad', () => {
  it('sin violaciones en el login, con error, sin acceso y sin conexión', async () => {
    const { servidor, abrirPestana } = navegador()
    const login = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    expect(await axe(login.container)).toHaveNoViolations()

    await iniciarSesion('usuario.prueba', 'mala')
    await screen.findByRole('alert')
    expect(await axe(login.container)).toHaveNoViolations()
    login.unmount()

    servidor.perfil.apps = []
    const sinAcceso = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByLabelText('Usuario')
    await iniciarSesion()
    await screen.findByRole('heading', { name: 'Sin acceso a Traslado' })
    expect(await axe(sinAcceso.container)).toHaveNoViolations()
    sinAcceso.unmount()

    servidor.sinRed = true
    const sinConexion = render(<App auth={abrirPestana()} lista={nuevaLista()} catalogo={nuevoCatalogo()} identificador={nuevoIdentificador()} />)
    await screen.findByText(/no hay conexión/)
    expect(await axe(sinConexion.container)).toHaveNoViolations()
  })
})
