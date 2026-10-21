import { Id, IsoDateTime } from './common';

/** O que o cliente fez pelo app. Da própria ação a barbearia já sabe. */
export type ShopNotificationKind = 'novo_horario' | 'cancelado' | 'reagendado';

/**
 * Aviso do sino do painel. Lido é da barbearia, não de cada pessoa: o
 * tablet do balcão é de todos.
 */
export interface ShopNotification {
  readonly id: Id;
  readonly appointmentId: Id;
  readonly kind: ShopNotificationKind;
  readonly clientName: string;
  readonly startsAt: IsoDateTime;
  /** Na remarcação, o horário de antes. */
  readonly previousStartsAt: IsoDateTime | null;
  readonly read: boolean;
  readonly createdAt: IsoDateTime;
}
