-- ════════════════════════════════════════════════════════════════════════
-- Átrio — endereços reservados
--
-- O link de cada barbearia é atrioagenda.com.br/<endereço>, direto na raiz
-- do site. Alguns endereços são (ou vão ser) páginas do próprio Átrio —
-- /planos, /entrar, /painel — e uma barbearia chamada "planos" tomaria a
-- página de preços. A lista fica no banco, numa regra da tabela: vale para
-- o script de cadastro, para o SQL Editor e para o que vier depois.
-- ════════════════════════════════════════════════════════════════════════

create function private.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_slug = any (array[
    -- caminhos do app e de versões anteriores
    'b', 'app', 'api', 'auth', 'assets', 'icons', 'static', 'manifest', 'favicon',
    -- conta e acesso
    'entrar', 'login', 'sair', 'cadastro', 'cadastrar', 'conta', 'perfil',
    'nova-senha', 'meus-horarios', 'agendar',
    -- painel da barbearia
    'painel', 'admin', 'equipe',
    -- páginas do Átrio
    'atrio', 'www', 'planos', 'precos', 'preco', 'assinar', 'sobre', 'contato',
    'ajuda', 'suporte', 'blog', 'barbearias', 'privacidade', 'termos'
  ])
$$;

alter table public.tenants
  add constraint tenants_slug_nao_reservado check (not private.is_reserved_slug(slug));

-- ─── cadastro: a mensagem certa para cada recusa ────────────────────────
--
-- Mesma função de 20261019000500_onboarding.sql, conferindo antes de gravar
-- se o endereço tem formato válido e se não é reservado. Sem isso, a regra
-- da tabela recusaria do mesmo jeito, mas com um erro genérico de banco.

create or replace function public.create_tenant(
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
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Endereço "%" inválido: use letras sem acento, números e hífen.', v_slug
      using hint = 'endereco_invalido';
  end if;

  if private.is_reserved_slug(v_slug) then
    raise exception 'O endereço "%" é reservado pelo Átrio. Escolha outro.', v_slug
      using hint = 'endereco_reservado';
  end if;

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
