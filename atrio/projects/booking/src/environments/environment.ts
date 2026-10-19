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
};
