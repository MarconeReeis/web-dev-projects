/**
 * Responde um pedido de horário pelos botões do e-mail.
 *
 * Quem chama é a página /responder do painel — que funciona sem login: o
 * barbeiro toca em "Confirmar" no e-mail, de qualquer aparelho. A prova é o
 * token do pedido, de uso único, que só a barbearia recebeu. A página pede um
 * segundo toque antes de confirmar: leitores de e-mail abrem links sozinhos.
 *
 *   POST { token, acao: 'ver' | 'confirmar' | 'recusar' }
 *   →   { result: 'pendente' | 'confirmado' | 'recusado' | 'invalido', ...pedido }
 *
 * Por que não uma página aqui mesmo: o Supabase não serve HTML das funções
 * no domínio dele (vira texto, contra golpes). Então a função só responde
 * dados, e a página é do painel.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = ['ver', 'confirmar', 'recusar'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  let body: { token?: unknown; acao?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo inválido.' }, 400);
  }

  const token = typeof body.token === 'string' ? body.token : '';
  const action = typeof body.acao === 'string' ? body.acao : '';
  // Token fora do formato nem chega ao banco: responde como link inválido.
  if (!UUID.test(token) || !ACTIONS.includes(action)) return json({ result: 'invalido' });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db.rpc('respond_by_token', { p_token: token, p_action: action });
  if (error) return json({ error: 'Não foi possível responder agora.' }, 500);

  const row = (data ?? [])[0];
  return json(row ?? { result: 'invalido' });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
