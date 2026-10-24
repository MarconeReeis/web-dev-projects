/**
 * Ambiente do app do cliente.
 *
 * A chave é a PÚBLICA do Supabase (publishable / anon): feita para ir no app,
 * no navegador de qualquer cliente. Quem protege os dados são as regras do
 * banco (RLS), não o segredo desta chave. A service_role nunca entra aqui.
 *
 * `dataSource: 'demo'` volta ao modo demonstração, sem rede — útil para
 * mexer em tela sem depender do banco.
 */
export const environment = {
  dataSource: 'supabase' as 'supabase' | 'demo',
  supabaseUrl: 'https://bgivwvjxonfickevvilm.supabase.co',
  supabaseKey: 'sb_publishable_m3GrRqHztsLw614bwNaQmA_9wJp8-2q',
  /** Barbearia de quem abre o app sem caminho (/). */
  defaultTenantSlug: 'navalha-e-co',
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
