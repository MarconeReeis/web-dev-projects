import { Audited, Id, TenantScoped } from './common';

/**
 * Cliente da barbearia.
 *
 * Existe sem conta: o atendente cadastra nome e telefone no balcão. Quando a
 * pessoa se cadastra no app, `userId` liga o registro à conta de autenticação.
 *
 * LGPD: nome e telefone são dados pessoais de terceiros sob responsabilidade
 * da barbearia. Exclusão a pedido deve apagar o cliente e anonimizar o nome
 * nos atendimentos passados, preservando os valores do financeiro.
 */
export interface Client extends TenantScoped, Audited {
  readonly id: Id;
  readonly name: string;
  readonly phone: string | null;
  readonly userId: Id | null;
  readonly notes: string | null;
}

/**
 * Cliente de um agendamento, gravado por cópia.
 *
 * Denormalizado de propósito: a agenda precisa mostrar nome e telefone sem uma
 * leitura extra por linha, e o atendimento guarda quem era o cliente naquela
 * data mesmo que o cadastro mude depois.
 */
export interface AppointmentClient {
  readonly clientId: Id | null;
  readonly name: string;
  readonly phone: string | null;
}

/**
 * Uma ficha do app que parece ser a mesma pessoa de um agendamento do
 * balcão (mesmo telefone, nesta barbearia). É sugestão: só vira ligação
 * quando a equipe confirma — o telefone da conta não é verificado.
 */
export interface LinkSuggestion {
  readonly clientId: Id;
  readonly clientName: string;
  readonly clientPhone: string | null;
  /** Agendamentos do balcão com o mesmo telefone que iriam junto, este incluído. */
  readonly pending: number;
}
