/**
 * Limpieza de las pruebas que **toman órdenes reales** de la base de desarrollo: devuelve al pool todas
 * las órdenes `pendiente` que tenga el usuario de prueba. Se llama en `afterAll`, así que corre también
 * si una prueba falló a mitad o se quedó sin tiempo (el `finally` de la prueba no puede, porque la
 * página ya puede estar cerrada). Toca solo al usuario de prueba y solo lo que él tiene tomado.
 */
const BASE = process.env.TRASLADO_BACKEND_URL ?? 'http://localhost:8050'

export async function soltarOrdenesDelUsuarioDePrueba(): Promise<void> {
  const usuario = process.env.TRASLADO_USUARIO
  const clave = process.env.TRASLADO_CLAVE
  if (!usuario || !clave) return

  try {
    const login = (await (
      await fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: usuario, password: clave }) })
    ).json()) as { token?: string }
    if (!login.token) return
    const cabeceras = { Authorization: `Bearer ${login.token}` }

    const { ordenes } = (await (await fetch(`${BASE}/mobile/traslado/mis-ordenes`, { headers: cabeceras })).json()) as {
      ordenes: Array<{ id_orden: number; estado: string; conductor_asignado: unknown }>
    }
    for (const orden of ordenes.filter((o) => o.conductor_asignado && o.estado === 'pendiente')) {
      await fetch(`${BASE}/mobile/traslado/${orden.id_orden}/soltar`, { method: 'POST', headers: cabeceras })
    }
  } catch {
    // Sin backend no hay nada que limpiar.
  }
}
