-- ════════════════════════════════════════════════════════════════════════
-- Átrio — escritas do painel que tocam mais de uma tabela
--
-- Cada uma é UMA transação: salvar profissional pela metade (o nome novo
-- com o expediente velho) ou configurações pela metade deixa a tela
-- discordando do banco.
--
-- SECURITY INVOKER (o padrão): rodam como quem chama, e a RLS vale linha a
-- linha — as políticas de equipe já dizem quem pode escrever. A checagem
-- explícita no começo existe para devolver um erro que se explique, em vez
-- de "0 linhas afetadas".
-- ════════════════════════════════════════════════════════════════════════

-- ─── profissional: dados, expediente e "quem faz o quê" ──────────────────
--
-- p_schedule: [{ "weekday": 1, "kind": "expediente", "starts": "09:00",
-- "ends": "20:00" }, …] — o WeeklySchedule do app, achatado em linhas.

create function public.save_professional(
  p_id           uuid,
  p_tenant_id    uuid,
  p_name         text,
  p_photo_url    text,
  p_phone        text,
  p_bio          text,
  p_about        text,
  p_active       boolean,
  p_service_ids  uuid[],
  p_schedule     jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_member(p_tenant_id) then
    raise exception 'Barbearia não encontrada.' using hint = 'nao_encontrado';
  end if;

  insert into public.professionals (id, tenant_id, name, photo_url, phone, bio, about, active)
  values (p_id, p_tenant_id, trim(p_name), p_photo_url, nullif(trim(p_phone), ''),
          nullif(trim(p_bio), ''), nullif(trim(p_about), ''), p_active)
  on conflict (id) do update
    set name = excluded.name,
        photo_url = excluded.photo_url,
        phone = excluded.phone,
        bio = excluded.bio,
        about = excluded.about,
        active = excluded.active
    -- Um id de outra barbearia não é "atualizado": a linha não muda de dono.
    where public.professionals.tenant_id = excluded.tenant_id;

  if not found then
    raise exception 'Profissional não encontrado.' using hint = 'nao_encontrado';
  end if;

  delete from public.professional_schedule where professional_id = p_id;
  insert into public.professional_schedule (tenant_id, professional_id, weekday, kind, starts, ends)
  select p_tenant_id, p_id,
         (item ->> 'weekday')::smallint,
         (item ->> 'kind')::public.schedule_kind,
         (item ->> 'starts')::time,
         (item ->> 'ends')::time
  from jsonb_array_elements(coalesce(p_schedule, '[]'::jsonb)) as item;

  delete from public.professional_services where professional_id = p_id;
  insert into public.professional_services (tenant_id, professional_id, service_id)
  select p_tenant_id, p_id, service_id
  from unnest(coalesce(p_service_ids, '{}')) as service_id;

  return p_id;
end;
$$;

-- ─── serviço: quem realiza ───────────────────────────────────────────────
--
-- O outro lado de "quem faz o quê", editado pela tela de Serviços. Substitui
-- o vínculo inteiro de uma vez; as chaves compostas garantem que só entram
-- profissionais da mesma barbearia.

create function public.set_service_professionals(
  p_service_id        uuid,
  p_professional_ids  uuid[]
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_tenant uuid;
begin
  select tenant_id into v_tenant from public.services where id = p_service_id;
  if v_tenant is null or not private.is_member(v_tenant) then
    raise exception 'Serviço não encontrado.' using hint = 'nao_encontrado';
  end if;

  delete from public.professional_services where service_id = p_service_id;
  insert into public.professional_services (tenant_id, professional_id, service_id)
  select v_tenant, professional_id, p_service_id
  from unnest(coalesce(p_professional_ids, '{}')) as professional_id;
end;
$$;

-- ─── configurações da barbearia ──────────────────────────────────────────
--
-- Vitrine (tenants) e contato da conta (tenant_accounts) juntos. Só o dono:
-- as políticas de UPDATE das duas tabelas já exigem; sem elas, o UPDATE
-- simplesmente não acharia linha — por isso a checagem explícita.

create function public.save_tenant_settings(
  p_tenant_id    uuid,
  p_name         text,
  p_phone        text,
  p_address      jsonb,
  p_branding     jsonb,
  p_highlight    jsonb,
  p_admin_name   text,
  p_admin_email  text
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
         admin_email = trim(p_admin_email)
   where tenant_id = p_tenant_id;
end;
$$;

revoke execute on function public.save_professional(uuid, uuid, text, text, text, text, text, boolean, uuid[], jsonb) from public, anon, authenticated;
revoke execute on function public.set_service_professionals(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;

grant execute on function public.save_professional(uuid, uuid, text, text, text, text, text, boolean, uuid[], jsonb) to authenticated;
grant execute on function public.set_service_professionals(uuid, uuid[]) to authenticated;
grant execute on function public.save_tenant_settings(uuid, text, text, jsonb, jsonb, jsonb, text, text) to authenticated;
