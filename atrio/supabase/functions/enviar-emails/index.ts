/**
 * Envia os e-mails do agendamento que estão na fila (public.email_outbox).
 *
 * Quem chama é o banco, a cada minuto (private.dispatch_emails, pelo
 * pg_cron), com o segredo `x-atrio-secret`. Sem ele, nada sai — a função
 * é pública na internet e não pode virar um botão de mandar e-mail.
 *
 * Variáveis (Supabase → Edge Functions → Secrets):
 *   RESEND_API_KEY   chave do Resend com permissão de envio
 *   EMAILS_SECRET    o mesmo segredo guardado no Vault como `emails_secret`
 *   APP_URL          endereço do app do cliente (https://atrioagenda.com.br)
 *   PAINEL_URL       endereço do painel
 *   EMAILS_FROM      remetente (padrão: naoresponda@atrioagenda.com.br)
 * SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o Supabase já fornece.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { type EmailRow, render } from './render.ts';

const BATCH = 20;

Deno.serve(async (request) => {
  const secret = Deno.env.get('EMAILS_SECRET');
  if (!secret || request.headers.get('x-atrio-secret') !== secret) {
    return new Response('Não autorizado', { status: 401 });
  }

  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return new Response('RESEND_API_KEY não configurada', { status: 500 });

  const appUrl = trimSlash(Deno.env.get('APP_URL') ?? 'https://atrioagenda.com.br');
  const painelUrl = trimSlash(Deno.env.get('PAINEL_URL') ?? appUrl);
  const from = Deno.env.get('EMAILS_FROM') ?? 'naoresponda@atrioagenda.com.br';

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.rpc('claim_emails', { p_limit: BATCH });
  if (error) return new Response(`Fila indisponível: ${error.message}`, { status: 500 });

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as EmailRow[]) {
    const ok = await send(row, { resendKey, from, appUrl, painelUrl });
    if (ok === true) sent++;
    else failed++;
    await db.rpc('finish_email', { p_id: row.id, p_ok: ok === true, p_error: ok === true ? null : ok });
  }

  return Response.json({ sent, failed });
});

/** `true` quando o Resend aceitou; senão, o motivo (vai para last_error). */
async function send(
  row: EmailRow,
  config: { resendKey: string; from: string; appUrl: string; painelUrl: string },
): Promise<true | string> {
  try {
    const mail = render(row, { appUrl: config.appUrl, painelUrl: config.painelUrl });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendKey}`,
        'Content-Type': 'application/json',
        // Mesmo aviso, mesma chave: se a resposta se perder e o aviso voltar
        // à fila, o Resend não envia de novo.
        'Idempotency-Key': row.id,
      },
      body: JSON.stringify({
        from: `${mail.fromName} <${config.from}>`,
        to: [row.to_email],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        ...(row.reply_to ? { reply_to: row.reply_to } : {}),
      }),
    });
    if (response.ok) return true;
    return `Resend ${response.status}: ${(await response.text()).slice(0, 300)}`;
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}
