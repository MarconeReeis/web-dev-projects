import { Injectable, Provider, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import {
  Appointment,
  AppointmentStatus,
  BLOCKING_STATUSES,
  NewAppointment,
  PaymentMethod,
} from '../models/appointment';
import { Cents, Id, IsoDateTime } from '../models/common';
import { FinanceEntry, NewExpense } from '../models/finance';
import { Professional } from '../models/professional';
import { TimeBlock } from '../models/schedule';
import { Service } from '../models/service';
import { Tenant } from '../models/tenant';
import {
  AppointmentQuery,
  AppointmentRepository,
  FinanceQuery,
  FinanceRepository,
  ProfessionalRepository,
  ServiceRepository,
  TenantRepository,
  TimeBlockRepository,
} from '../repositories/repositories';
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
 * Implementações de demonstração dos repositórios.
 *
 * Mesma assinatura da futura implementação Firebase — é isso que permite
 * construir e revisar todas as telas antes de existir backend, e trocar depois
 * sem tocar em componente.
 */

@Injectable()
export class DemoAppointmentRepository extends AppointmentRepository {
  private readonly store = inject(DemoStore);

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

  async create(input: NewAppointment): Promise<Appointment> {
    const { services, appointments } = this.store.snapshot();
    const service = services.find((s) => s.id === input.serviceId);
    if (!service) throw new Error('Serviço não encontrado.');

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    // No modo demonstração a trava é local porque não há concorrência real.
    // A implementação Firebase NÃO pode fazer isso aqui: a checagem tem de
    // acontecer dentro de uma transação no servidor.
    const conflict = appointments.find(
      (a) =>
        a.professionalId === input.professionalId &&
        BLOCKING_STATUSES.includes(a.status) &&
        new Date(a.startsAt) < endsAt &&
        startsAt < new Date(a.endsAt),
    );
    if (conflict) {
      throw new Error('Esse profissional já tem atendimento nesse horário.');
    }

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

    this.store.patchAppointment(id, {
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      professionalId: professionalId ?? current.professionalId,
    });
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
  ];
}
