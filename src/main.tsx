import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/App'
import { auth, catalogo, fotos, identificador, lista, llegada, seguimiento, tablero } from '@/app/composicion'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('No se encontró el elemento #root')

createRoot(root).render(
  <StrictMode>
    <App auth={auth} lista={lista} catalogo={catalogo} identificador={identificador} fotos={fotos} llegada={llegada} seguimiento={seguimiento} tablero={tablero} />
  </StrictMode>,
)
