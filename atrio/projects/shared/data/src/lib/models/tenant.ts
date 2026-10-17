import { Id, IsoDateTime } from './common';
import { WeeklySchedule } from './schedule';

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

export interface Tenant {
  readonly id: Id;
  /** Identificador na URL pública: /b/barbearia-do-ze */
  readonly slug: string;
  readonly name: string;
  readonly phone: string | null;
  readonly address: Address | null;
  readonly openingHours: WeeklySchedule;
  readonly branding: Branding;
  readonly subscription: SubscriptionStatus;
  /** IANA, ex.: "America/Sao_Paulo". O Brasil tem mais de um fuso. */
  readonly timeZone: string;
  readonly createdAt: IsoDateTime;
}
