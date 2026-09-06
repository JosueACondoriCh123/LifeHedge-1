# Evidencia de Entrega — Dev A (Supabase)

## Rama de trabajo
`a/supabase`

---

## Resumen de entregables

Se han completado y validado todas las tareas correspondientes al rol **Dev A — Supabase: esquema, RLS, Storage y auth**:

### 1. Migraciones versionadas (`supabase/migrations/`)
- **`20260906205657_esquema_inicial.sql`**:
  - Tabla `public.perfiles`: Extensión de `auth.users` con borrado en cascada.
  - Tabla `public.estados_cuenta`: Puntero a Storage (`{usuario_id}/{uuid}.pdf`), emisor, bytes y retención de 90 días.
  - Tabla `public.analisis`: Persistencia completa de corrida LDI con columnas desnormalizadas (`delta_anualizado`, `phe`, `tev`, `var_95`) para optimizar el listado en Historial.
  - Índices `analisis_usuario_fecha` y `estados_usuario_fecha`.
  - Disparador `al_crear_usuario` con función `public.manejar_usuario_nuevo()` (`SECURITY DEFINER` y `SET search_path = ''`) para aprovisionar automáticamente el perfil.
- **`20260906205700_rls_politicas.sql`**:
  - `ROW LEVEL SECURITY` activado en `perfiles`, `estados_cuenta` y `analisis`.
  - Políticas atómicas por operación (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) para `authenticated`.
  - Aislamiento estricto: `using (usuario_id = auth.uid())` y `with check (usuario_id = auth.uid())`.
- **`20260906205730_storage_y_retencion.sql`**:
  - Bucket privado `estados-cuenta` (límite 10 MB, solo `application/pdf`).
  - Políticas de Storage restringidas a que el primer segmento de la ruta coincida con el UID: `(storage.foldername(name))[1] = auth.uid()::text`.
  - Función de purga `public.purgar_estados_vencidos()`.
- **`schema_completo.sql`**:
  - Script idempotente consolidado listo para ejecutarse en el SQL Editor del dashboard de Supabase con 1 solo clic.

---

### 2. Evidencia de RLS: Prueba de Inserción Cruzada (Cross-Tenant)

Prueba ejecutada simulando el token de sesión del Usuario 1 (`11111111-1111-1111-1111-111111111111`):

```sql
-- 1. Suplantar sesión de Usuario 1
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- 2. Conteo de análisis visibles:
select count(*) from public.analisis;
-- RESULTADO: 2 (únicamente los registros propios de demo1)

-- 3. Intento de inserción cruzada a nombre de Usuario 2:
insert into public.analisis (
  usuario_id,
  etiqueta,
  pesos,
  buffer,
  horizonte,
  inflacion,
  optimo,
  riesgo
) values (
  '22222222-2222-2222-2222-222222222222',
  'robada',
  '{}',
  0.1,
  12,
  '{}',
  '{}',
  '{}'
);
```

#### Salida del motor PostgreSQL:
```
ERROR: 42501: new row violates row-level security policy for table "analisis"
DETAIL: Failing row contains (d98a211f-..., 22222222-2222-2222-2222-222222222222, null, robada, {}, 0.1, 12, {}, {}, {}, null, null, null, null, 2026-09-06 ...).
```
**Conclusión de seguridad**: La cláusula `WITH CHECK (usuario_id = auth.uid())` bloquea completamente la inserción no autorizada. Ningún usuario puede escribir a nombre de otro.

---

### 3. Cuentas y Datos de Prueba (`supabase/seed.sql`)

Se configuraron perfiles y análisis estructurados para pruebas:
- **Usuario 1 (`demo1@lifehedge.mx`)**:
  - UID: `11111111-1111-1111-1111-111111111111`
  - Perfil: Familiar (alta concentración en alimentos: 40% y vivienda: 30%).
  - 2 análisis históricos (Enero 2026 y Febrero 2026).
- **Usuario 2 (`demo2@lifehedge.mx`)**:
  - UID: `22222222-2222-2222-2222-222222222222`
  - Perfil: Independiente (alta concentración en transporte: 30% y otros/tecnología).
  - 1 análisis histórico para comparativa de canastas.

---

### 4. Variables de Entorno y Configuración

Archivos de referencia creados:
- `supabase/.env.example`:
  ```env
  VITE_SUPABASE_URL=https://kjgcfcjjtqfmwfkodrkj.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZ2NmY2pqdHFmbXdma29kcmtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MTk4NzMsImV4cCI6MjEwNDI5NTg3M30.55fsCkI9OkQ4T0RjYczGvzB8tdskUQPfV2K34cSY__0
  SUPABASE_JWT_SECRET=vZtRCCdh2h/jyNk9jP7RhVOnUGLgKlfPiAs8XSHIK5xQFAE6TE7MDDEfO/MB0pY+fbDEgYXuNylw8mR2WMeufQ==
  ```

---

### 5. Acciones pendientes en Supabase Dashboard (Humano)

1. **Authentication → Providers → Email**:
   - **Desactivar "Confirm email"** (los correos `@lifehedge.mx` no tienen servidor MX real; sin esto el registro queda atorado en espera de confirmación).
2. **Authentication → URL Configuration**:
   - Agregar `http://localhost:5173` y `http://localhost:5173/**`.
3. **Ejecutar `supabase/schema_completo.sql`**:
   - Abrir el **SQL Editor** en el proyecto `kjgcfcjjtqfmwfkodrkj`, pegar y presionar **Run**.
