import { Id, IsoDateTime } from './common';

/** O que o cliente fez pelo app. Da própria ação a barbearia já sabe. */
export type ShopNotificationKind =
  | 'novo_horario'
  | 'cancelado'
  | 'reagendado'
  /** Pedido para confirmar (barbearia que confirma cada agendamento). */
  | 'pedido'
  /** O prazo do pedido venceu sem resposta: recusado sozinho. */
  | 'sem_resposta';

/** Resposta a um pedido pelo link do e-mail (página /responder do painel). */
export type RequestAction = 'ver' | 'confirmar' | 'recusar';

export interface RequestAnswer {
  /** 'pendente' é o "ver"; 'invalido', link usado ou pedido já respondido. */
  readonly result: 'pendente' | 'confirmado' | 'recusado' | 'invalido';
  readonly tenantName: string | null;
  readonly clientName: string | null;
  readonly serviceName: string | null;
  readonly professionalName: string | null;
  readonly startsAt: IsoDateTime | null;
  /** Fuso da barbearia, para mostrar o horário no relógio dela. */
  readonly timeZone: string | null;
}

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
