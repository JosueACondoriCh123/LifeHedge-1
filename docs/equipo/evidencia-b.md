# Evidencia B — FastAPI, autenticación y despliegue

**Fecha:** 2026-09-06  
**Rama:** `b/backend`  
**Commit principal:** `bfad613`

## Estado de entregables

- [x] JWT HS256 verificado localmente en las cinco rutas de datos.
- [x] `/health` continúa pública.
- [x] `/analysis/run` también exige sesión y limita a cada usuario a 30 solicitudes por minuto.
- [x] Pruebas de 401 sin encabezado y con token inválido en las seis rutas protegidas.
- [x] Prueba positiva con un token HS256 válido.
- [x] `/analysis/run` reutiliza las funciones internas y tiene prueba de equivalencia contra las tres rutas individuales.
- [x] CORS configurable mediante `CORS_ORIGINS_RAW`.
- [x] `render.yaml` creado y validado como YAML.
- [x] `backend/.env.example` documenta las variables requeridas.
- [ ] Snapshots reales: bloqueados porque no existen `INEGI_TOKEN` ni `BANXICO_TOKEN`.
- [ ] Despliegue y cron: bloqueados porque falta la cuenta/URL de Render.
- [ ] Dominio de Vercel en CORS: pendiente de que D entregue la URL.

## Pruebas

Línea base, antes de modificar la aplicación:

```text
66 passed in 3.81s
```

Suite final:

```text
82 passed in 10.05s
```

Comando utilizado:

```powershell
cd backend
./.venv/Scripts/python.exe -m pytest -q --basetemp=.pytest-tmp-final-20260906-1740
```

También pasaron `git diff --check`, `compileall` y la validación estructural de
`render.yaml`. La construcción local de Docker no se pudo ejecutar porque el
daemon de Docker Desktop no está iniciado.

## Bloqueos comprobados

Al revisar la configuración sin imprimir valores sensibles:

```text
INEGI_TOKEN_configurado=False
BANXICO_TOKEN_configurado=False
SUPABASE_JWT_SECRET_configurado=False
env_file_exists=False
snapshot_market_exists=False
snapshot_inpc_exists=False
```

No se generaron snapshots a partir del caché sintético: hacerlo los presentaría
incorrectamente como datos reales.

## Compatibilidad de Supabase

La implementación cumple el contrato compartido y verifica tokens con el secreto
legado HS256. Supabase usa claves asimétricas de forma predeterminada en proyectos
nuevos desde 2025. Antes de integrar hay que confirmar que el proyecto conserva
el modo legado; si emite `RS256` o `ES256`, debe migrarse la verificación a JWKS.

Referencias oficiales:

- <https://supabase.com/docs/guides/auth/jwts>
- <https://supabase.com/docs/guides/auth/signing-keys>

## Observaciones fuera del alcance de B

- El frontend debe enviar el token mediante el enganche de autenticación y adoptar
  `/analysis/run` para la carga inicial; no se modificó ningún archivo de frontend.
- En la versión revisada antes de los cambios concurrentes, `calcularTodo()` no
  incluía `pesos`, pero `App.jsx` intentaba guardar `datos.pesos` al crear una
  revisión. D debe confirmar que su integración actual ya corrige ese desfase.
