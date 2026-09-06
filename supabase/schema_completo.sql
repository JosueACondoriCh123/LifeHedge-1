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

-- ==============================================================================
-- 6. FUNCIONES RPC DE UTILIDAD (HISTORIAL, COMPARAR, CUENTA)
-- ==============================================================================

-- Resumen de métricas para la pantalla de Cuenta y Dashboard
create or replace function public.resumen_usuario()
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_total_analisis int;
  v_total_estados int;
  v_bytes_almacenados bigint;
  v_ultimo_analisis timestamptz;
  v_phe_promedio numeric;
  v_delta_promedio numeric;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select count(*), coalesce(max(creado_en), null), round(avg(phe), 4), round(avg(delta_anualizado), 4)
  into v_total_analisis, v_ultimo_analisis, v_phe_promedio, v_delta_promedio
  from public.analisis
  where usuario_id = v_uid;

  select count(*), coalesce(sum(bytes), 0)
  into v_total_estados, v_bytes_almacenados
  from public.estados_cuenta
  where usuario_id = v_uid;

  return jsonb_build_object(
    'total_analisis', coalesce(v_total_analisis, 0),
    'total_estados', coalesce(v_total_estados, 0),
    'bytes_almacenados', coalesce(v_bytes_almacenados, 0),
    'ultimo_analisis_fecha', v_ultimo_analisis,
    'phe_promedio', coalesce(v_phe_promedio, 0),
    'delta_promedio', coalesce(v_delta_promedio, 0)
  );
end;
$$;

-- Comparación detallada de dos análisis para la pantalla Comparar
create or replace function public.comparar_dos_analisis(p_id_a uuid, p_id_b uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a record;
  v_b record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_a from public.analisis where id = p_id_a and usuario_id = v_uid;
  select * into v_b from public.analisis where id = p_id_b and usuario_id = v_uid;

  if v_a.id is null or v_b.id is null then
    raise exception 'Uno o ambos análisis no existen o no te pertenecen';
  end if;

  return jsonb_build_object(
    'a', jsonb_build_object(
      'id', v_a.id,
      'etiqueta', v_a.etiqueta,
      'creado_en', v_a.creado_en,
      'pesos', v_a.pesos,
      'buffer', v_a.buffer,
      'horizonte', v_a.horizonte,
      'delta_anualizado', v_a.delta_anualizado,
      'phe', v_a.phe,
      'tev', v_a.tev,
      'var_95', v_a.var_95,
      'optimo', v_a.optimo,
      'inflacion', v_a.inflacion,
      'riesgo', v_a.riesgo
    ),
    'b', jsonb_build_object(
      'id', v_b.id,
      'etiqueta', v_b.etiqueta,
      'creado_en', v_b.creado_en,
      'pesos', v_b.pesos,
      'buffer', v_b.buffer,
      'horizonte', v_b.horizonte,
      'delta_anualizado', v_b.delta_anualizado,
      'phe', v_b.phe,
      'tev', v_b.tev,
      'var_95', v_b.var_95,
      'optimo', v_b.optimo,
      'inflacion', v_b.inflacion,
      'riesgo', v_b.riesgo
    ),
    'diferencias', jsonb_build_object(
      'diff_delta_anualizado', round(v_b.delta_anualizado - v_a.delta_anualizado, 4),
      'diff_phe', round(v_b.phe - v_a.phe, 4),
      'diff_tev', round(v_b.tev - v_a.tev, 4),
      'diff_var_95', round(v_b.var_95 - v_a.var_95, 4)
    )
  );
end;
$$;

-- Tendencia histórica para gráficas en Recharts (pantalla Historial)
create or replace function public.tendencia_historica()
returns table (
  id uuid,
  etiqueta text,
  fecha timestamptz,
  delta_anualizado numeric,
  phe numeric,
  tev numeric,
  var_95 numeric
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  return query
  select a.id, a.etiqueta, a.creado_en as fecha, a.delta_anualizado, a.phe, a.tev, a.var_95
  from public.analisis a
  where a.usuario_id = v_uid
  order by a.creado_en asc;
end;
$$;

-- Purga completa con rutas devueltas para limpieza en Storage
create or replace function public.purgar_estados_con_rutas()
returns table (ruta_storage text)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query
  delete from public.estados_cuenta
  where borrar_despues_de < now()
  returning public.estados_cuenta.ruta_storage;
end;
$$;

-- Actualización segura del nombre de perfil
create or replace function public.actualizar_nombre_perfil(p_nuevo_nombre text)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if trim(p_nuevo_nombre) = '' or p_nuevo_nombre is null then
    raise exception 'El nombre no puede estar vacío';
  end if;

  update public.perfiles
  set nombre = trim(p_nuevo_nombre)
  where id = v_uid;

  return jsonb_build_object('success', true, 'nombre', trim(p_nuevo_nombre));
end;
$$;

grant execute on function public.resumen_usuario() to authenticated;
grant execute on function public.comparar_dos_analisis(uuid, uuid) to authenticated;
grant execute on function public.tendencia_historica() to authenticated;
grant execute on function public.purgar_estados_con_rutas() to authenticated;
grant execute on function public.actualizar_nombre_perfil(text) to authenticated;

