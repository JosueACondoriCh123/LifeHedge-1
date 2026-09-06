# LifeHedge — Arquitectura y contratos compartidos

> **Lee este documento antes que el tuyo.** Es el único lugar donde viven el esquema, las rutas HTTP y las convenciones. Si algo aquí choca con tu brief, gana este documento. Si necesitas cambiar algo de aquí, avísale al equipo antes de tocarlo: los cuatro codificamos contra estas definiciones.

## Qué estamos construyendo

LifeHedge adapta el marco institucional de *Liability-Driven Investment* a un hogar mexicano. Lee tu estado de cuenta, mide la inflación de **tu** canasta contra el INPC oficial, y optimiza la cartera que la cubre.

Lo que ya existe y funciona: el motor cuantitativo completo en FastAPI (66 tests en verde) y un frontend de 6 vistas. Lo que añadimos ahora: cuentas de usuario, persistencia real en Supabase, historial, comparación de escenarios, y un sistema visual que se vea como producto.

## Reparto y propiedad de archivos

Tres agentes trabajan **en paralelo sobre la misma máquina**. Por eso el reparto no es "por temas" sino por **archivos concretos y disjuntos**: ningún archivo tiene dos dueños. Si dos agentes pudieran escribir el mismo archivo, tarde o temprano uno sobrescribe al otro sin aviso y nadie se entera hasta el final.

| Agente | Escribe exclusivamente en | Archivos |
|---|---|---|
| **A** | `supabase/` | todo lo de esa carpeta |
| **B** | `backend/`, `render.yaml` | todo lo de esa carpeta |
| **C** | `frontend/src/auth/`, `frontend/src/datos/`, `frontend/src/estilos/producto.css`, `frontend/src/rutas-producto.jsx`, y **solo estas cuatro vistas nuevas**: `views/Acceso.jsx`, `views/Historial.jsx`, `views/Comparar.jsx`, `views/Cuenta.jsx` | |
| **D** | todo el resto de `frontend/` | `App.jsx`, `styles.css`, `components/`, vistas existentes, `graficas.js`, `analitica.js`, `views/Acoplamiento.jsx`, `package.json` |

### La regla, sin excepciones

**Si un archivo no está en tu lista, no lo abres para escribir.** Leerlo está bien y a menudo es necesario. Escribirlo, no.

Esto vale especialmente para los cuatro archivos que antes eran compartidos y ahora son de D:

- `frontend/src/App.jsx`
- `frontend/src/styles.css`
- `frontend/src/api/client.js`
- `frontend/package.json`

### Puntos de extensión

Para que C no necesite tocar ninguno de esos cuatro, **D construye antes los enganches**. C escribe únicamente en archivos suyos, y D ya los tiene conectados:

| C necesita | En vez de editar | Escribe en |
|---|---|---|
| Registrar sus pantallas en la navegación | `App.jsx` | `src/rutas-producto.jsx` |
| Estilos de sus pantallas | `styles.css` | `src/estilos/producto.css` |
| Mandar el token a FastAPI | `api/client.js` | `src/auth/token.js` |
| La librería de Supabase | `package.json` | ya instalada por D |

D crea los cuatro archivos como esqueletos vacíos y los deja cableados **antes** de que C empiece. C solo los rellena.

**Si te falta un enganche, no improvises editando un archivo ajeno.** Pídeselo a D, o déjalo anotado y sigue con otra tarea.

---

## Arquitectura

```
                        ┌──────────────────────────┐
                        │  React + Vite (Vercel)   │
                        └────┬─────────────────┬───┘
                             │                 │
              JWT de Supabase│                 │ JWT de Supabase
                             ▼                 ▼
        ┌────────────────────────────┐   ┌──────────────────────┐
        │  Supabase                  │   │  FastAPI (Render)    │
        │  · Auth (email + password) │   │  · Parseo de PDF     │
        │  · Postgres + RLS          │   │  · Optimizador QP    │
        │  · Storage (bucket privado)│   │  · Monte Carlo       │
        └────────────────────────────┘   └──────┬───────────────┘
                                                │
                                    ┌───────────┴────────────┐
                                    │ Yahoo · Banxico · INEGI│
                                    │ caché + snapshot       │
                                    └────────────────────────┘
```

**Decisiones de arquitectura, y por qué:**

1. **El motor se queda en FastAPI.** El optimizador es un QP convexo resuelto con `cvxpy` y el Monte Carlo es `numpy` vectorizado. Reescribirlo en TypeScript para Edge Functions tiraría 66 tests y una precisión numérica que costó construir.

2. **FastAPI no escribe en la base de datos.** Sigue siendo sin estado: recibe datos, calcula, responde. **El frontend es quien persiste**, usando el cliente de Supabase con RLS. Esto evita darle a FastAPI la llave de servicio, mantiene sus tests verdes sin una base de datos, y deja la frontera de propiedad limpia entre B y A.

3. **FastAPI sí verifica el JWT.** Si no, la API queda abierta a cualquiera. Verificación local con el secreto compartido, sin llamar a Supabase en cada petición.

4. **El PDF viaja dos veces** —una a Storage, otra a `/statement/parse`— y está bien. Es una subida de pocos cientos de kilobytes y nos ahorra acoplar FastAPI a Storage.

---

## Esquema de base de datos

Este es **el contrato**. A lo escribe como migración; C lo consume; B no lo toca.

```sql
-- Perfil, extiende auth.users
create table perfiles (
  id          uuid primary key references auth.users on delete cascade,
  nombre      text,
  creado_en   timestamptz not null default now()
);

-- Estados de cuenta subidos. El archivo vive en Storage; aquí solo el puntero.
create table estados_cuenta (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users on delete cascade,
  ruta_storage      text not null,          -- '{usuario_id}/{uuid}.pdf'
  nombre_archivo    text not null,
  emisor            text,                    -- BBVA | SANTANDER | ... | GENERICO
  bytes             integer,
  subido_en         timestamptz not null default now(),
  borrar_despues_de timestamptz not null default (now() + interval '90 days')
);

-- Una corrida completa del motor.
create table analisis (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users on delete cascade,
  estado_cuenta_id  uuid references estados_cuenta on delete set null,
  etiqueta          text not null,           -- "Enero 2026", editable
  pesos             jsonb not null,          -- {alimentos:0.35, ...}
  buffer            numeric not null,
  horizonte         integer not null,
  inflacion         jsonb not null,          -- respuesta de /inflation/personal
  optimo            jsonb not null,          -- respuesta de /portfolio/optimize
  riesgo            jsonb not null,          -- respuesta de /risk/simulate
  -- Columnas derivadas: el historial se lista sin abrir un solo jsonb.
  delta_anualizado  numeric,
  phe               numeric,
  tev               numeric,
  var_95            numeric,
  creado_en         timestamptz not null default now()
);

create index analisis_usuario_fecha on analisis (usuario_id, creado_en desc);
create index estados_usuario_fecha on estados_cuenta (usuario_id, subido_en desc);
```

**Por qué las columnas derivadas.** La pantalla de Historial lista decenas de análisis con su Delta y su PHE. Sin ellas, cada fila obligaría a deserializar tres `jsonb` grandes. Las escribe C al guardar; son una desnormalización deliberada.

**Regla de oro de RLS:** las tres tablas filtran por `usuario_id = auth.uid()`. Sin excepción. El detalle de las políticas está en el brief de A.

**Storage:** un solo bucket **privado** llamado `estados-cuenta`. La ruta de cada objeto **empieza con el id del usuario**: `{usuario_id}/{uuid}.pdf`. La política se apoya en ese prefijo. Nunca se sirve por URL pública, siempre por URL firmada de corta duración.

---

## Contrato HTTP de FastAPI

Base en desarrollo: `http://localhost:8000`. Documentación viva en `/docs`.

**Todas las rutas salvo `/health` exigen `Authorization: Bearer <access_token>`** una vez que B termine su tarea 1. El token sale de `supabase.auth.getSession()`.

### Constantes que nadie puede cambiar por su cuenta

Los seis rubros, en este orden, sin acentos y en minúsculas:

```
alimentos  vivienda  transporte  salud  educacion  otros
```

Los ocho activos, en orden canónico. `weights` siempre viene en este orden; las etiquetas se leen de `assets`, **nunca se escriben a mano**:

| # | ticker | label |
|---|---|---|
| 0 | `UDIBONO` | Udibonos |
| 1 | `CETES28` | Cetes 28d |
| 2 | `NAFTRACISHRS.MX` | IPC |
| 3 | `IVVPESOISHRS.MX` | S&P 500 (MXN) |
| 4 | `GLD` | Oro |
| 5 | `XLE` | Energía |
| 6 | `DBA` | Agro |
| 7 | `MXN=X` | USD/MXN |

**Todos los números son fracciones decimales.** `0.0504` es 5.04%. Multiplica por 100 al mostrar.

### Rutas

| Método | Ruta | Entrada | Devuelve |
|---|---|---|---|
| GET | `/health` | — | `{status, service}` |
| GET | `/market/universe` | — | `{assets, dates, returns, stale, as_of}` |
| POST | `/statement/parse` | multipart, campo **`archivo`** | `{emisor, transacciones[], pesos}` |
| POST | `/inflation/personal` | `{pesos}` | `{dates, personal, general, delta_anualizado, personal_anual, general_anual, volatilidad_anual, stale, as_of}` |
| POST | `/portfolio/optimize` | `{pesos, buffer}` | `{assets, weights, tev, phe, benchmark_cetes, frontera, stale, as_of}` |
| POST | `/risk/simulate` | `{pesos, weights, horizonte}` | `{percentiles, var_95, cvar_95, media_final, stale, as_of}` |
| POST | `/analysis/run` | `{pesos, buffer, horizonte}` | `{inflacion, optimo, riesgo}` — **nuevo, lo hace B** |

`/analysis/run` existe porque hoy el frontend hace tres viajes de red para poblar el dashboard, y con el arranque en frío de Render eso se siente eterno. Un solo viaje.

### Errores, y la trampa que cuesta una hora

Hay **dos formas distintas de 422** y hay que manejar ambas o el usuario ve `[object Object]`:

```jsonc
// 422 de nuestra lógica: detail es un string listo para mostrar
{ "detail": "El PDF no contiene texto seleccionable; parece un escaneo." }

// 422 de validación de Pydantic: detail es un arreglo de objetos
{ "detail": [{ "type": "greater_than_equal", "loc": ["body","buffer"], "msg": "..." }] }
```

Ya está resuelto en `frontend/src/api/client.js`, función `mensajeDeError`. Úsala, no la reimplementes.

Otros códigos: **401** sin token o token vencido. **503** sin datos de mercado ni INPC. **500** trae `correlation_id`.

**Campos `stale` y `as_of`:** cuando una fuente externa se cae, el backend sirve el último snapshot y marca `stale: true` en vez de fallar. Muestra el badge con la fecha. No es un error.

---

## Convenciones del equipo

**Idioma.** Todo el texto visible al usuario en español de México. Nombres de variables, funciones y columnas en español también — el código existente ya lo hace y mezclar es peor que cualquiera de las dos opciones.

**Commits.** Prefijo convencional en español e imperativo: `feat: añadir historial de análisis`. Firma tus commits con tu inicial de dev en el cuerpo si compartes archivo.

**Ramas.** Una por tarea, con tu letra: `a/esquema-rls`, `b/auth-jwt`, `c/pantalla-historial`, `d/sistema-visual`. PR contra `main`. Nadie empuja directo a `main`.

**Secretos.** Nada de llaves en el repo. `.env.example` con los nombres, `.env` en `.gitignore`. La `service_role` de Supabase **nunca** sale del navegador de A; el frontend usa exclusivamente la `anon key`.

**Datos.** No inventes datos. Si una fuente no responde, muestra un estado vacío que diga por qué. Nunca cifras de relleno que alguien pueda leer como reales.

---

## Levantar el proyecto

```bash
cd backend && ./.venv/Scripts/python.exe -m scripts.seed_dev_cache
```

```bash
cd backend && ./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

El sembrador llena el caché con series **sintéticas** para trabajar sin tokens de INEGI ni Banxico. Escribe en `backend/data/cache/`, que está en `.gitignore`. **Esos datos son inventados: no los uses en el video ni en capturas.**

El backend acepta CORS desde `http://localhost:5173`. No cambies el puerto de Vite.

---

## Orden de arranque y dependencias

No hay calendario por días: los agentes trabajan rápido y lo que manda son las dependencias. Cada agente arranca **cuando su condición se cumple**, no cuando le toca el turno.

```
[Humano] Cuentas y tokens ──────┬──────────────► A: Supabase
  (docs/equipo/01-checklist)    │
                                └──────────────► B: snapshots reales
                                                 (opcional; B arranca sin esto)

[D] Base del frontend ─────────────────────────► C: pantallas de producto
    repo · tokens · shell · enganches
                                    ▲
[A] Esquema + RLS ──────────────────┤
[B] JWT + /analysis/run ────────────┘
```

### Condiciones de arranque

| Agente | Arranca cuando | Puede avanzar sin nada más |
|---|---|---|
| **B** | **Ya.** No depende de nadie | Todo salvo snapshots reales y despliegue |
| **D** | **Ya.** No depende de nadie | Toda la base del frontend |
| **A** | Exista el proyecto de Supabase (checklist humano §1) | Todo su brief |
| **C** | A terminó esquema y RLS · B terminó JWT · D terminó los enganches | — |

**C es el único con dependencias reales, y depende de los tres.** Si algo se atrasa, se atrasa C. Por eso B y D arrancan de inmediato y A en cuanto exista el proyecto.

### Los cuatro hitos que desbloquean a alguien

| Hito | Dueño | Desbloquea |
|---|---|---|
| Repo extraído y frontend commiteado | D | A, B, C pueden trabajar sin miedo a perder nada |
| Enganches del frontend creados | D | C |
| Esquema y RLS aplicados | A | C |
| JWT verificado y `/analysis/run` | B | C |

### Integración

D integra al final: recorrido completo con **dos cuentas distintas**, comprobando que ninguna ve datos de la otra. Después, congelamiento, video y texto de Devpost.

---

## Definición de terminado, para cualquier tarea

- [ ] Funciona en el recorrido completo, no solo aislada
- [ ] Estados de error y estado vacío resueltos, con texto en español
- [ ] Sin advertencias nuevas en la consola del navegador
- [ ] `npm run build` y `pytest` en verde
- [ ] Probada con **dos cuentas distintas**: nadie ve datos del otro
