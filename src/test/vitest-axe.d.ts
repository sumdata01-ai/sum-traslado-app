import type { AxeMatchers } from 'vitest-axe/matchers'

// vitest-axe 0.1.0 declara sus tipos en el espacio de nombres `Vi`, de Vitest anterior a 1.0.
// Con Vitest 4 hay que aumentar el módulo `vitest`.
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
