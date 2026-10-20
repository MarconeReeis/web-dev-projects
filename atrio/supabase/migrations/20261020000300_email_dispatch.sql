-- ════════════════════════════════════════════════════════════════════════
-- Átrio — chamar o envio de e-mails a cada minuto
--
-- O pg_cron roda private.dispatch_emails() a cada minuto: enfileira os
-- lembretes da véspera e, se há algo na fila, chama a Edge Function
-- enviar-emails pelo pg_net.
--
-- O endereço da função e o segredo que ela confere ficam no Vault do
-- Supabase, não aqui — mudam por ambiente (desenvolvimento e produção), e o
-- segredo não pode estar no Git. Sem eles, nada é chamado: a fila só
-- espera. Como cadastrar: supabase/README.md, "E-mails do agendamento".
-- ════════════════════════════════════════════════════════════════════════

-- As extensões existem no Supabase; nos testes (PGlite), não — lá o
-- arquivo de teste monta substitutos de `cron` e `net`.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
end;
$$;

create function private.dispatch_emails()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_secret  text;
begin
  perform private.enqueue_reminders();

  if not exists (
    select 1 from public.email_outbox
     where status = 'pendente'
        or (status = 'enviando' and claimed_at < now() - interval '10 minutes')
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'emails_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'emails_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-atrio-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function private.dispatch_emails() from public;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('atrio-enviar-emails', '* * * * *', 'select private.dispatch_emails()');
  end if;
end;
$$;
