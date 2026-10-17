import { Observable } from 'rxjs';
import {
  Appointment,
  AppointmentStatus,
  NewAppointment,
  PaymentMethod,
} from '../models/appointment';
import { Cents, DateRange, Id, IsoDateTime } from '../models/common';
import { FinanceEntry, NewExpense } from '../models/finance';
import { Professional } from '../models/professional';
import { Service } from '../models/service';
import { TimeBlock } from '../models/schedule';
import { Tenant } from '../models/tenant';

/**
 * Contratos de acesso a dados.
 *
 * São classes abstratas, não interfaces, porque assim servem de token de DI
 * sem um InjectionToken para cada uma — e o app passa a depender do contrato,
 * não do Firebase.
 *
 * Na prática isso compra três coisas:
 *   - a UI inteira roda no modo demonstração, sem backend;
 *   - trocar Firestore por outro backend não encosta em componente;
 *   - teste injeta um fake sem emulador.
 *
 * Leitura devolve Observable (o Firestore é realtime por natureza) e escrita
 * devolve Promise (operação pontual, com erro a tratar).
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
   * Cria o agendamento.
   *
   * ATENÇÃO para a implementação Firebase: esta operação NÃO pode validar
   * conflito no cliente. Dois celulares marcando o mesmo horário ao mesmo
   * tempo passam pela validação local e gravam os dois. A checagem precisa
   * acontecer dentro de uma transação no servidor (Cloud Function callable),
   * e este método deve apenas chamá-la.
   */
  abstract create(input: NewAppointment): Promise<Appointment>;

  abstract reschedule(
    id: Id,
    startsAt: IsoDateTime,
    professionalId?: Id,
  ): Promise<void>;

  abstract changeStatus(id: Id, status: AppointmentStatus): Promise<void>;

  /**
   * Registra o pagamento e lança o recebimento no financeiro.
   *
   * As duas escritas são uma operação só: atendimento pago sem lançamento
   * (ou o contrário) deixa o caixa errado. Em Firestore, batch ou transação.
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
   * catálogo discordando da equipe. Em Firestore, um batch.
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
