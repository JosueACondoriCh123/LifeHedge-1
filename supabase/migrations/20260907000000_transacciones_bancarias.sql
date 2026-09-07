-- ==============================================================================
-- LIFEHEDGE: TABLA DE TRANSACCIONES BANCARIAS REALES Y POLITICAS RLS
-- ==============================================================================

create table if not exists public.transacciones_bancarias (
  id                uuid primary key default gen_random_uuid(),
  usuario_id        uuid not null references auth.users on delete cascade,
  estado_cuenta_id  uuid references public.estados_cuenta on delete cascade,
  fecha             date not null default current_date,
  concepto          text not null,
  monto             numeric(12, 2) not null,
  rubro             text not null default 'otros',
  moneda            text not null default 'MXN',
  creado_en         timestamptz not null default now()
);

-- Habilitar Row Level Security (RLS)
alter table public.transacciones_bancarias enable row level security;

-- Politicas de seguridad por usuario
drop policy if exists "transacciones: leer propias" on public.transacciones_bancarias;
create policy "transacciones: leer propias"
  on public.transacciones_bancarias for select
  to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "transacciones: insertar propias" on public.transacciones_bancarias;
create policy "transacciones: insertar propias"
  on public.transacciones_bancarias for insert
  to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "transacciones: actualizar propias" on public.transacciones_bancarias;
create policy "transacciones: actualizar propias"
  on public.transacciones_bancarias for update
  to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "transacciones: eliminar propias" on public.transacciones_bancarias;
create policy "transacciones: eliminar propias"
  on public.transacciones_bancarias for delete
  to authenticated
  using (usuario_id = auth.uid());

-- Indices de consulta frecuente
create index if not exists idx_transacciones_usuario_fecha
  on public.transacciones_bancarias (usuario_id, fecha desc);

create index if not exists idx_transacciones_usuario_rubro
  on public.transacciones_bancarias (usuario_id, rubro);

create index if not exists idx_transacciones_estado_cuenta
  on public.transacciones_bancarias (estado_cuenta_id);
