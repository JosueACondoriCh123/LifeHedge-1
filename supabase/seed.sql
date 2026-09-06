-- LifeHedge — Datos de prueba (Seed)
-- Cuentas de prueba para desarrollo:
--   Usuario 1: demo1@lifehedge.mx (UUID: 11111111-1111-1111-1111-111111111111)
--   Usuario 2: demo2@lifehedge.mx (UUID: 22222222-2222-2222-2222-222222222222)

-- Nota: Si se corre contra Supabase Cloud, los usuarios deben registrarse primero
-- mediante auth.signUp() o en el dashboard. Este script inserta perfiles y análisis
-- simulados garantizando que cada usuario tenga datos diferentes para probar Historial y Comparar.

-- Perfil Usuario 1
insert into public.perfiles (id, nombre)
values ('11111111-1111-1111-1111-111111111111', 'Sofía - Perfil Familiar')
on conflict (id) do update set nombre = excluded.nombre;

-- Perfil Usuario 2
insert into public.perfiles (id, nombre)
values ('22222222-2222-2222-2222-222222222222', 'Carlos - Perfil Independiente')
on conflict (id) do update set nombre = excluded.nombre;

-- Análisis 1 para demo1: Enfoque alimentos y vivienda
insert into public.analisis (
  id,
  usuario_id,
  etiqueta,
  pesos,
  buffer,
  horizonte,
  inflacion,
  optimo,
  riesgo,
  delta_anualizado,
  phe,
  tev,
  var_95,
  creado_en
) values (
  'a1111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Enero 2026 - Canasta Familiar',
  '{"alimentos": 0.40, "vivienda": 0.30, "transporte": 0.10, "salud": 0.10, "educacion": 0.05, "otros": 0.05}'::jsonb,
  0.10,
  12,
  '{"personal_anual": 0.058, "general_anual": 0.046, "delta_anualizado": 0.012, "stale": false, "as_of": "2026-01-31"}'::jsonb,
  '{"weights": [0.35, 0.25, 0.10, 0.10, 0.10, 0.05, 0.05, 0.0], "tev": 0.018, "phe": 0.895, "stale": false}'::jsonb,
  '{"var_95": -0.038, "cvar_95": -0.051, "media_final": 1.072, "stale": false}'::jsonb,
  0.0120,
  0.8950,
  0.0180,
  -0.0380,
  now() - interval '30 days'
) on conflict (id) do nothing;

-- Análisis 2 para demo1: Febrero 2026 con ajuste en educación
insert into public.analisis (
  id,
  usuario_id,
  etiqueta,
  pesos,
  buffer,
  horizonte,
  inflacion,
  optimo,
  riesgo,
  delta_anualizado,
  phe,
  tev,
  var_95,
  creado_en
) values (
  'a2222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'Febrero 2026 - Ajuste Escolar',
  '{"alimentos": 0.35, "vivienda": 0.25, "transporte": 0.10, "salud": 0.10, "educacion": 0.15, "otros": 0.05}'::jsonb,
  0.12,
  12,
  '{"personal_anual": 0.061, "general_anual": 0.047, "delta_anualizado": 0.014, "stale": false, "as_of": "2026-02-28"}'::jsonb,
  '{"weights": [0.40, 0.20, 0.10, 0.15, 0.05, 0.05, 0.05, 0.0], "tev": 0.021, "phe": 0.880, "stale": false}'::jsonb,
  '{"var_95": -0.042, "cvar_95": -0.055, "media_final": 1.068, "stale": false}'::jsonb,
  0.0140,
  0.8800,
  0.0210,
  -0.0420,
  now() - interval '5 days'
) on conflict (id) do nothing;

-- Análisis 1 para demo2: Enfoque transporte y tecnología
insert into public.analisis (
  id,
  usuario_id,
  etiqueta,
  pesos,
  buffer,
  horizonte,
  inflacion,
  optimo,
  riesgo,
  delta_anualizado,
  phe,
  tev,
  var_95,
  creado_en
) values (
  'b1111111-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  '22222222-2222-2222-2222-222222222222',
  'Enero 2026 - Movilidad y Tecnología',
  '{"alimentos": 0.20, "vivienda": 0.20, "transporte": 0.30, "salud": 0.05, "educacion": 0.10, "otros": 0.15}'::jsonb,
  0.08,
  6,
  '{"personal_anual": 0.052, "general_anual": 0.046, "delta_anualizado": 0.006, "stale": false, "as_of": "2026-01-31"}'::jsonb,
  '{"weights": [0.25, 0.30, 0.15, 0.15, 0.05, 0.10, 0.0, 0.0], "tev": 0.024, "phe": 0.840, "stale": false}'::jsonb,
  '{"var_95": -0.049, "cvar_95": -0.063, "media_final": 1.055, "stale": false}'::jsonb,
  0.0060,
  0.8400,
  0.0240,
  -0.0490,
  now() - interval '20 days'
) on conflict (id) do nothing;
