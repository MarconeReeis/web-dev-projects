-- ─── aceite dos termos (LGPD) ────────────────────────────────────────────
--
-- Quem cria conta no app do cliente aceita os Termos de uso e a Política de
-- privacidade. Fica guardado QUAL versão foi aceita e QUANDO — é a prova do
-- consentimento, se um dia alguém perguntar.
--
-- O app manda a versão nos metadados do cadastro (`terms_version`), ao lado
-- de nome e telefone, e o perfil nasce com ela e com a hora do banco (não a
-- do aparelho, que pode estar errada ou ser forjada).

alter table public.profiles
  add column terms_version     text,
  add column terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'Versão dos Termos de uso e da Política de privacidade aceita (a data da versão, AAAA-MM-DD).';
comment on column public.profiles.terms_accepted_at is
  'Quando o aceite aconteceu, na hora do banco.';

-- O aceite não se edita por update: o cliente muda nome, telefone e foto;
-- versão e data só mudam por accept_terms, com a hora do banco.
revoke update on public.profiles from authenticated;
grant update (name, phone, photo_url) on public.profiles to authenticated;

-- Conta de cliente (com nome e telefone) só nasce com o aceite. Contas da
-- equipe, criadas sem esses dados, seguem sem perfil, como antes.
create or replace function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := trim(coalesce(new.raw_user_meta_data ->> 'name', ''));
  v_phone text := trim(coalesce(new.raw_user_meta_data ->> 'phone', ''));
  v_terms text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version', '')), '');
begin
  if length(v_name) >= 2 and length(regexp_replace(v_phone, '\D', '', 'g')) >= 10 then
    if v_terms is null then
      raise exception 'Para criar a conta, aceite os Termos de uso e a Política de privacidade.'
        using hint = 'termos_nao_aceitos';
    end if;
    insert into public.profiles (id, name, phone, terms_version, terms_accepted_at)
    values (new.id, v_name, v_phone, v_terms, now());
  end if;
  return new;
end;
$$;

-- Aceitar uma versão nova (ou, para contas de antes desta migração, a
-- primeira). Devolve a hora registrada.
create function public.accept_terms(p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Entre na sua conta para aceitar os termos.' using hint = 'nao_autenticado';
  end if;
  if coalesce(trim(p_version), '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Versão dos termos inválida.' using hint = 'versao_invalida';
  end if;

  update public.profiles
     set terms_version = trim(p_version), terms_accepted_at = v_at
   where id = v_uid;
  if not found then
    raise exception 'Esta conta não tem perfil de cliente.' using hint = 'sem_perfil';
  end if;
  return v_at;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;
