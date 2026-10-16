import type { FixUbicacion } from '../domain'

/** Por qué el navegador no da la ubicación. Solo `denegada` cambia lo que se le dice al conductor; las otras dos se resuelven esperando. */
export type ErrorUbicacion = 'denegada' | 'noDisponible' | 'tiempo'

/** El GPS. Es un puerto para poder probar el recorrido sin un teléfono. */
export interface ServicioUbicacion {
  /** Empieza a escuchar las lecturas a medida que llegan. Devuelve cómo dejar de escuchar. Puede fallar o no emitir nada (GPS apagado). */
  iniciar(alFix: (fix: FixUbicacion) => void, alError: (error: ErrorUbicacion) => void): () => void
}

interface GeolocalizacionLike {
  watchPosition(
    ok: (posicion: { coords: { latitude: number; longitude: number; accuracy: number }; timestamp: number }) => void,
    error: (error: { code: number }) => void,
    opciones: PositionOptions,
  ): number
  clearWatch(id: number): void
}

/**
 * La ubicación del navegador. `maximumAge: 0` y `enableHighAccuracy: true` son la regla «nunca la última posición conocida»: el
 * navegador no entrega una lectura en caché. Aun así quien usa el fix lo revisa por su `momento` (`esFixUtil`).
 */
export function crearUbicacionDelNavegador(geolocalizacion: GeolocalizacionLike | undefined = typeof navigator === 'undefined' ? undefined : navigator.geolocation): ServicioUbicacion {
  return {
    iniciar(alFix, alError) {
      if (!geolocalizacion) {
        alError('noDisponible')
        return () => undefined
      }
      const id = geolocalizacion.watchPosition(
        ({ coords, timestamp }) => alFix({ latitud: coords.latitude, longitud: coords.longitude, precisionM: coords.accuracy, momento: timestamp }),
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT.
        (error) => alError(error.code === 1 ? 'denegada' : error.code === 3 ? 'tiempo' : 'noDisponible'),
        { enableHighAccuracy: true, maximumAge: 0 },
      )
      return () => geolocalizacion.clearWatch(id)
    },
  }
}
