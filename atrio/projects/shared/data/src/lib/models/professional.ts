import { Audited, Id, TenantScoped } from './common';
import { WeeklySchedule } from './schedule';

export interface Professional extends TenantScoped, Audited {
  readonly id: Id;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly phone: string | null;
  /** Serviços que este profissional realiza. */
  readonly serviceIds: readonly Id[];
  readonly schedule: WeeklySchedule;
  /**
   * Profissional desativado some das telas de agendamento mas continua
   * existindo: o histórico de atendimentos e o financeiro apontam para ele.
   * Nunca excluir — apenas desativar.
   */
  readonly active: boolean;
}
