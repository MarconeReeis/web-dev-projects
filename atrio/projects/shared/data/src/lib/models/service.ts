import { Audited, Cents, Id, TenantScoped } from './common';

/**
 * Serviço do catálogo.
 *
 * Quem realiza o quê fica SÓ em `Professional.serviceIds`. Guardar a mesma
 * relação dos dois lados pareceria conveniente para consultar, e seria a
 * origem garantida de divergência: duas telas editando lados diferentes do
 * mesmo vínculo acabam discordando, e nada avisa.
 *
 * O custo de ter um lado só é varrer os profissionais para descobrir quem faz
 * um serviço. São poucos por barbearia — e a tela de Serviços escreve o
 * vínculo por ProfessionalRepository.setServiceAssignment.
 */
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
  readonly active: boolean;
}
