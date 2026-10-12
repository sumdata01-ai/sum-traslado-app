// @vitest-environment node
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// F-01 AC4: la regla de dependencias del dominio tiene que fallar de verdad.
// Se lintea código en memoria con rutas que no existen en disco; ESLint solo las usa para
// decidir qué bloque de la configuración aplica.
const eslint = new ESLint({ cwd: process.cwd() })

async function reglasQueFallan(codigo: string, filePath: string): Promise<string[]> {
  const [resultado] = await eslint.lintText(codigo, { filePath })
  return (resultado?.messages ?? []).map((m) => m.ruleId ?? 'sin-regla')
}

const DOMINIO = 'src/features/traslado/domain/ejemplo.ts'
const PAGINA = 'src/features/traslado/pages/Ejemplo.tsx'

// El primer lint carga la configuración y los plugins: solo tarda ~1 s, pero con la suite entera
// en paralelo superó los 15 s por defecto (2026-10-09). El margen es para ese arranque en frío.
describe('límites de capas (ESLint)', { timeout: 60_000 }, () => {
  it('el dominio no puede importar React', async () => {
    expect(await reglasQueFallan("import { useState } from 'react'\nexport const x = useState\n", DOMINIO)).toContain(
      'no-restricted-imports',
    )
  })

  it('el dominio no puede importar Dexie', async () => {
    expect(await reglasQueFallan("import Dexie from 'dexie'\nexport const x = Dexie\n", DOMINIO)).toContain(
      'no-restricted-imports',
    )
  })

  it('el dominio no puede importar las capas superiores', async () => {
    expect(
      await reglasQueFallan("import { f } from '@/features/traslado/data/fotoStore'\nexport const x = f\n", DOMINIO),
    ).toContain('no-restricted-imports')
  })

  it('el dominio no puede usar globales del navegador', async () => {
    expect(await reglasQueFallan('export const x = window.location.href\n', DOMINIO)).toContain('no-restricted-globals')
    expect(await reglasQueFallan('export const x = indexedDB\n', DOMINIO)).toContain('no-restricted-globals')
  })

  it('el dominio puro sin dependencias no produce errores', async () => {
    expect(await reglasQueFallan('export const ZONAS = ["FRONTAL"] as const\n', DOMINIO)).toEqual([])
  })

  it('fuera del dominio, las mismas importaciones están permitidas', async () => {
    expect(await reglasQueFallan("import { useState } from 'react'\nexport const x = useState\n", PAGINA)).not.toContain(
      'no-restricted-imports',
    )
  })
})
