-- Migración Storage y Retención
-- Bucket privado: estados-cuenta (10MB máx, solo application/pdf)
-- Políticas: lectura, subida y borrado restringidos a la carpeta con el ID del usuario
-- Función: purga de estados de cuenta vencidos (90 días)

-- 1. Crear o actualizar bucket privado
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('estados-cuenta', 'estados-cuenta', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- 2. Políticas de acceso a storage.objects
-- Nota: La ruta de subida DEBE tener el formato: '{usuario_id}/{uuid}.pdf'
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

-- 3. Función de retención / purga de registros vencidos (>90 días)
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
