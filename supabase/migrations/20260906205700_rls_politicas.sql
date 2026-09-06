-- Migración RLS: Aislamiento estricto por usuario
-- Tablas protegidas: perfiles, estados_cuenta, analisis

-- 1. Habilitar RLS en todas las tablas
alter table public.perfiles       enable row level security;
alter table public.estados_cuenta enable row level security;
alter table public.analisis       enable row level security;

-- 2. Políticas para perfiles
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

-- 3. Políticas para estados_cuenta
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

-- 4. Políticas para analisis
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
