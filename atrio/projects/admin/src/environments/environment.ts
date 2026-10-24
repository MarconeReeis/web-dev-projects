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
  /**
   * Chave pública do Turnstile (captcha da Cloudflare), do widget "Átrio
   * Agenda" (atrioagenda.com.br e painel.atrioagenda.com.br). No
   * computador (localhost) o app usa a chave de TESTE da Cloudflare no lugar
   * dela — ver provideTurnstile. Nula: sem captcha.
   */
  turnstileSiteKey: '0x4AAAAAAFj_wfmPtEOp8eGW' as string | null,
  /** DSN do Sentry (público), para receber os erros. Nulo: desligado. */
  sentryDsn: 'https://f01973c003fe7a8e0156bcc7dcbd3687@o4512295610220544.ingest.us.sentry.io/4512295677919232' as string | null,
};
