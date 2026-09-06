-- Script de verificación obligatoria de Row Level Security (RLS)
-- Este script se puede ejecutar en el SQL Editor de Supabase para comprobar el aislamiento.

-- 1. Simular sesión autenticada como Usuario 1
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

-- Test 1.1: Solo debe contar los análisis propios (Usuario 1)
select count(*) as analisis_usuario_1 from public.analisis;

-- Test 1.2: Solo debe ver el perfil del Usuario 1
select id, nombre from public.perfiles;

-- Test 1.3: INSERCIÓN CRUZADA (Debe FALLAR con error de RLS)
-- Intento de Usuario 1 de insertar un análisis asignado al Usuario 2
do $$
begin
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
    'Intento de inserción cruzada ilegítima',
    '{"alimentos": 0.5}'::jsonb,
    0.1,
    12,
    '{}'::jsonb,
    '{}'::jsonb,
    '{}'::jsonb
  );
  raise exception 'FALLO CRÍTICO DE SEGURIDAD: La política RLS WITH CHECK permitió insertar a nombre de otro usuario.';
exception
  when insufficient_privilege then
    raise notice 'PRUEBA EXITOSA (insufficient_privilege): RLS bloqueó la inserción cruzada.';
  when others then
    if sqlerrm like '%violates row-level security policy%' then
      raise notice 'PRUEBA EXITOSA (row-level security violation): %', sqlerrm;
    else
      raise exception 'Error inesperado: %', sqlerrm;
    end if;
end $$;

-- 2. Simular sesión autenticada como Usuario 2
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

-- Test 2.1: Solo debe contar los análisis del Usuario 2
select count(*) as analisis_usuario_2 from public.analisis;

-- 3. Resetear rol
reset role;
