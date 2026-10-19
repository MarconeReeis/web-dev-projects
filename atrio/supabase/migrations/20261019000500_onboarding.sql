-- ════════════════════════════════════════════════════════════════════════
-- Átrio — cadastrar uma barbearia nova
--
-- Uma chamada cria tudo o que a barbearia precisa para o dono entrar no
-- painel: a vitrine (tenants), a ficha da conta (tenant_accounts), o vínculo
-- de dono (tenant_members) e, se pedido, um catálogo inicial de serviços.
-- Tudo ou nada: barbearia sem dono, ou dono sem barbearia, não sobra.
--
-- Só a service_role executa — ou seja, o script tools/nova-barbearia.mjs,
-- rodado por quem administra o Átrio. Nem cliente nem equipe de barbearia
-- criam barbearia.
--
-- A conta do dono já precisa existir no Supabase Auth: criar usuário é API
-- de autenticação, não SQL. O script cria a conta e chama esta função em
-- seguida.
-- ════════════════════════════════════════════════════════════════════════

create function public.create_tenant(
  p_slug             text,
  p_name             text,
  p_owner_email      text,
  p_owner_name       text,
  p_phone            text default null,
  p_address          jsonb default null,
  p_starter_catalog  boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_tenant  uuid;
  v_slug    text := lower(trim(p_slug));
begin
  select id into v_owner
  from auth.users
  where lower(email) = lower(trim(p_owner_email));

  if v_owner is null then
    raise exception 'Não existe conta com o e-mail %. Crie a conta do dono antes.', p_owner_email
      using hint = 'dono_inexistente';
  end if;

  begin
    insert into public.tenants (slug, name, phone, address)
    values (v_slug, trim(p_name), nullif(trim(p_phone), ''), p_address)
    returning id into v_tenant;
  exception when unique_violation then
    raise exception 'O endereço "%" já é de outra barbearia. Escolha outro.', v_slug
      using hint = 'endereco_em_uso';
  end;

  insert into public.tenant_accounts (tenant_id, admin_name, admin_email)
  values (v_tenant, trim(p_owner_name), lower(trim(p_owner_email)));

  insert into public.tenant_members (tenant_id, user_id, role)
  values (v_tenant, v_owner, 'dono');

  -- Ponto de partida, não verdade: o dono ajusta nomes, tempos e preços no
  -- painel. Começar com o catálogo vazio deixaria o app do cliente sem nada
  -- para marcar até alguém lembrar de cadastrar.
  if p_starter_catalog then
    insert into public.services (tenant_id, name, description, duration_minutes, price_cents)
    values
      (v_tenant, 'Corte', 'Corte na máquina ou tesoura, com finalização.', 45, 4500),
      (v_tenant, 'Barba', 'Toalha quente, navalha e hidratação.', 30, 3500),
      (v_tenant, 'Corte + Barba', 'O combo completo.', 75, 7000),
      (v_tenant, 'Acabamento', 'Pezinho e contorno.', 20, 2500);
  end if;

  return v_tenant;
end;
$$;

revoke execute on function public.create_tenant(text, text, text, text, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.create_tenant(text, text, text, text, text, jsonb, boolean)
  to service_role;
