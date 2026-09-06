-- Migración: Funciones y RPCs de utilidad para frontend (Historial, Comparar, Cuenta)
-- Todas las funciones usan SECURITY DEFINER y SET search_path = '' para máxima seguridad.

-- 1. Resumen de métricas para la pantalla de Cuenta y Dashboard
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

-- 2. Comparación detallada de dos análisis para la pantalla Comparar
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

-- 3. Tendencia histórica para gráficas en Recharts (pantalla Historial)
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

-- 4. Purga completa: borra registros y devuelve las rutas de archivos para eliminarlos de Storage
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

-- 5. Actualización segura del nombre de perfil
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

-- Otorgar permisos de ejecución al rol autenticado
grant execute on function public.resumen_usuario() to authenticated;
grant execute on function public.comparar_dos_analisis(uuid, uuid) to authenticated;
grant execute on function public.tendencia_historica() to authenticated;
grant execute on function public.purgar_estados_con_rutas() to authenticated;
grant execute on function public.actualizar_nombre_perfil(text) to authenticated;
