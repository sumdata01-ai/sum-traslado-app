/**
 * Dobles de prueba de la cámara: un navegador de mentira controlable desde el test. Solo se
 * importan desde pruebas; la aplicación no los usa.
 */
import type { DocumentoLike, VideoLike } from '../cameraSession'
import type { EntornoNavegador } from '../plataforma'

/** Un `EventTarget` que cuenta cuántos oyentes tiene, para comprobar que no quedan colgados. */
class ObjetivoContable extends EventTarget {
  oyentes = 0

  override addEventListener(...args: Parameters<EventTarget['addEventListener']>): void {
    this.oyentes++
    super.addEventListener(...args)
  }

  override removeEventListener(...args: Parameters<EventTarget['removeEventListener']>): void {
    this.oyentes--
    super.removeEventListener(...args)
  }
}

export class FakeTrack extends ObjetivoContable {
  readyState: 'live' | 'ended' = 'live'
  detenciones = 0

  stop(): void {
    this.readyState = 'ended'
    this.detenciones++
  }

  /** El dispositivo terminó el track por su cuenta (se bloqueó la pantalla, llamada, etc.). */
  terminarPorSuCuenta(): void {
    this.readyState = 'ended'
    this.dispatchEvent(new Event('ended'))
  }
}

export class FakeStream {
  readonly track = new FakeTrack()
  getVideoTracks = () => [this.track]
  getTracks = () => [this.track]
  /** Para pasarlo donde se espera un `MediaStream`. */
  como(): MediaStream {
    return this as unknown as MediaStream
  }
}

export class FakeVideo extends ObjetivoContable implements VideoLike {
  muted = false
  playsInline = false
  autoplay = false
  videoWidth = 0
  videoHeight = 0
  readyState = 0
  pausas = 0
  /** Lo que hace `play()`: por defecto resuelve; el test lo cambia para simular un rechazo. */
  jugar: () => Promise<void> = () => Promise.resolve()

  #srcObject: MediaProvider | null = null
  get srcObject(): MediaProvider | null {
    return this.#srcObject
  }
  set srcObject(valor: MediaProvider | null) {
    // Un stream nuevo no tiene frame hasta que el navegador lo decodifica.
    this.#srcObject = valor
    this.videoWidth = 0
    this.videoHeight = 0
    this.readyState = 0
  }

  play(): Promise<void> {
    return this.jugar()
  }

  pause(): void {
    this.pausas++
  }

  /** El navegador decodificó el primer frame. */
  mostrarFrame(ancho = 1280, alto = 720): void {
    this.videoWidth = ancho
    this.videoHeight = alto
    this.readyState = 4
    this.dispatchEvent(new Event('loadeddata'))
  }
}

export class FakeDocument extends ObjetivoContable implements DocumentoLike {
  visibilityState: 'visible' | 'hidden' = 'visible'

  cambiar(estado: 'visible' | 'hidden'): void {
    this.visibilityState = estado
    this.dispatchEvent(new Event('visibilitychange'))
  }
}

export function errorDeDom(nombre: string): DOMException {
  return new DOMException(`simulado: ${nombre}`, nombre)
}

export const ENTORNO_SEGURO: EntornoNavegador = {
  isSecureContext: true,
  mediaDevices: { getUserMedia: () => undefined },
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0',
  platform: 'Linux x86_64',
  maxTouchPoints: 0,
}

export const USER_AGENT_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
export const USER_AGENT_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

/** Espera a que se vacíen las promesas pendientes (con temporizadores reales). */
export const vaciarPromesas = () => new Promise<void>((resolver) => setTimeout(resolver, 0))
