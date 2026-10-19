/**
 * Ambiente do painel.
 *
 * Login e dados são chaves separadas porque o painel passa ao banco em
 * etapas: primeiro o login da equipe (real, pelo Supabase), depois as telas.
 * Enquanto `dataSource` for 'demo', quem entra com conta de verdade ainda vê
 * os dados fictícios — e o selo "Modo demonstração" continua avisando isso.
 *
 * A chave é a PÚBLICA do Supabase; quem protege os dados é a RLS do banco.
 * A service_role nunca entra aqui.
 */
export const environment = {
  /** 'supabase': contas reais da equipe. 'demo': entra direto, sem rede. */
  auth: 'supabase' as 'supabase' | 'demo',
  /** De onde vêm os dados das telas. O painel no banco é a próxima etapa. */
  dataSource: 'demo' as const,
  supabaseUrl: 'https://bgivwvjxonfickevvilm.supabase.co',
  supabaseKey: 'sb_publishable_m3GrRqHztsLw614bwNaQmA_9wJp8-2q',
};
