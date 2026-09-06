# LifeHedge — Reparto de trabajo

Tres agentes trabajando **en paralelo, en local, sobre la misma máquina**, más yo integrando. Entrega de hackathon con cara de producto.

## Orden de lectura

1. **[01-checklist-humano.md](01-checklist-humano.md)** — empieza por aquí, lo haces tú. Cuentas y tokens que ningún agente puede dar de alta. Unos 30 minutos, y bloquean a dos agentes.
2. **[00-arquitectura-y-contratos.md](00-arquitectura-y-contratos.md)** — lo lee todo agente antes que su brief. Esquema, rutas HTTP, propiedad de archivos y dependencias.
3. El brief de cada quien:

| Agente | Brief | Escribe en |
|---|---|---|
| **A** | [dev-a-supabase.md](dev-a-supabase.md) | `supabase/` |
| **B** | [dev-b-backend.md](dev-b-backend.md) | `backend/`, `render.yaml` |
| **C** | [dev-c-frontend-producto.md](dev-c-frontend-producto.md) | `auth/`, `datos/`, 4 vistas nuevas, 2 esqueletos |
| **D** (yo) | [dev-d-sistema-visual.md](dev-d-sistema-visual.md) | el resto de `frontend/` |

## La regla que sostiene todo esto

**Ningún archivo tiene dos dueños.** Con tres procesos escribiendo en el mismo disco, dos agentes editando el mismo archivo se sobrescriben sin aviso, y no te enteras hasta el final.

Los cuatro archivos que antes eran compartidos —`App.jsx`, `styles.css`, `api/client.js` y `package.json`— son míos. Para que C no los necesite, construyo antes tres puntos de extensión que C rellena sin tocar nada ajeno: `rutas-producto.jsx`, `estilos/producto.css` y `auth/token.js`.

Si a un agente le falta un enganche, **no improvisa**: lo anota en su archivo de evidencia y sigue con otra tarea.

## Quién arranca cuándo

| Agente | Arranca |
|---|---|
| **B** | Ya. No depende de nadie |
| **D** | Ya. No depende de nadie |
| **A** | En cuanto exista el proyecto de Supabase |
| **C** | Cuando A, B y D terminen sus hitos. Es el único con dependencias reales |

## Lo que ya existe

**Backend terminado y probado.** Optimizador QP convexo con `cvxpy`, Monte Carlo de Merton con saltos, parser de estados de cuenta en PDF, y una capa de caché que garantiza que ninguna ruta devuelva 5xx aunque se caigan Yahoo, Banxico e INEGI a la vez. **66 tests en verde.** Falta ponerle candado y desplegarlo.

**Frontend de 6 vistas**, funcional y sin commitear. Falta el sistema visual y las pantallas de producto.

**No existe todavía:** Supabase, autenticación, persistencia, ni despliegue.

## Lo que aplica a los cuatro

- Todo el texto visible al usuario en español de México
- Nada de secretos en el repo. La `service_role` de Supabase no se copia a ningún archivo: ignora RLS por completo
- No inventes datos: si una fuente no responde, estado vacío que diga por qué
- Ninguna tarea está terminada sin probarla con **dos cuentas distintas**
- Cada agente deja lo que hizo y lo que encontró en `docs/equipo/evidencia-<letra>.md`
