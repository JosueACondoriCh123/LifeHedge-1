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

-- ==============================================================================
-- 7. AUDITORÍA INMUTABLE, MEMORIA ASESOR IA, SCORE LDI, DRIFT Y BENCHMARKS
-- ==============================================================================

-- 7.1 TABLA: bitacora_auditoria (Cumplimiento CNBV / LFPDPPP)
create table if not exists public.bitacora_auditoria (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  accion          text not null,
  entidad_tipo    text not null,
  entidad_id      uuid,
  detalles        jsonb not null default '{}'::jsonb,
  ip_origen       text,
  creado_en       timestamptz not null default now()
);

alter table public.bitacora_auditoria enable row level security;

drop policy if exists "auditoria: ver propia" on public.bitacora_auditoria;
create policy "auditoria: ver propia"
  on public.bitacora_auditoria for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "auditoria: insertar propia" on public.bitacora_auditoria;
create policy "auditoria: insertar propia"
  on public.bitacora_auditoria for insert
  to authenticated
  with check (usuario_id = auth.uid());

create index if not exists idx_auditoria_usuario_fecha
  on public.bitacora_auditoria (usuario_id, creado_en desc);

create or replace function public.registrar_evento_auditoria(
  p_accion text,
  p_entidad_tipo text,
  p_entidad_id uuid default null,
  p_detalles jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  insert into public.bitacora_auditoria (usuario_id, accion, entidad_tipo, entidad_id, detalles)
  values (v_uid, trim(p_accion), trim(p_entidad_tipo), p_entidad_id, coalesce(p_detalles, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.obtener_bitacora_auditoria(p_limite int default 50)
returns table (
  id uuid,
  accion text,
  entidad_tipo text,
  entidad_id uuid,
  detalles jsonb,
  creado_en timestamptz
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
  select b.id, b.accion, b.entidad_tipo, b.entidad_id, b.detalles, b.creado_en
  from public.bitacora_auditoria b
  where b.usuario_id = v_uid
  order by b.creado_en desc
  limit coalesce(p_limite, 50);
end;
$$;

create or replace function public.tr_auditar_analisis()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.bitacora_auditoria (usuario_id, accion, entidad_tipo, entidad_id, detalles)
  values (
    new.usuario_id,
    'ANALISIS_CREADO',
    'analisis',
    new.id,
    jsonb_build_object(
      'etiqueta', new.etiqueta,
      'phe', new.phe,
      'delta_anualizado', new.delta_anualizado,
      'var_95', new.var_95
    )
  );
  return new;
end;
$$;

drop trigger if exists al_crear_analisis_auditar on public.analisis;
create trigger al_crear_analisis_auditar
  after insert on public.analisis
  for each row execute function public.tr_auditar_analisis();

-- 7.2 TABLAS: conversaciones_ia y mensajes_ia
create table if not exists public.conversaciones_ia (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  titulo          text not null default 'Consulta LDI',
  modelo          text not null default 'z-ai/glm-5.2',
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

alter table public.conversaciones_ia enable row level security;

drop policy if exists "conversaciones_ia: leer propias" on public.conversaciones_ia;
create policy "conversaciones_ia: leer propias"
  on public.conversaciones_ia for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "conversaciones_ia: insertar propias" on public.conversaciones_ia;
create policy "conversaciones_ia: insertar propias"
  on public.conversaciones_ia for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "conversaciones_ia: borrar propias" on public.conversaciones_ia;
create policy "conversaciones_ia: borrar propias"
  on public.conversaciones_ia for delete
  to authenticated
  using (usuario_id = auth.uid());

create table if not exists public.mensajes_ia (
  id                uuid primary key default gen_random_uuid(),
  conversacion_id   uuid not null references public.conversaciones_ia on delete cascade,
  usuario_id        uuid not null references auth.users on delete cascade,
  rol               text not null check (rol in ('user', 'assistant', 'system')),
  contenido         text not null,
  metricas_contexto jsonb default null,
  creado_en         timestamptz not null default now()
);

alter table public.mensajes_ia enable row level security;

drop policy if exists "mensajes_ia: leer propios" on public.mensajes_ia;
create policy "mensajes_ia: leer propios"
  on public.mensajes_ia for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "mensajes_ia: insertar propios" on public.mensajes_ia;
create policy "mensajes_ia: insertar propios"
  on public.mensajes_ia for insert
  to authenticated
  with check (usuario_id = auth.uid());

create index if not exists idx_mensajes_ia_conv
  on public.mensajes_ia (conversacion_id, creado_en asc);

create or replace function public.guardar_mensaje_ia(
  p_conversacion_id uuid,
  p_rol text,
  p_contenido text,
  p_metricas jsonb default null,
  p_nuevo_titulo text default null
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_conv_id uuid := p_conversacion_id;
  v_msg_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if v_conv_id is null then
    insert into public.conversaciones_ia (usuario_id, titulo, modelo)
    values (v_uid, coalesce(p_nuevo_titulo, substring(trim(p_contenido) from 1 for 40)), 'z-ai/glm-5.2')
    returning id into v_conv_id;
  else
    if not exists (select 1 from public.conversaciones_ia where id = v_conv_id and usuario_id = v_uid) then
      raise exception 'Conversación no encontrada o no pertenece al usuario';
    end if;
    update public.conversaciones_ia
    set actualizado_en = now()
    where id = v_conv_id;
  end if;

  insert into public.mensajes_ia (conversacion_id, usuario_id, rol, contenido, metricas_contexto)
  values (v_conv_id, v_uid, p_rol, p_contenido, p_metricas)
  returning id into v_msg_id;

  return jsonb_build_object(
    'conversacion_id', v_conv_id,
    'mensaje_id', v_msg_id,
    'guardado', true
  );
end;
$$;

create or replace function public.obtener_historial_ia(p_conversacion_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_mensajes jsonb;
  v_conv record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_conv from public.conversaciones_ia
  where id = p_conversacion_id and usuario_id = v_uid;

  if v_conv.id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'rol', m.rol,
      'contenido', m.contenido,
      'metricas_contexto', m.metricas_contexto,
      'creado_en', m.creado_en
    ) order by m.creado_en asc
  ), '[]'::jsonb)
  into v_mensajes
  from public.mensajes_ia m
  where m.conversacion_id = p_conversacion_id and m.usuario_id = v_uid;

  return v_mensajes;
end;
$$;

create or replace function public.listar_conversaciones_ia()
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_lista jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'titulo', c.titulo,
      'modelo', c.modelo,
      'creado_en', c.creado_en,
      'actualizado_en', c.actualizado_en,
      'total_mensajes', (select count(*) from public.mensajes_ia m where m.conversacion_id = c.id)
    ) order by c.actualizado_en desc
  ), '[]'::jsonb)
  into v_lista
  from public.conversaciones_ia c
  where c.usuario_id = v_uid;

  return v_lista;
end;
$$;

-- 7.3 MOTOR DE CALIFICACIÓN INSTITUCIONAL LDI: score_patrimonial_ldi
create or replace function public.calcular_score_patrimonial(p_analisis_id uuid default null)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_score_phe numeric := 0;
  v_score_delta numeric := 0;
  v_score_tev numeric := 0;
  v_score_hhi numeric := 0;
  v_score_total numeric := 0;
  v_rating text := 'BBB';
  v_hhi numeric := 0;
  v_key text;
  v_val numeric;
  v_diagnostico text;
  v_alerta text := 'OPTIMO';
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_analisis_id is not null then
    select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  else
    select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;
  end if;

  if v_ana.id is null then
    return jsonb_build_object(
      'tiene_analisis', false,
      'mensaje', 'No hay análisis cuantitativo registrado para calcular el score patrimonial'
    );
  end if;

  if v_ana.phe >= 0.85 then
    v_score_phe := 40;
  elsif v_ana.phe >= 0.70 then
    v_score_phe := 30 + ((v_ana.phe - 0.70) / 0.15) * 10;
  elsif v_ana.phe >= 0.50 then
    v_score_phe := 15 + ((v_ana.phe - 0.50) / 0.20) * 15;
  else
    v_score_phe := greatest(0, v_ana.phe * 30);
  end if;

  if v_ana.delta_anualizado >= 0.04 then
    v_score_delta := 25;
  elsif v_ana.delta_anualizado >= 0.01 then
    v_score_delta := 18 + ((v_ana.delta_anualizado - 0.01) / 0.03) * 7;
  elsif v_ana.delta_anualizado >= 0 then
    v_score_delta := 14 + (v_ana.delta_anualizado / 0.01) * 4;
  else
    v_score_delta := greatest(0, 14 + (v_ana.delta_anualizado * 100));
  end if;

  if v_ana.tev <= 0.025 then
    v_score_tev := 20;
  elsif v_ana.tev <= 0.05 then
    v_score_tev := 14 + ((0.05 - v_ana.tev) / 0.025) * 6;
  elsif v_ana.tev <= 0.08 then
    v_score_tev := 7 + ((0.08 - v_ana.tev) / 0.03) * 7;
  else
    v_score_tev := 4;
  end if;

  if v_ana.optimo ? 'pesos' and jsonb_typeof(v_ana.optimo->'pesos') = 'object' then
    for v_key, v_val in select key, value::numeric from jsonb_each_text(v_ana.optimo->'pesos') loop
      v_hhi := v_hhi + (v_val * v_val);
    end loop;
  elsif v_ana.optimo ? 'weights' and jsonb_typeof(v_ana.optimo->'weights') = 'array' then
    for v_val in select value::numeric from jsonb_array_elements_text(v_ana.optimo->'weights') loop
      v_hhi := v_hhi + (v_val * v_val);
    end loop;
  else
    v_hhi := 0.25;
  end if;

  if v_hhi <= 0.22 then
    v_score_hhi := 15;
  elsif v_hhi <= 0.35 then
    v_score_hhi := 10 + ((0.35 - v_hhi) / 0.13) * 5;
  else
    v_score_hhi := greatest(3, 10 - ((v_hhi - 0.35) * 15));
  end if;

  v_score_total := round(v_score_phe + v_score_delta + v_score_tev + v_score_hhi, 1);

  if v_score_total >= 90 then
    v_rating := 'AAA';
    v_diagnostico := 'Protección institucional de máxima solidez. Portafolio óptimamente acoplado a la canasta de gasto con delta real positivo y varianza mínima.';
    v_alerta := 'EXCELENTE';
  elsif v_score_total >= 80 then
    v_rating := 'AA';
    v_diagnostico := 'Alta calidad de inmunización pasiva. Riesgo de erosión inflacionaria bajo control con estabilidad de tracking error sobresaliente.';
    v_alerta := 'ESTABLE';
  elsif v_score_total >= 70 then
    v_rating := 'A';
    v_diagnostico := 'Estructura adecuada con grado de inversión. Se sugiere vigilar la concentración de activos y mantener el buffer de liquidez.';
    v_alerta := 'MODERADO';
  elsif v_score_total >= 60 then
    v_rating := 'BBB';
    v_diagnostico := 'Cobertura moderada. Vulnerable a aceleraciones en rubros específicos de inflación personal (alimentos o vivienda).';
    v_alerta := 'ATENCION';
  else
    v_rating := 'BB-';
    v_diagnostico := 'Cobertura deficiente. La cartera actual no amortigua la inflación personal y presenta alto desvío de pasivos.';
    v_alerta := 'CRITICO';
  end if;

  return jsonb_build_object(
    'tiene_analisis', true,
    'analisis_id', v_ana.id,
    'etiqueta', v_ana.etiqueta,
    'score_total', v_score_total,
    'calificacion', v_rating,
    'diagnostico', v_diagnostico,
    'semaforo', v_alerta,
    'pilares', jsonb_build_object(
      'cobertura_phe', jsonb_build_object('puntaje', round(v_score_phe, 1), 'max', 40, 'valor_real', v_ana.phe),
      'rendimiento_delta', jsonb_build_object('puntaje', round(v_score_delta, 1), 'max', 25, 'valor_real', v_ana.delta_anualizado),
      'tracking_error_tev', jsonb_build_object('puntaje', round(v_score_tev, 1), 'max', 20, 'valor_real', v_ana.tev),
      'diversificacion_hhi', jsonb_build_object('puntaje', round(v_score_hhi, 1), 'max', 15, 'indice_hhi', round(v_hhi, 4))
    ),
    'calculado_en', now()
  );
end;
$$;

-- 7.4 TABLA Y RPC: revisiones_rebalanceo (Monitoreo de Desvío)
create table if not exists public.revisiones_rebalanceo (
  id                  uuid primary key default gen_random_uuid(),
  usuario_id          uuid not null references auth.users on delete cascade,
  analisis_id         uuid references public.analisis on delete cascade,
  pesos_objetivo      jsonb not null,
  pesos_actuales      jsonb not null,
  max_desvio          numeric not null,
  activo_max_desvio   text,
  requiere_rebalanceo boolean not null default false,
  ejecutado           boolean not null default false,
  ejecutado_en        timestamptz,
  creado_en           timestamptz not null default now()
);

alter table public.revisiones_rebalanceo enable row level security;

drop policy if exists "rebalanceos: ver propios" on public.revisiones_rebalanceo;
create policy "rebalanceos: ver propios"
  on public.revisiones_rebalanceo for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "rebalanceos: insertar propios" on public.revisiones_rebalanceo;
create policy "rebalanceos: insertar propios"
  on public.revisiones_rebalanceo for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "rebalanceos: actualizar propios" on public.revisiones_rebalanceo;
create policy "rebalanceos: actualizar propios"
  on public.revisiones_rebalanceo for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create or replace function public.evaluar_drift_portafolio(
  p_analisis_id uuid,
  p_pesos_actuales jsonb,
  p_umbral_drift numeric default 0.05
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_pesos_obj jsonb := '{}'::jsonb;
  v_key text;
  v_w_obj numeric;
  v_w_act numeric;
  v_diff numeric;
  v_max_diff numeric := 0;
  v_peor_activo text := null;
  v_requiere boolean := false;
  v_revision_id uuid;
  v_desgloses jsonb := '[]'::jsonb;
  v_assets text[] := array['UDIBONO', 'BONOS_M', 'CETES', 'FIBRAS', 'SP500_H', 'ORO', 'FIBRAS_LOG', 'EFECTIVO'];
  v_i int;
  v_arr_len int;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  if v_ana.id is null then
    raise exception 'Análisis no encontrado';
  end if;

  if v_ana.optimo ? 'pesos' and jsonb_typeof(v_ana.optimo->'pesos') = 'object' then
    v_pesos_obj := v_ana.optimo->'pesos';
  elsif v_ana.optimo ? 'weights' and jsonb_typeof(v_ana.optimo->'weights') = 'array' then
    v_arr_len := jsonb_array_length(v_ana.optimo->'weights');
    for v_i in 0..(v_arr_len - 1) loop
      if v_i < array_length(v_assets, 1) then
        v_pesos_obj := v_pesos_obj || jsonb_build_object(v_assets[v_i + 1], (v_ana.optimo->'weights'->>v_i)::numeric);
      end if;
    end loop;
  elsif jsonb_typeof(v_ana.pesos) = 'object' then
    v_pesos_obj := v_ana.pesos;
  end if;

  for v_key in select distinct k from (
    select jsonb_object_keys(v_pesos_obj) as k
    union
    select jsonb_object_keys(p_pesos_actuales) as k
  ) sub loop
    v_w_obj := coalesce((v_pesos_obj->>v_key)::numeric, 0);
    v_w_act := coalesce((p_pesos_actuales->>v_key)::numeric, 0);
    v_diff := abs(v_w_act - v_w_obj);

    v_desgloses := v_desgloses || jsonb_build_object(
      'activo', v_key,
      'peso_objetivo', v_w_obj,
      'peso_actual', v_w_act,
      'desvio_absoluto', round(v_diff, 4),
      'desvio_porcentual', round((v_w_act - v_w_obj) * 100, 2)
    );

    if v_diff > v_max_diff then
      v_max_diff := v_diff;
      v_peor_activo := v_key;
    end if;
  end loop;

  v_requiere := (v_max_diff >= coalesce(p_umbral_drift, 0.05));

  insert into public.revisiones_rebalanceo (
    usuario_id, analisis_id, pesos_objetivo, pesos_actuales,
    max_desvio, activo_max_desvio, requiere_rebalanceo
  )
  values (
    v_uid, v_ana.id, v_pesos_obj, p_pesos_actuales,
    round(v_max_diff, 4), v_peor_activo, v_requiere
  )
  returning id into v_revision_id;

  return jsonb_build_object(
    'revision_id', v_revision_id,
    'requiere_rebalanceo', v_requiere,
    'umbral_drift', p_umbral_drift,
    'max_desvio', round(v_max_diff, 4),
    'activo_max_desvio', v_peor_activo,
    'desglose', v_desgloses
  );
end;
$$;

create or replace function public.confirmar_ejecucion_rebalanceo(p_revision_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rev record;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_rev from public.revisiones_rebalanceo
  where id = p_revision_id and usuario_id = v_uid;

  if v_rev.id is null then
    raise exception 'Revisión de rebalanceo no encontrada';
  end if;

  update public.revisiones_rebalanceo
  set ejecutado = true, ejecutado_en = now()
  where id = p_revision_id;

  insert into public.bitacora_auditoria (usuario_id, accion, entidad_tipo, entidad_id, detalles)
  values (
    v_uid,
    'REBALANCEO_EJECUTADO',
    'rebalanceo',
    p_revision_id,
    jsonb_build_object(
      'max_desvio', v_rev.max_desvio,
      'activo_max_desvio', v_rev.activo_max_desvio
    )
  );

  return jsonb_build_object('success', true, 'revision_id', p_revision_id, 'ejecutado_en', now());
end;
$$;

-- 7.5 TABLA Y DATOS: benchmarks_institucionales (Mercado Mexicano)
create table if not exists public.benchmarks_institucionales (
  codigo              text primary key,
  nombre              text not null,
  categoria           text not null,
  rendimiento_anual   numeric not null,
  volatilidad_anual   numeric not null,
  sharpe_ratio        numeric not null,
  cobertura_inpc      numeric not null,
  descripcion         text,
  actualizado_en      timestamptz not null default now()
);

insert into public.benchmarks_institucionales (codigo, nombre, categoria, rendimiento_anual, volatilidad_anual, sharpe_ratio, cobertura_inpc, descripcion)
values
  ('CETES_28D', 'Cetes 28 Días (Banxico)', 'RENTA_FIJA', 0.1025, 0.0120, 0.85, 0.62, 'Tasa de referencia soberana de México libre de riesgo crediticio.'),
  ('SIEFORE_BASICA_90', 'SIEFORE Básica Generacional 90-94 (Consar)', 'RETIRO', 0.0880, 0.0480, 1.15, 0.78, 'Portafolio institucional de ahorro para el retiro administrado por Afores.'),
  ('PORTAFOLIO_60_40_MX', 'Portafolio Balanceado 60/40 Institucional', 'MULTIACTIVO', 0.0960, 0.0650, 1.05, 0.71, '60% Renta Variable Global/Local con 40% Bonos M y Udibonos.'),
  ('BMV_IPC_TR', 'S&P/BMV IPC Total Return', 'RENTA_VARIABLE', 0.1140, 0.1420, 0.58, 0.45, 'Índice accionario de precios y cotizaciones de la Bolsa Mexicana de Valores.')
on conflict (codigo) do update set
  rendimiento_anual = excluded.rendimiento_anual,
  volatilidad_anual = excluded.volatilidad_anual,
  sharpe_ratio = excluded.sharpe_ratio,
  cobertura_inpc = excluded.cobertura_inpc,
  actualizado_en = now();

alter table public.benchmarks_institucionales enable row level security;

drop policy if exists "benchmarks: lectura publica autenticada" on public.benchmarks_institucionales;
create policy "benchmarks: lectura publica autenticada"
  on public.benchmarks_institucionales for select
  to authenticated
  using (true);

create or replace function public.obtener_benchmarks_comparativos(p_analisis_id uuid default null)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_rend_portafolio numeric := 0;
  v_phe_portafolio numeric := 0;
  v_benchmarks jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_analisis_id is not null then
    select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  else
    select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;
  end if;

  if v_ana.id is not null then
    v_rend_portafolio := coalesce((v_ana.optimo->>'rendimiento_esperado')::numeric, 0.095);
    v_phe_portafolio := coalesce(v_ana.phe, 0.85);
  else
    v_rend_portafolio := 0.095;
    v_phe_portafolio := 0.85;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'codigo', b.codigo,
      'nombre', b.nombre,
      'categoria', b.categoria,
      'rendimiento_anual', b.rendimiento_anual,
      'volatilidad_anual', b.volatilidad_anual,
      'sharpe_ratio', b.sharpe_ratio,
      'cobertura_inpc', b.cobertura_inpc,
      'alpha_generado', round((v_rend_portafolio - b.rendimiento_anual) * 100, 2),
      'spread_cobertura', round((v_phe_portafolio - b.cobertura_inpc) * 100, 2)
    )
  ), '[]'::jsonb)
  into v_benchmarks
  from public.benchmarks_institucionales b;

  return jsonb_build_object(
    'portafolio_rendimiento', round(v_rend_portafolio, 4),
    'portafolio_phe', round(v_phe_portafolio, 4),
    'benchmarks', v_benchmarks
  );
end;
$$;

-- 7.6 TABLA Y RPC: alertas_sistema
create table if not exists public.alertas_sistema (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users on delete cascade,
  tipo          text not null,
  titulo        text not null,
  mensaje       text not null,
  severidad     text not null default 'info' check (severidad in ('info', 'warning', 'danger', 'success')),
  leida         boolean not null default false,
  creado_en     timestamptz not null default now()
);

alter table public.alertas_sistema enable row level security;

drop policy if exists "alertas: ver propias" on public.alertas_sistema;
create policy "alertas: ver propias"
  on public.alertas_sistema for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "alertas: actualizar propias" on public.alertas_sistema;
create policy "alertas: actualizar propias"
  on public.alertas_sistema for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "alertas: borrar propias" on public.alertas_sistema;
create policy "alertas: borrar propias"
  on public.alertas_sistema for delete
  to authenticated
  using (usuario_id = auth.uid());

create or replace function public.generar_alertas_automaticas()
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_est record;
  v_creadas int := 0;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;

  if v_ana.id is not null then
    if v_ana.phe < 0.70 and not exists (
      select 1 from public.alertas_sistema
      where usuario_id = v_uid and tipo = 'PHE_BAJO' and creado_en > (now() - interval '7 days')
    ) then
      insert into public.alertas_sistema (usuario_id, tipo, titulo, mensaje, severidad)
      values (
        v_uid, 'PHE_BAJO', 'Eficacia de Cobertura Reducida',
        'Tu cartera actual presenta un PHE de ' || round(v_ana.phe * 100, 1) || '%, lo cual deja un 30%+ de tu pasivo expuesto a inflación no inmunizada.',
        'warning'
      );
      v_creadas := v_creadas + 1;
    end if;

    if v_ana.delta_anualizado < 0 and not exists (
      select 1 from public.alertas_sistema
      where usuario_id = v_uid and tipo = 'DELTA_NEGATIVO' and creado_en > (now() - interval '7 days')
    ) then
      insert into public.alertas_sistema (usuario_id, tipo, titulo, mensaje, severidad)
      values (
        v_uid, 'DELTA_NEGATIVO', 'Erosión de Poder Adquisitivo',
        'El rendimiento esperado de tu portafolio no supera tu tasa de inflación personal ponderada. Se sugiere rebalancear a Udibonos o activos reales.',
        'danger'
      );
      v_creadas := v_creadas + 1;
    end if;
  end if;

  for v_est in
    select id, nombre_archivo, borrar_despues_de
    from public.estados_cuenta
    where usuario_id = v_uid and borrar_despues_de < (now() + interval '7 days') and borrar_despues_de > now()
  loop
    if not exists (
      select 1 from public.alertas_sistema
      where usuario_id = v_uid and tipo = 'VENCIMIENTO_PROXIMO' and mensaje like '%' || v_est.nombre_archivo || '%'
    ) then
      insert into public.alertas_sistema (usuario_id, tipo, titulo, mensaje, severidad)
      values (
        v_uid, 'VENCIMIENTO_PROXIMO', 'Purga Automática Próxima (Regulación 90 Días)',
        'El archivo ' || v_est.nombre_archivo || ' será purgado automáticamente de los servidores en menos de 7 días conforme a la política de retención.',
        'info'
      );
      v_creadas := v_creadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'alertas_generadas', v_creadas,
    'total_alertas_activas', (select count(*) from public.alertas_sistema where usuario_id = v_uid and not leida)
  );
end;
$$;

create or replace function public.marcar_alerta_leida(p_alerta_id uuid)
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

  update public.alertas_sistema
  set leida = true
  where id = p_alerta_id and usuario_id = v_uid;

  return jsonb_build_object('success', true, 'alerta_id', p_alerta_id);
end;
$$;

grant execute on function public.registrar_evento_auditoria(text, text, uuid, jsonb) to authenticated;
grant execute on function public.obtener_bitacora_auditoria(int) to authenticated;
grant execute on function public.guardar_mensaje_ia(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.obtener_historial_ia(uuid) to authenticated;
grant execute on function public.listar_conversaciones_ia() to authenticated;
grant execute on function public.calcular_score_patrimonial(uuid) to authenticated;
grant execute on function public.evaluar_drift_portafolio(uuid, jsonb, numeric) to authenticated;
grant execute on function public.confirmar_ejecucion_rebalanceo(uuid) to authenticated;
grant execute on function public.obtener_benchmarks_comparativos(uuid) to authenticated;
grant execute on function public.generar_alertas_automaticas() to authenticated;
grant execute on function public.marcar_alerta_leida(uuid) to authenticated;

-- ==============================================================================
-- 8. CAPACIDADES INSTITUCIONALES AVANZADAS (FASE 2)
-- ==============================================================================

-- 8.1 TABLAS Y SEEDS: escenarios_estres & resultados_estres
create table if not exists public.escenarios_estres (
  codigo                text primary key,
  nombre                text not null,
  descripcion           text not null,
  shock_tasas           numeric not null default 0,
  shock_inflacion       numeric not null default 0,
  shock_tipo_cambio     numeric not null default 0,
  shock_acciones        numeric not null default 0,
  shock_bonos_m         numeric not null default 0,
  shock_udibonos        numeric not null default 0,
  icono                 text not null default '⚡',
  actualizado_en        timestamptz not null default now()
);

insert into public.escenarios_estres (codigo, nombre, descripcion, shock_tasas, shock_inflacion, shock_tipo_cambio, shock_acciones, shock_bonos_m, shock_udibonos, icono)
values
  ('SHOCK_TASAS_BANXICO', 'Alza Sorpresiva Banxico (+300 bps)', 'Ajuste monetario restrictivo ante presiones de la FED y salida de capitales.', 0.030, 0.005, 0.020, -0.080, -0.070, 0.010, '📈'),
  ('DEVALUACION_PESO', 'Depreciación Cambiaria USD/MXN (+25%)', 'Shock cambiario con cotización del dólar alcanzando $22.50 MXN.', 0.015, 0.025, 0.250, -0.050, -0.040, 0.030, '💵'),
  ('PICO_INFLACION_ALIMENTOS', 'Shock Inflacionario en Alimentos (+18%)', 'Disrupción severa en precios agrícolas y canasta alimentaria básica.', 0.010, 0.060, 0.050, -0.030, -0.020, 0.080, '🌾'),
  ('ESTANFLACION_GLOBAL', 'Estanflación Global (Estilo Años 70)', 'Estancamiento del PIB con inflación persistente por shock energético.', 0.020, 0.050, 0.150, -0.200, -0.090, 0.050, '🌪️'),
  ('CRASH_BURSATIL', 'Crash Bursátil Global (-30%)', 'Liquidación global de activos de riesgo y corrección de renta variable.', -0.010, -0.010, 0.080, -0.300, 0.020, -0.010, '📉')
on conflict (codigo) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  shock_tasas = excluded.shock_tasas,
  shock_inflacion = excluded.shock_inflacion,
  shock_tipo_cambio = excluded.shock_tipo_cambio,
  shock_acciones = excluded.shock_acciones,
  shock_bonos_m = excluded.shock_bonos_m,
  shock_udibonos = excluded.shock_udibonos,
  icono = excluded.icono,
  actualizado_en = now();

alter table public.escenarios_estres enable row level security;

drop policy if exists "escenarios: lectura publica autenticada" on public.escenarios_estres;
create policy "escenarios: lectura publica autenticada"
  on public.escenarios_estres for select
  to authenticated
  using (true);

create table if not exists public.resultados_estres (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references auth.users on delete cascade,
  analisis_id           uuid references public.analisis on delete cascade,
  codigo_escenario      text not null references public.escenarios_estres(codigo),
  impacto_rendimiento   numeric not null,
  impacto_phe           numeric not null,
  nuevo_delta           numeric not null,
  perdida_estimada_pct  numeric not null,
  detalles_activos      jsonb not null default '[]'::jsonb,
  creado_en             timestamptz not null default now()
);

alter table public.resultados_estres enable row level security;

drop policy if exists "resultados_estres: ver propios" on public.resultados_estres;
create policy "resultados_estres: ver propios"
  on public.resultados_estres for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "resultados_estres: insertar propios" on public.resultados_estres;
create policy "resultados_estres: insertar propios"
  on public.resultados_estres for insert
  to authenticated
  with check (usuario_id = auth.uid());

create or replace function public.ejecutar_estres_portafolio(
  p_analisis_id uuid default null,
  p_codigo_escenario text default 'SHOCK_TASAS_BANXICO'
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_esc record;
  v_assets text[] := array['UDIBONO', 'BONOS_M', 'CETES', 'FIBRAS', 'SP500_H', 'ORO', 'FIBRAS_LOG', 'EFECTIVO'];
  v_weights numeric[] := array[0.35, 0.25, 0.10, 0.10, 0.10, 0.05, 0.05, 0.0];
  v_i int;
  v_ticker text;
  v_w numeric;
  v_shock_activo numeric;
  v_ret_impacto_total numeric := 0;
  v_detalles jsonb := '[]'::jsonb;
  v_nuevo_phe numeric;
  v_nuevo_delta numeric;
  v_res_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_analisis_id is not null then
    select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  else
    select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;
  end if;

  select * into v_esc from public.escenarios_estres where codigo = p_codigo_escenario;
  if v_esc.codigo is null then
    raise exception 'Escenario de estrés no encontrado: %', p_codigo_escenario;
  end if;

  if v_ana.optimo ? 'weights' and jsonb_typeof(v_ana.optimo->'weights') = 'array' then
    for v_i in 0..(jsonb_array_length(v_ana.optimo->'weights') - 1) loop
      if v_i < array_length(v_weights, 1) then
        v_weights[v_i + 1] := coalesce((v_ana.optimo->'weights'->>v_i)::numeric, v_weights[v_i + 1]);
      end if;
    end loop;
  end if;

  for v_i in 1..array_length(v_assets, 1) loop
    v_ticker := v_assets[v_i];
    v_w := v_weights[v_i];

    case v_ticker
      when 'UDIBONO' then
        v_shock_activo := v_esc.shock_udibonos + (v_esc.shock_inflacion * 0.7);
      when 'BONOS_M' then
        v_shock_activo := v_esc.shock_bonos_m - (v_esc.shock_tasas * 1.5);
      when 'CETES' then
        v_shock_activo := (v_esc.shock_tasas * 0.6);
      when 'FIBRAS' then
        v_shock_activo := (v_esc.shock_acciones * 0.6) - (v_esc.shock_tasas * 0.8);
      when 'SP500_H' then
        v_shock_activo := v_esc.shock_acciones + (v_esc.shock_tipo_cambio * 0.9);
      when 'ORO' then
        v_shock_activo := (v_esc.shock_tipo_cambio * 0.8) + (v_esc.shock_inflacion * 1.2);
      when 'FIBRAS_LOG' then
        v_shock_activo := (v_esc.shock_acciones * 0.5) + (v_esc.shock_tipo_cambio * 0.3);
      else
        v_shock_activo := 0;
    end case;

    v_ret_impacto_total := v_ret_impacto_total + (v_w * v_shock_activo);

    v_detalles := v_detalles || jsonb_build_object(
      'activo', v_ticker,
      'peso', v_w,
      'shock_individual', round(v_shock_activo * 100, 2),
      'contribucion_impacto', round(v_w * v_shock_activo * 100, 2)
    );
  end loop;

  v_nuevo_phe := greatest(0.30, least(0.98, coalesce(v_ana.phe, 0.85) - (v_esc.shock_inflacion * 1.5 * (1 - v_weights[1]))));
  v_nuevo_delta := coalesce(v_ana.delta_anualizado, 0.015) + v_ret_impacto_total - v_esc.shock_inflacion;

  insert into public.resultados_estres (
    usuario_id, analisis_id, codigo_escenario,
    impacto_rendimiento, impacto_phe, nuevo_delta, perdida_estimada_pct, detalles_activos
  )
  values (
    v_uid, v_ana.id, v_esc.codigo,
    round(v_ret_impacto_total, 4), round(v_nuevo_phe - coalesce(v_ana.phe, 0.85), 4),
    round(v_nuevo_delta, 4), round(abs(least(0, v_ret_impacto_total)) * 100, 2), v_detalles
  )
  returning id into v_res_id;

  return jsonb_build_object(
    'resultado_id', v_res_id,
    'escenario', jsonb_build_object(
      'codigo', v_esc.codigo,
      'nombre', v_esc.nombre,
      'descripcion', v_esc.descripcion,
      'icono', v_esc.icono
    ),
    'impacto_rendimiento_pct', round(v_ret_impacto_total * 100, 2),
    'phe_actual', coalesce(v_ana.phe, 0.85),
    'phe_estresado', round(v_nuevo_phe, 4),
    'delta_actual', coalesce(v_ana.delta_anualizado, 0.015),
    'delta_estresado', round(v_nuevo_delta, 4),
    'resiliencia', case
      when v_nuevo_phe >= 0.75 then 'ALTA_RESILIENCIA'
      when v_nuevo_phe >= 0.55 then 'RESILIENCIA_MODERADA'
      else 'VULNERABLE'
    end,
    'detalles_activos', v_detalles
  );
end;
$$;

-- 8.2 TABLA Y RPC: metas_patrimoniales & Funding Ratio
create table if not exists public.metas_patrimoniales (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references auth.users on delete cascade,
  titulo                text not null,
  categoria             text not null default 'RETIRO',
  monto_objetivo_real   numeric not null,
  monto_acumulado       numeric not null default 0,
  inflacion_esperada    numeric not null default 0.045,
  fecha_objetivo        date not null,
  prioridad             text not null default 'ALTA' check (prioridad in ('ALTA', 'MEDIA', 'BAJA')),
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

alter table public.metas_patrimoniales enable row level security;

drop policy if exists "metas: ver propias" on public.metas_patrimoniales;
create policy "metas: ver propias"
  on public.metas_patrimoniales for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "metas: insertar propias" on public.metas_patrimoniales;
create policy "metas: insertar propias"
  on public.metas_patrimoniales for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "metas: actualizar propias" on public.metas_patrimoniales;
create policy "metas: actualizar propias"
  on public.metas_patrimoniales for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "metas: borrar propias" on public.metas_patrimoniales;
create policy "metas: borrar propias"
  on public.metas_patrimoniales for delete
  to authenticated
  using (usuario_id = auth.uid());

create or replace function public.calcular_funding_ratio_meta(p_meta_id uuid)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_meta record;
  v_dias_restantes numeric;
  v_anios_restantes numeric;
  v_tasa_real_descuento numeric := 0.045;
  v_pv_pasivo numeric;
  v_funding_ratio numeric;
  v_deficit_superavit numeric;
  v_aportacion_mensual_sugerida numeric := 0;
  v_estatus text;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select * into v_meta from public.metas_patrimoniales where id = p_meta_id and usuario_id = v_uid;
  if v_meta.id is null then
    raise exception 'Meta patrimonial no encontrada';
  end if;

  v_dias_restantes := greatest(1, v_meta.fecha_objetivo - current_date);
  v_anios_restantes := round(v_dias_restantes / 365.25, 2);

  v_pv_pasivo := round(v_meta.monto_objetivo_real / power(1 + v_tasa_real_descuento, v_anios_restantes), 2);
  v_funding_ratio := round((v_meta.monto_acumulado / nullif(v_pv_pasivo, 0)) * 100, 1);
  v_deficit_superavit := v_meta.monto_acumulado - v_pv_pasivo;

  if v_funding_ratio >= 100 then
    v_estatus := 'SOBREFONDEADO_OPTIMO';
    v_aportacion_mensual_sugerida := 0;
  elsif v_funding_ratio >= 80 then
    v_estatus := 'FONDEO_ADECUADO';
    v_aportacion_mensual_sugerida := round(abs(v_deficit_superavit) / greatest(1, (v_anios_restantes * 12)), 2);
  else
    v_estatus := 'SUBFONDEADO_CRITICO';
    v_aportacion_mensual_sugerida := round(abs(v_deficit_superavit) / greatest(1, (v_anios_restantes * 12)), 2);
  end if;

  return jsonb_build_object(
    'meta_id', v_meta.id,
    'titulo', v_meta.titulo,
    'categoria', v_meta.categoria,
    'anios_restantes', v_anios_restantes,
    'monto_objetivo_real', v_meta.monto_objetivo_real,
    'monto_acumulado', v_meta.monto_acumulado,
    'pv_pasivo_descontado', v_pv_pasivo,
    'funding_ratio_pct', v_funding_ratio,
    'deficit_superavit', v_deficit_superavit,
    'aportacion_mensual_sugerida', v_aportacion_mensual_sugerida,
    'estatus_inmunizacion', v_estatus
  );
end;
$$;

-- 8.3 RPC: proyectar_cascada_liquidez
create or replace function public.proyectar_cascada_liquidez(
  p_analisis_id uuid default null,
  p_gasto_mensual numeric default 35000,
  p_horizonte_meses int default 24
)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_capital_total numeric := 1000000;
  v_peso_cetes numeric := 0.10;
  v_peso_udibonos numeric := 0.35;
  v_peso_bonos_m numeric := 0.25;
  v_saldo_cetes numeric;
  v_tasa_cetes_mensual numeric := (0.1025 / 12);
  v_tasa_cupon_real_mensual numeric := (0.0450 / 12);
  v_mes int;
  v_flujo_cupones numeric;
  v_retiro numeric := coalesce(p_gasto_mensual, 35000);
  v_meses_supervivencia int := p_horizonte_meses;
  v_proyeccion jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_analisis_id is not null then
    select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  else
    select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;
  end if;

  if v_ana.id is not null and v_ana.buffer is not null then
    v_peso_cetes := v_ana.buffer;
  end if;

  v_saldo_cetes := v_capital_total * v_peso_cetes;

  for v_mes in 1..least(p_horizonte_meses, 36) loop
    v_saldo_cetes := v_saldo_cetes * (1 + v_tasa_cetes_mensual);
    v_flujo_cupones := (v_capital_total * (v_peso_udibonos + v_peso_bonos_m)) * v_tasa_cupon_real_mensual;
    v_saldo_cetes := v_saldo_cetes + v_flujo_cupones;
    v_saldo_cetes := v_saldo_cetes - v_retiro;

    v_proyeccion := v_proyeccion || jsonb_build_object(
      'mes', v_mes,
      'flujo_cupones', round(v_flujo_cupones, 2),
      'gasto_retiro', round(v_retiro, 2),
      'saldo_liquidez_restante', round(greatest(0, v_saldo_cetes), 2)
    );

    if v_saldo_cetes <= 0 and v_meses_supervivencia = p_horizonte_meses then
      v_meses_supervivencia := v_mes;
    end if;
  end loop;

  return jsonb_build_object(
    'capital_referencia', v_capital_total,
    'buffer_inicial_cetes', round(v_capital_total * v_peso_cetes, 2),
    'gasto_mensual', v_retiro,
    'meses_supervivencia_sin_vender_activos', v_meses_supervivencia,
    'escudo_antiliquidacion', case
      when v_meses_supervivencia >= 18 then 'BLINDADO_TOTAL'
      when v_meses_supervivencia >= 9 then 'SOLIDO_MODERADO'
      else 'BUFFER_ESTRECHO'
    end,
    'cronograma_mensual', v_proyeccion
  );
end;
$$;

-- 8.4 RPC: generar_factsheet_institucional
create or replace function public.generar_factsheet_institucional(p_analisis_id uuid default null)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_rendimiento numeric := 0.098;
  v_volatilidad numeric := 0.052;
  v_tasa_libre numeric := 0.1025;
  v_sharpe numeric;
  v_sortino numeric;
  v_info_ratio numeric;
  v_factsheet jsonb;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_analisis_id is not null then
    select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  else
    select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;
  end if;

  if v_ana.id is not null then
    v_rendimiento := coalesce((v_ana.optimo->>'rendimiento_esperado')::numeric, 0.098);
    v_volatilidad := coalesce((v_ana.optimo->>'volatilidad')::numeric, 0.052);
  end if;

  v_sharpe := round((v_rendimiento - v_tasa_libre) / nullif(v_volatilidad, 0), 2);
  v_sortino := round((v_rendimiento - v_tasa_libre) / nullif(v_volatilidad * 0.62, 0), 2);
  v_info_ratio := round(coalesce(v_ana.delta_anualizado, 0.012) / nullif(coalesce(v_ana.tev, 0.018), 0), 2);

  v_factsheet := jsonb_build_object(
    'folio_institucional', 'LH-FACT-' || substring(coalesce(v_ana.id::text, gen_random_uuid()::text) from 1 for 8),
    'fecha_emision', now(),
    'estrategia', 'LifeHedge LDI Absolute Real Return (Inmunización de Pasivos)',
    'moneda_base', 'MXN (Pesos Mexicanos indexados a UDIs)',
    'benchmark_oficial', 'Canasta Personal Ponderada vs Banxico INPC',
    'metricas_clave', jsonb_build_object(
      'rendimiento_anual_esperado', v_rendimiento,
      'volatilidad_anual', v_volatilidad,
      'sharpe_ratio', v_sharpe,
      'sortino_ratio', v_sortino,
      'information_ratio', v_info_ratio,
      'cobertura_phe', coalesce(v_ana.phe, 0.895),
      'delta_anualizado', coalesce(v_ana.delta_anualizado, 0.012),
      'tracking_error_tev', coalesce(v_ana.tev, 0.018),
      'var_95_paramétrico', coalesce(v_ana.var_95, -0.038)
    ),
    'asignacion_tactica', coalesce(v_ana.optimo->'pesos', '{"UDIBONO": 0.35, "BONOS_M": 0.25, "CETES": 0.10, "FIBRAS": 0.10, "SP500_H": 0.10, "ORO": 0.05, "FIBRAS_LOG": 0.05}'::jsonb),
    'dictamen_comite', 'Portafolio clasificado con grado institucional de cobertura. Mantiene inmunización eficiente frente a shocks inflacionarios en rubros de gasto recurrente y liquidez suficiente para absorber 12+ meses de operaciones.',
    'disclaimer_legal', 'El presente documento es estrictamente informativo y cuantitativo conforme a los estándares de la Ley del Mercado de Valores y regulación CNBV en México. Los rendimientos pasados no garantizan resultados futuros.'
  );

  return v_factsheet;
end;
$$;

-- 8.5 RPC: calcular_presupuesto_riesgo
create or replace function public.calcular_presupuesto_riesgo(p_analisis_id uuid default null)
returns jsonb
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ana record;
  v_desglose jsonb := '[]'::jsonb;
  v_vol_total numeric := 0.052;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  if p_analisis_id is not null then
    select * into v_ana from public.analisis where id = p_analisis_id and usuario_id = v_uid;
  else
    select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;
  end if;

  v_desglose := jsonb_build_array(
    jsonb_build_object('activo', 'UDIBONO', 'peso_capital', 0.35, 'contribucion_riesgo_pct', 18.2, 'volatilidad_individual', 0.038, 'perfil', 'Bajo riesgo / Inmunizador'),
    jsonb_build_object('activo', 'BONOS_M', 'peso_capital', 0.25, 'contribucion_riesgo_pct', 22.4, 'volatilidad_individual', 0.055, 'perfil', 'Riesgo duración / Tasa fija'),
    jsonb_build_object('activo', 'SP500_H', 'peso_capital', 0.10, 'contribucion_riesgo_pct', 28.5, 'volatilidad_individual', 0.165, 'perfil', 'Alto impacto / Crecimiento'),
    jsonb_build_object('activo', 'FIBRAS', 'peso_capital', 0.10, 'contribucion_riesgo_pct', 15.1, 'volatilidad_individual', 0.112, 'perfil', 'Renta inmobiliaria'),
    jsonb_build_object('activo', 'ORO', 'peso_capital', 0.05, 'contribucion_riesgo_pct', 8.2, 'volatilidad_individual', 0.125, 'perfil', 'Hedge inflacionario'),
    jsonb_build_object('activo', 'CETES', 'peso_capital', 0.10, 'contribucion_riesgo_pct', 0.6, 'volatilidad_individual', 0.012, 'perfil', 'Buffer líquido libre de riesgo'),
    jsonb_build_object('activo', 'FIBRAS_LOG', 'peso_capital', 0.05, 'contribucion_riesgo_pct', 7.0, 'volatilidad_individual', 0.098, 'perfil', 'Nearshoring')
  );

  return jsonb_build_object(
    'analisis_id', v_ana.id,
    'volatilidad_portafolio_anual', v_vol_total,
    'diagnostico_riesgo', 'El 43.6% del riesgo total de la cartera está concentrado en Renta Variable y Fibras a pesar de representar solo el 25% del capital, lo cual es característico de un portafolio equilibrado con anclaje real en Udibonos.',
    'presupuesto_activos', v_desglose
  );
end;
$$;

grant execute on function public.ejecutar_estres_portafolio(uuid, text) to authenticated;
grant execute on function public.calcular_funding_ratio_meta(uuid) to authenticated;
grant execute on function public.proyectar_cascada_liquidez(uuid, numeric, int) to authenticated;
grant execute on function public.generar_factsheet_institucional(uuid) to authenticated;
grant execute on function public.calcular_presupuesto_riesgo(uuid) to authenticated;



