# Dev B — FastAPI: autenticación, endpoint agregado y despliegue

## Antes de empezar

Trabajas en local sobre `C:/Users/HP/Documents/Coppel hackathon`, **junto a otros dos agentes que editan el mismo disco al mismo tiempo**.

**Escribes exclusivamente en `backend/` y en `render.yaml`.** Todo lo demás del repositorio es de solo lectura para ti: nada de `frontend/` ni de `supabase/`, aunque veas algo que arreglar. Anótalo en tu informe final.

Lee antes `docs/equipo/00-arquitectura-y-contratos.md`.

**Arranca ya: no dependes de nadie.** Las tareas B1 y B2 no necesitan ninguna credencial. B3 espera a los tokens de INEGI y Banxico, y B4 a la cuenta de Render (§2 y §3 de `docs/equipo/01-checklist-humano.md`); si aún no existen, hazlas al final.

Usa siempre `backend/.venv/Scripts/python.exe`. El `python` del PATH apunta a otro entorno sin pip.

No hay GitHub ni pull requests: todo es local. Trabaja en la rama `b/backend` y deja tus evidencias en `docs/equipo/evidencia-b.md`, que también es tuyo.

---

El motor cuantitativo ya está terminado y probado: 66 tests en verde, optimizador QP con `cvxpy`, Monte Carlo de Merton, parser de PDF, y una capa de caché que garantiza que ninguna ruta devuelva 5xx aunque se caigan las tres fuentes externas. **No lo reescribas.** Tu trabajo es ponerle candado, hacerlo más rápido para el frontend, y sacarlo a producción.

Antes de tocar nada, corre la suite para tener tu línea base:

```bash
cd backend && ./.venv/Scripts/python.exe -m pytest -q
```

Debe decir `66 passed`. Si no, avísame antes de seguir.

---

## Tarea B1 — Verificación de JWT ⚠ bloquea a C

**Entrega esperada: primera mitad del día 1.** C no puede llamar a las rutas autenticadas hasta que esto exista.

Hoy la API está abierta: cualquiera con la URL de Render puede consumirla. Añade verificación del token de Supabase, **local, sin llamar a Supabase en cada petición**.

Supabase firma sus JWT con HS256 usando el *JWT secret* del proyecto (lo tiene A, en Settings → API). Con eso la verificación es una operación en memoria de microsegundos.

Añade a `requirements.txt`:

```
pyjwt==2.10.1
```

Crea `backend/app/auth.py`:

```python
from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, Request

from app.config import settings


class Usuario:
    def __init__(self, id: str, email: str | None) -> None:
        self.id = id
        self.email = email


def usuario_actual(request: Request) -> Usuario:
    encabezado = request.headers.get("authorization", "")
    if not encabezado.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Falta tu sesión. Vuelve a iniciar sesión.")

    token = encabezado.split(" ", 1)[1].strip()
    try:
        claims = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=401, detail="Tu sesión expiró. Vuelve a iniciar sesión.") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=401, detail="Sesión inválida.") from exc

    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Sesión inválida.")
    return Usuario(id=sub, email=claims.get("email"))
```

En `config.py` añade `supabase_jwt_secret: str | None = None`.

Aplícalo como dependencia en las cinco rutas de datos —`/market/universe`, `/statement/parse`, `/inflation/personal`, `/portfolio/optimize`, `/risk/simulate`— y **no** en `/health`, que debe seguir abierta porque el frontend la usa para el arranque en frío y un cron externo la mantiene despierta.

```python
def universe(usuario: Usuario = Depends(usuario_actual)) -> UniverseResponse:
```

### Un detalle que te va a morder

Los 66 tests existentes llaman a las rutas sin token y van a fallar todos de golpe. La solución correcta no es quitar la autenticación de los tests: es sobrescribir la dependencia en `conftest.py`, que es justo para lo que existe ese mecanismo.

```python
from app.auth import Usuario, usuario_actual
from app.main import app

@pytest.fixture(autouse=True)
def usuario_de_prueba():
    app.dependency_overrides[usuario_actual] = lambda: Usuario(
        id="00000000-0000-0000-0000-000000000001", email="test@lifehedge.mx"
    )
    yield
    app.dependency_overrides.clear()
```

Y añade **dos tests nuevos** que sí comprueben el candado, saltándose el override:

- sin encabezado `Authorization` → 401
- con token basura → 401

Sin esos dos, la autenticación no está probada.

---

## Tarea B2 — `POST /analysis/run` ⚠ bloquea a C

**Entrega esperada: cierre del día 1.**

Hoy poblar el dashboard cuesta **tres viajes de red**: `/inflation/personal`, `/portfolio/optimize` y luego `/risk/simulate`, que depende de los pesos del segundo. Con el arranque en frío de Render eso se siente eterno y triplica la probabilidad de que algo falle a media carga.

Una sola ruta que haga los tres pasos:

```python
class RunRequest(BaseModel):
    pesos: dict[str, float]
    buffer: float = Field(default=0.10, ge=0.0, le=1.0)
    horizonte: int = Field(default=12, ge=1, le=60)


class RunResponse(BaseModel):
    inflacion: InflationResponse
    optimo: OptimizeResponse
    riesgo: SimulateResponse
```

Reutiliza `_entradas_optimizacion` y las funciones que ya existen en `main.py`. **No dupliques la lógica**: si copias y pegas, en dos días las dos rutas divergen. Extrae lo común a funciones y deja que tanto las rutas individuales como esta las llamen.

Las rutas individuales se quedan: el frontend las usa para recálculos parciales cuando solo cambia el buffer o el horizonte.

Tests: que `/analysis/run` devuelva lo mismo que las tres llamadas por separado con las mismas entradas. Ese test es el que impide la divergencia.

---

## Tarea B3 — Tokens reales y snapshots

**Entrega esperada: día 2.**

El backend funciona hoy con datos sintéticos sembrados. Para la entrega necesita datos reales.

Consigue los dos tokens gratuitos, de registro inmediato:

- INEGI: <https://www.inegi.org.mx/app/api/indicadores/interna_v2/tokenVerify.aspx>
- Banxico: <https://www.banxico.org.mx/SieAPIRest/service/v1/token>

Luego valida las tres fuentes antes de generar nada. Este script te dice exactamente qué indicador o serie está roto:

```bash
cd backend && INEGI_TOKEN=xxx BANXICO_TOKEN=yyy ./.venv/Scripts/python.exe -m scripts.verificar_fuentes
```

**Esperado:** seis líneas OK de Yahoo, dos de Banxico, siete de INEGI. Los siete identificadores del INPC en `config.py` y las dos series de Banxico se pusieron de memoria y **no están verificados**; es el riesgo más probable de todo el backend. Si alguno falla, búscalo en el Banco de Información Económica de INEGI (Índices de precios → INPC → por objeto del gasto) y corrige `INEGI_INDICATORS`.

Con las tres fuentes en verde:

```bash
cd backend && INEGI_TOKEN=xxx BANXICO_TOKEN=yyy ./.venv/Scripts/python.exe -m scripts.build_snapshot
```

Eso escribe `data/snapshot/market.json` e `inpc.json`. **Commitéalos.** Son la red de seguridad: si las tres fuentes se caen durante el juzgado, la API sigue respondiendo 200 con `stale: true` en lugar de morir.

Verifica el simulacro de apagón antes de cerrar la tarea:

```bash
cd backend && rm -rf data/cache && ./.venv/Scripts/python.exe -m pytest -q
```

---

## Tarea B4 — Despliegue en Render

**Entrega esperada: día 2.**

Ya existe el `Dockerfile`. Crea `render.yaml` en la raíz:

```yaml
services:
  - type: web
    name: lifehedge-api
    runtime: docker
    rootDir: backend
    dockerfilePath: ./Dockerfile
    plan: free
    healthCheckPath: /health
    envVars:
      - key: INEGI_TOKEN
        sync: false
      - key: BANXICO_TOKEN
        sync: false
      - key: SUPABASE_JWT_SECRET
        sync: false
      - key: CORS_ORIGINS_RAW
        sync: false
```

Antes de desplegar, haz configurable el CORS. Hoy está fijo en `config.py`; cámbialo por:

```python
    cors_origins_raw: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins_raw.split(",") if o.strip()]
```

**El plan gratuito de Render duerme el servicio a los 15 minutos y tarda entre 30 y 60 segundos en despertar.** Si un juez abre la URL en frío, ve una app rota. Mitigación obligatoria: un cron en <https://cron-job.org> que golpee `/health` cada 10 minutos. Actívalo el día 2 y verifica el historial de ejecuciones antes de la entrega.

Añade también un límite de tasa sencillo por usuario —`slowapi` o un diccionario en memoria— porque `/analysis/run` corre 1000 trayectorias de Monte Carlo y el plan gratuito tiene poca CPU. Treinta peticiones por minuto por usuario es de sobra.

---

## Entregables

- [ ] JWT verificado en las cinco rutas de datos, `/health` abierta
- [ ] Dos tests nuevos que comprueben el 401
- [ ] `/analysis/run` con test de equivalencia contra las tres rutas sueltas
- [ ] Los 66 tests originales siguen en verde
- [ ] Snapshots reales commiteados
- [ ] URL de Render respondiendo, cron activo con historial de 200
- [ ] `CORS_ORIGINS_RAW` con el dominio de Vercel que te dé D

## Lo que no debes hacer

- **No le des a FastAPI acceso a la base de datos.** El frontend persiste; el backend calcula. Meter la `service_role` aquí rompe el modelo de seguridad que A construyó.
- No toques `optimizer.py`, `monte_carlo.py` ni `liability.py`. Están probados y son el corazón del proyecto.
- No cambies los rubros ni el orden de los tickers: hay tres personas codificando contra ese orden.
