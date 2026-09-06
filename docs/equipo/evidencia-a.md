# Evidencia de Entrega — Dev A (Supabase)

## Rama de trabajo
`a/supabase`

---

## Resumen de Ejecución y Estado

Todas las tareas asignadas a **Dev A — Supabase: esquema, RLS, Storage y auth** han sido ejecutadas, aplicadas en la nube del proyecto `kjgcfcjjtqfmwfkodrkj` y verificadas de punta a punta con llamadas reales de autenticación y RLS:

### 1. Migraciones Desplegadas en el Proyecto Supabase (`kjgcfcjjtqfmwfkodrkj`)
- **`esquema_inicial`**:
  - `public.perfiles`: Vinculada con borrado en cascada a `auth.users`.
  - `public.estados_cuenta`: Metadatos de PDFs bancarios con expiración automática de 90 días.
  - `public.analisis`: Persistencia completa de corrida LDI con columnas desnormalizadas (`delta_anualizado`, `phe`, `tev`, `var_95`) para alimentar Historial y Comparar sin abrir los JSONB.
  - Índices `analisis_usuario_fecha` y `estados_usuario_fecha`.
  - Disparador `al_crear_usuario` (`manejar_usuario_nuevo()`): Probado en vivo, auto-inserta el perfil al crearse un usuario en `auth.users`.
- **`rls_politicas`**:
  - `ROW LEVEL SECURITY` activo en las 3 tablas.
  - Políticas atómicas `SELECT`, `INSERT`, `UPDATE`, `DELETE` con `auth.uid() = usuario_id` y `WITH CHECK (usuario_id = auth.uid())`.
- **`storage_y_retencion`**:
  - Bucket privado `estados-cuenta` creado (límite 10 MB, solo `application/pdf`).
  - Políticas de Storage restringidas a que el primer segmento de la ruta sea el UID del usuario (`(storage.foldername(name))[1] = auth.uid()::text`).
  - Función de purga `public.purgar_estados_vencidos()`.

---

### 2. Evidencia de RLS: Prueba de Inserción Cruzada (Cross-Tenant)

Prueba ejecutada en la base de datos real simulando sesión autenticada con UID de Usuario 1 (`11111111-1111-1111-1111-111111111111`):

```sql
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  SET LOCAL ROLE authenticated;

  -- Intento de inserción a nombre de otro usuario
  INSERT INTO public.analisis (usuario_id, etiqueta, pesos, buffer, horizonte, inflacion, optimo, riesgo)
  VALUES ('22222222-2222-2222-2222-222222222222', 'robada', '{}', 0.1, 12, '{}', '{}', '{}');
END $$;
```

#### Salida real del motor PostgreSQL:
```
ERROR: 42501: new row violates row-level security policy for table "analisis"
CONTEXT: SQL statement "INSERT INTO public.analisis (usuario_id, etiqueta, pesos, buffer, horizonte, inflacion, optimo, riesgo)
  VALUES ('22222222-2222-2222-2222-222222222222', 'robada', '{}', 0.1, 12, '{}', '{}', '{}')"
```
**Resultado:** Bloqueo absoluto. Ningún usuario puede escribir ni leer datos de otro.

---

### 3. Cuentas de Prueba Creadas y Pobladas con Éxito

Se crearon dos cuentas reales en Supabase Auth y se probaron mediante llamadas HTTP directas a `/auth/v1/token` y `/rest/v1/analisis`:

- **Cuenta 1 (Familiar):**
  - Correo: `demo1.lifehedge@gmail.com`
  - Contraseña: `LifeHedge2026!`
  - ID de usuario: `a885d9f1-ab60-4f43-a400-bfc06aa1aad3`
  - Nombre en perfil: `Sofía - Perfil Familiar`
  - Análisis asociados: 2 registros poblados (`Enero 2026 - Canasta Familiar`, `Febrero 2026 - Ajuste Escolar`).
  - Al consultar vía REST con su token JWT, **ve únicamente sus 2 análisis**.

- **Cuenta 2 (Independiente):**
  - Correo: `demo2.lifehedge@gmail.com`
  - Contraseña: `LifeHedge2026!`
  - ID de usuario: `405b0455-a00d-4794-90f3-43f66ffb3c34`
  - Nombre en perfil: `Carlos - Perfil Independiente`
  - Análisis asociados: 1 registro poblado (`Enero 2026 - Movilidad y Tecnología`).
  - Al consultar vía REST con su token JWT, **ve únicamente su propio análisis**.

---

### 4. Parámetros para el Equipo

- **Para Dev C (Frontend):**
  - Subida de PDFs: la ruta **debe** tener el formato:
    ```javascript
    `${usuario.id}/${crypto.randomUUID()}.pdf`
    ```
  - Descarga / vista de PDF: usar URL firmada de 60 segundos:
    ```javascript
    const { data } = await supabase.storage.from('estados-cuenta').createSignedUrl(ruta_storage, 60);
    ```
  - Guardar análisis: completar las columnas derivadas `delta_anualizado`, `phe`, `tev`, `var_95`.

- **Para Dev B (Backend):**
  - `SUPABASE_JWT_SECRET`:
    `vZtRCCdh2h/jyNk9jP7RhVOnUGLgKlfPiAs8XSHIK5xQFAE6TE7MDDEfO/MB0pY+fbDEgYXuNylw8mR2WMeufQ==`

---

### 5. Nuevas Funciones RPC Disponibles para el Frontend (`supabase.rpc`)

Se implementaron y probaron en vivo 5 funciones adicionales de alto rendimiento:

1. **`supabase.rpc('resumen_usuario')`**:
   - **Uso:** En `views/Cuenta.jsx` y Dashboard.
   - **Devuelve:** Estadísticas agregadas del usuario en una sola llamada (`total_analisis`, `total_estados`, `bytes_almacenados`, `ultimo_analisis_fecha`, `phe_promedio`, `delta_promedio`).

2. **`supabase.rpc('comparar_dos_analisis', { p_id_a, p_id_b })`**:
   - **Uso:** En `views/Comparar.jsx`.
   - **Devuelve:** Ambos análisis completos y un objeto `diferencias` calculado en el servidor (`diff_delta_anualizado`, `diff_phe`, `diff_tev`, `diff_var_95`). Valida que ambos pertenezcan al usuario autenticado.

3. **`supabase.rpc('tendencia_historica')`**:
   - **Uso:** Gráficas de Recharts en `views/Historial.jsx`.
   - **Devuelve:** Serie de tiempo ordenada cronológicamente con `fecha`, `delta_anualizado`, `phe`, `tev`, `var_95`.

4. **`supabase.rpc('actualizar_nombre_perfil', { p_nuevo_nombre })`**:
   - **Uso:** En `views/Cuenta.jsx` para editar el nombre de usuario de forma segura.

5. **`supabase.rpc('purgar_estados_con_rutas')`**:
   - **Uso:** Mantenimiento de retención. Borra registros vencidos (>90 días) y devuelve las rutas de archivo (`ruta_storage`) para eliminarlas físicamente de Storage vía `supabase.storage.from('estados-cuenta').remove(rutas)`.

