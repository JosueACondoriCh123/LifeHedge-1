-- ==============================================================================
-- LIFEHEDGE — MIGRACIÓN DE CAPACIDADES INSTITUCIONALES Y PROFESIONALES
-- Archivo: 20260906223500_funciones_profesionales.sql
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLA: bitacora_auditoria (Cumplimiento CNBV / LFPDPPP / Auditoría Inmutable)
-- ------------------------------------------------------------------------------
create table if not exists public.bitacora_auditoria (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users on delete cascade,
  accion          text not null,           -- ANALISIS_CREADO, ESTADO_SUBIDO, REBALANCEO_EJECUTADO, etc.
  entidad_tipo    text not null,           -- 'analisis', 'estado_cuenta', 'rebalanceo', 'perfil'
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

-- Función RPC para registrar eventos de auditoría desde frontend/backend
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

-- Función RPC para consultar la bitácora del usuario autenticado
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

-- Trigger para auditar automáticamente inserciones en public.analisis
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

-- ------------------------------------------------------------------------------
-- 2. TABLAS: conversaciones_ia y mensajes_ia (Memoria Cuantitativa del Asesor GLM-5.2)
-- ------------------------------------------------------------------------------
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
  metricas_contexto jsonb default null,     -- Snapshot de {phe, delta, tev, var_95, activos}
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

-- RPC para guardar mensaje atómicamente y actualizar la conversación
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

  -- Crear conversación si no existe
  if v_conv_id is null then
    insert into public.conversaciones_ia (usuario_id, titulo, modelo)
    values (v_uid, coalesce(p_nuevo_titulo, substring(trim(p_contenido) from 1 for 40)), 'z-ai/glm-5.2')
    returning id into v_conv_id;
  else
    -- Verificar propiedad
    if not exists (select 1 from public.conversaciones_ia where id = v_conv_id and usuario_id = v_uid) then
      raise exception 'Conversación no encontrada o no pertenece al usuario';
    end if;
    update public.conversaciones_ia
    set actualizado_en = now()
    where id = v_conv_id;
  end if;

  -- Insertar mensaje
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

-- RPC para obtener el historial de mensajes de una conversación
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

-- RPC para listar todas las conversaciones del usuario
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

-- ------------------------------------------------------------------------------
-- 3. MOTOR DE CALIFICACIÓN INSTITUCIONAL LDI: score_patrimonial_ldi
-- ------------------------------------------------------------------------------
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

  -- Seleccionar análisis especificado o el más reciente
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

  -- 1. Pilar 1: Cobertura de Pasivo (PHE) - Máx 40 puntos
  if v_ana.phe >= 0.85 then
    v_score_phe := 40;
  elsif v_ana.phe >= 0.70 then
    v_score_phe := 30 + ((v_ana.phe - 0.70) / 0.15) * 10;
  elsif v_ana.phe >= 0.50 then
    v_score_phe := 15 + ((v_ana.phe - 0.50) / 0.20) * 15;
  else
    v_score_phe := greatest(0, v_ana.phe * 30);
  end if;

  -- 2. Pilar 2: Rendimiento Real vs Inflación Personal (Delta) - Máx 25 puntos
  if v_ana.delta_anualizado >= 0.04 then
    v_score_delta := 25;
  elsif v_ana.delta_anualizado >= 0.01 then
    v_score_delta := 18 + ((v_ana.delta_anualizado - 0.01) / 0.03) * 7;
  elsif v_ana.delta_anualizado >= 0 then
    v_score_delta := 14 + (v_ana.delta_anualizado / 0.01) * 4;
  else
    v_score_delta := greatest(0, 14 + (v_ana.delta_anualizado * 100));
  end if;

  -- 3. Pilar 3: Estabilidad / Tracking Error (TEV) - Máx 20 puntos
  if v_ana.tev <= 0.025 then
    v_score_tev := 20;
  elsif v_ana.tev <= 0.05 then
    v_score_tev := 14 + ((0.05 - v_ana.tev) / 0.025) * 6;
  elsif v_ana.tev <= 0.08 then
    v_score_tev := 7 + ((0.08 - v_ana.tev) / 0.03) * 7;
  else
    v_score_tev := 4;
  end if;

  -- 4. Pilar 4: Diversificación HHI (Herfindahl-Hirschman) - Máx 15 puntos
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

  -- Suma de puntuación
  v_score_total := round(v_score_phe + v_score_delta + v_score_tev + v_score_hhi, 1);

  -- Asignación de Calificación Institucional
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

-- ------------------------------------------------------------------------------
-- 4. TABLA Y RPC: revisiones_rebalanceo (Monitoreo de Desvío / Corridor Drift)
-- ------------------------------------------------------------------------------
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

  -- Inferir o mapear pesos objetivo
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

  -- Iterar sobre las claves del objetivo y del actual
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

  -- Registrar en auditoría
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

-- ------------------------------------------------------------------------------
-- 5. TABLA Y DATOS: benchmarks_institucionales (Mercado Mexicano Banxico/Consar)
-- ------------------------------------------------------------------------------
create table if not exists public.benchmarks_institucionales (
  codigo              text primary key,
  nombre              text not null,
  categoria           text not null,       -- RENTA_FIJA, MULTIACTIVO, RETIRO, RENTA_VARIABLE
  rendimiento_anual   numeric not null,    -- Tasa anualizada esperada / observada
  volatilidad_anual   numeric not null,
  sharpe_ratio        numeric not null,
  cobertura_inpc      numeric not null,    -- Grado de correlación/inmunización con INPC
  descripcion         text,
  actualizado_en      timestamptz not null default now()
);

-- Semillas institucionales oficiales
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

-- RPC para calcular Alpha Institucional y spread vs Benchmarks
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

-- ------------------------------------------------------------------------------
-- 6. TABLA Y RPC: alertas_sistema (Avisos Proactivos de Cobertura y Vencimiento)
-- ------------------------------------------------------------------------------
create table if not exists public.alertas_sistema (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users on delete cascade,
  tipo          text not null,              -- VENCIMIENTO_PROXIMO, PHE_BAJO, REBALANCEO_DRIFT, INFLACION_PICO
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

-- RPC para evaluar la cuenta y generar alertas proactivas automáticamente
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

  -- 1. Verificar último análisis
  select * into v_ana from public.analisis where usuario_id = v_uid order by creado_en desc limit 1;

  if v_ana.id is not null then
    -- Alerta si PHE < 0.70
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

    -- Alerta si Delta anualizado < 0
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

  -- 2. Verificar estados de cuenta próximos a vencer (< 7 días)
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

-- RPC para marcar alerta como leída
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

-- ------------------------------------------------------------------------------
-- 7. PERMISOS DE EJECUCIÓN PARA ROL AUTENTICADO
-- ------------------------------------------------------------------------------
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
