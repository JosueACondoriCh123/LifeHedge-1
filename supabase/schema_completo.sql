-- ==============================================================================
-- LIFEHEDGE — ESQUEMA COMPLETO, RLS Y STORAGE PARA SUPABASE
-- Ejecuta este script completo en el SQL Editor de Supabase (dashboard web)
-- ==============================================================================

-- 1. TABLA: perfiles (extiende auth.users)
create table if not exists public.perfiles (
  id          uuid primary key references auth.users on delete cascade,
  nombre      text,
  creado_en   timestamptz not null default now()
);

-- 2. TABLA: estados_cuenta
create table if not exists public.estados_cuenta (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users on delete cascade,
  ruta_storage      text not null,          -- '{usuario_id}/{uuid}.pdf'
  nombre_archivo    text not null,
  emisor            text,                   -- BBVA | SANTANDER | ... | GENERICO
  bytes             integer,
  subido_en         timestamptz not null default now(),
  borrar_despues_de timestamptz not null default (now() + interval '90 days')
);

-- 3. TABLA: analisis
create table if not exists public.analisis (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users on delete cascade,
  estado_cuenta_id  uuid references public.estados_cuenta on delete set null,
  etiqueta          text not null,           -- Ej. "Enero 2026"
  pesos             jsonb not null,          -- {"alimentos": 0.35, ...}
  buffer            numeric not null,
  horizonte         integer not null,
  inflacion         jsonb not null,          -- respuesta de /inflation/personal
  optimo            jsonb not null,          -- respuesta de /portfolio/optimize
  riesgo            jsonb not null,          -- respuesta de /risk/simulate
  delta_anualizado  numeric,
  phe               numeric,
  tev               numeric,
  var_95            numeric,
  creado_en         timestamptz not null default now()
);

-- Índices de consulta frecuente
create index if not exists analisis_usuario_fecha on public.analisis (usuario_id, creado_en desc);
create index if not exists estados_usuario_fecha on public.estados_cuenta (usuario_id, subido_en desc);

-- Disparador para crear el perfil automáticamente al registrarse en auth.users
create or replace function public.manejar_usuario_nuevo()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
alter table public.perfiles       enable row level security;
alter table public.estados_cuenta enable row level security;
alter table public.analisis       enable row level security;

-- Políticas: perfiles
drop policy if exists "perfil propio: leer" on public.perfiles;
create policy "perfil propio: leer"
  on public.perfiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "perfil propio: escribir" on public.perfiles;
create policy "perfil propio: escribir"
  on public.perfiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Políticas: estados_cuenta
drop policy if exists "estados: leer" on public.estados_cuenta;
create policy "estados: leer"
  on public.estados_cuenta for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "estados: crear" on public.estados_cuenta;
create policy "estados: crear"
  on public.estados_cuenta for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "estados: borrar" on public.estados_cuenta;
create policy "estados: borrar"
  on public.estados_cuenta for delete
  to authenticated
  using (usuario_id = auth.uid());

-- Políticas: analisis
drop policy if exists "analisis: leer" on public.analisis;
create policy "analisis: leer"
  on public.analisis for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "analisis: crear" on public.analisis;
create policy "analisis: crear"
  on public.analisis for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "analisis: editar" on public.analisis;
create policy "analisis: editar"
  on public.analisis for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "analisis: borrar" on public.analisis;
create policy "analisis: borrar"
  on public.analisis for delete
  to authenticated
  using (usuario_id = auth.uid());

-- ==============================================================================
-- 5. STORAGE & RETENCIÓN
-- ==============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estados-cuenta', 'estados-cuenta', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

drop policy if exists "archivos propios: leer" on storage.objects;
create policy "archivos propios: leer"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'estados-cuenta' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "archivos propios: subir" on storage.objects;
create policy "archivos propios: subir"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'estados-cuenta' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "archivos propios: borrar" on storage.objects;
create policy "archivos propios: borrar"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'estados-cuenta' and (storage.foldername(name))[1] = auth.uid()::text);

-- Función de purga de registros vencidos (>90 días)
create or replace function public.purgar_estados_vencidos()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  borrados integer;
begin
  with fuera as (
    delete from public.estados_cuenta
    where borrar_despues_de < now()
    returning 1
  )
  select count(*) into borrados from fuera;
  return borrados;
end;
$$;
