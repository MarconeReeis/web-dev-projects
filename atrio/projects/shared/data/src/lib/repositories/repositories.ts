import { Observable } from 'rxjs';
import {
  Appointment,
  AppointmentStatus,
  NewAppointment,
  NewBooking,
  PaymentMethod,
} from '../models/appointment';
import { ClientAccount, NewClientAccount } from '../models/client-account';
import { StaffSession } from '../models/staff';
import { Cents, DateRange, Id, IsoDateTime } from '../models/common';
import { FinanceEntry, NewExpense } from '../models/finance';
import { Professional } from '../models/professional';
import { Service } from '../models/service';
import { BusyInterval, TimeBlock } from '../models/schedule';
import { Tenant } from '../models/tenant';

/**
 * Contratos de acesso a dados.
 *
 * São classes abstratas, não interfaces, porque assim servem de token de DI
 * sem um InjectionToken para cada uma — e o app passa a depender do contrato,
 * não do backend.
 *
 * Na prática isso compra três coisas:
 *   - a UI inteira roda no modo demonstração, sem backend;
 *   - trocar de backend não encosta em componente — já aconteceu uma vez,
 *     de Firebase para Supabase, antes de existir uma linha de integração;
 *   - teste injeta um fake sem banco.
 *
 * Leitura devolve Observable (a tela acompanha mudanças) e escrita devolve
 * Promise (operação pontual, com erro a tratar).
 */

export interface AppointmentQuery {
  readonly range: DateRange;
  /** null ou ausente = todos os profissionais. */
  readonly professionalId?: Id | null;
  readonly statuses?: readonly AppointmentStatus[];
}

export abstract class AppointmentRepository {
  abstract watch(query: AppointmentQuery): Observable<readonly Appointment[]>;
  abstract watchById(id: Id): Observable<Appointment | null>;

  /**
   * Agendamentos do cliente logado, na barbearia atual.
   *
   * Pela conta, nunca por telefone digitado: telefone não prova nada, e com
   * ele qualquer um veria os horários de outro. Sem sessão, lista vazia.
   */
  abstract watchMine(range: DateRange): Observable<readonly Appointment[]>;

  /**
   * O cliente marca pelo app. Quem é e quanto custa, o servidor decide
   * (ver NewBooking).
   *
   * Validação de conflito, expediente e bloqueio é do servidor — dois
   * celulares no mesmo instante passariam por qualquer checagem local. Este
   * método só chama a operação e devolve o agendamento gravado.
   */
  abstract book(input: NewBooking): Promise<Appointment>;

  /** A equipe marca no balcão: cliente por parâmetro, preço ajustável. */
  abstract create(input: NewAppointment): Promise<Appointment>;

  /**
   * Move o agendamento. O conflito é checado no servidor, desconsiderando o
   * próprio horário. Cliente: só os próprios, com 2h de antecedência e sem
   * trocar de profissional — a regra é do servidor.
   */
  abstract reschedule(
    id: Id,
    startsAt: IsoDateTime,
    professionalId?: Id,
  ): Promise<void>;

  /** Mudança de status pela equipe (em atendimento, concluído…). */
  abstract changeStatus(id: Id, status: AppointmentStatus): Promise<void>;

  /** Cancelamento — pelo cliente, com a regra das 2h; pela equipe, sem. */
  abstract cancel(id: Id): Promise<void>;

  /**
   * Registra o pagamento e lança o recebimento no financeiro.
   *
   * As duas escritas são uma operação só: atendimento pago sem lançamento
   * (ou o contrário) deixa o caixa errado: uma transação no servidor.
   *
   * `amount` ausente usa o preço congelado no agendamento.
   */
  abstract registerPayment(
    id: Id,
    method: PaymentMethod,
    amount?: Cents,
  ): Promise<void>;
}

export abstract class ProfessionalRepository {
  abstract watchAll(includeInactive?: boolean): Observable<readonly Professional[]>;
  abstract watchById(id: Id): Observable<Professional | null>;
  abstract save(professional: Professional): Promise<void>;
  /** Desativa; nunca exclui. O histórico aponta para este registro. */
  abstract setActive(id: Id, active: boolean): Promise<void>;

  /**
   * Define quem realiza um serviço, substituindo o vínculo atual.
   *
   * Existe porque o vínculo mora em `Professional.serviceIds` e a tela de
   * Serviços edita o outro lado dele. Como mexe em vários profissionais de
   * uma vez, é UMA operação: metade dos profissionais atualizados deixaria o
   * catálogo discordando da equipe.
   */
  abstract setServiceAssignment(
    serviceId: Id,
    professionalIds: readonly Id[],
  ): Promise<void>;
}

export abstract class ServiceRepository {
  abstract watchAll(includeInactive?: boolean): Observable<readonly Service[]>;
  abstract watchById(id: Id): Observable<Service | null>;
  abstract save(service: Service): Promise<void>;
  abstract setActive(id: Id, active: boolean): Promise<void>;
}

export interface FinanceQuery {
  readonly range: DateRange;
  readonly professionalId?: Id | null;
}

export abstract class FinanceRepository {
  /** Lançamentos do período, filtrados por `occurredAt` (data do dinheiro). */
  abstract watchEntries(query: FinanceQuery): Observable<readonly FinanceEntry[]>;
  abstract addExpense(expense: NewExpense): Promise<void>;

  /**
   * Corrige uma despesa já lançada.
   *
   * Só despesa. Recebimento vindo de atendimento continua imutável: ele tem
   * contrapartida no atendimento, e mexer num lado sem o outro desalinha o
   * caixa. Despesa é lançamento manual, digitado às pressas no balcão — valor
   * trocado acontece, e obrigar a excluir e relançar só faz o dono errar de
   * novo.
   */
  abstract updateExpense(id: Id, expense: NewExpense): Promise<void>;

  abstract removeExpense(id: Id): Promise<void>;
}

/**
 * Horários ocupados, para o cálculo de horários livres.
 *
 * Existe à parte da agenda porque o app do cliente não pode ler a agenda: ela
 * tem nome e telefone de outros clientes e o motivo dos bloqueios. Este
 * contrato entrega só quem está ocupado e quando (ver BusyInterval).
 */
export abstract class AvailabilityRepository {
  abstract watchBusy(range: DateRange): Observable<readonly BusyInterval[]>;
}

export abstract class TimeBlockRepository {
  abstract watch(range: DateRange): Observable<readonly TimeBlock[]>;
  abstract create(block: Omit<TimeBlock, 'id'>): Promise<void>;
  abstract remove(id: Id): Promise<void>;
}

export abstract class TenantRepository {
  /** A barbearia da sessão atual. */
  abstract watchCurrent(): Observable<Tenant | null>;
  abstract save(tenant: Tenant): Promise<void>;
}

/**
 * Autenticação do cliente final (app de agendamento).
 *
 * Separada dos repositórios de dados porque o painel da barbearia terá a
 * sua, com papéis por barbearia. Misturar as duas abriria a porta para um
 * cliente chegar ao painel.
 *
 * Falhas que a tela precisa explicar chegam como `ClientAuthError`.
 */
export abstract class ClientAuth {
  /** Conta com sessão aberta neste aparelho; null quando ninguém entrou. */
  abstract watchSession(): Observable<ClientAccount | null>;
  abstract signIn(email: string, password: string): Promise<ClientAccount>;
  abstract signUp(account: NewClientAccount): Promise<ClientAccount>;
  abstract signOut(): Promise<void>;
  /**
   * Pede o link de nova senha. Resolve igual exista a conta ou não: dizer
   * "esse e-mail não tem cadastro" entrega a quem perguntar quem é cliente.
   */
  abstract sendPasswordReset(email: string): Promise<void>;
}

/**
 * Login da equipe da barbearia (painel).
 *
 * Separado de ClientAuth de propósito: uma conta de cliente que entrasse
 * aqui não acharia barbearia nenhuma — e é exatamente o que precisa
 * acontecer. Quem decide quem é equipe é o vínculo no banco, não o app.
 *
 * Falhas que a tela precisa explicar chegam como `StaffAuthError`.
 */
export abstract class StaffAuth {
  /** Sessão aberta neste aparelho; null quando ninguém entrou. */
  abstract watchSession(): Observable<StaffSession | null>;
  abstract signIn(email: string, password: string): Promise<StaffSession>;
  abstract signOut(): Promise<void>;
  /** Resolve igual exista a conta ou não. */
  abstract sendPasswordReset(email: string): Promise<void>;
}
