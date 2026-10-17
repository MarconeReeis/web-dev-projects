import { Audited, Id, TenantScoped } from './common';
import { WeeklySchedule } from './schedule';

export interface Professional extends TenantScoped, Audited {
  readonly id: Id;
  readonly name: string;
  readonly photoUrl: string | null;
  readonly phone: string | null;
  /**
   * Especialidade, em uma linha: "Degradê e freestyle", "Barba e navalha".
   *
   * É o que faz o cliente escolher um barbeiro em vez de outro — a lista de
   * serviços diz o que ele PODE fazer, não o que ele faz bem. Vazio, a
   * vitrine cai na lista de serviços, que é melhor que um espaço em branco.
   */
  readonly bio: string | null;
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
