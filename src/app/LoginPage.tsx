import { type FormEvent, useRef, useState } from 'react'
import type { AuthPort } from '@/core/auth'
import { Banner, Button, TextField } from '@/core/ui'

/**
 * Pantalla de inicio de sesión. Un segundo envío mientras el primero sigue en curso se ignora: el
 * login del backend admite 10 por minuto. Tras un intento fallido se conserva el usuario y se borra
 * la contraseña.
 */
export function LoginPage({ auth }: { auth: AuthPort }) {
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enviandoRef = useRef(false)

  const enviar = async (evento: FormEvent) => {
    evento.preventDefault()
    if (enviandoRef.current) return
    enviandoRef.current = true
    setEnviando(true)
    setError(null)
    try {
      const resultado = await auth.login(usuario, clave)
      if (!resultado.ok) {
        setError(resultado.mensaje)
        setClave('')
      }
    } finally {
      enviandoRef.current = false
      setEnviando(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-6">
      <div>
        <h1 className="text-[22px] font-bold">Traslado</h1>
        <p className="text-ink-2">Inicia sesión para continuar.</p>
      </div>

      <form onSubmit={(evento) => void enviar(evento)} noValidate className="flex flex-col gap-4">
        {error && <Banner tono="danger">{error}</Banner>}
        <TextField
          etiqueta="Usuario"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={usuario}
          onChange={(evento) => setUsuario(evento.target.value)}
          disabled={enviando}
        />
        <TextField
          etiqueta="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(evento) => setClave(evento.target.value)}
          disabled={enviando}
        />
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
    </main>
  )
}
