# LifeHedge — Supabase Setup & Migraciones

Este directorio contiene las migraciones, políticas de seguridad (RLS), configuración de Storage y datos de prueba (seed) para la base de datos de LifeHedge en Supabase.

---

## Estructura de archivos

```
supabase/
├── config.toml                              # Configuración local de Supabase
├── migrations/
│   ├── 20260906205657_esquema_inicial.sql   # Tablas perfiles, estados_cuenta, analisis + trigger
│   ├── 20260906205700_rls_politicas.sql     # RLS y políticas por operación (SELECT/INSERT/UPDATE/DELETE)
│   └── 20260906205730_storage_y_retencion.sql # Bucket privado 'estados-cuenta' + función purga
├── seed.sql                                 # Datos de prueba para demo1 y demo2
├── verificacion_rls.sql                     # Script de prueba de aislamiento de inquilinos
└── README.md                                # Este documento
```

---

## Cómo aplicar las migraciones

### Opción A: Vía Supabase CLI (Recomendada)

1. **Obtener el Reference ID del proyecto:**
   En [supabase.com](https://supabase.com), entra a tu proyecto y copia el `Project Ref` de la URL o de **Settings → General**.

2. **Vincular el proyecto:**
   ```bash
   npx supabase link --project-ref <tu-project-ref>
   ```
   *(Te pedirá la contraseña de la base de datos que guardaste al crear el proyecto).*

3. **Subir las migraciones:**
   ```bash
   npx supabase db push
   ```

4. **(Opcional) Cargar los datos de prueba:**
   ```bash
   npx supabase db reset   # En local
   # O ejecutar supabase/seed.sql directamente en el SQL Editor
   ```

---

### Opción B: Vía Supabase Dashboard (SQL Editor)

Si prefieres ejecutar directamente en la interfaz web de Supabase:

1. Ve a **SQL Editor** en tu panel de Supabase.
2. Abre y ejecuta los archivos en este orden estricto:
   - `supabase/migrations/20260906205657_esquema_inicial.sql`
   - `supabase/migrations/20260906205700_rls_politicas.sql`
   - `supabase/migrations/20260906205730_storage_y_retencion.sql`
   - *(Opcional)* `supabase/seed.sql`

---

## Configuración esencial de Authentication en Supabase

En el dashboard web de Supabase:
1. **Authentication → Providers → Email:**
   - Habilitar **Email provider**.
   - **DESACTIVAR "Confirm email"** (imprescindible para que los jueces y evaluadores puedan registrarse y probar de inmediato sin verificar bandeja).
   - Longitud mínima de contraseña: `8`.
2. **Authentication → URL Configuration:**
   - **Site URL:** `http://localhost:5173`
   - **Redirect URLs:** `http://localhost:5173/**` y añadir la URL de Vercel cuando se despliegue.

---

## Variables de entorno requeridas

En **Settings → API**:

1. **En `frontend/.env`:**
   ```env
   VITE_SUPABASE_URL=https://<tu-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi... (anon public key)
   ```

2. **En `backend/.env`:**
   ```env
   SUPABASE_JWT_SECRET=tu-jwt-secret-de-settings-api
   ```
   *(Atención: usa el **JWT Secret**, NO la anon key ni la service_role).*

> ⚠️ **REGLA DE SEGURIDAD CRÍTICA:**
> La clave `service_role` **NUNCA** debe guardarse en `.env`, ni en el repositorio, ni enviarse al cliente. Esa clave ignora completamente las políticas RLS.

---

## Verificación de Seguridad RLS

Para comprobar que las políticas aíslan correctamente los datos y que un usuario no puede leer ni escribir datos de otro usuario:
1. Abre el **SQL Editor** en Supabase.
2. Ejecuta el archivo `supabase/verificacion_rls.sql`.
3. Debe confirmar que las consultas filtran exclusivamente los registros del usuario activo y que la inserción cruzada (`with check`) produce un error de violación de RLS.
