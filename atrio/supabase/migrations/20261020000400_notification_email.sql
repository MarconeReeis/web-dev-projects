-- ════════════════════════════════════════════════════════════════════════
-- Átrio — e-mail para os avisos de agendamento
--
-- Os avisos à barbearia (novo horário, remarcação e cancelamento pelo
-- cliente) iam para o e-mail do administrador da conta. São papéis
-- diferentes: o administrador pode ser o contador; os avisos precisam
-- chegar a quem cuida da agenda. Campo opcional — em branco, vale o do
-- administrador, como antes.
-- ════════════════════════════════════════════════════════════════════════

alter table public.tenant_accounts
  add column notification_email text
    check (notification_email is null or notification_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

-- O dono edita só colunas listadas (20261019000200_security.sql); a nova
-- entra na lista. A assinatura e o status seguem de fora.
grant update (notification_email) on public.tenant_accounts to authenticated;

create or replace function private.tenant_email(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(notification_email, admin_email)
    from public.tenant_accounts
   where tenant_id = p_tenant_id
$$;

-- save_tenant_settings ganha o campo. A assinatura muda, então a antiga sai
-- (senão ficariam as duas, e o app poderia chamar a errada).
drop function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text);

create function public.save_tenant_settings(
  p_tenant_id           uuid,
  p_name                text,
  p_phone               text,
  p_address             jsonb,
  p_branding            jsonb,
  p_highlight           jsonb,
  p_admin_name          text,
  p_admin_email         text,
  p_notification_email  text default null
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_owner(p_tenant_id) then
    raise exception 'Só o dono da barbearia altera as configurações.' using hint = 'sem_permissao';
  end if;

  update public.tenants
     set name = trim(p_name),
         phone = nullif(trim(p_phone), ''),
         address = p_address,
         branding = coalesce(p_branding, '{}'::jsonb),
         highlight = p_highlight
   where id = p_tenant_id;

  update public.tenant_accounts
     set admin_name = trim(p_admin_name),
         admin_email = trim(p_admin_email),
         notification_email = nullif(lower(trim(p_notification_email)), '')
   where tenant_id = p_tenant_id;
end;
$$;

revoke execute on function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text, text)
  to authenticated;
