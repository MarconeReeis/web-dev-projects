-- ════════════════════════════════════════════════════════════════════════
-- Átrio — imagens no Storage
--
-- Foto de profissional e logo da barbearia saem de dentro do banco (texto
-- base64 em photo_url / branding.logoUrl) e vão para o bucket "midia". No
-- banco fica só o link.
--
-- Por quê: a lista de profissionais carregava todas as fotos inteiras a cada
-- leitura — o app do cliente baixava tudo de novo em cada abertura. Com
-- link, o celular guarda a imagem em cache, e a consulta volta a ser leve.
--
-- Público para LER: é a vitrine, aparece para qualquer cliente. Para
-- ESCREVER, só a equipe da barbearia, e só dentro da pasta dela:
--
--   midia/<tenant_id>/profissionais/<arquivo>
--   midia/<tenant_id>/marca/<arquivo>
--
-- O nome do arquivo é único a cada envio: trocar a foto é enviar outra, e
-- o celular pode guardar a antiga em cache para sempre sem nunca mostrar
-- uma imagem velha no lugar da nova.
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- A barbearia dona de um caminho: a primeira pasta, se for um uuid.
-- Caminho fora do formato devolve null — e is_member(null) é falso.
create function private.tenant_of_path(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

grant execute on function private.tenant_of_path(text) to anon, authenticated;

create policy "equipe envia imagens da barbearia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'midia' and private.is_member(private.tenant_of_path(name)));

-- Remover exige ler os metadados do arquivo antes (é assim que o Storage
-- localiza o que apagar). Os arquivos são públicos de qualquer forma.
create policy "equipe vê as imagens da barbearia" on storage.objects
  for select to authenticated
  using (bucket_id = 'midia' and private.is_member(private.tenant_of_path(name)));

create policy "equipe remove imagens da barbearia" on storage.objects
  for delete to authenticated
  using (bucket_id = 'midia' and private.is_member(private.tenant_of_path(name)));
