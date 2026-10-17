import { Audited, Cents, Id, IsoDateTime, TenantScoped } from './common';
import { AppointmentClient } from './client';

export type AppointmentStatus =
  | 'agendado'
  | 'em_atendimento'
  | 'concluido'
  | 'cancelado'
  | 'nao_compareceu';

export const APPOINTMENT_STATUS_LABEL: Readonly<Record<AppointmentStatus, string>> = {
  agendado: 'Agendado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
};

/** Status que ainda ocupam o horário na agenda. */
export const BLOCKING_STATUSES: readonly AppointmentStatus[] = [
  'agendado',
  'em_atendimento',
  'concluido',
];

export type PaymentMethod = 'pix' | 'dinheiro' | 'cartao';

export const PAYMENT_METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  cartao: 'Cartão',
};

export type PaymentStatus = 'pendente' | 'pago';

export interface AppointmentPayment {
  readonly status: PaymentStatus;
  readonly method: PaymentMethod | null;
  /** Data do RECEBIMENTO, não do atendimento. É por ela que o caixa soma. */
  readonly paidAt: IsoDateTime | null;
}

export interface Appointment extends TenantScoped, Audited {
  readonly id: Id;
  readonly professionalId: Id;
  readonly serviceId: Id;
  /** Nome do serviço no momento da marcação — a tabela pode mudar depois. */
  readonly serviceName: string;
  readonly client: AppointmentClient;

  readonly startsAt: IsoDateTime;
  /**
   * Gravado, não derivado.
   *
   * A checagem de conflito compara intervalos no servidor; depender da duração
   * do serviço atual faria um reajuste de duração reabrir buracos em agendas
   * já fechadas.
   */
  readonly endsAt: IsoDateTime;
  readonly durationMinutes: number;

  /** Preço praticado, congelado na marcação. */
  readonly price: Cents;

  readonly status: AppointmentStatus;
  readonly payment: AppointmentPayment;
  readonly notes: string | null;
}

/** Dados que o formulário de agendamento envia; o resto o servidor preenche. */
export interface NewAppointment {
  readonly professionalId: Id;
  readonly serviceId: Id;
  readonly client: AppointmentClient;
  readonly startsAt: IsoDateTime;
  readonly notes: string | null;
  /** Permite ajustar o valor na marcação (desconto combinado, por exemplo). */
  readonly priceOverride?: Cents;
}
