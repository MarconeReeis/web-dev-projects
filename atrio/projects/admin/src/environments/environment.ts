/**
 * Ambiente do painel.
 *
 * - `dataSource: 'supabase'` — painel inteiro no banco, login real.
 * - `dataSource: 'demo'` — dados fictícios no aparelho; `auth` escolhe se o
 *   login é real ('supabase') ou de demonstração ('demo', sem rede).
 *
 * A chave é a PÚBLICA do Supabase; quem protege os dados é a RLS do banco.
 * A service_role nunca entra aqui.
 */
export const environment = {
  /** 'supabase': contas reais da equipe. 'demo': entra direto, sem rede. */
  auth: 'supabase' as 'supabase' | 'demo',
  /** De onde vêm os dados das telas. */
  dataSource: 'supabase' as 'supabase' | 'demo',
  supabaseUrl: 'https://bgivwvjxonfickevvilm.supabase.co',
  supabaseKey: 'sb_publishable_m3GrRqHztsLw614bwNaQmA_9wJp8-2q',
  /** App do cliente: o link da barbearia é este endereço + /<barbearia>. */
  bookingUrl: 'http://localhost:4300',
};
