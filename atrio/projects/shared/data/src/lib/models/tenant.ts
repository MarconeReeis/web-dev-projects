import { Id, IsoDateTime } from './common';

/**
 * Situação da assinatura.
 *
 * Fica no documento do tenant e é lida pelas regras de segurança: é assim que
 * o acesso degrada sozinho quando a mensalidade para de ser paga, sem depender
 * de ninguém desligar na mão.
 */
export type SubscriptionStatus = 'trial' | 'ativa' | 'inadimplente' | 'cancelada';

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

  /** Identificador na URL pública: /b/barbearia-do-ze */
  readonly slug: string;
  readonly name: string;
  readonly phone: string | null;
  readonly address: Address | null;
  readonly admin: TenantAdmin;
  readonly branding: Branding;
  readonly subscription: SubscriptionStatus;
  /** IANA, ex.: "America/Sao_Paulo". O Brasil tem mais de um fuso. */
  readonly timeZone: string;
  readonly createdAt: IsoDateTime;
}
