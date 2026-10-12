import { type Zona, esTransicionPermitida, transicionarFoto, zonasDe } from '../domain'
import { AlmacenError, esErrorDeCuota } from './almacenError'
import type { ClaveFormulario, FotoGuardada, FotoParaGuardar, FotoStorePort, ResultadoReconciliacion } from './fotoStorePort'
import type { FilaFoto, TrasladoDb } from './trasladoDb'

export interface OpcionesFotoStoreDexie {
  /** Por defecto `Date.now`. */
  ahora?: () => number
  /** Por defecto `crypto.randomUUID`. */
  crearId?: () => string
  /** Cuánto debe llevar una fila `writing` para darla por huérfana. Por defecto {@link UMBRAL_FILA_HUERFANA_MS}. */
  umbralHuerfanaMs?: number
}

const INTENTOS_DE_ESCRITURA = 2

/**
 * Una fila `writing` más vieja que esto se da por abandonada. Guardar una foto tarda del orden de un
 * segundo; el margen evita marcar como fallida la foto que **otra pestaña** está guardando justo
 * ahora. Es una propuesta: no hay un candado entre pestañas que lo haga exacto.
 */
export const UMBRAL_FILA_HUERFANA_MS = 30_000

const MENSAJE_ESCRITURA_A_MEDIAS = 'La escritura de la foto quedó a medias al cerrarse la página. Vuelve a tomarla.'

function aFotoGuardada(fila: FilaFoto): FotoGuardada {
  return {
    clientId: fila.clientId,
    zona: fila.zona,
    blob: fila.blob,
    ancho: fila.ancho,
    alto: fila.alto,
    creadaEn: fila.creadaEn,
    // Una foto aceptada solo puede estar en uno de estos tres estados (`writing` y `failed_local` viven en `enEscritura`).
    estado: fila.estado === 'uploaded' || fila.estado === 'failed_upload' ? fila.estado : 'pending',
    storageKey: fila.storageKey,
    errorMessage: fila.errorMessage,
  }
}

function comoAlmacenError(causa: unknown): AlmacenError {
  if (causa instanceof AlmacenError) return causa
  return new AlmacenError(esErrorDeCuota(causa) ? 'ESPACIO_INSUFICIENTE' : 'ESCRITURA_FALLIDA', causa)
}

/**
 * Guarda las fotos del operario en IndexedDB. Ver ARQUITECTURA-FRONT.md §6 y las fallas C13 a C15.
 *
 * Guardar una foto sigue siempre este camino:
 *  1. Se inserta una fila `writing` en `enEscritura`, **sin el Blob**, antes de escribirlo.
 *  2. Se escribe el Blob y se **lee de vuelta**: debe tener el mismo tamaño. Hasta 2 intentos; un
 *     error de cuota no se reintenta (no va a mejorar).
 *  3. Solo entonces, en **una sola transacción**, se borra la foto anterior de esa zona y la nueva
 *     pasa a `fotos` como `pending`. Si algo falla antes, la foto anterior no se toca (falla C15).
 *
 * Si no se pudo, la fila queda `failed_local` con el motivo y la promesa rechaza con un
 * {@link AlmacenError}.
 */
export class FotoStoreDexie implements FotoStorePort {
  readonly #db: TrasladoDb
  readonly #ahora: () => number
  readonly #crearId: () => string
  readonly #umbralHuerfanaMs: number

  constructor(db: TrasladoDb, opciones: OpcionesFotoStoreDexie = {}) {
    this.#db = db
    this.#ahora = opciones.ahora ?? Date.now
    this.#crearId = opciones.crearId ?? (() => globalThis.crypto.randomUUID())
    this.#umbralHuerfanaMs = opciones.umbralHuerfanaMs ?? UMBRAL_FILA_HUERFANA_MS
  }

  /**
   * Revisa lo que quedó a medias de una sesión anterior:
   *  - una fila `writing` abandonada pasa a `failed_local` (sin Blob, con el motivo);
   *  - las filas fallidas de una zona que **ya tiene** foto aceptada se borran: esa foto sigue
   *    intacta y no hay nada que retomar.
   * Devuelve las zonas que sí hay que volver a tomar. Es idempotente y no toca las fotos aceptadas.
   */
  async reconciliar(clave: ClaveFormulario): Promise<ResultadoReconciliacion> {
    const ahora = this.#ahora()

    return this.#db.transaction('rw', this.#db.fotos, this.#db.enEscritura, async () => {
      const enTransito = await this.#db.enEscritura.where('[ordenId+momento]').equals([clave.ordenId, clave.momento]).toArray()
      const conFoto = new Set((await this.#db.fotos.where('[ordenId+momento]').equals([clave.ordenId, clave.momento]).toArray()).map((f) => f.zona))
      const aRetomar = new Set<Zona>()

      for (const fila of enTransito) {
        let fallida = fila.estado === 'failed_local'
        if (fila.estado === 'writing' && ahora - fila.actualizadoEn >= this.#umbralHuerfanaMs) {
          transicionarFoto('writing', 'failed_local')
          await this.#db.enEscritura.update(fila.clientId, {
            estado: 'failed_local',
            blob: null,
            errorMessage: MENSAJE_ESCRITURA_A_MEDIAS,
            actualizadoEn: ahora,
          })
          fallida = true
        }

        if (!fallida) continue // una escritura reciente: probablemente de otra pestaña, no se toca
        if (conFoto.has(fila.zona)) await this.#db.enEscritura.delete(fila.clientId)
        else aRetomar.add(fila.zona)
      }

      return { zonasARetomar: zonasDe(clave.momento).filter((zona) => aRetomar.has(zona)) }
    })
  }

  async listar(clave: ClaveFormulario): Promise<FotoGuardada[]> {
    const filas = await this.#db.fotos.where('[ordenId+momento]').equals([clave.ordenId, clave.momento]).toArray()
    return filas.map(aFotoGuardada)
  }

  async guardar(clave: ClaveFormulario, zona: Zona, foto: FotoParaGuardar): Promise<FotoGuardada> {
    if (foto.blob.size === 0) throw new AlmacenError('FOTO_VACIA')

    const clientId = this.#crearId()
    const datos = {
      clientId,
      ordenId: clave.ordenId,
      momento: clave.momento,
      zona,
      ancho: foto.ancho,
      alto: foto.alto,
      creadaEn: foto.creadaEn,
      errorMessage: null,
      actualizadoEn: this.#ahora(),
    }

    // 1. La fila existe antes que el Blob: si el proceso muere a mitad, queda un `writing` detectable.
    try {
      await this.#db.enEscritura.put({ ...datos, blob: null, estado: 'writing' })
    } catch (causa) {
      throw comoAlmacenError(causa)
    }

    // 2. Escribir el Blob y leerlo de vuelta.
    let causaDelFallo: unknown
    let verificada = false
    for (let intento = 1; intento <= INTENTOS_DE_ESCRITURA && !verificada; intento++) {
      try {
        await this.#db.enEscritura.update(clientId, { blob: foto.blob })
        const leida = await this.#db.enEscritura.get(clientId)
        if (leida?.blob?.size === foto.blob.size) {
          verificada = true
        } else {
          causaDelFallo = new AlmacenError('VERIFICACION_FALLIDA')
        }
      } catch (causa) {
        causaDelFallo = causa
        if (esErrorDeCuota(causa)) break // reintentar no libera espacio
      }
    }
    if (!verificada) return this.#fallar(clientId, causaDelFallo)

    // 3. Promover: borrar la anterior y publicar la nueva, todo o nada.
    try {
      const estado = transicionarFoto('writing', 'pending')
      await this.#db.transaction('rw', this.#db.fotos, this.#db.enEscritura, async () => {
        const anterior = await this.#db.fotos.where('[ordenId+momento+zona]').equals([clave.ordenId, clave.momento, zona]).first()
        if (anterior) await this.#db.fotos.delete(anterior.clientId)

        const enTransito = await this.#db.enEscritura.get(clientId)
        if (!enTransito?.blob) throw new AlmacenError('VERIFICACION_FALLIDA')
        await this.#db.fotos.put({
          clientId,
          ordenId: enTransito.ordenId,
          momento: enTransito.momento,
          zona: enTransito.zona,
          blob: enTransito.blob,
          ancho: enTransito.ancho,
          alto: enTransito.alto,
          creadaEn: enTransito.creadaEn,
          estado,
          storageKey: null,
          errorMessage: null,
          actualizadoEn: this.#ahora(),
        })
        await this.#db.enEscritura.delete(clientId)

        // Esta zona ya tiene foto: sus intentos fallidos de antes dejan de pedir que se retome.
        // Solo los fallidos; una fila `writing` ajena puede ser de otra pestaña a medio guardar.
        const fallidos = await this.#db.enEscritura
          .where('[ordenId+momento+zona]')
          .equals([clave.ordenId, clave.momento, zona])
          .filter((fila) => fila.estado === 'failed_local')
          .primaryKeys()
        await this.#db.enEscritura.bulkDelete(fallidos)
      })
    } catch (causa) {
      return this.#fallar(clientId, causa)
    }

    return { clientId, zona, blob: foto.blob, ancho: foto.ancho, alto: foto.alto, creadaEn: foto.creadaEn, estado: 'pending', storageKey: null, errorMessage: null }
  }

  async leerBlob(clientId: string): Promise<Blob | null> {
    return (await this.#db.fotos.get(clientId))?.blob ?? null
  }

  async marcarSubida(clientId: string, storageKey: string): Promise<boolean> {
    return this.#cambiarEstado(clientId, 'uploaded', { storageKey, errorMessage: null })
  }

  async marcarFalloSubida(clientId: string, mensaje: string): Promise<boolean> {
    return this.#cambiarEstado(clientId, 'failed_upload', { errorMessage: mensaje })
  }

  async prepararReintento(clientId: string): Promise<boolean> {
    return this.#cambiarEstado(clientId, 'pending', { errorMessage: null }, 'failed_upload')
  }

  /**
   * Cambia el estado de una foto **solo si todavía existe** (y, si se pide, solo si está en `desde`), en una
   * transacción: entre leer y escribir otra pestaña pudo repetir esa zona, y no se debe marcar la foto nueva
   * con el resultado de la subida de la vieja.
   *
   * Una transición que la tabla del dominio no permite (por ejemplo, marcar como fallida una foto que otra
   * pestaña ya subió) devuelve `false`: no hay nada que hacer porque ya está resuelta, y no es un error de
   * programación. Gana el primero que termina.
   */
  async #cambiarEstado(
    clientId: string,
    hacia: 'pending' | 'uploaded' | 'failed_upload',
    cambios: Partial<Pick<FilaFoto, 'storageKey' | 'errorMessage'>>,
    desde?: FilaFoto['estado'],
  ): Promise<boolean> {
    return this.#db.transaction('rw', this.#db.fotos, async () => {
      const fila = await this.#db.fotos.get(clientId)
      if (!fila || (desde !== undefined && fila.estado !== desde)) return false
      if (!esTransicionPermitida(fila.estado, hacia)) return false
      await this.#db.fotos.update(clientId, { ...cambios, estado: hacia, actualizadoEn: this.#ahora() })
      return true
    })
  }

  /** Deja la fila `failed_local` con el motivo (sin el Blob) y rechaza. Marcarla es un esfuerzo: puede fallar. */
  async #fallar(clientId: string, causa: unknown): Promise<never> {
    const error = comoAlmacenError(causa)
    try {
      transicionarFoto('writing', 'failed_local')
      await this.#db.enEscritura.update(clientId, {
        estado: 'failed_local',
        blob: null,
        errorMessage: error.message,
        actualizadoEn: this.#ahora(),
      })
    } catch {
      // Si ni siquiera se puede anotar el fallo (por ejemplo, sin espacio), el error original sigue siendo el que importa.
    }
    throw error
  }
}
