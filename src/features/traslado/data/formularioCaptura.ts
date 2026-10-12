import { ETIQUETA_ZONA, type Momento, type Zona, siguienteZonaSinFoto, zonasDe } from '../domain'
import type { FotoGuardada, FotoParaGuardar, FotoStorePort } from './fotoStorePort'
import type { SubidaFotos } from './subidaFotos'

/**
 * Cómo va la subida de la foto de una zona (E4-01):
 * - `enEspera`: guardada en el teléfono, todavía sin empezar a subir;
 * - `subiendo`: se está subiendo ahora;
 * - `subida`: ya está en el almacenamiento;
 * - `fallida`: la subida falló; se puede reintentar.
 */
export type EstadoSubidaVista = 'enEspera' | 'subiendo' | 'subida' | 'fallida'

export interface ZonaVista {
  zona: Zona
  etiqueta: string
  /** `null` es el hueco: la zona todavía no tiene foto. */
  foto: {
    urlMiniatura: string
    ancho: number
    alto: number
    creadaEn: number
    subida: EstadoSubidaVista
    /** Por qué falló la última subida; solo con `fallida`. */
    errorSubida: string | null
  } | null
  /** Su foto no llegó a guardarse (la página se cerró en plena escritura): hay que volver a tomarla. */
  aRetomar: boolean
}

export interface InstantaneaFormulario {
  readonly momento: Momento
  readonly zonas: readonly ZonaVista[]
  /** La zona a la que irá la próxima foto; `null` cuando todas las zonas tienen foto. */
  readonly zonaActiva: Zona | null
  readonly tomadas: number
  readonly total: number
  readonly completo: boolean
  /** Cuántas fotos ya están subidas al almacenamiento. */
  readonly subidas: number
  /** Cuántas fotos fallaron al subir y esperan un «Reintentar». */
  readonly fallidas: number
  /** Las `total` fotos están tomadas **y subidas**: lo que hace falta para confirmar (E4-02). */
  readonly todasSubidas: boolean
  readonly cargando: boolean
  readonly errorCarga: string | null
  /** Zonas sin foto cuyo guardado quedó a medias en una sesión anterior, en el orden del formulario. */
  readonly zonasARetomar: readonly Zona[]
}

export interface OpcionesFormulario {
  momento: Momento
  ordenId: number
  store: FotoStorePort
  /**
   * Quien sube las fotos a GCS. Con él, cada foto se empieza a subir en cuanto se guarda, y las que
   * quedaron `pending` de una sesión anterior se retoman al cargar. Sin él (las pruebas de captura) las
   * fotos solo se guardan en el teléfono.
   */
  subidas?: SubidaFotos
  /** Por defecto `URL.createObjectURL` / `URL.revokeObjectURL`. */
  crearUrl?: (blob: Blob) => string
  revocarUrl?: (url: string) => void
}

/**
 * Estado del formulario de captura de una orden y un momento: qué foto tiene cada zona y cuál toca.
 *
 * Es dueño de las URL de las miniaturas (se crean al guardar o cargar y se revocan al reemplazar o
 * liberar), igual que la sesión de cámara lo es de la de la vista previa.
 *
 * Una foto solo aparece aquí **después** de que el almacén confirmó haberla guardado: si guardar
 * falla, la vista no cambia y la foto anterior de esa zona sigue donde estaba.
 *
 * Con `subidas`, además, **cada foto se sube en cuanto se guarda** (E4-01) y la vista refleja su estado
 * de subida. La subida nunca bloquea la captura: se puede seguir tomando fotos mientras otras suben.
 */
export class FormularioCaptura {
  readonly #momento: Momento
  readonly #ordenId: number
  readonly #store: FotoStorePort
  readonly #subidas: SubidaFotos | undefined
  readonly #crearUrl: (blob: Blob) => string
  readonly #revocarUrl: (url: string) => void

  readonly #guardadas = new Map<Zona, { foto: FotoGuardada; url: string }>()
  #zonaActiva: Zona | null = null
  #cargando = false
  #errorCarga: string | null = null
  #zonasARetomar: Zona[] = []
  #bajaDeSubidas: (() => void) | null = null
  #generacion = 0
  #instantanea: InstantaneaFormulario
  readonly #escuchas = new Set<() => void>()

  constructor(opciones: OpcionesFormulario) {
    this.#momento = opciones.momento
    this.#ordenId = opciones.ordenId
    this.#store = opciones.store
    this.#subidas = opciones.subidas
    this.#crearUrl = opciones.crearUrl ?? ((blob) => URL.createObjectURL(blob))
    this.#revocarUrl = opciones.revocarUrl ?? ((url) => URL.revokeObjectURL(url))
    this.#zonaActiva = siguienteZonaSinFoto(this.#momento, new Set())
    this.#instantanea = this.#construir()
  }

  readonly getSnapshot = (): InstantaneaFormulario => this.#instantanea

  readonly suscribir = (escucha: () => void): (() => void) => {
    this.#escuchas.add(escucha)
    return () => {
      this.#escuchas.delete(escucha)
    }
  }

  /** Lee del almacén las fotos que ya había (por ejemplo, tras recargar). */
  async cargar(): Promise<void> {
    const generacion = ++this.#generacion
    this.#cargando = true
    this.#errorCarga = null
    this.#publicar()

    try {
      const clave = { ordenId: this.#ordenId, momento: this.#momento }

      // Primero se revisa lo que quedó a medias; si eso falla, no es motivo para no mostrar las fotos.
      let zonasARetomar: Zona[] = []
      try {
        zonasARetomar = (await this.#store.reconciliar?.(clave))?.zonasARetomar ?? []
      } catch {
        zonasARetomar = []
      }
      if (generacion !== this.#generacion) return

      const fotos = await this.#store.listar(clave)
      if (generacion !== this.#generacion) return

      this.#zonasARetomar = zonasARetomar
      this.#soltarMiniaturas()
      const delMomento = new Set<string>(zonasDe(this.#momento))
      for (const foto of fotos) {
        if (delMomento.has(foto.zona)) this.#guardadas.set(foto.zona, { foto, url: this.#crearUrl(foto.blob) })
      }
      this.#zonaActiva = siguienteZonaSinFoto(this.#momento, this.#zonasTomadas())
    } catch {
      if (generacion !== this.#generacion) return
      this.#errorCarga = 'No se pudieron leer las fotos guardadas.'
    }

    this.#cargando = false
    this.#escucharSubidas()
    this.#publicar()
    // Las que quedaron sin subir (por ejemplo, se recargó la página a mitad) se retoman: es como si se
    // acabaran de tomar. Las fallidas NO: esas esperan el «Reintentar» del operario.
    if (this.#subidas) {
      for (const { foto } of this.#guardadas.values()) if (foto.estado === 'pending') void this.#subidas.subir(foto.clientId)
    }
  }

  /** «Reintentar» la subida de la foto de una zona que falló. No hace nada si esa zona no tiene foto. */
  reintentarSubida(zona: Zona): void {
    const guardada = this.#guardadas.get(zona)
    if (guardada && this.#subidas) void this.#subidas.reintentar(guardada.foto.clientId)
  }

  /** Elige la zona de la próxima foto, para repetir una ya tomada o completar un hueco. */
  seleccionarZona(zona: Zona): void {
    if (!(zonasDe(this.#momento) as readonly Zona[]).includes(zona)) {
      throw new RangeError(`La zona ${zona} no corresponde a la ${this.#momento}.`)
    }
    this.#zonaActiva = zona
    this.#publicar()
  }

  /**
   * Guarda la foto en `zona` (por defecto la activa) y avanza a la siguiente zona sin foto. Rechaza
   * si el almacén no pudo guardarla; en ese caso la vista no cambia.
   *
   * La zona se pasa explícita para que una foto no acabe en otra zona si el operario cambió la
   * selección mientras la revisaba.
   */
  async guardar(foto: FotoParaGuardar, zona: Zona | null = this.#zonaActiva): Promise<void> {
    if (!zona) throw new Error('No hay una zona activa donde guardar la foto.')
    const generacion = this.#generacion
    this.#escucharSubidas() // idempotente: no depende de que `cargar()` se haya llamado antes

    const guardada = await this.#store.guardar({ ordenId: this.#ordenId, momento: this.#momento }, zona, foto)
    if (generacion !== this.#generacion) return // el formulario se liberó mientras se guardaba

    const anterior = this.#guardadas.get(zona)
    this.#guardadas.set(zona, { foto: guardada, url: this.#crearUrl(guardada.blob) })
    if (anterior) this.#revocarUrl(anterior.url)

    // Ya tiene foto aceptada: deja de pedirse que se retome.
    this.#zonasARetomar = this.#zonasARetomar.filter((pendiente) => pendiente !== zona)
    this.#zonaActiva = siguienteZonaSinFoto(this.#momento, this.#zonasTomadas(), zona)
    this.#publicar()

    // Se sube en cuanto está guardada, sin esperar: la captura de la siguiente zona no depende de esto.
    // `guardada` es la fila que acaba de quedar `pending`; si se repite la zona, la nueva es otra fila.
    if (this.#subidas) void this.#subidas.subir(guardada.clientId)
  }

  /** Suelta las miniaturas. El formulario se puede volver a `cargar()` después. */
  liberar(): void {
    this.#generacion++
    this.#bajaDeSubidas?.()
    this.#bajaDeSubidas = null
    this.#soltarMiniaturas()
    this.#zonasARetomar = []
    this.#cargando = false
    this.#zonaActiva = siguienteZonaSinFoto(this.#momento, new Set())
    this.#publicar()
  }

  // --- Internos -------------------------------------------------------------------------------

  /** Se entera de cada cambio de las subidas para refrescar el estado de las fotos desde el almacén. */
  #escucharSubidas(): void {
    if (!this.#subidas || this.#bajaDeSubidas) return
    this.#bajaDeSubidas = this.#subidas.suscribir(() => void this.#refrescarEstadosDeSubida())
  }

  /**
   * Lee del almacén cómo quedó cada foto (subida, fallida…) y lo refleja **sin recrear las miniaturas**.
   * Se descarta si el formulario se liberó mientras se leía; si la lectura falla, la vista queda como
   * estaba (el siguiente cambio vuelve a intentarlo).
   */
  async #refrescarEstadosDeSubida(): Promise<void> {
    const generacion = this.#generacion
    this.#publicar() // lo que cambió puede ser solo «se está subiendo», que no está en el almacén
    try {
      const fotos = await this.#store.listar({ ordenId: this.#ordenId, momento: this.#momento })
      if (generacion !== this.#generacion) return
      let cambio = false
      for (const foto of fotos) {
        const actual = this.#guardadas.get(foto.zona)
        if (!actual || actual.foto.clientId !== foto.clientId) continue // otra foto de esa zona: no se pisa
        if (actual.foto.estado !== foto.estado || actual.foto.errorMessage !== foto.errorMessage || actual.foto.storageKey !== foto.storageKey) {
          this.#guardadas.set(foto.zona, { foto: { ...actual.foto, estado: foto.estado, storageKey: foto.storageKey, errorMessage: foto.errorMessage }, url: actual.url })
          cambio = true
        }
      }
      if (cambio) this.#publicar()
    } catch {
      // se conserva lo que se mostraba
    }
  }

  #estadoDeSubida(foto: FotoGuardada): EstadoSubidaVista {
    if (foto.estado === 'uploaded') return 'subida'
    if (foto.estado === 'failed_upload') return 'fallida'
    return this.#subidas?.getSnapshot().enCurso.has(foto.clientId) ? 'subiendo' : 'enEspera'
  }

  #zonasTomadas(): Set<Zona> {
    return new Set(this.#guardadas.keys())
  }

  #soltarMiniaturas(): void {
    for (const { url } of this.#guardadas.values()) this.#revocarUrl(url)
    this.#guardadas.clear()
  }

  #construir(): InstantaneaFormulario {
    const zonas = zonasDe(this.#momento).map<ZonaVista>((zona) => {
      const guardada = this.#guardadas.get(zona)
      return {
        zona,
        etiqueta: ETIQUETA_ZONA[zona],
        foto: guardada
          ? {
              urlMiniatura: guardada.url,
              ancho: guardada.foto.ancho,
              alto: guardada.foto.alto,
              creadaEn: guardada.foto.creadaEn,
              subida: this.#estadoDeSubida(guardada.foto),
              errorSubida: guardada.foto.estado === 'failed_upload' ? guardada.foto.errorMessage : null,
            }
          : null,
        aRetomar: !guardada && this.#zonasARetomar.includes(zona),
      }
    })
    const tomadas = zonas.filter((z) => z.foto).length
    const subidas = zonas.filter((z) => z.foto?.subida === 'subida').length
    return {
      momento: this.#momento,
      zonas,
      zonaActiva: this.#zonaActiva,
      tomadas,
      total: zonas.length,
      completo: tomadas === zonas.length,
      subidas,
      fallidas: zonas.filter((z) => z.foto?.subida === 'fallida').length,
      todasSubidas: subidas === zonas.length,
      cargando: this.#cargando,
      errorCarga: this.#errorCarga,
      zonasARetomar: this.#zonasARetomar,
    }
  }

  #publicar(): void {
    this.#instantanea = this.#construir()
    for (const escucha of [...this.#escuchas]) escucha()
  }
}
