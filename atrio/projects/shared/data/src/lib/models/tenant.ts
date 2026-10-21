import { Id, IsoDateTime } from './common';

/**
 * Situação da assinatura.
 *
 * Fica no documento do tenant e é lida pelas regras de segurança: é assim que
 * o acesso degrada sozinho quando a mensalidade para de ser paga, sem depender
 * de ninguém desligar na mão.
 */
export type SubscriptionStatus = 'trial' | 'ativa' | 'inadimplente' | 'cancelada';

/**
 * Plano da assinatura (docs/ROADMAP.md, "Direção do produto").
 *
 * - solo: 1 profissional ativo, só a conta do dono, caixa só com o que
 *   entrou (sem despesas);
 * - barbearia: sem esses limites.
 *
 * Quem impõe os limites é o banco (20261020000500_plans.sql); o painel só
 * os mostra.
 */
export type TenantPlan = 'solo' | 'barbearia';

export const PLAN_LABEL: Readonly<Record<TenantPlan, string>> = {
  solo: 'Solo',
  barbearia: 'Barbearia',
};

export interface Address {
  readonly street: string;
  readonly number: string;
  readonly complement: string | null;
  readonly district: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
}

/**
 * Identidade visual da barbearia — aplicada APENAS no app do cliente.
 *
 * O admin mantém sempre a marca Átrio: é um produto só, com uma cara só,
 * identificando qual barbearia está logada. Quem é personalizado é a vitrine
 * que o cliente final vê.
 */
/**
 * Endereço numa linha: "Rua Augusta, 1520 — Consolação — São Paulo - SP".
 *
 * Mora aqui, e não em cada tela, porque o mesmo endereço aparece na vitrine e
 * no comprovante do agendamento — e dois formatos para a mesma barbearia
 * parecem dois lugares diferentes. Sem rua, devolve null: meio endereço é
 * pior que nenhum.
 */
export function formatAddress(address: Address | null | undefined): string | null {
  if (!address?.street) return null;

  const line = [address.street, address.number].filter(Boolean).join(', ');
  const extra = [address.complement, address.district].filter(Boolean).join(' · ');
  const city = [address.city, address.state].filter(Boolean).join(' - ');

  return [line, extra, city].filter(Boolean).join(' — ');
}

export interface Branding {
  readonly logoUrl: string | null;
  /** Cor da marca em hex. As variações (hover, soft) são derivadas em oklch. */
  readonly primaryColor: string | null;
}

/**
 * Contato responsável pela conta.
 *
 * Fica no tenant, e não num modelo de usuário, porque é dado do cliente da
 * assinatura: quem o Átrio cobra e procura quando algo dá errado. Quando a
 * autenticação entrar, os usuários que operam o painel são outra coisa — uma
 * barbearia pode ter três atendentes e um dono.
 */
export interface TenantAdmin {
  readonly name: string;
  readonly email: string;
  /**
   * Para onde vão os avisos de agendamento (novo horário, remarcação e
   * cancelamento pelo cliente). Nulo: vão para `email`.
   */
  readonly noticeEmail: string | null;
}

/**
 * Destaque da vitrine: o banner no topo do app do cliente.
 *
 * Espaço da barbearia para anunciar promoção, serviço novo ou recado — "toda
 * terça, barba com 20%". É editável nas Configurações porque um banner que só
 * o desenvolvedor muda não serve para promoção: a data passa e ele fica
 * mentindo na tela do cliente.
 *
 * Nulo, ou inativo, e o banner simplesmente não aparece. Espaço vazio é
 * melhor que um anúncio genérico ocupando o topo.
 */
export interface Highlight {
  readonly title: string;
  readonly subtitle: string | null;
  /** Rótulo do botão. Nulo deixa o banner só informativo. */
  readonly ctaLabel: string | null;
  readonly active: boolean;
}

export interface Tenant {
  readonly id: Id;
  /**
   * NÃO existe horário de funcionamento aqui, de propósito.
   *
   * O horário real da barbearia é a união das jornadas dos profissionais —
   * é o que determina quais horários o cliente consegue marcar. Um campo
   * separado viraria uma segunda fonte de verdade: a vitrine anunciaria
   * 09:00 e o agendamento não ofereceria horário nenhum às 09:00, porque
   * ninguém trabalha a essa hora.
   *
   * As Configurações exibem o horário derivado, em leitura.
   */

  /** Identificador na URL pública: atrioagenda.com.br/barbearia-do-ze */
  readonly slug: string;
  readonly name: string;
  readonly phone: string | null;
  readonly address: Address | null;
  readonly admin: TenantAdmin;
  readonly highlight: Highlight | null;
  readonly branding: Branding;
  readonly subscription: SubscriptionStatus;
  readonly plan: TenantPlan;
  /** IANA, ex.: "America/Sao_Paulo". O Brasil tem mais de um fuso. */
  readonly timeZone: string;
  readonly createdAt: IsoDateTime;
}
