import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
// Después de styles.css a propósito: así las reglas de las pantallas de
// producto (Agente C) ganan sin necesitar !important.
import './estilos/producto.css'
import App from './App.jsx'
// Tema final compartido por la landing y el producto, inspirado en ClearLot.
import './estilos/clearlot-theme.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
