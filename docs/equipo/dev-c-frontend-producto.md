# Dev C — React: cuentas, persistencia y pantallas nuevas

## Antes de empezar

Trabajas en local sobre `C:/Users/HP/Documents/Coppel hackathon`, **junto a otros dos agentes que editan el mismo disco al mismo tiempo**.

### Los únicos archivos que puedes escribir

```
frontend/src/auth/               (carpeta entera, tuya)
frontend/src/datos/              (carpeta entera, tuya)
frontend/src/rutas-producto.jsx  (D lo deja como esqueleto; tú lo rellenas)
frontend/src/estilos/producto.css (D lo deja como esqueleto; tú lo rellenas)
frontend/src/views/Acceso.jsx
frontend/src/views/Historial.jsx
frontend/src/views/Comparar.jsx
frontend/src/views/Cuenta.jsx
docs/equipo/evidencia-c.md
```

**Todo lo demás es de solo lectura.** En particular, y por mucho que parezca que lo necesitas:

| No edites | Porque |
|---|---|
| `App.jsx` | D ya te dejó `rutas-producto.jsx` para registrar tus pantallas |
| `styles.css` | D ya te dejó `estilos/producto.css`, importado desde ahí |
| `api/client.js` | D ya lo cableó a `auth/token.js`, que sí es tuyo |
| `package.json` | D ya instaló `@supabase/supabase-js` |
| Cualquier vista existente | No son tuyas |

Si te falta un enganche, **no improvises editando un archivo ajeno**: anótalo en `docs/equipo/evidencia-c.md` y sigue con otra tarea. Un agente sobrescribiendo el archivo de otro es el fallo más caro de este montaje, porque nadie se entera hasta el final.

Lee antes `docs/equipo/00-arquitectura-y-contratos.md`.

No hay GitHub ni pull requests: todo es local. Trabaja en la rama `c/producto`.

### Arranca cuando estas tres cosas existan

1. **A terminó** el esquema y las políticas de RLS, y `frontend/.env` tiene `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
2. **B terminó** la verificación de JWT y `POST /analysis/run`
3. **D terminó** los enganches: existen `rutas-producto.jsx`, `estilos/producto.css` y `auth/token.js` como esqueletos

Eres el único agente con dependencias reales, y dependes de los tres. Si al empezar falta alguna, **no la sustituyas por tu cuenta**: espera o trabaja en lo que sí puedas.

---

Tú conviertes un demo sin estado en un producto con cuentas. Cuatro pantallas nuevas: **Acceso**, **Historial**, **Comparar** y **Cuenta y privacidad**.

---

## Tarea C1 — Cliente y contexto de auth

**Entrega esperada: día 1.**

`frontend/src/datos/supabase.js`:

```javascript
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error("Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en tu .env");
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
});
```

`frontend/src/auth/SesionProvider.jsx` — contexto con `{ sesion, usuario, cargando, entrar, registrar, salir }`.

**El detalle que rompe la app si lo haces mal:** hay que leer la sesión existente *y* suscribirse a los cambios. Con solo una de las dos, o el usuario aparece deslogueado al recargar, o no reacciona al cerrar sesión en otra pestaña.

```javascript
useEffect(() => {
  let vivo = true;
  supabase.auth.getSession().then(({ data }) => {
    if (vivo) { setSesion(data.session); setCargando(false); }
  });
  const { data: sub } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
    setSesion(nuevaSesion);
  });
  return () => { vivo = false; sub.subscription.unsubscribe(); };
}, []);
```

`cargando` importa: sin él la app parpadea a la pantalla de acceso durante un instante en cada recarga, y eso se ve barato.

### Conectar el token con FastAPI

`client.js` ya tiene una función `pedir` centralizada. Añade el encabezado ahí, en un solo lugar:

```javascript
import { supabase } from "../datos/supabase";

async function encabezadosAuth() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

Mézclalo en `opciones.headers` dentro de `pedir`. Y añade el manejo del 401: cuando el backend responda 401, cierra sesión y manda a Acceso, en vez de dejar al usuario en un dashboard que ya no puede refrescar.

---

## Tarea C2 — Pantalla de Acceso

**Entrega esperada: día 1.**

Un solo componente con dos modos, entrar y registrar, alternados por un enlace. No hagas dos pantallas.

- Correo y contraseña, mínimo 8 caracteres
- Al registrar, pide el nombre y pásalo en `options.data.nombre`: el disparador de A lo usa para crear el perfil
- Errores de Supabase traducidos al español. `Invalid login credentials` → *"Correo o contraseña incorrectos."* No muestres el mensaje crudo en inglés.
- Estado de carga en el botón, y deshabilitado mientras envía
- **Botón "Explorar sin cuenta"** que lleva directo al dashboard con los datos demo empaquetados

Ese último punto no es un adorno: un juez con tres minutos no se va a registrar. El recorrido de demo tiene que funcionar sin cuenta, y la cuenta desbloquea guardar e historial.

---

## Tarea C3 — Persistir análisis y PDFs

**Entrega esperada: día 2.**

`frontend/src/datos/analisis.js` con las operaciones. Nunca llames a `supabase` desde una vista: todo pasa por este módulo.

```javascript
import { supabase } from "./supabase";

export async function guardarAnalisis({ etiqueta, pesos, buffer, horizonte, datos, estadoCuentaId = null }) {
  const { data: sesion } = await supabase.auth.getUser();
  const usuario_id = sesion.user.id;

  const { data, error } = await supabase.from("analisis").insert({
    usuario_id,
    estado_cuenta_id: estadoCuentaId,
    etiqueta,
    pesos,
    buffer,
    horizonte,
    inflacion: datos.inflacion,
    optimo: datos.optimo,
    riesgo: datos.riesgo,
    // Columnas derivadas: el historial se lista sin abrir un solo jsonb.
    delta_anualizado: datos.inflacion.delta_anualizado,
    phe: datos.optimo.phe,
    tev: datos.optimo.tev,
    var_95: datos.riesgo.var_95,
  }).select().single();

  if (error) throw new Error("No pudimos guardar tu análisis. Intenta de nuevo.");
  return data;
}

export async function listarAnalisis() {
  const { data, error } = await supabase
    .from("analisis")
    .select("id, etiqueta, delta_anualizado, phe, tev, var_95, creado_en")
    .order("creado_en", { ascending: false });
  if (error) throw new Error("No pudimos cargar tu historial.");
  return data;
}
```

Fíjate que `listarAnalisis` **no pide los `jsonb`**. Para eso están las columnas derivadas: traer tres objetos grandes por fila para pintar una lista es la forma más fácil de que el historial se sienta lento.

No filtres por `usuario_id` en los `select`: **RLS ya lo hace**. Añadirlo a mano no da seguridad extra y da la impresión falsa de que la seguridad vive en el cliente.

### Subida a Storage

La ruta **tiene que empezar con el id del usuario** o la política de A rechaza la subida:

```javascript
export async function subirEstadoCuenta(archivo, emisor) {
  const { data: sesion } = await supabase.auth.getUser();
  const usuario_id = sesion.user.id;
  const ruta = `${usuario_id}/${crypto.randomUUID()}.pdf`;   // el prefijo es obligatorio

  const { error: errSubida } = await supabase.storage
    .from("estados-cuenta")
    .upload(ruta, archivo, { contentType: "application/pdf", upsert: false });
  if (errSubida) throw new Error("No pudimos guardar tu estado de cuenta.");

  const { data, error } = await supabase.from("estados_cuenta").insert({
    usuario_id, ruta_storage: ruta, nombre_archivo: archivo.name,
    emisor, bytes: archivo.size,
  }).select().single();
  if (error) throw new Error("No pudimos registrar tu estado de cuenta.");
  return data;
}
```

Para mostrar o descargar un PDF guardado, **URL firmada de 60 segundos**, nunca pública:

```javascript
const { data } = await supabase.storage.from("estados-cuenta").createSignedUrl(ruta, 60);
```

**Orden del flujo al subir un PDF:** primero `/statement/parse` a FastAPI, y solo si el parseo funciona, sube a Storage y guarda. Al revés acumulas archivos huérfanos de PDFs que ni siquiera se pudieron leer.

---

## Tarea C4 — Pantalla de Historial

**Entrega esperada: día 2.**

Tabla o tarjetas, una por análisis, ordenadas por fecha descendente. Por fila: etiqueta, fecha, Delta de Divergencia, PHE, VaR 95%.

- **Abrir** carga ese análisis en el dashboard: llama al `setDatos` que D expone desde `App.jsx`
- **Renombrar** en línea, `update` sobre `etiqueta`
- **Borrar** con confirmación
- **Estado vacío** con sentido: *"Aún no has guardado ningún análisis. Sube tu estado de cuenta y guarda el resultado para verlo aquí."* con botón a Onboarding
- **Esqueleto de carga**, no una pantalla en blanco

Muestra el Delta con color según signo, reutilizando los tonos de `MetricCard`. Que se lea de un vistazo cuál mes fue peor.

---

## Tarea C5 — Pantalla Comparar

**Entrega esperada: día 2. Es tu pieza de lucimiento.**

Dos selectores de análisis guardado, y una comparación lado a lado. Es la pantalla que demuestra por qué guardar sirve de algo, y la que mejor se ve en un video.

Tres bloques:

1. **Métricas enfrentadas** — Delta, PHE, TEV, VaR. Cada una con su diferencia y una flecha de dirección. Marca cuál ganó.
2. **Canasta** — barras agrupadas por rubro, las dos canastas juntas, para ver en qué cambió el gasto.
3. **Cartera** — los 8 pesos de cada una, con la diferencia en puntos porcentuales.

Todo sale de los `jsonb` que ya guardaste. **Cero llamadas al backend.** Es cómputo puro sobre datos locales, así que es instantáneo aunque Render esté dormido — otra razón por la que luce en demo.

Pídele a D los colores de serie: hay reglas de accesibilidad ya validadas y dos combinaciones prohibidas.

---

## Tarea C6 — Cuenta y privacidad

**Entrega esperada: día 2.**

Estamos guardando estados de cuenta bancarios. Esta pantalla es lo que hace que eso sea defendible, y es un punto que un jurado sí valora.

- Nombre y correo, con el nombre editable sobre `perfiles`
- Lista de estados de cuenta guardados: nombre, emisor, fecha, tamaño, y **cuándo se borrará automáticamente**
- Descargar uno, por URL firmada
- Borrar uno: quita el objeto de Storage **y** la fila
- **Borrar todos mis datos**, con confirmación escribiendo la palabra `BORRAR`
- Un párrafo llano explicando qué guardamos, dónde, y que se borra solo a los 90 días

El borrado tiene que quitar el archivo de Storage además de la fila. Borrar solo la fila deja el PDF vivo en el bucket, y eso convierte esta pantalla en una mentira.

---

## Entregables

- [ ] Sesión que sobrevive a recargar, sin parpadeo
- [ ] 401 del backend cierra sesión y redirige
- [ ] Guardar, listar, renombrar y borrar análisis
- [ ] Subir, descargar y borrar PDFs, con URLs firmadas
- [ ] Las cuatro pantallas con su estado vacío, de carga y de error
- [ ] **Probado con las dos cuentas de A: ninguna ve datos de la otra**
- [ ] `npm run build` sin errores ni advertencias nuevas

## Lo que no debes hacer

- **No edites `App.jsx` ni `styles.css`.** Son de D.
- **No pongas la `service_role` en el frontend.** Solo `anon key`. La `anon` va en el bundle y eso está bien: RLS es lo que protege.
- **No inventes datos.** Sin análisis guardados, estado vacío honesto.
- No llames a `supabase` desde una vista: todo por `src/datos/`.
