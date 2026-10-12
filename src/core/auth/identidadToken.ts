export interface IdentidadToken {
  idUsuario: number | null
  usuario: string | null
}

const SIN_IDENTIDAD: IdentidadToken = { idUsuario: null, usuario: null }

/**
 * Quién es el dueño de un access token, leído de su contenido (`sub` = usuario, `user_id` = id; ver
 * `auth_service.py` del backend). **No verifica la firma ni la vigencia:** eso lo hace el servidor
 * en cada petición. Aquí solo sirve para saber si la sesión de esta pestaña sigue siendo de la misma
 * persona. Un token que no se puede leer devuelve una identidad desconocida, nunca lanza.
 */
export function identidadDelToken(token: string): IdentidadToken {
  try {
    const partes = token.split('.')
    if (partes.length !== 3 || !partes[1]) return SIN_IDENTIDAD
    const datos: unknown = JSON.parse(decodificarBase64Url(partes[1]))
    if (typeof datos !== 'object' || datos === null) return SIN_IDENTIDAD
    const { sub, user_id: id } = datos as { sub?: unknown; user_id?: unknown }
    return {
      idUsuario: typeof id === 'number' && Number.isInteger(id) ? id : null,
      usuario: typeof sub === 'string' && sub.length > 0 ? sub : null,
    }
  } catch {
    return SIN_IDENTIDAD
  }
}

function decodificarBase64Url(texto: string): string {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
  return new TextDecoder().decode(bytes) // UTF-8: un nombre con tildes no se rompe
}
