import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map } from 'rxjs';
import { Appointment, AppointmentStatus, PaymentMethod } from '../models/appointment';
import { Cents, DateRange, Id, IsoDateTime } from '../models/common';
import { FinanceEntry, NewExpense } from '../models/finance';
import { Professional } from '../models/professional';
import { TimeBlock } from '../models/schedule';
import { Service } from '../models/service';
import { Tenant } from '../models/tenant';
import { DemoDataset, buildDemoDataset, todayKey } from './demo-seed';

/**
 * A versão faz parte da chave de propósito.
 *
 * O conjunto salvo é um retrato do modelo do dia em que foi gravado. Quando o
 * formato muda — um campo novo em Tenant, por exemplo — o dado antigo deixa de
 * satisfazer os tipos e a tela quebra ao ler. Subir a versão descarta o
 * retrato velho em vez de tentar migrá-lo: é demonstração, não há nada a
 * preservar.
 */
const STORAGE_KEY = 'atrio.demo.v3';

/**
 * Estado do modo demonstração, em memória e espelhado no armazenamento local.
 *
 * Regera o conjunto quando a data muda: o seed é relativo ao "agora" (ver
 * demo-seed), então um dado de ontem mostraria o dia inteiro já encerrado.
 * As alterações feitas durante o dia (pagamentos, despesas) sobrevivem a
 * recarregar a página — e só até a virada do dia.
 *
 * Tudo aqui é descartado quando o Firebase entrar: nenhum componente deve
 * injetar esta classe, só os repositórios abstratos.
 */
@Injectable({ providedIn: 'root' })
export class DemoStore {
  private readonly state$: BehaviorSubject<DemoDataset>;

  constructor() {
    // load() não pode usar commit(): o BehaviorSubject ainda não existe neste
    // ponto. Por isso a gravação inicial é explícita, depois da atribuição.
    const initial = this.load();
    this.state$ = new BehaviorSubject(initial);
    this.persist(initial);
  }

  // ─── leitura ──────────────────────────────────────────────────────────

  readonly tenant$ = (): Observable<Tenant> =>
    this.state$.pipe(map((s) => s.tenant));

  readonly professionals$ = (): Observable<readonly Professional[]> =>
    this.state$.pipe(map((s) => s.professionals));

  readonly services$ = (): Observable<readonly Service[]> =>
    this.state$.pipe(map((s) => s.services));

  readonly appointments$ = (): Observable<readonly Appointment[]> =>
    this.state$.pipe(map((s) => s.appointments));

  readonly entries$ = (): Observable<readonly FinanceEntry[]> =>
    this.state$.pipe(map((s) => s.entries));

  readonly blocks$ = (): Observable<readonly TimeBlock[]> =>
    this.state$.pipe(map((s) => s.blocks));

  snapshot(): DemoDataset {
    return this.state$.value;
  }

  // ─── escrita ──────────────────────────────────────────────────────────

  setAppointments(next: readonly Appointment[]): void {
    this.commit({ ...this.state$.value, appointments: next });
  }

  patchAppointment(id: Id, patch: Partial<Appointment>): void {
    this.setAppointments(
      this.state$.value.appointments.map((a) =>
        a.id === id ? { ...a, ...patch, updatedAt: new Date().toISOString() } : a,
      ),
    );
  }

  addAppointment(appointment: Appointment): void {
    this.setAppointments([...this.state$.value.appointments, appointment]);
  }

  addEntry(entry: FinanceEntry): void {
    this.commit({
      ...this.state$.value,
      entries: [...this.state$.value.entries, entry],
    });
  }

  replaceEntry(entry: FinanceEntry): void {
    this.commit({
      ...this.state$.value,
      entries: this.state$.value.entries.map((item) =>
        item.id === entry.id ? entry : item,
      ),
    });
  }

  removeEntry(id: Id): void {
    this.commit({
      ...this.state$.value,
      entries: this.state$.value.entries.filter((e) => e.id !== id),
    });
  }

  setProfessionals(next: readonly Professional[]): void {
    this.commit({ ...this.state$.value, professionals: next });
  }

  setServices(next: readonly Service[]): void {
    this.commit({ ...this.state$.value, services: next });
  }

  setBlocks(next: readonly TimeBlock[]): void {
    this.commit({ ...this.state$.value, blocks: next });
  }

  setTenant(tenant: Tenant): void {
    this.commit({ ...this.state$.value, tenant });
  }

  /** Volta ao conjunto original — útil antes de demonstrar para um cliente. */
  reset(): void {
    this.commit(buildDemoDataset(new Date()));
  }

  // ─── persistência ─────────────────────────────────────────────────────

  private commit(next: DemoDataset): void {
    this.state$.next(next);
    this.persist(next);
  }

  private persist(data: DemoDataset): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Modo privado ou armazenamento cheio: o app segue em memória.
    }
  }

  private load(): DemoDataset {
    const now = new Date();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as DemoDataset;
        if (saved.seededFor === todayKey(now)) return saved;
      }
    } catch {
      // JSON corrompido ou acesso bloqueado: regera do zero.
    }
    return buildDemoDataset(now);
  }
}

// ─── auxiliares compartilhados pelos repositórios de demonstração ────────

export function withinRange(instant: IsoDateTime, range: DateRange): boolean {
  const t = new Date(instant).getTime();
  return t >= new Date(range.from).getTime() && t < new Date(range.to).getTime();
}

export function newId(prefix: string): Id {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function receivableEntry(
  appointment: Appointment,
  method: PaymentMethod,
  amount: Cents,
  paidAt: IsoDateTime,
): FinanceEntry {
  return {
    // Id derivado do agendamento: registrar o mesmo pagamento duas vezes
    // sobrescreve em vez de duplicar o recebimento.
    id: `fin-apt-${appointment.id}`,
    tenantId: appointment.tenantId,
    kind: 'recebimento',
    description: `${appointment.serviceName} — ${appointment.client.name}`,
    amount,
    occurredAt: paidAt,
    method,
    appointmentId: appointment.id,
    professionalId: appointment.professionalId,
    category: null,
    createdAt: paidAt,
    updatedAt: paidAt,
  };
}

export function expenseEntry(tenantId: Id, input: NewExpense): FinanceEntry {
  const stamp = new Date().toISOString();
  return {
    id: newId('fin-exp'),
    tenantId,
    kind: 'despesa',
    description: input.description,
    amount: input.amount,
    occurredAt: input.occurredAt,
    method: null,
    appointmentId: null,
    professionalId: null,
    category: input.category,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function nextStatusIsAllowed(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  const allowed: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
    agendado: ['em_atendimento', 'cancelado', 'nao_compareceu', 'concluido'],
    em_atendimento: ['concluido', 'cancelado'],
    concluido: [],
    cancelado: [],
    nao_compareceu: [],
  };
  return allowed[from].includes(to);
}
