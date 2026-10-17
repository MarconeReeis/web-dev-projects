import { Audited, Cents, Id, TenantScoped } from './common';

export interface Service extends TenantScoped, Audited {
  readonly id: Id;
  readonly name: string;
  readonly description: string | null;
  readonly durationMinutes: number;
  /**
   * Preço de tabela nesta versão (um preço por barbearia, não por profissional).
   *
   * Mudança de preço vale só para agendamentos NOVOS: o Appointment grava o
   * preço praticado no momento da marcação. Sem isso, reajustar a tabela
   * reescreveria o faturamento do mês passado.
   */
  readonly price: Cents;
  readonly professionalIds: readonly Id[];
  readonly active: boolean;
}
