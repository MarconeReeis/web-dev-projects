import { Injectable, Provider, inject } from '@angular/core';
import { Observable, combineLatest, firstValueFrom, map } from 'rxjs';
import {
  Appointment,
  AppointmentStatus,
  BLOCKING_STATUSES,
  NewAppointment,
  NewBooking,
  PaymentMethod,
} from '../models/appointment';
import { Cents, Id, IsoDateTime } from '../models/common';
import { FinanceEntry, NewExpense } from '../models/finance';
import { Professional } from '../models/professional';
import { BusyInterval, TimeBlock } from '../models/schedule';
import { Service } from '../models/service';
import { Tenant } from '../models/tenant';
import {
  AppointmentQuery,
  AppointmentRepository,
  AvailabilityRepository,
  ClientAuth,
  FinanceQuery,
  FinanceRepository,
  ProfessionalRepository,
  ServiceRepository,
  StaffAuth,
  TenantRepository,
  TimeBlockRepository,
} from '../repositories/repositories';
import { DemoClientAuth } from './demo-auth';
import { DemoStaffAuth } from './demo-staff-auth';
import { sortProfessionals } from './demo-seed';
import {
  DemoStore,
  expenseEntry,
  newId,
  nextStatusIsAllowed,
  receivableEntry,
  withinRange,
} from './demo-store';

/**
 * Compara telefones só pelos dígitos.
 *
 * "(11) 99100-2201" e "11991002201" são a mesma pessoa. Guardar formatado é
 * melhor para ler na tela; comparar formatado faria o cliente não encontrar
 * os próprios agendamentos por causa de um parêntese.
 *
 * Na implementação Firebase isso precisa virar um campo normalizado gravado
 * junto, já que a consulta acontece no servidor.
 */
function digitsOf(phone: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

/**
 * Implementações de demonstração dos repositórios.
 *
 * Mesma assinatura da futura implementação Firebase — é isso que permite
 * construir e revisar todas as telas antes de existir backend, e trocar depois
 * sem tocar em componente.
 */

@Injectable()
export class DemoAppointmentRepository extends AppointmentRepository {
  private readonly store = inject(DemoStore);
  private readonly auth = inject(ClientAuth);

  watch(query: AppointmentQuery): Observable<readonly Appointment[]> {
    return this.store.appointments$().pipe(
      map((all) =>
        all
          .filter((a) => withinRange(a.startsAt, query.range))
          .filter((a) =>
            query.professionalId ? a.professionalId === query.professionalId : true,
          )
          .filter((a) => (query.statuses ? query.statuses.includes(a.status) : true))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      ),
    );
  }

  watchById(id: Id): Observable<Appointment | null> {
    return this.store
      .appointments$()
      .pipe(map((all) => all.find((a) => a.id === id) ?? null));
  }

  /**
   * Na demonstração não há ficha ligada à conta: os agendamentos do seed
   * nasceram sem conta. O telefone da conta logada faz as vezes da ligação —
   * aqui é aceitável porque a conta e os dados são fictícios e do aparelho.
   */
  watchMine(range: { from: IsoDateTime; to: IsoDateTime }): Observable<readonly Appointment[]> {
    return combineLatest([this.auth.watchSession(), this.store.appointments$()]).pipe(
      map(([account, all]) => {
        const wanted = digitsOf(account?.phone ?? '');
        if (!wanted) return [];
        return all
          .filter((appointment) => digitsOf(appointment.client.phone) === wanted)
          .filter((appointment) => withinRange(appointment.startsAt, range))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      }),
    );
  }

  async book(input: NewBooking): Promise<Appointment> {
    const account = await firstValueFrom(this.auth.watchSession());
    if (!account) throw new Error('Entre na sua conta para agendar.');

    return this.create({
      professionalId: input.professionalId,
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      notes: input.notes,
      client: { clientId: null, name: account.name, phone: account.phone },
    });
  }

  async create(input: NewAppointment): Promise<Appointment> {
    const { services, appointments } = this.store.snapshot();
    const service = services.find((s) => s.id === input.serviceId);
    if (!service) throw new Error('Serviço não encontrado.');

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    assertFree(appointments, input.professionalId, startsAt, endsAt);

    const stamp = new Date().toISOString();
    const appointment: Appointment = {
      id: newId('apt'),
      tenantId: this.store.snapshot().tenant.id,
      professionalId: input.professionalId,
      serviceId: service.id,
      serviceName: service.name,
      client: input.client,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationMinutes: service.durationMinutes,
      price: input.priceOverride ?? service.price,
      status: 'agendado',
      payment: { status: 'pendente', method: null, paidAt: null },
      notes: input.notes,
      createdAt: stamp,
      updatedAt: stamp,
    };

    this.store.addAppointment(appointment);
    return appointment;
  }

  async reschedule(
    id: Id,
    startsAt: IsoDateTime,
    professionalId?: Id,
  ): Promise<void> {
    const current = this.store.snapshot().appointments.find((a) => a.id === id);
    if (!current) throw new Error('Agendamento não encontrado.');

    const start = new Date(startsAt);
    const end = new Date(start.getTime() + current.durationMinutes * 60_000);
    const professional = professionalId ?? current.professionalId;

    // O próprio agendamento fica de fora: mudar 09:30 para 09:45 sobrepõe o
    // horário antigo, que deixa de existir no mesmo instante.
    assertFree(
      this.store.snapshot().appointments.filter((a) => a.id !== id),
      professional,
      start,
      end,
    );

    this.store.patchAppointment(id, {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      professionalId: professional,
    });
  }

  cancel(id: Id): Promise<void> {
    return this.changeStatus(id, 'cancelado');
  }

  async changeStatus(id: Id, status: AppointmentStatus): Promise<void> {
    const current = this.store.snapshot().appointments.find((a) => a.id === id);
    if (!current) throw new Error('Agendamento não encontrado.');

    if (!nextStatusIsAllowed(current.status, status)) {
      throw new Error(
        `Não é possível mudar de "${current.status}" para "${status}".`,
      );
    }

    this.store.patchAppointment(id, { status });
  }

  async registerPayment(
    id: Id,
    method: PaymentMethod,
    amount?: Cents,
  ): Promise<void> {
    const current = this.store.snapshot().appointments.find((a) => a.id === id);
    if (!current) throw new Error('Agendamento não encontrado.');
    if (current.payment.status === 'pago') return;

    const paidAt = new Date().toISOString();
    const value = amount ?? current.price;

    // As duas escritas andam juntas: pagamento registrado sem lançamento
    // deixa o caixa errado. Em Firestore isto vira batch/transação.
    this.store.patchAppointment(id, {
      payment: { status: 'pago', method, paidAt },
    });
    this.store.addEntry(receivableEntry(current, method, value, paidAt));
  }
}

@Injectable()
export class DemoProfessionalRepository extends ProfessionalRepository {
  private readonly store = inject(DemoStore);

  watchAll(includeInactive = false): Observable<readonly Professional[]> {
    return this.store
      .professionals$()
      .pipe(
        map((all) =>
          sortProfessionals(includeInactive ? all : all.filter((p) => p.active)),
        ),
      );
  }

  watchById(id: Id): Observable<Professional | null> {
    return this.store
      .professionals$()
      .pipe(map((all) => all.find((p) => p.id === id) ?? null));
  }

  async save(professional: Professional): Promise<void> {
    const all = this.store.snapshot().professionals;
    const exists = all.some((p) => p.id === professional.id);
    this.store.setProfessionals(
      exists
        ? all.map((p) => (p.id === professional.id ? professional : p))
        : [...all, professional],
    );
  }

  async setActive(id: Id, active: boolean): Promise<void> {
    this.store.setProfessionals(
      this.store
        .snapshot()
        .professionals.map((p) => (p.id === id ? { ...p, active } : p)),
    );
  }

  async setServiceAssignment(
    serviceId: Id,
    professionalIds: readonly Id[],
  ): Promise<void> {
    const stamp = new Date().toISOString();

    this.store.setProfessionals(
      this.store.snapshot().professionals.map((professional) => {
        const shouldHave = professionalIds.includes(professional.id);
        const has = professional.serviceIds.includes(serviceId);
        if (shouldHave === has) return professional;

        return {
          ...professional,
          serviceIds: shouldHave
            ? [...professional.serviceIds, serviceId]
            : professional.serviceIds.filter((id) => id !== serviceId),
          updatedAt: stamp,
        };
      }),
    );
  }
}

@Injectable()
export class DemoServiceRepository extends ServiceRepository {
  private readonly store = inject(DemoStore);

  watchAll(includeInactive = false): Observable<readonly Service[]> {
    return this.store
      .services$()
      .pipe(map((all) => (includeInactive ? all : all.filter((s) => s.active))));
  }

  watchById(id: Id): Observable<Service | null> {
    return this.store
      .services$()
      .pipe(map((all) => all.find((s) => s.id === id) ?? null));
  }

  async save(service: Service): Promise<void> {
    const all = this.store.snapshot().services;
    const exists = all.some((s) => s.id === service.id);
    this.store.setServices(
      exists ? all.map((s) => (s.id === service.id ? service : s)) : [...all, service],
    );
  }

  async setActive(id: Id, active: boolean): Promise<void> {
    this.store.setServices(
      this.store.snapshot().services.map((s) => (s.id === id ? { ...s, active } : s)),
    );
  }
}

@Injectable()
export class DemoFinanceRepository extends FinanceRepository {
  private readonly store = inject(DemoStore);

  watchEntries(query: FinanceQuery): Observable<readonly FinanceEntry[]> {
    return this.store.entries$().pipe(
      map((all) =>
        all
          .filter((e) => withinRange(e.occurredAt, query.range))
          .filter((e) =>
            query.professionalId
              ? // Despesa é da barbearia, não de um profissional: ao filtrar
                // por profissional ela sai da lista.
                e.professionalId === query.professionalId
              : true,
          )
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
      ),
    );
  }

  async addExpense(expense: NewExpense): Promise<void> {
    this.store.addEntry(expenseEntry(this.store.snapshot().tenant.id, expense));
  }

  async updateExpense(id: Id, expense: NewExpense): Promise<void> {
    const current = this.store.snapshot().entries.find((entry) => entry.id === id);
    if (!current) throw new Error('Despesa não encontrada.');
    if (current.kind !== 'despesa') {
      throw new Error('Só despesas podem ser editadas.');
    }

    this.store.replaceEntry({
      ...current,
      description: expense.description,
      amount: expense.amount,
      occurredAt: expense.occurredAt,
      category: expense.category,
      updatedAt: new Date().toISOString(),
    });
  }

  async removeExpense(id: Id): Promise<void> {
    this.store.removeEntry(id);
  }
}

@Injectable()
export class DemoAvailabilityRepository extends AvailabilityRepository {
  private readonly store = inject(DemoStore);

  /**
   * Na demonstração tudo está no aparelho, mas o formato é o mesmo do
   * servidor: o app do cliente aprende a calcular sem ver a agenda.
   */
  watchBusy(range: { from: IsoDateTime; to: IsoDateTime }): Observable<readonly BusyInterval[]> {
    return combineLatest([this.store.appointments$(), this.store.blocks$()]).pipe(
      map(([appointments, blocks]) => [
        ...appointments
          .filter((a) => BLOCKING_STATUSES.includes(a.status) && overlapsRange(a, range))
          .map(
            (a): BusyInterval => ({
              kind: 'agendamento',
              professionalId: a.professionalId,
              startsAt: a.startsAt,
              endsAt: a.endsAt,
              // A demonstração não tem regras de acesso: todo id é "seu".
              appointmentId: a.id,
            }),
          ),
        ...blocks
          .filter((b) => overlapsRange(b, range))
          .map(
            (b): BusyInterval => ({
              kind: 'bloqueio',
              professionalId: b.professionalId,
              startsAt: b.startsAt,
              endsAt: b.endsAt,
              appointmentId: null,
            }),
          ),
      ]),
    );
  }
}

function overlapsRange(
  item: { startsAt: IsoDateTime; endsAt: IsoDateTime },
  range: { from: IsoDateTime; to: IsoDateTime },
): boolean {
  return item.startsAt < range.to && item.endsAt > range.from;
}

@Injectable()
export class DemoTimeBlockRepository extends TimeBlockRepository {
  private readonly store = inject(DemoStore);

  watch(range: { from: IsoDateTime; to: IsoDateTime }): Observable<readonly TimeBlock[]> {
    return this.store
      .blocks$()
      .pipe(map((all) => all.filter((b) => withinRange(b.startsAt, range))));
  }

  async create(block: Omit<TimeBlock, 'id'>): Promise<void> {
    this.store.setBlocks([...this.store.snapshot().blocks, { ...block, id: newId('blk') }]);
  }

  async remove(id: Id): Promise<void> {
    this.store.setBlocks(this.store.snapshot().blocks.filter((b) => b.id !== id));
  }
}

@Injectable()
export class DemoTenantRepository extends TenantRepository {
  private readonly store = inject(DemoStore);

  watchCurrent(): Observable<Tenant | null> {
    return this.store.tenant$();
  }

  async save(tenant: Tenant): Promise<void> {
    this.store.setTenant(tenant);
  }
}

/**
 * Liga os repositórios à implementação de demonstração.
 *
 * Trocar por `provideFirebaseData()` depois é mudar esta linha no app.config
 * — nenhum componente precisa saber de onde vêm os dados.
 */
export function provideDemoData(): Provider[] {
  return [
    { provide: AppointmentRepository, useClass: DemoAppointmentRepository },
    { provide: ProfessionalRepository, useClass: DemoProfessionalRepository },
    { provide: ServiceRepository, useClass: DemoServiceRepository },
    { provide: FinanceRepository, useClass: DemoFinanceRepository },
    { provide: TimeBlockRepository, useClass: DemoTimeBlockRepository },
    { provide: TenantRepository, useClass: DemoTenantRepository },
    { provide: AvailabilityRepository, useClass: DemoAvailabilityRepository },
    { provide: ClientAuth, useClass: DemoClientAuth },
    { provide: StaffAuth, useClass: DemoStaffAuth },
  ];
}

/**
 * Trava de conflito do modo demonstração, a mesma para criar e reagendar.
 *
 * Local porque aqui não há concorrência real. A implementação Firebase NÃO
 * pode fazer isso no cliente: a checagem tem de acontecer dentro de uma
 * transação no servidor.
 */
function assertFree(
  appointments: readonly Appointment[],
  professionalId: Id,
  startsAt: Date,
  endsAt: Date,
): void {
  const conflict = appointments.some(
    (a) =>
      a.professionalId === professionalId &&
      BLOCKING_STATUSES.includes(a.status) &&
      new Date(a.startsAt) < endsAt &&
      startsAt < new Date(a.endsAt),
  );
  if (conflict) {
    throw new Error('Esse profissional já tem atendimento nesse horário.');
  }
}
