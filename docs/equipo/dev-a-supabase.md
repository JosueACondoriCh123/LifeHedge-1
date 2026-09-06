# Dev A — Supabase: esquema, RLS, Storage y auth

## Antes de empezar

Trabajas en local sobre `C:/Users/HP/Documents/Coppel hackathon`, **junto a otros dos agentes que editan el mismo disco al mismo tiempo**.

**Escribes exclusivamente en `supabase/`.** Todo lo demás del repositorio es de solo lectura para ti: léelo cuanto necesites, no lo edites. Si crees que hace falta un cambio fuera de tu carpeta, anótalo en tu informe final en vez de hacerlo.

Lee antes `docs/equipo/00-arquitectura-y-contratos.md`. El esquema de ahí es el contrato; aquí está cómo implementarlo.

**Arranca cuando** exista el proyecto de Supabase (§1 de `docs/equipo/01-checklist-humano.md`). Sin él no puedes hacer nada de esto.

No hay GitHub ni pull requests: todo es local. Trabaja en la rama `a/supabase` y deja tus evidencias en `docs/equipo/evidencia-a.md`, que también es tuyo.

---

**Tu trabajo es el más delicado del equipo.** Vamos a guardar estados de cuenta bancarios: si una política de RLS está mal, un usuario ve los movimientos de otro. Es el único fallo del proyecto que no tiene arreglo después de que pase.

---

## Tarea A1 — Proyecto y migraciones ⚠ bloquea a C

**Entrega esperada: primera mitad del día 1.**

```bash
npm install -g supabase
cd "Coppel hackathon" && supabase init
```

Crea el proyecto en supabase.com, región **East US** o la más cercana a México, y guarda las credenciales. Luego enlaza y crea la primera migración:

```bash
supabase link --project-ref <tu-ref>
supabase migration new esquema_inicial
```

Escribe el esquema del documento de contratos en `supabase/migrations/<sello>_esquema_inicial.sql`, y añade esto al final: un disparador que cree el perfil automáticamente al registrarse, para que C nunca tenga que crearlo a mano.

```sql
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();
```

`security definer` con `search_path = ''` es obligatorio: sin eso el disparador no puede escribir en `public` y un esquema malicioso podría secuestrar la función.

---

## Tarea A2 — RLS, la parte que no puede fallar

**Entrega esperada: cierre del día 1.**

Migración nueva. Empieza activando RLS en las tres tablas: **una tabla sin RLS activo es pública para cualquiera con la `anon key`**, que va incrustada en el bundle del frontend.

```sql
alter table perfiles       enable row level security;
alter table estados_cuenta enable row level security;
alter table analisis       enable row level security;
```

Después las políticas. Nota que van **una por operación**: una política `for all` es más corta pero mucho más fácil de equivocar.

```sql
-- perfiles: cada quien el suyo, y no se puede borrar (cae en cascada con auth.users)
create policy "perfil propio: leer"     on perfiles for select to authenticated using (id = auth.uid());
create policy "perfil propio: escribir" on perfiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- estados_cuenta
create policy "estados: leer"    on estados_cuenta for select to authenticated using (usuario_id = auth.uid());
create policy "estados: crear"   on estados_cuenta for insert to authenticated with check (usuario_id = auth.uid());
create policy "estados: borrar"  on estados_cuenta for delete to authenticated using (usuario_id = auth.uid());

-- analisis
create policy "analisis: leer"   on analisis for select to authenticated using (usuario_id = auth.uid());
create policy "analisis: crear"  on analisis for insert to authenticated with check (usuario_id = auth.uid());
create policy "analisis: editar" on analisis for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "analisis: borrar" on analisis for delete to authenticated using (usuario_id = auth.uid());
```

**El detalle que se le escapa a todo el mundo:** en `insert` la condición va en `with check`, no en `using`. Si la pones en `using`, el insert pasa siempre y cualquiera puede escribir filas a nombre de otro. En `update` necesitas ambas: `using` decide qué filas puedes tocar, `with check` decide en qué estado pueden quedar. Sin `with check` en update, un usuario puede reasignarse una fila cambiando `usuario_id`.

### Verificación obligatoria

Esto no se da por bueno leyendo el SQL. Crea dos usuarios de prueba y demuestra el aislamiento:

```sql
-- En el editor SQL de Supabase, suplantando a un usuario
select set_config('request.jwt.claims', '{"sub":"<uuid-usuario-1>","role":"authenticated"}', true);
set local role authenticated;

select count(*) from analisis;                          -- solo las suyas
insert into analisis (usuario_id, etiqueta, pesos, buffer, horizonte, inflacion, optimo, riesgo)
values ('<uuid-usuario-2>', 'robada', '{}', 0.1, 12, '{}', '{}', '{}');
-- debe FALLAR con: new row violates row-level security policy
```

Ese insert **tiene que fallar**. Si pasa, la política de `with check` está mal. Deja el resultado pegado en el PR: es tu evidencia.

---

## Tarea A3 — Storage para los PDFs

**Entrega esperada: día 2.**

Un solo bucket, **privado**, llamado `estados-cuenta`. Privado no es opcional: son estados de cuenta bancarios.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estados-cuenta', 'estados-cuenta', false, 10485760, array['application/pdf']);
```

El límite de 10 MB y el filtro de tipo MIME los aplica Supabase del lado del servidor. La validación del frontend es cortesía; esta es la que cuenta.

Las políticas se apoyan en que **la ruta empieza con el id del usuario** (`{usuario_id}/{uuid}.pdf`):

```sql
create policy "archivos propios: leer" on storage.objects for select to authenticated
  using (bucket_id = 'estados-cuenta' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "archivos propios: subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'estados-cuenta' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "archivos propios: borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'estados-cuenta' and (storage.foldername(name))[1] = auth.uid()::text);
```

`storage.foldername(name)` devuelve el arreglo de carpetas de la ruta; para `abc-123/x.pdf` da `{abc-123}`. Por eso el primer segmento tiene que ser el id, y por eso **C debe construir la ruta exactamente así**. Díselo explícitamente.

**Nunca URLs públicas.** Para mostrar o descargar un PDF, C usa `createSignedUrl(ruta, 60)`. Sesenta segundos alcanzan de sobra y el enlace no sirve si alguien lo reenvía.

### Retención

La columna `borrar_despues_de` tiene 90 días por defecto. Para el hackathon basta con una función que se pueda invocar a mano; deja documentado que en producción va en un cron:

```sql
create or replace function public.purgar_estados_vencidos()
returns integer language plpgsql security definer set search_path = '' as $$
declare borrados integer;
begin
  with fuera as (
    delete from public.estados_cuenta where borrar_despues_de < now() returning 1
  ) select count(*) into borrados from fuera;
  return borrados;
end;
$$;
```

Ojo: esto borra la fila, no el objeto en Storage. Deja escrito ese hueco en el PR — es honesto y evita que alguien crea que la purga está completa.

---

## Tarea A4 — Auth y datos de prueba

**Entrega esperada: día 2.**

En el panel de Authentication: correo y contraseña activados, **confirmación por correo desactivada** para el hackathon (un juez no va a revisar su bandeja), longitud mínima de contraseña 8. Anota en el PR que la confirmación queda pendiente para producción.

En URL Configuration añade `http://localhost:5173` y el dominio de Vercel cuando D lo tenga.

Crea dos cuentas de prueba con datos distintos y pásaselas al equipo por un canal privado, no por el repo:

```
demo1@lifehedge.mx  /  demo2@lifehedge.mx
```

Cárgale a cada una dos o tres análisis, con canastas claramente diferentes, para que C pueda desarrollar Historial y Comparar contra datos reales y para que la demo tenga algo que enseñar.

---

## Entregables

- [ ] `supabase/migrations/` con esquema, RLS, Storage y purga, todo versionado
- [ ] `supabase/README.md` con cómo aplicar migraciones desde cero
- [ ] Evidencia pegada en el PR de que el insert cruzado **falla**
- [ ] Dos cuentas de prueba pobladas
- [ ] `.env.example` con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`

## Lo que no debes hacer

- **La `service_role` no sale de tu navegador.** No al repo, no a Vercel, no a un mensaje. Ignora completamente RLS.
- **No apagues RLS "un momento para probar".** Se olvida encendido y ese es exactamente el fallo que no queremos.
- No metas datos personales reales en las cuentas de prueba.
