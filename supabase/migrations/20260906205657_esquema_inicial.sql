-- Migración inicial: esquema de LifeHedge
-- Tablas: perfiles, estados_cuenta, analisis
-- Disparador: creacion automatica de perfil al registrar usuario

-- 1. Perfil (extiende auth.users)
create table public.perfiles (
  id          uuid primary key references auth.users on delete cascade,
  nombre      text,
  creado_en   timestamptz not null default now()
);

-- 2. Estados de cuenta
create table public.estados_cuenta (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users on delete cascade,
  ruta_storage      text not null,          -- '{usuario_id}/{uuid}.pdf'
  nombre_archivo    text not null,
  emisor            text,                   -- BBVA | SANTANDER | ... | GENERICO
  bytes             integer,
  subido_en         timestamptz not null default now(),
  borrar_despues_de timestamptz not null default (now() + interval '90 days')
);

-- 3. Análisis
create table public.analisis (
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
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)));
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.manejar_usuario_nuevo();
