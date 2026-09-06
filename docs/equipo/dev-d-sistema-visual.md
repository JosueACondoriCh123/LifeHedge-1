# Dev D — Repositorio, sistema visual, shell y panel de acoplamiento

> Lee antes `00-arquitectura-y-contratos.md`.

**Posee:** `frontend/src/styles.css`, `frontend/src/App.jsx`, `frontend/src/components/`, `frontend/src/graficas.js`, `frontend/src/analitica.js`, y el despliegue en Vercel.

Soy el dueño de las dos zonas compartidas del frontend, así que mi primera obligación es **desbloquear a los demás rápido**: repositorio, tokens y shell de navegación tienen que estar el día 1 o A, B y C trabajan a ciegas.

---

## Tarea D0 — Repositorio propio ⚠ bloquea a los tres

**Entrega esperada: primera hora del día 1. Antes que cualquier otra cosa.**

Hay un problema serio. La raíz del repo git actual es `C:/Users/HP/Documents`, no la carpeta del proyecto: abarca el Obsidian Vault, otros hackathons y todas las carpetas personales del dueño. **No hay remotos.** Si alguien hace `git push`, publica todo eso.

El plan, todo local —no hay GitHub y no hace falta, porque los tres agentes trabajan sobre esta misma máquina—:

1. Repo nuevo con raíz en `Coppel hackathon/`, conservando los 11 commits de historia del backend. **Sin borrar nada del repo actual de `Documents`:** la operación es aditiva y reversible.
2. `.gitignore` en la raíz: `.venv/`, `node_modules/`, `.env`, `backend/data/cache/`, `dist/`, `.commandcode/`.
3. **Commitear el frontend**, que hoy está sin versionar: 2684 líneas de trabajo sin red de seguridad. Con tres agentes a punto de escribir en paralelo, esto es lo primero.
4. `README.md` en la raíz: qué es, cómo levantarlo, y enlaces a los briefs.

El objetivo no es publicar: es que exista un punto de restauración antes de que tres procesos empiecen a escribir a la vez.

---

## Tarea D1.5 — Enganches para C ⚠ bloquea a C

**Entrega esperada: día 1, junto con D1 y D2.**

C no puede tocar `App.jsx`, `styles.css`, `client.js` ni `package.json` sin arriesgarse a sobrescribir mi trabajo. Así que creo los puntos de extensión **antes** de que arranque, y quedan cableados desde el primer momento:

| Archivo que creo | Qué hace | Quién lo rellena |
|---|---|---|
| `src/rutas-producto.jsx` | Exporta un arreglo de rutas que `App.jsx` importa y registra | C |
| `src/estilos/producto.css` | Importado desde `styles.css`, con los tokens ya disponibles | C |
| `src/auth/token.js` | Exporta `encabezadosAuth()`; `client.js` ya la llama en `pedir` | C |

Los tres nacen como esqueletos que compilan y no rompen nada: rutas vacías, CSS vacío, y `encabezadosAuth` devolviendo `{}`. Cuando C los rellena, todo se conecta solo.

Además instalo `@supabase/supabase-js` para que C nunca toque `package.json`.

**Le entrego a C las firmas exactas** de las tres cosas en cuanto existan.

---

## Tarea D1 — Tokens de diseño ⚠ bloquea a C

**Entrega esperada: día 1.**

El sistema visual está sin construir, y es medible: solo 12 variables CSS, todas de color. **Cero tokens de tipografía y espaciado** —27 tamaños de fuente ad hoc, ~19 espaciados que mezclan múltiplos de 4 con 6, 7, 10, 14, 18, 22, 26, 30 y 42—. En 1074 líneas de CSS hay **0 sombras, 0 degradados, 0 transforms, 1 sola declaración `transition` y 1 keyframe**. La interfaz es estática.

Construyo la escala completa en `:root`: color de interfaz, estado semántico, series de datos, tipografía de 10 pasos, espaciado base 4, cuatro radios, tres niveles de elevación, y duraciones con curva. Más un bloque `prefers-reduced-motion`.

**Se lo paso a C en cuanto exista**, con la tabla de equivalencias, para que sus cuatro pantallas nazcan con el sistema puesto y no haya que repintarlas el día 3.

### La paleta de gráficas está rota, y no es opinión

Corrí el validador de paletas sobre los 8 colores que usa `Cobertura.jsx`: **falla 4 de 5 comprobaciones.** El verde de marca queda fuera de la banda de luminosidad, 7 de 8 colores están bajo el piso de croma —leen como gris—, el peor par adyacente tiene ΔE 4.8 en deuteranopía y el piso de visión normal es 9.6 contra un mínimo de 15. Además `#0f5132` difiere un dígito de `--acento` `#0e5132`: una errata.

Sustitutos verificados, cada combinación que aparece junta en una gráfica pasa las cinco:

| Gráfica | Series |
|---|---|
| Inflación | `#c0392b` personal · `#2a78d6` INPC |
| Acoplamiento | `#2a78d6` positiva · `#c0392b` negativa · `#9aa3ad` punto medio |
| Cobertura, barras | `#2a78d6` activos · `#eb6834` colchón |
| Comparar (para C) | `#2a78d6` análisis A · `#eb6834` análisis B |

**Dos reglas que nadie puede violar:**

1. **`#c0392b` y `#eb6834` nunca en la misma gráfica.** Juntos dan ΔE 13.2 en visión normal, bajo el piso de 15.
2. **El verde de marca `#0e5132` nunca es color de serie.** Fuera de banda de luminosidad, y colisiona con el rojo en protanopia con ΔE 2.5. Sigue siendo el color de interfaz: botones, pestañas, foco.

Elimino además la paleta categórica de 8 colores de las barras de cartera: las barras ya se identifican por su etiqueta de eje, así que ocho colores no aportan identidad y solo reprueban accesibilidad.

---

## Tarea D2 — Shell de navegación ⚠ bloquea a C

**Entrega esperada: día 1.**

Hoy `App.jsx` navega con una cadena de seis ternarios `vista === "x" ? <Vista/> : null` y guarda trece `useState`. Con cuatro pantallas más eso es insostenible, y además C y yo estaríamos editando el mismo archivo todo el tiempo.

Reestructuro en un shell con registro de rutas, para que **C añada sus pantallas registrándolas, sin tocar `App.jsx`**:

- Rutas separadas en públicas (Acceso, Onboarding) y privadas
- Guardia de sesión que manda a Acceso si no hay sesión, respetando el `cargando` de C para que no parpadee
- Barra de navegación con las secciones agrupadas: *Análisis* (Inflación, Acoplamiento, Cobertura, Riesgo), *Tu cuenta* (Historial, Comparar, Cuenta), y Alertas y Reporte como acciones de cabecera
- `setDatos` expuesto por contexto, que es lo que C necesita para que "Abrir" desde Historial cargue un análisis en el dashboard

Le entrego a C la firma exacta del registro de rutas y del contexto en cuanto esté.

---

## Tarea D3 — Panel de acoplamiento

**Entrega esperada: día 2. Es la pieza que hace visible la matemática.**

Descubrí que `getUniverse()` está exportada en `client.js` y **nunca se llama**. `GET /market/universe` devuelve unos 110 meses de retornos mensuales para los 8 activos, y está completamente sin usar.

Alineándolos por fecha con la serie de inflación personal se puede calcular en el cliente, sin tocar el backend, el vector de acoplamiento σ_AL: **exactamente lo que mueve al optimizador**.

El panel, en pestaña propia entre Inflación y Cobertura:

- Barras divergentes horizontales con la correlación de cada activo contra tu canasta, ordenadas
- Tabla con ρ, σ_AL crudo, volatilidad mensual, y **el peso que el optimizador le asignó** — el juez ve la correlación al lado de la decisión, y el mecanismo se cierra ante sus ojos
- Pie de método citando el cálculo: fechas comunes, centrado, denominador `t−1`, y el número exacto de meses en común

La barra codifica la correlación y no σ_AL porque σ_AL es del orden de 1e-5, ilegible como barra; pero el número crudo aparece en tooltip y tabla. Legibilidad y rigor sin elegir entre los dos.

La narrativa completa queda: *qué pagas → por qué estos activos → cuánto de cada uno → qué puede salir mal*.

---

## Tarea D4 — Rigor visual en las vistas existentes

**Entrega esperada: día 2.**

- **Arreglar una gráfica que miente.** Al mover el slider de buffer, las gráficas se quedan con datos viejos sin atenuar ni avisar. Peor: `App.jsx` hace dos `setDatos` secuenciales, así que hay una ventana con `optimo` nuevo y `riesgo` viejo, y `cambiarHorizonte` lee `datos.optimo.weights`. Si un juez toca buffer y horizonte seguido, la simulación corre con pesos de otra optimización.
- Envoltorio `PanelGrafica` que atenúa el contenido y superpone "Recalculando…" durante los recálculos
- Tooltip propio del sistema: hoy hay uno personalizado y tres por defecto de Recharts, sin una sola regla CSS `.recharts-*`, así que salen con estilo ajeno
- Leyendas: **hoy no hay ni una** en toda la app
- Elevación, hover en tarjetas y filas de tabla, y `:active` en los controles, que hoy no existe en ninguno
- Sparklines en las tarjetas de métrica

---

## Tarea D5 — Despliegue e integración

**Entrega esperada: día 2 y día 3.**

Frontend en Vercel con Root Directory `frontend`. Variables: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Le paso el dominio a B para `CORS_ORIGINS_RAW` y a A para las URLs de redirección de auth. **Si al abrir producción las llamadas fallan, casi siempre es CORS** — revisar la pestaña Network antes de buscar en otro lado.

El día 3 integro las cuatro ramas, ejecuto el recorrido completo con dos cuentas, y congelo.

---

## Prioridad si el tiempo se acaba

D0 → D1 → D2 son intocables: bloquean a tres personas. Después D4 (una gráfica que miente es el defecto que un juez técnico sí nota) y D3 (es el diferenciador). D5 al final.

Lo primero que recorto son las sparklines y los tooltips de las gráficas secundarias.

## Fuera de alcance

Modo oscuro, fuentes web, heatmap de correlación 8×8, y tests de frontend. Las razones están en el plan aprobado de mejora visual.
