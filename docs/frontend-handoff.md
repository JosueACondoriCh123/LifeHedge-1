# LifeHedge — Instrucciones para construir el frontend

> **Para el agente que recibe esto:** el backend ya está terminado, probado (66 tests en verde) y corriendo. Tu trabajo es exclusivamente el frontend. No modifiques nada dentro de `backend/`. Todos los contratos de este documento fueron verificados contra el servidor en vivo el 2026-09-05; están correctos, no los adivines de nuevo.

---

## 1. Qué es LifeHedge

Un motor de inversión guiada por pasivos (*Liability-Driven Investment*) para hogares mexicanos.

La idea: las apps de finanzas personales optimizan rendimiento contra un benchmark genérico e ignoran el pasivo real de una familia, que es el costo futuro de la canasta que *esa* familia consume. Un hogar que gasta 40% en despensa vive una inflación distinta a la que reporta el INPC oficial.

LifeHedge lee un estado de cuenta en PDF, mide la inflación de esa canasta específica contra el INPC de INEGI, y construye la cartera que la cubre.

El producto tiene **cuatro pantallas** y el usuario las recorre en orden:

1. **Onboarding** — sube su estado de cuenta, o usa uno de demostración
2. **Tu inflación** — su inflación personal contra el INPC oficial, y la brecha entre ambas
3. **Cobertura** — la cartera óptima, y cuánto mejor cubre que dejar todo en Cetes
4. **Riesgo** — simulación a 12 meses con VaR y CVaR

Es una entrega de hackathon (Coppel, México). Los jueces abren una URL en vivo. **La interfaz importa tanto como el motor**: es lo único que van a ver.

---

## 2. Levanta el backend antes de escribir una línea

El backend necesita tokens de INEGI y Banxico para datos reales, que todavía no existen. Hay un sembrador de datos sintéticos para que puedas desarrollar sin ellos.

```bash
cd "C:/Users/HP/Documents/Coppel hackathon/backend" && ./.venv/Scripts/python.exe -m scripts.seed_dev_cache
```

```bash
cd "C:/Users/HP/Documents/Coppel hackathon/backend" && ./.venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
```

Comprueba que responde antes de seguir:

```bash
curl -s localhost:8000/health
```

Debe devolver `{"status":"ok","service":"lifehedge"}`. La documentación interactiva de la API vive en `http://localhost:8000/docs` — úsala para inspeccionar respuestas mientras trabajas.

**Notas del entorno:**
- El `python` del PATH apunta a un venv sin pip. Usa siempre `backend/.venv/Scripts/python.exe`.
- Los datos sembrados son **inventados**. Sirven para desarrollar la interfaz. Nunca los uses en una captura de pantalla ni en un video que alguien pueda leer como cifras reales de mercado.
- El backend acepta CORS desde `http://localhost:5173`, que es el puerto por defecto de Vite. No lo cambies.

---

## 3. Contrato de la API

Base URL en desarrollo: `http://localhost:8000`

### Constantes compartidas

**Los seis rubros de gasto**, en este orden exacto, sin acentos y en minúsculas. Aparecen como claves en varios lugares:

```
alimentos  vivienda  transporte  salud  educacion  otros
```

**Los ocho activos**, en orden canónico. `weights` siempre viene en este orden y `assets` te da la etiqueta legible, así que **nunca hardcodees las etiquetas: léelas de `assets`**.

| Índice | ticker | label |
|---|---|---|
| 0 | `UDIBONO` | Udibonos |
| 1 | `CETES28` | Cetes 28d |
| 2 | `NAFTRACISHRS.MX` | IPC |
| 3 | `IVVPESOISHRS.MX` | S&P 500 (MXN) |
| 4 | `GLD` | Oro |
| 5 | `XLE` | Energía |
| 6 | `DBA` | Agro |
| 7 | `MXN=X` | USD/MXN |

**Todos los valores numéricos son fracciones decimales, no porcentajes.** `0.0504` significa 5.04%. Multiplica por 100 al mostrar.

---

### `GET /health`

Sin cuerpo. Úsalo para el gate de arranque.

```json
{ "status": "ok", "service": "lifehedge" }
```

---

### `POST /statement/parse`

`multipart/form-data`. **El campo se llama `archivo`** (no `file`).

Respuesta:

```json
{
  "emisor": "BBVA",
  "transacciones": [
    { "fecha": "05/01/2026", "descripcion": "OXXO SUC 4412 CULIACAN", "monto": 480.0, "rubro": "alimentos" }
  ],
  "pesos": { "alimentos": 0.31, "vivienda": 0.42, "transporte": 0.09, "salud": 0.04, "educacion": 0.11, "otros": 0.03 }
}
```

`emisor` puede ser `BBVA`, `SANTANDER`, `BANORTE`, `HSBC`, `CITIBANAMEX`, `SCOTIABANK` o `GENERICO`. Los montos negativos son abonos: vienen en `transacciones` pero no cuentan para `pesos`.

Devuelve **422** si el PDF es un escaneo, está corrupto, o no tiene movimientos reconocibles. El mensaje ya viene redactado en español y es apto para mostrarlo tal cual al usuario.

Hay tres PDFs de prueba en `backend/data/samples/`: `bbva_familia.pdf`, `santander_joven.pdf`, `banorte_hogar.pdf`.

---

### `POST /inflation/personal`

```json
{ "pesos": { "alimentos": 0.35, "vivienda": 0.30, "transporte": 0.15, "salud": 0.08, "educacion": 0.07, "otros": 0.05 } }
```

Respuesta:

```json
{
  "dates": ["2018-02", "2018-03"],
  "personal": [0.0041, 0.0038],
  "general": [0.0039, 0.0040],
  "delta_anualizado": 0.00065,
  "personal_anual": 0.0504,
  "general_anual": 0.0497,
  "volatilidad_anual": 0.0061,
  "stale": false,
  "as_of": "2026-09-05T20:41:00+00:00"
}
```

`dates`, `personal` y `general` tienen la misma longitud (unos 71 puntos) y son **variaciones mensuales**. `delta_anualizado` es la métrica estrella: `personal_anual − general_anual`.

Devuelve 422 si falta un rubro, si hay pesos negativos, o si suman cero.

---

### `POST /portfolio/optimize`

```json
{ "pesos": { "...": 0.35 }, "buffer": 0.10 }
```

`buffer` es la fracción mínima en Cetes, entre 0 y 1. Por defecto 0.10.

Respuesta:

```json
{
  "assets": [{ "ticker": "UDIBONO", "label": "Udibonos" }],
  "weights": [0.8889, 0.1041, 0.0001, 0.0007, 0.0019, 0.0012, 0.0001, 0.0029],
  "tev": 0.0024,
  "phe": 0.8101,
  "benchmark_cetes": { "weights": [0, 1, 0, 0, 0, 0, 0, 0], "tev": 0.0054, "phe": 0.0 },
  "frontera": [{ "lam": 0.0, "tev": 0.0054, "phe": 0.0, "vol_cartera": 0.0021 }],
  "stale": false,
  "as_of": "2026-09-05T20:41:00+00:00"
}
```

- `weights` — 8 números que suman 1, en el orden canónico
- `phe` — *Personal Hedge Efficiency*: fracción de la varianza de tu inflación que la cartera neutraliza, entre 0 y 1. **Es el número grande del producto.**
- `tev` — *Tracking Error Volatility*: desajuste anualizado contra tu canasta. Menor es mejor.
- `benchmark_cetes` — las mismas métricas para una cartera 100% Cetes. **El contraste entre `phe` y `benchmark_cetes.phe` es el argumento de venta entero.** Con los datos sembrados da 81% contra 0%.
- `frontera` — 12 puntos que trazan el trade-off riesgo/cobertura

Devuelve 422 si el buffer sale del rango o si el problema es infactible.

---

### `POST /risk/simulate`

```json
{ "pesos": { "...": 0.35 }, "weights": [0.8889, 0.1041, 0.0001, 0.0007, 0.0019, 0.0012, 0.0001, 0.0029], "horizonte": 12 }
```

`weights` son los 8 que te devolvió `/portfolio/optimize`. `horizonte` va de 1 a 60 meses.

Respuesta:

```json
{
  "percentiles": {
    "p5":  [0.998, 0.996],
    "p25": [0.999, 0.998],
    "p50": [1.000, 1.001],
    "p75": [1.001, 1.003],
    "p95": [1.003, 1.006]
  },
  "var_95": 0.0075,
  "cvar_95": 0.0106,
  "media_final": 1.0041,
  "stale": false,
  "as_of": "2026-09-05T20:41:00+00:00"
}
```

Cada percentil es un arreglo de largo `horizonte`. **El valor es la razón cartera/canasta:** `1.00` significa que conservas exactamente tu poder adquisitivo; `0.97` que perdiste 3%.

`var_95` y `cvar_95` son **pérdidas positivas**. Por construcción `cvar_95 >= var_95`. Preséntalas como pérdida, con signo o color de alerta.

---

### Errores — leer con cuidado

Hay **dos formas distintas** de error 422 y tienes que manejar ambas, o le mostrarás `[object Object]` al usuario:

```jsonc
// 422 de nuestra lógica: detail es un string listo para mostrar
{ "detail": "El PDF no contiene texto seleccionable; parece un escaneo." }

// 422 de validación de Pydantic: detail es un arreglo de objetos
{ "detail": [{ "type": "greater_than_equal", "loc": ["body", "buffer"], "msg": "..." }] }
```

Otros códigos:

| Código | Significado | Qué hacer |
|---|---|---|
| 503 | Sin datos de mercado ni INPC | Mensaje de reintento; el `detail` ya está en español |
| 500 | Error inesperado | Trae `correlation_id`; muestra un mensaje genérico |

**Campos `stale` y `as_of`:** cuando una fuente externa se cae, el backend sirve el último snapshot y marca `stale: true` en vez de fallar. Cuando eso pase, muestra un badge discreto con la fecha de `as_of`. No es un error: la app sigue siendo plenamente usable.

---

## 4. Stack y dirección de diseño

**Stack:** React 19 + Vite (JavaScript, sin TypeScript), Recharts para gráficas. Sin router, sin librería de estado: la navegación entre las cuatro pantallas es un `useState` en `App.jsx`.

**Dirección visual.** Esto lo juzga un panel en una sala, probablemente proyectado. Apunta a **terminal financiera sobria**, no a fintech pastel:

- Fondo claro casi neutro, tinta oscura, un solo acento verde profundo y un rojo reservado para alertas
- Números grandes, tabulares (`font-variant-numeric: tabular-nums`) para que no bailen al actualizarse
- Espacio en blanco generoso; una idea dominante por pantalla
- Nada de emojis en la interfaz, nada de gradientes decorativos, nada de sombras difusas
- Todo el texto visible en español de México

**La jerarquía manda.** En cada pantalla hay un número que importa más que el resto; hazlo visualmente inevitable:

| Pantalla | El número |
|---|---|
| Tu inflación | Delta de Divergencia |
| Cobertura | PHE, junto al de solo-Cetes |
| Riesgo | CVaR 95% |

---

## Paso 1 — Cimientos, capa de conexión y shell

**Objetivo:** una app que arranca, sabe hablar con el backend, y nunca muestra una pantalla en blanco.

### Archivos

```
frontend/
  package.json          vite.config.js       index.html
  .env.example
  src/
    main.jsx            App.jsx              styles.css
    api/client.js
    data/demoData.json
    components/MetricCard.jsx
    components/StaleBadge.jsx
    components/EstadoCarga.jsx
```

### 1.1 Crear el proyecto

```bash
cd "C:/Users/HP/Documents/Coppel hackathon" && npm create vite@latest frontend -- --template react
```

```bash
cd "C:/Users/HP/Documents/Coppel hackathon/frontend" && npm install && npm install recharts
```

Borra el CSS y los assets de ejemplo que trae la plantilla.

### 1.2 La capa de conexión

Crea `src/api/client.js` exactamente así. Es la única parte del frontend que toca la red, y maneja las dos formas de error 422.

```javascript
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const TIEMPO_MAX_WARMUP_MS = 90_000;
const INTERVALO_WARMUP_MS = 2_000;

function mensajeDeError(cuerpo) {
  const detail = cuerpo?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    // Error de validación de Pydantic: arreglo de objetos, no apto para mostrar tal cual.
    return "Revisa los datos enviados: alguno está fuera del rango permitido.";
  }
  return "El motor no pudo procesar la solicitud.";
}

async function pedir(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`${BASE}${ruta}`, opciones);
  } catch {
    throw new Error("No pudimos contactar al motor. Revisa tu conexión.");
  }

  if (!respuesta.ok) {
    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      // respuesta sin JSON
    }
    throw new Error(mensajeDeError(cuerpo));
  }
  return respuesta.json();
}

function json(cuerpo) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  };
}

/** Espera a que el backend responda. Devuelve false si nunca despertó. */
export async function esperarBackend() {
  const limite = Date.now() + TIEMPO_MAX_WARMUP_MS;
  while (Date.now() < limite) {
    try {
      const respuesta = await fetch(`${BASE}/health`);
      if (respuesta.ok) return true;
    } catch {
      // el servicio sigue despertando
    }
    await new Promise((r) => setTimeout(r, INTERVALO_WARMUP_MS));
  }
  return false;
}

export const getUniverse = () => pedir("/market/universe");

export function parseStatement(file) {
  const datos = new FormData();
  datos.append("archivo", file); // el backend espera este nombre exacto
  return pedir("/statement/parse", { method: "POST", body: datos });
}

export const getInflacion = (pesos) => pedir("/inflation/personal", json({ pesos }));

export const optimizar = (pesos, buffer = 0.1) =>
  pedir("/portfolio/optimize", json({ pesos, buffer }));

export const simular = (pesos, weights, horizonte = 12) =>
  pedir("/risk/simulate", json({ pesos, weights, horizonte }));

/** Las tres llamadas que pueblan el dashboard. simular depende de optimizar. */
export async function calcularTodo(pesos, buffer = 0.1) {
  const [inflacion, optimo] = await Promise.all([
    getInflacion(pesos),
    optimizar(pesos, buffer),
  ]);
  const riesgo = await simular(pesos, optimo.weights, 12);
  return { inflacion, optimo, riesgo };
}
```

`.env.example`:

```
VITE_API_URL=http://localhost:8000
```

Copia a `.env` para desarrollo.

### 1.3 Datos demo empaquetados

Con el backend corriendo, captura respuestas reales para que la app tenga algo que pintar antes de que el servidor responda. Guarda en `src/data/demoData.json` un objeto con esta forma:

```json
{ "pesos": { }, "inflacion": { }, "optimo": { }, "riesgo": { } }
```

Genéralo así:

```bash
cd "C:/Users/HP/Documents/Coppel hackathon" && backend/.venv/Scripts/python.exe -c "
import json, urllib.request
pesos = {'alimentos':0.35,'vivienda':0.30,'transporte':0.15,'salud':0.08,'educacion':0.07,'otros':0.05}
def post(ruta, cuerpo):
    req = urllib.request.Request('http://localhost:8000'+ruta, data=json.dumps(cuerpo).encode(), headers={'Content-Type':'application/json'})
    return json.loads(urllib.request.urlopen(req).read())
inflacion = post('/inflation/personal', {'pesos': pesos})
optimo = post('/portfolio/optimize', {'pesos': pesos, 'buffer': 0.10})
riesgo = post('/risk/simulate', {'pesos': pesos, 'weights': optimo['weights'], 'horizonte': 12})
json.dump({'pesos':pesos,'inflacion':inflacion,'optimo':optimo,'riesgo':riesgo}, open('frontend/src/data/demoData.json','w',encoding='utf-8'), ensure_ascii=False)
print('demoData.json escrito')
"
```

### 1.4 Componentes compartidos

- **`MetricCard({ etiqueta, valor, nota, tono })`** — tarjeta con etiqueta pequeña en mayúsculas, número grande tabular, y nota opcional. `tono` es `"neutro" | "positivo" | "alerta"` y sólo cambia el color de un borde izquierdo de 3px.
- **`StaleBadge({ stale, asOf })`** — si `stale` es falso no renderiza nada. Si es cierto, muestra `Datos guardados del {fecha}` con `as_of` formateado en `es-MX`.
- **`EstadoCarga({ mensaje })`** — un esqueleto o spinner sobrio, reutilizable mientras se resuelven las llamadas.

### 1.5 El shell y el gate de arranque

`App.jsx` mantiene todo el estado de la aplicación:

```javascript
const [backendListo, setBackendListo] = useState(false);
const [pesos, setPesos] = useState(demoData.pesos);
const [datos, setDatos] = useState(demoData);   // { inflacion, optimo, riesgo }
const [vista, setVista] = useState("onboarding");
```

En `useEffect`, llama `esperarBackend().then(setBackendListo)`.

**La regla que no puedes romper:** la app renderiza inmediatamente con `demoData`, aunque el backend esté dormido. Mientras `backendListo` sea falso, muestra un aviso — *"Calentando el motor cuantitativo…"* — sin bloquear la interfaz. En producción el backend vive en el plan gratuito de Render, que duerme a los 15 minutos y tarda hasta 60 segundos en despertar. Si un juez abre la URL en frío y ve una pantalla en blanco, perdiste.

Navegación: pestañas para las tres vistas del dashboard, más un enlace para volver a onboarding y cambiar de estado de cuenta. Las pestañas sólo aparecen una vez que el usuario salió de onboarding.

### Verificación del Paso 1

```bash
cd "C:/Users/HP/Documents/Coppel hackathon/frontend" && npm run dev
```

Con el backend **apagado**, abre `http://localhost:5173`: debes ver la cabecera y el aviso de calentamiento, sin pantalla en blanco y sin errores rojos en consola. Enciende el backend: el aviso desaparece solo en menos de 3 segundos.

---

## Paso 2 — Pantallas 1 y 2: Onboarding e inflación personal

**Objetivo:** el usuario entrega su gasto y ve la brecha entre su inflación y la oficial.

### Archivos

```
src/components/Dropzone.jsx
src/views/Onboarding.jsx
src/views/Inflacion.jsx
```

### 2.1 Pantalla 1 — Onboarding

Es la primera impresión. Debe explicar el producto en una frase y ofrecer dos caminos.

**Contenido:**
- Título y una línea de propuesta: *"LifeHedge lee tu estado de cuenta, mide la inflación de tu canasta real y construye la cartera que la cubre."*
- **Dropzone** que acepta arrastrar o hacer clic, sólo `application/pdf`
- Una nota de privacidad honesta: el archivo se procesa y se descarta, no se guarda
- **Botón "Usar un estado de cuenta demo"**, con el mismo peso visual que el dropzone

**Conexiones:**

| Acción | Llamada | Después |
|---|---|---|
| Suelta un PDF | `parseStatement(file)` → luego `calcularTodo(parsed.pesos)` | Guarda pesos y datos, navega a *Tu inflación* |
| Clic en demo | `calcularTodo(demoData.pesos)` | Igual, con los pesos demo |

**Manejo de errores, que es donde se gana o se pierde esta pantalla:**
- Mientras carga, deshabilita ambos caminos y muestra progreso. El encadenamiento son cuatro llamadas; puede tardar varios segundos.
- Si `parseStatement` da 422, muestra el mensaje del backend **dentro del dropzone**, en rojo, y deja el botón de demo intacto y visible. El usuario debe poder seguir adelante sin frustrarse.
- Si el camino demo falla porque el backend está caído, **cae silenciosamente a `demoData` empaquetado** y navega igual. La demo nunca se queda trabada.

### 2.2 Pantalla 2 — Tu inflación

El gancho emocional del producto. Aquí el usuario descubre que su inflación no es la que sale en las noticias.

**Contenido, de arriba a abajo:**

1. **Cuatro tarjetas de métrica** desde la respuesta de `/inflation/personal`:

   | Etiqueta | Valor | Tono |
   |---|---|---|
   | Tu inflación anual | `personal_anual` | neutro |
   | INPC oficial | `general_anual` | neutro |
   | **Delta de Divergencia** | `delta_anualizado` | `alerta` si es positivo, `positivo` si es negativo |
   | Volatilidad de tu canasta | `volatilidad_anual` | neutro |

   El Delta lleva una nota que lo interpreta: si es positivo, *"Pagas más inflación que el promedio nacional"*; si es negativo, lo contrario. Dale más peso visual que a las otras tres.

2. **Gráfica de líneas** (Recharts `LineChart`) con `dates` en el eje X y dos series: `personal` (acento rojo) y `general` (azul apagado). Multiplica por 100 y pon `unit="%"`. Con ~71 puntos usa `minTickGap={40}` y `dot={false}` para que no se sature.

3. **Desglose de la canasta.** Los seis rubros con su peso, como barras horizontales proporcionales. Ordénalos de mayor a menor: se lee mucho mejor que en orden alfabético.

4. **`StaleBadge`** en el encabezado.

---

## Paso 3 — Pantallas 3 y 4: Cobertura y riesgo

**Objetivo:** mostrar la cartera y demostrar, con números, que es mejor que la alternativa obvia.

### Archivos

```
src/views/Cobertura.jsx
src/views/Riesgo.jsx
```

### 3.1 Pantalla 3 — Terminal de cobertura

Desde la respuesta de `/portfolio/optimize`.

**Contenido:**

1. **Tres tarjetas**, y la comparación es el corazón de la pantalla:

   | Etiqueta | Valor | Nota |
   |---|---|---|
   | Eficiencia de cobertura | `phe` | "De la varianza de tu inflación, neutralizada" |
   | Tracking error | `tev` | "Desajuste anualizado contra tu canasta" |
   | Solo Cetes (referencia) | `benchmark_cetes.phe` | "LifeHedge cubre X puntos más" |

   Con los datos sembrados esto da **81.0% contra 0.0%**. Es la diapositiva que gana el hackathon: dale el espacio que merece. Considera ponerlas lado a lado en una comparación explícita en vez de tres tarjetas sueltas.

2. **Gráfica de barras** con los 8 pesos. Recorre `assets` en paralelo a `weights`, usa `assets[i].label` como etiqueta. Un color distinto por barra.

3. **Tabla de la cartera**: activo, ticker, peso. Alinea el peso a la derecha con cifras tabulares. Como algunos pesos son casi cero (`0.0001`), agrupa todo lo menor a 0.5% en una fila *"Otros"* o muéstralo como `<0.1%` en vez de `0.01%`.

4. **Frontera de cobertura** (opcional pero valioso): `ScatterChart` con `tev` en X y `phe` en Y desde el arreglo `frontera`, marcando dónde cae la cartera elegida. Es lo que convence a un juez con formación cuantitativa de que hay un optimizador real detrás.

### 3.2 Pantalla 4 — Riesgo a 12 meses

Desde la respuesta de `/risk/simulate`.

**Contenido:**

1. **Tres tarjetas:**

   | Etiqueta | Valor | Nota | Tono |
   |---|---|---|---|
   | VaR 95% | `var_95` | "Pérdida de poder adquisitivo en el peor 5% de escenarios" | alerta |
   | CVaR 95% | `cvar_95` | "Pérdida promedio dentro de ese peor 5%" | alerta |
   | Escenario medio | `media_final - 1` | "Poder adquisitivo ganado o perdido al cierre" | según signo |

2. **Fan chart.** Es la gráfica más difícil del proyecto; léelo con cuidado.

   Recharts apila las áreas de un mismo `stackId`, así que **no puedes pasarle los percentiles directamente**: tienes que transformarlos a diferencias.

   ```javascript
   const p = datos.percentiles;
   const serie = p.p50.map((_, i) => ({
     mes: `M${i + 1}`,
     base: p.p5[i],                  // área invisible que empuja las bandas hacia arriba
     banda_baja: p.p25[i] - p.p5[i], // p5 → p25
     banda_alta: p.p95[i] - p.p25[i],// p25 → p95
     mediana: p.p50[i],
   }));
   ```

   Pinta `base` con `fill="transparent"` y sin leyenda, las dos bandas con verdes translúcidos de distinta intensidad, y la mediana como `Line` sólida encima. El eje Y no debe empezar en cero: usa `domain={["auto", "auto"]}`, porque los valores rondan 1.00 y forzar el cero aplana la gráfica hasta volverla inútil.

3. **Una línea de referencia horizontal en 1.00**, etiquetada *"conservas tu poder adquisitivo"*. Sin ella el eje no significa nada para el lector.

4. **Nota al pie** explicando el método: *"1000 trayectorias con proceso de saltos de Merton. El eje muestra la razón entre tu cartera y tu canasta: 1.00 significa que conservas exactamente tu poder adquisitivo."*

---

## Paso 4 — Interactividad, robustez y entrega

**Objetivo:** que la aplicación aguante que la manipulen en vivo y esté lista para desplegarse.

### 4.1 Controles que recalculan

Hasta aquí el dashboard es estático. Estos dos controles lo vuelven un producto, y son lo que un juez va a querer tocar:

**Slider de buffer de efectivo** en la pantalla de Cobertura, de 0% a 50%. Al soltarlo, vuelve a llamar `optimizar(pesos, buffer)` y luego `simular`. Aplica *debounce* de unos 300 ms y muestra un estado de carga sutil sin desmontar la gráfica — que no parpadee toda la pantalla.

**Edición de la canasta** en la pantalla de Tu inflación. Deja ajustar los seis pesos con sliders o campos numéricos, renormalizando a 100%. Al confirmar, vuelve a correr `calcularTodo`. Esto demuestra en vivo la tesis del producto: al subir el peso de alimentos, el Delta se mueve y la cartera óptima cambia.

Añade también un **selector de horizonte** (12 / 24 / 36 meses) en la pantalla de Riesgo, que rellama `simular`.

### 4.2 Robustez

- **Errores por pantalla:** si una llamada falla estando ya en el dashboard, muestra el error dentro de esa pantalla con un botón de reintentar. No tires al usuario de vuelta a onboarding ni pierdas lo que ya estaba viendo.
- **`stale`:** el `StaleBadge` debe aparecer en las tres vistas del dashboard.
- **Responsive:** funciona en 1280px de ancho, que es lo típico proyectado, y no se rompe en 768px. Las gráficas van dentro de `ResponsiveContainer`. Las tablas anchas dentro de un contenedor con `overflow-x: auto`; el `body` nunca debe tener scroll horizontal.
- **Accesibilidad mínima:** el dropzone se activa con teclado, las gráficas tienen texto alternativo o una tabla equivalente, y el contraste pasa AA.
- **Revisa la consola del navegador** y déjala sin advertencias. Recharts se queja si le pasas claves que no existen.

### 4.3 Verificación antes de dar por terminado

Corre esto y confirma cada punto contra la aplicación real, no de memoria:

```bash
cd "C:/Users/HP/Documents/Coppel hackathon/frontend" && npm run build
```

- [ ] El build termina sin errores
- [ ] Con el backend apagado, la app carga y muestra el aviso de calentamiento; nunca una pantalla en blanco
- [ ] "Usar un estado de cuenta demo" puebla las tres vistas
- [ ] Subir `backend/data/samples/bbva_familia.pdf` produce una canasta **distinta** a la del demo
- [ ] Subir `backend/data/samples/santander_joven.pdf` produce una canasta distinta a la de BBVA
- [ ] Subir un archivo que no sea PDF muestra un mensaje en español dentro del dropzone, y el botón de demo sigue funcionando
- [ ] Las cuatro pantallas pintan sin advertencias en la consola
- [ ] En Cobertura, la eficiencia de LifeHedge supera visiblemente a la de solo-Cetes
- [ ] Mover el slider de buffer cambia los pesos y las métricas
- [ ] Editar la canasta cambia el Delta de Divergencia
- [ ] El fan chart muestra bandas que se abren con el tiempo, no líneas planas
- [ ] A 768px de ancho nada se desborda ni aparece scroll horizontal

### 4.4 Notas para el despliegue

El frontend va a **Vercel** con Root Directory `frontend` y framework Vite. La variable `VITE_API_URL` apunta a la URL del backend en Render, **sin diagonal final**.

El backend ya trae `CORS_ORIGINS_RAW` como variable de entorno: el dominio de Vercel tiene que agregarse ahí o el navegador bloqueará todas las llamadas. Si al abrir la URL de producción las gráficas se quedan con los datos demo empaquetados, casi siempre es eso — revísalo en la pestaña Network antes de buscar en otro lado.

---

## Lo que no debes hacer

- **No modifiques `backend/`.** Si crees que encontraste un bug del backend, repórtalo; no lo parches desde el frontend.
- **No inventes datos.** Todos los números en pantalla salen de la API o del `demoData.json` generado desde ella. Nada hardcodeado que parezca real.
- **No hardcodees las etiquetas de activos.** Léelas de `assets`, que viene en cada respuesta.
- **No commitees `data/cache/`** ni presentes los datos sembrados como reales en un video o captura.
- **No cambies el puerto de Vite** de 5173: el CORS del backend lo espera.
