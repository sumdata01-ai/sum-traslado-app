// @vitest-environment node
/**
 * O-01 contra el BACKEND REAL, en la base de DESARROLLO (decisión del 2026-10-09).
 *
 * Qué prueban: que lo que el backend devuelve en `/mobile/traslado/mis-ordenes` cumple el contrato
 * que el front espera (ninguna orden se descarta por forma) y que la lista de la home funciona de
 * punta a punta con esos datos. Qué NO prueban: el 403 (necesitaría un usuario con un rol no
 * permitido; lo cubren las pruebas con respuestas simuladas) ni los datos concretos de la base
 * (cambian: aquí no se asume ninguna orden en particular).
 *
 * Se omiten solas si faltan `TRASLADO_USUARIO` / `TRASLADO_CLAVE` (en `.env.local`) o si el backend no
 * responde. Hacen 1 login por corrida, y el backend admite 10 por minuto.
 *
 * O-02: las de tomar y soltar **modifican la base de desarrollo**: toman una orden real del pool y
 * la devuelven. Si una prueba falla a mitad, la limpieza del final la suelta igual.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AuthCookie } from '@/core/auth'
import { AlmacenMemoria } from '@/core/auth/testing/servidorFalso'
import { ApiError } from '@/core/http/ApiError'
import { createApiClient } from '@/core/http/apiClient'
import { CatalogoEnMemoria } from '../data/catalogoCache'
import { CatalogoTraslado } from '../data/catalogoTraslado'
import { IdentificadorVin } from '../data/identificadorVin'
import { ListaOrdenes } from '../data/listaOrdenes'
import { CacheEnMemoria, ConteoFalso } from '../data/testing/fakes'
import { esMia, filtrarOpciones } from '../domain'
import { crearTrasladoApi } from './trasladoApi'

const BASE = process.env.TRASLADO_BACKEND_URL ?? 'http://localhost:8050'
const USUARIO = process.env.TRASLADO_USUARIO
const CLAVE = process.env.TRASLADO_CLAVE

let disponible = false
let motivoDeOmision = ''

const solicitar = (path: string, init: RequestInit = {}) => fetch(BASE + path, { ...init, signal: AbortSignal.timeout(12_000) })
const auth = new AuthCookie({ solicitar, almacen: new AlmacenMemoria(), candado: (tarea) => tarea() })
const cliente = createApiClient({
  getToken: () => auth.getToken(),
  refreshSession: async () => 'expirada', // aquí no hay cookie: si el token falla, se ve como error, no se disimula
  limpiarSesion: () => undefined,
  fetchImpl: (url, init) => fetch(BASE + String(url), init),
})
const api = crearTrasladoApi(cliente)

beforeAll(async () => {
  if (!USUARIO || !CLAVE) {
    motivoDeOmision = 'faltan TRASLADO_USUARIO y TRASLADO_CLAVE en .env.local'
    return
  }
  try {
    const respuesta = await fetch(`${BASE}/openapi.json`, { signal: AbortSignal.timeout(3_000) })
    if (!respuesta.ok) {
      motivoDeOmision = `el backend respondió ${respuesta.status}`
      return
    }
  } catch {
    motivoDeOmision = `no hay un backend en ${BASE}`
    return
  }
  const login = await auth.login(USUARIO, CLAVE)
  if (!login.ok) {
    motivoDeOmision = `el login de prueba falló: ${login.mensaje}`
    return
  }
  disponible = true
})

const contraElBackend = (nombre: string, tarea: () => Promise<void>) =>
  it(nombre, async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    await tarea()
  })

describe.sequential('mis-ordenes contra el backend real (base de desarrollo)', () => {
  contraElBackend('devuelve una lista y ninguna orden se descarta por no cumplir el contrato', async () => {
    const { ordenes, descartadas } = await api.misOrdenes()

    expect(Array.isArray(ordenes)).toBe(true)
    expect(descartadas, 'el backend mandó órdenes con una forma que el front no entiende: ¿cambió el contrato?').toBe(0)
  })

  contraElBackend('cada orden trae lo imprescindible: id entero, VIN y estado', async () => {
    const { ordenes } = await api.misOrdenes()

    for (const orden of ordenes) {
      expect(Number.isInteger(orden.idOrden)).toBe(true)
      expect(orden.vin.length).toBeGreaterThan(0)
      expect(orden.estado.length).toBeGreaterThan(0)
    }
  })

  contraElBackend('no repite órdenes', async () => {
    const { ordenes } = await api.misOrdenes()
    const ids = ordenes.map((o) => o.idOrden)
    expect(new Set(ids).size).toBe(ids.length)
  })

  contraElBackend('la lista de la home, con la API real, reparte todas las órdenes entre «mías» y «pool» y no pierde ninguna', async () => {
    const { ordenes } = await api.misOrdenes()
    const cache = new CacheEnMemoria()
    const lista = new ListaOrdenes({ api, cache, fotos: new ConteoFalso() })

    await lista.iniciar()
    const instantanea = lista.getSnapshot()

    expect(instantanea).toMatchObject({ cargando: false, actualizando: false, sinConexion: false, error: null, sinPermiso: null })
    expect(instantanea.mias.length + instantanea.pool.length).toBe(ordenes.length)
    expect(instantanea.mias.every((v) => esMia(v.orden))).toBe(true)
    expect(instantanea.pool.every((v) => !esMia(v.orden))).toBe(true)
    expect(cache.filas).toHaveLength(ordenes.length)
  })

  contraElBackend('actualizar dos veces seguidas deja la misma lista (la mezcla con la caché es estable)', async () => {
    const cache = new CacheEnMemoria()
    const lista = new ListaOrdenes({ api, cache, fotos: new ConteoFalso() })
    await lista.iniciar()
    const primera = lista.getSnapshot().mias.length + lista.getSnapshot().pool.length
    const idsPrimera = cache.filas.map((o) => o.idOrden)

    await lista.actualizar()

    expect(lista.getSnapshot().mias.length + lista.getSnapshot().pool.length).toBe(primera)
    expect(cache.filas.map((o) => o.idOrden).sort()).toEqual([...idsPrimera].sort())
  })

  contraElBackend('sin token el backend responde 401 y el cliente lo informa como error con código', async () => {
    const sinToken = createApiClient({
      getToken: () => null,
      refreshSession: async () => 'expirada',
      limpiarSesion: () => undefined,
      fetchImpl: (url, init) => fetch(BASE + String(url), init),
    })

    const error = await crearTrasladoApi(sinToken).misOrdenes().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(401)
  })
})

describe.sequential('tomar y soltar contra el backend real (O-02, modifica la base de desarrollo)', () => {
  let tomada: number | null = null

  afterAll(async () => {
    // Limpieza: si una prueba falló a mitad, la orden no queda tomada por el usuario de prueba.
    if (tomada !== null) await api.soltarOrden(tomada).catch(() => undefined)
  })

  /** Una orden del pool (sin dueño) para tomar; si no hay ninguna, la prueba se omite. */
  async function unaDelPool(contexto: { skip: (motivo: string) => void }) {
    const { ordenes } = await api.misOrdenes()
    const libre = ordenes.find((o) => o.conductorAsignado === null && o.estado === 'pendiente')
    if (!libre) contexto.skip('la base de desarrollo no tiene órdenes en el pool')
    return libre!
  }

  it('tomar deja la orden a nombre del usuario; tomarla otra vez no la duplica (AC3); soltarla la devuelve al pool', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const orden = await unaDelPool(contexto)

    expect(await api.tomarOrden(orden.idOrden)).toEqual({ idOrden: orden.idOrden, tomada: true })
    tomada = orden.idOrden
    expect(await api.tomarOrden(orden.idOrden)).toEqual({ idOrden: orden.idOrden, tomada: true }) // idempotente
    const trasTomar = (await api.misOrdenes()).ordenes.find((o) => o.idOrden === orden.idOrden)
    expect(trasTomar?.conductorAsignado?.username).toBe(USUARIO)

    expect(await api.soltarOrden(orden.idOrden)).toEqual({ idOrden: orden.idOrden, tomada: false })
    tomada = null
    const trasSoltar = (await api.misOrdenes()).ordenes.find((o) => o.idOrden === orden.idOrden)
    expect(trasSoltar?.conductorAsignado).toBeNull()
  })

  it('soltar una orden que no es propia responde 409 con el motivo', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const orden = await unaDelPool(contexto)

    const error = await api.soltarOrden(orden.idOrden).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, message: 'Esa orden no es tuya' })
  })

  it('tomar una orden que no existe responde 404', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const error = await api.tomarOrden(2_000_000_000).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 404 })
  })

  it('la lista de la home, con la API real: tomar y soltar mueven la orden entre las secciones', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const orden = await unaDelPool(contexto)
    const lista = new ListaOrdenes({ api, cache: new CacheEnMemoria(), fotos: new ConteoFalso() })
    await lista.iniciar(null)

    const toma = await lista.tomar(orden.idOrden)
    tomada = orden.idOrden
    expect(toma).toEqual({ ok: true, mensaje: 'La orden es tuya.' })
    expect(lista.getSnapshot().mias.map((v) => v.orden.idOrden)).toContain(orden.idOrden)

    const suelta = await lista.soltar(orden.idOrden)
    tomada = null
    expect(suelta).toEqual({ ok: true, mensaje: 'Devuelta al pool.' })
    expect(lista.getSnapshot().pool.map((v) => v.orden.idOrden)).toContain(orden.idOrden)
  })
})

describe.sequential('catálogos contra el backend real (O-04, solo lectura)', () => {
  it('devuelve placas y proveedores que cumplen el contrato, sin descartar ninguno', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)

    const { placas, proveedores, descartadas } = await api.catalogos()

    expect(descartadas, 'el backend mandó opciones con una forma que el front no entiende: ¿cambió el contrato?').toBe(0)
    expect(placas.length).toBeGreaterThan(0)
    expect(proveedores.length).toBeGreaterThan(0)
    for (const p of placas) {
      expect(Number.isInteger(p.id)).toBe(true)
      expect(p.nombre.length).toBeGreaterThan(0)
      expect(p.estado === null || typeof p.estado === 'string').toBe(true)
    }
  })

  it('devuelve TODAS las placas, sin filtrar por estado (D-27): también las que figuran «en uso»', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const { placas } = await api.catalogos()
    const estados = new Set(placas.map((p) => p.estado))
    // Con una base donde alguna placa salió, hay más de un estado; si todas están disponibles no se puede comprobar.
    if (estados.size < 2) contexto.skip('la base de desarrollo tiene todas las placas en el mismo estado')
    expect(estados.has('en_uso')).toBe(true)
  })

  it('no repite placas ni proveedores', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const { placas, proveedores } = await api.catalogos()
    expect(new Set(placas.map((p) => p.id)).size).toBe(placas.length)
    expect(new Set(proveedores.map((p) => p.id)).size).toBe(proveedores.length)
  })

  it('el filtro encuentra una placa real por una parte de su código, escrito como lo teclearía el operario', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const { placas } = await api.catalogos()
    const primera = placas[0]!
    const tecleado = primera.nombre.slice(0, 3).toLowerCase() + '-' + primera.nombre.slice(3)

    expect(filtrarOpciones(placas, tecleado).map((p) => p.id)).toContain(primera.id)
  })

  it('el controlador del selector, con la API real: trae el catálogo y lo guarda', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const cache = new CatalogoEnMemoria()
    const catalogo = new CatalogoTraslado({ api, cache })

    await catalogo.iniciar()

    expect(catalogo.getSnapshot()).toMatchObject({ cargando: false, sinConexion: false, error: null, nuncaDescargado: false })
    expect(catalogo.getSnapshot().placas.length).toBeGreaterThan(0)
    expect(cache.guardado?.placas).toHaveLength(catalogo.getSnapshot().placas.length)
  })
})

describe.sequential('identificar un VIN contra el backend real (O-03, solo lectura)', () => {
  /** Un VIN con forma válida que no es ningún vehículo conocido. */
  const VIN_DESCONOCIDO = '1HGCM82633A004352'

  async function vinDelPool(contexto: { skip: (motivo: string) => void }) {
    const { ordenes } = await api.misOrdenes()
    const libre = ordenes.find((o) => o.conductorAsignado === null && o.estado === 'pendiente')
    if (!libre) contexto.skip('la base de desarrollo no tiene órdenes en el pool')
    return libre!
  }

  it('AC2 · un VIN con forma válida que no es un vehículo conocido responde 404', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const error = await api.identificarVin(VIN_DESCONOCIDO).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404 })
  })

  it('AC4 · un texto sin forma de VIN, mandado directo al servidor, responde 422', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    expect(await api.identificarVin('XYZ').catch((e: unknown) => e)).toMatchObject({ status: 422 })
    expect(await api.identificarVin('LSCABN3E2VE84063O').catch((e: unknown) => e)).toMatchObject({ status: 422 }) // con una O
  })

  it('AC5 · una búsqueda de menos de 4 caracteres la rechaza el servidor (422): por eso el cliente no la manda', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    expect(await api.buscarVin('abc').catch((e: unknown) => e)).toMatchObject({ status: 422 })
  })

  it('un VIN del pool devuelve su orden, sin dueño, tanto en mayúsculas como en minúsculas', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const orden = await vinDelPool(contexto)

    const exacto = await api.identificarVin(orden.vin)
    const enMinusculas = await api.identificarVin(orden.vin.toLowerCase())

    for (const resultado of [exacto, enMinusculas]) {
      const hallada = resultado.ordenes.find((o) => o.idOrden === orden.idOrden)
      expect(hallada, 'la orden del pool no vino en /vin/{vin}').toBeDefined()
      expect(hallada?.conductorAsignado).toBeNull()
      expect(resultado.descartadas).toBe(0)
    }
  })

  it('la búsqueda parcial encuentra el VIN del pool con su marca y modelo', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const orden = await vinDelPool(contexto)

    const { candidatos, descartados } = await api.buscarVin(orden.vin.slice(0, 10))

    expect(descartados).toBe(0)
    const candidato = candidatos.find((c) => c.vin === orden.vin)
    expect(candidato, 'el VIN del pool no apareció en la búsqueda parcial').toBeDefined()
    expect(candidato?.marca.length).toBeGreaterThan(0)
    expect(candidato?.modelo.length).toBeGreaterThan(0)
  })

  it('el controlador de la búsqueda, con la API real: un VIN del pool sale como «del pool»; uno desconocido, como «no conocido»', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const orden = await vinDelPool(contexto)
    const identificador = new IdentificadorVin({ api })

    await identificador.buscar(orden.vin, null)
    const resultado = identificador.getSnapshot().resultado
    expect(resultado.tipo).toBe('ordenes')
    if (resultado.tipo === 'ordenes') expect(resultado.ordenes.find((o) => o.orden.idOrden === orden.idOrden)?.relacion).toBe('delPool')

    await identificador.buscar(VIN_DESCONOCIDO, null)
    expect(identificador.getSnapshot().resultado).toEqual({ tipo: 'noConocido', vin: VIN_DESCONOCIDO })
  })

  it('nada de esto modifica la base: el pool queda igual', async (contexto) => {
    if (!disponible) contexto.skip(motivoDeOmision)
    const antes = (await api.misOrdenes()).ordenes.map((o) => `${o.idOrden}:${o.conductorAsignado?.id ?? '-'}`).sort()
    await api.identificarVin(VIN_DESCONOCIDO).catch(() => undefined)
    const despues = (await api.misOrdenes()).ordenes.map((o) => `${o.idOrden}:${o.conductorAsignado?.id ?? '-'}`).sort()
    expect(despues).toEqual(antes)
  })
})
