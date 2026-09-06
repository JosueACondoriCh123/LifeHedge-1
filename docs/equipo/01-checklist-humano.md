# Checklist humano — lo que ningún agente puede hacer

Todo esto exige registro con correo en un navegador. **Ningún agente puede hacerlo por ti**, y varias tareas quedan bloqueadas hasta que exista. Son unos 30 minutos.

Ve marcando y pega cada credencial en `backend/.env` y `frontend/.env` según indica cada bloque. **Esos dos archivos están en `.gitignore`: nunca los commitees.**

---

## 1. Supabase ⚠ bloquea al Agente A por completo

Sin esto no hay auth, ni base de datos, ni Storage. Es el bloqueo más caro.

1. Crea cuenta en <https://supabase.com> y un proyecto nuevo
2. Nombre `lifehedge`, región **East US** (la más cercana a México con plan gratuito)
3. Guarda la contraseña de la base de datos que te genere: **no se puede recuperar después**
4. En **Settings → API** copia tres valores:

```
Project URL        →  VITE_SUPABASE_URL        (frontend/.env)
anon public key    →  VITE_SUPABASE_ANON_KEY   (frontend/.env)
JWT Secret         →  SUPABASE_JWT_SECRET      (backend/.env)
```

5. En **Settings → API** verás también `service_role`. **No la copies a ningún archivo.** Ignora RLS por completo: si se filtra, cualquiera lee los estados de cuenta de todos.
6. En **Authentication → Providers**: Email activado, y **desactiva "Confirm email"**. Un juez con tres minutos no va a revisar su bandeja.
7. En **Authentication → URL Configuration** añade `http://localhost:5173`

También necesitarás el *project ref* (está en la URL del panel) para que el Agente A enlace el CLI.

---

## 2. Tokens de datos ⚠ bloquea datos reales

Gratis, inmediatos, sin tarjeta. Sin ellos el backend corre con series **inventadas**, que no puedes usar en el video ni en capturas.

**INEGI** — <https://www.inegi.org.mx/app/api/indicadores/interna_v2/tokenVerify.aspx>

**Banxico** — <https://www.banxico.org.mx/SieAPIRest/service/v1/token>

```
INEGI_TOKEN=...      (backend/.env)
BANXICO_TOKEN=...    (backend/.env)
```

Cuando tengas ambos, esta orden te dice si las tres fuentes responden y **cuál indicador exacto está roto** si algo falla:

```bash
cd "C:/Users/HP/Documents/Coppel hackathon/backend" && ./.venv/Scripts/python.exe -m scripts.verificar_fuentes
```

Esperado: 6 líneas OK de Yahoo, 2 de Banxico, 7 de INEGI. Los 7 identificadores del INPC y las 2 series de Banxico se pusieron de memoria y **no están verificados** — es el riesgo más probable del backend. Si algo falla, pásale la salida al Agente B.

---

## 3. Render — la URL del backend

<https://render.com>, cuenta gratuita conectada a GitHub.

Necesario solo si quieres URL en vivo. Si entregas por video, el Agente B puede saltárselo.

**Advertencia:** el plan gratuito duerme el servicio a los 15 minutos y tarda entre 30 y 60 segundos en despertar. Si un juez abre la URL en frío ve una app rota. Por eso el Agente B tiene como tarea obligatoria un cron en <https://cron-job.org> que la mantenga despierta. Actívalo el día de la entrega.

---

## 4. Vercel — la URL del frontend

<https://vercel.com>, cuenta gratuita.

Root Directory `frontend`, framework Vite. Necesita tres variables: `VITE_API_URL` (la URL de Render, **sin diagonal final**), `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

Cuando tengas el dominio de Vercel, hay que darlo de alta en dos sitios o nada funciona en producción:

- **Render**, variable `CORS_ORIGINS_RAW`
- **Supabase**, Authentication → URL Configuration

---

## Resumen: qué se desbloquea con qué

| Cuando tengas | Se desbloquea |
|---|---|
| Proyecto de Supabase | Agente A completo, y luego el Agente C |
| Tokens INEGI y Banxico | Datos reales; el Agente B genera los snapshots |
| Render | URL del backend en vivo |
| Vercel | URL del frontend, y la demo para los jueces |

**Si solo puedes hacer una cosa ahora, haz Supabase.** Es lo que bloquea a dos agentes.

**Lo que no se bloquea con nada:** el Agente B puede trabajar de inmediato con datos sintéticos sembrados, y yo puedo construir toda la base del frontend sin ninguna credencial.
