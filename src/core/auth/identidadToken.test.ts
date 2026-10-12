// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { identidadDelToken } from './identidadToken'
import { tokenFalso } from './testing/servidorFalso'

describe('identidadDelToken', () => {
  it('lee el usuario (`sub`) y el id (`user_id`) como los pone el backend', () => {
    expect(identidadDelToken(tokenFalso({ sub: 'op.uno', user_id: 42, role: 'operario' }, 1))).toEqual({ idUsuario: 42, usuario: 'op.uno' })
  })

  it('un nombre con tildes y eñes no se rompe (UTF-8)', () => {
    expect(identidadDelToken(tokenFalso({ sub: 'josé.muñoz', user_id: 3 }, 1)).usuario).toBe('josé.muñoz')
  })

  it('un token sin esos datos da una identidad desconocida', () => {
    expect(identidadDelToken(tokenFalso({ role: 'operario' }, 1))).toEqual({ idUsuario: null, usuario: null })
  })

  it('un id que no es un entero no se toma como id', () => {
    expect(identidadDelToken(tokenFalso({ sub: 'x', user_id: '42' }, 1)).idUsuario).toBeNull()
    expect(identidadDelToken(tokenFalso({ sub: 'x', user_id: 4.2 }, 1)).idUsuario).toBeNull()
  })

  it.each([
    ['vacío', ''],
    ['sin puntos', 'token-1'],
    ['con dos partes', 'a.b'],
    ['con un contenido que no es base64', 'a.%%%.c'],
    ['con un contenido que no es JSON', `a.${btoa('no es json')}.c`],
    ['con un contenido que no es un objeto', `a.${btoa('42')}.c`],
  ])('un token %s no lanza: identidad desconocida', (_caso, token) => {
    expect(identidadDelToken(token)).toEqual({ idUsuario: null, usuario: null })
  })
})
