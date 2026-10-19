import { DestroyRef, Injectable, inject } from '@angular/core';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Observable, map, of, switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentStatus,
  NewAppointment,
  NewBooking,
  PaymentMethod,
} from '../models/appointment';
import { Cents, ClockTime, DateRange, Id, IsoDateTime } from '../models/common';
import { FinanceEntry, NewExpense } from '../models/finance';
import { Professional } from '../models/professional';
import {
  BusyInterval,
  DaySchedule,
  TimeBlock,
  TimeWindow,
  Weekday,
  WeeklySchedule,
} from '../models/schedule';
import { Service } from '../models/service';
import { Address, Tenant } from '../models/tenant';
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
import { sortProfessionals } from '../demo/demo-seed';
import {
  AppointmentRow,
  BusyRow,
  FinanceRow,
  ProfessionalRow,
  SUPABASE_CLIENT,
  ServiceRow,
  SupabaseSync,
  SupabaseTenantScope,
  TenantRow,
  TimeBlockRow,
  iso,
  toAppError,
} from './supabase-core';

/**
 * Repositórios sobre o Supabase — os mesmos para o painel e para o app do
 * cliente.
 *
 * Quem pode o quê não é decidido aqui: é a RLS do banco e as funções de
 * agenda. Um cliente que chamasse `save` de profissional seria barrado lá,
 * não aqui. O que muda entre os apps é só de qual barbearia são as
 * consultas (SupabaseTenantScope) e se há tempo real (SupabaseRealtime).
 */

@Injectable()
export class SupabaseTenantRepository extends TenantRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  watchCurrent(): Observable<Tenant | null> {
    return this.sync.live(async () => {
      const row = await this.scope.row();
      return row ? toTenant(row) : null;
    });
  }

  async save(tenant: Tenant): Promise<void> {
    const { error } = await this.client.rpc('save_tenant_settings', {
      p_tenant_id: tenant.id,
      p_name: tenant.name,
      p_phone: tenant.phone,
      p_address: tenant.address,
      p_branding: tenant.branding,
      p_highlight: tenant.highlight,
      p_admin_name: tenant.admin.name,
      p_admin_email: tenant.admin.email,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }
}

@Injectable()
export class SupabaseProfessionalRepository extends ProfessionalRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  /**
   * Para quem não é da equipe, a RLS já esconde os inativos — pedir os
   * inativos aqui só faz diferença no painel.
   */
  watchAll(includeInactive = false): Observable<readonly Professional[]> {
    return this.sync.live(async () => {
      let query = this.client
        .from('professionals')
        .select(
          '*, professional_services(service_id), professional_schedule(weekday, kind, starts, ends)',
        )
        .eq('tenant_id', await this.scope.id());
      if (!includeInactive) query = query.eq('active', true);

      const { data, error } = await query;
      if (error) throw error;
      return sortProfessionals((data as ProfessionalRow[]).map(toProfessional));
    });
  }

  watchById(id: Id): Observable<Professional | null> {
    return this.watchAll(true).pipe(map((all) => all.find((p) => p.id === id) ?? null));
  }

  /** Dados, expediente e serviços numa transação só (save_professional). */
  async save(professional: Professional): Promise<void> {
    const { error } = await this.client.rpc('save_professional', {
      p_id: professional.id,
      p_tenant_id: professional.tenantId,
      p_name: professional.name,
      p_photo_url: professional.photoUrl,
      p_phone: professional.phone,
      p_bio: professional.bio,
      p_about: professional.about,
      p_active: professional.active,
      p_service_ids: professional.serviceIds,
      p_schedule: toScheduleRows(professional.schedule),
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  async setActive(id: Id, active: boolean): Promise<void> {
    const { error } = await this.client.from('professionals').update({ active }).eq('id', id);
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  async setServiceAssignment(serviceId: Id, professionalIds: readonly Id[]): Promise<void> {
    const { error } = await this.client.rpc('set_service_professionals', {
      p_service_id: serviceId,
      p_professional_ids: professionalIds,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }
}

@Injectable()
export class SupabaseServiceRepository extends ServiceRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  watchAll(includeInactive = false): Observable<readonly Service[]> {
    return this.sync.live(async () => {
      let query = this.client
        .from('services')
        .select('*')
        .eq('tenant_id', await this.scope.id())
        .order('price_cents');
      if (!includeInactive) query = query.eq('active', true);

      const { data, error } = await query;
      if (error) throw error;
      return (data as ServiceRow[]).map(toService);
    });
  }

  watchById(id: Id): Observable<Service | null> {
    return this.watchAll(true).pipe(map((all) => all.find((s) => s.id === id) ?? null));
  }

  async save(service: Service): Promise<void> {
    const { error } = await this.client.from('services').upsert({
      id: service.id,
      tenant_id: service.tenantId,
      name: service.name,
      description: service.description,
      duration_minutes: service.durationMinutes,
      price_cents: service.price,
      active: service.active,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  async setActive(id: Id, active: boolean): Promise<void> {
    const { error } = await this.client.from('services').update({ active }).eq('id', id);
    if (error) throw toAppError(error);
    this.sync.changed();
  }
}

@Injectable()
export class SupabaseAvailabilityRepository extends AvailabilityRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  watchBusy(range: DateRange): Observable<readonly BusyInterval[]> {
    return this.sync.live(async () => {
      const { data, error } = await this.client.rpc('busy_intervals', {
        p_tenant_id: await this.scope.id(),
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return (data as BusyRow[]).map(
        (row): BusyInterval => ({
          kind: row.kind,
          professionalId: row.professional_id,
          startsAt: iso(row.starts_at),
          endsAt: iso(row.ends_at),
          appointmentId: row.appointment_id,
        }),
      );
    });
  }
}

@Injectable()
export class SupabaseAppointmentRepository extends AppointmentRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);
  /** Só no app do cliente; o painel não tem conta de cliente. */
  private readonly clientAuth = inject(ClientAuth, { optional: true });

  /** Agenda da barbearia (painel). Para quem não é da equipe, a RLS devolve só o próprio. */
  watch(query: AppointmentQuery): Observable<readonly Appointment[]> {
    return this.sync.live(async () => {
      let request = this.client
        .from('appointments')
        .select('*')
        .eq('tenant_id', await this.scope.id())
        .gte('starts_at', query.range.from)
        .lt('starts_at', query.range.to)
        .order('starts_at');
      if (query.professionalId) request = request.eq('professional_id', query.professionalId);
      if (query.statuses) request = request.in('status', [...query.statuses]);

      const { data, error } = await request;
      if (error) throw error;
      return (data as AppointmentRow[]).map(toAppointment);
    });
  }

  /** A RLS só devolve o que quem pergunta pode ver. */
  watchById(id: Id): Observable<Appointment | null> {
    const fetch = () =>
      this.sync.live(async () => {
        const { data, error } = await this.client
          .from('appointments')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw error;
        return data ? toAppointment(data as AppointmentRow) : null;
      });

    // No app do cliente, refaz ao entrar e sair da conta.
    return this.clientAuth ? this.clientAuth.watchSession().pipe(switchMap(fetch)) : fetch();
  }

  /**
   * Pela ficha ligada à conta: primeiro as fichas da pessoa nesta barbearia,
   * depois os agendamentos delas. A RLS já restringiria aos próprios — o
   * filtro explícito existe para alguém da equipe, logado no app do cliente,
   * não ver a agenda inteira como se fosse sua.
   */
  watchMine(range: DateRange): Observable<readonly Appointment[]> {
    if (!this.clientAuth) return of([]);

    return this.clientAuth.watchSession().pipe(
      switchMap((account) => {
        if (!account) return of([] as readonly Appointment[]);

        return this.sync.live(async () => {
          const tenantId = await this.scope.id();
          const clients = await this.client
            .from('clients')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('user_id', account.id);
          if (clients.error) throw clients.error;

          const ids = (clients.data as { id: string }[]).map((c) => c.id);
          if (ids.length === 0) return [] as readonly Appointment[];

          const { data, error } = await this.client
            .from('appointments')
            .select('*')
            .in('client_id', ids)
            .gte('starts_at', range.from)
            .lt('starts_at', range.to)
            .order('starts_at');
          if (error) throw error;
          return (data as AppointmentRow[]).map(toAppointment);
        });
      }),
    );
  }

  async book(input: NewBooking): Promise<Appointment> {
    const { data, error } = await this.client.rpc('book_appointment', {
      p_professional_id: input.professionalId,
      p_service_id: input.serviceId,
      p_starts_at: input.startsAt,
      p_notes: input.notes,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
    return toAppointment(data as AppointmentRow);
  }

  /** Marcação no balcão: cliente por parâmetro, preço ajustável, sem cobrar expediente. */
  async create(input: NewAppointment): Promise<Appointment> {
    const { data, error } = await this.client.rpc('create_appointment', {
      p_professional_id: input.professionalId,
      p_service_id: input.serviceId,
      p_starts_at: input.startsAt,
      p_client_name: input.client.name,
      p_client_phone: input.client.phone,
      p_client_id: input.client.clientId,
      p_notes: input.notes,
      p_price_cents: input.priceOverride ?? null,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
    return toAppointment(data as AppointmentRow);
  }

  async reschedule(id: Id, startsAt: IsoDateTime, professionalId?: Id): Promise<void> {
    const { error } = await this.client.rpc('reschedule_appointment', {
      p_id: id,
      p_starts_at: startsAt,
      p_professional_id: professionalId ?? null,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  async cancel(id: Id): Promise<void> {
    const { error } = await this.client.rpc('cancel_appointment', { p_id: id });
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  /** Pela tabela: a RLS exige ser da equipe, e o gatilho barra transição inválida. */
  async changeStatus(id: Id, status: AppointmentStatus): Promise<void> {
    const { data, error } = await this.client
      .from('appointments')
      .update({ status })
      .eq('id', id)
      .select('id');
    if (error) throw toAppError(error);
    if (!data?.length) throw new Error('Agendamento não encontrado.');
    this.sync.changed();
  }

  async registerPayment(id: Id, method: PaymentMethod, amount?: Cents): Promise<void> {
    const { error } = await this.client.rpc('register_payment', {
      p_id: id,
      p_method: method,
      p_amount_cents: amount ?? null,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }
}

@Injectable()
export class SupabaseTimeBlockRepository extends TimeBlockRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  /** Bloqueios que tocam o período — um que começou antes e ainda vale também conta. */
  watch(range: DateRange): Observable<readonly TimeBlock[]> {
    return this.sync.live(async () => {
      const { data, error } = await this.client
        .from('time_blocks')
        .select('*')
        .eq('tenant_id', await this.scope.id())
        .lt('starts_at', range.to)
        .gt('ends_at', range.from)
        .order('starts_at');
      if (error) throw error;
      return (data as TimeBlockRow[]).map(
        (row): TimeBlock => ({
          id: row.id,
          tenantId: row.tenant_id,
          professionalId: row.professional_id,
          startsAt: iso(row.starts_at),
          endsAt: iso(row.ends_at),
          reason: row.reason,
        }),
      );
    });
  }

  async create(block: Omit<TimeBlock, 'id'>): Promise<void> {
    const { error } = await this.client.from('time_blocks').insert({
      tenant_id: block.tenantId,
      professional_id: block.professionalId,
      starts_at: block.startsAt,
      ends_at: block.endsAt,
      reason: block.reason,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  async remove(id: Id): Promise<void> {
    const { error } = await this.client.from('time_blocks').delete().eq('id', id);
    if (error) throw toAppError(error);
    this.sync.changed();
  }
}

@Injectable()
export class SupabaseFinanceRepository extends FinanceRepository {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  /** Pela data do dinheiro (occurred_at), não do atendimento. */
  watchEntries(query: FinanceQuery): Observable<readonly FinanceEntry[]> {
    return this.sync.live(async () => {
      let request = this.client
        .from('finance_entries')
        .select('*')
        .eq('tenant_id', await this.scope.id())
        .gte('occurred_at', query.range.from)
        .lt('occurred_at', query.range.to)
        .order('occurred_at');
      if (query.professionalId) request = request.eq('professional_id', query.professionalId);

      const { data, error } = await request;
      if (error) throw error;
      return (data as FinanceRow[]).map(toFinanceEntry);
    });
  }

  async addExpense(expense: NewExpense): Promise<void> {
    const { error } = await this.client.from('finance_entries').insert({
      tenant_id: await this.scope.id(),
      kind: 'despesa',
      description: expense.description,
      amount_cents: expense.amount,
      occurred_at: expense.occurredAt,
      category: expense.category,
    });
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  /** Recebimento não passa: o gatilho do banco o mantém imutável. */
  async updateExpense(id: Id, expense: NewExpense): Promise<void> {
    const { error } = await this.client
      .from('finance_entries')
      .update({
        description: expense.description,
        amount_cents: expense.amount,
        occurred_at: expense.occurredAt,
        category: expense.category,
      })
      .eq('id', id)
      .eq('kind', 'despesa');
    if (error) throw toAppError(error);
    this.sync.changed();
  }

  async removeExpense(id: Id): Promise<void> {
    const { error } = await this.client
      .from('finance_entries')
      .delete()
      .eq('id', id)
      .eq('kind', 'despesa');
    if (error) throw toAppError(error);
    this.sync.changed();
  }
}

/**
 * Tempo real do painel: uma mudança em agendamentos, bloqueios ou caixa da
 * barbearia — feita no celular de um cliente, em outro tablet — reconsulta as
 * telas abertas. É o que faz o horário marcado pelo cliente aparecer na
 * agenda sem ninguém recarregar.
 *
 * O canal só entrega o que a RLS deixaria ler: assinar a barbearia de outra
 * conta não traz nada.
 */
@Injectable()
export class SupabaseRealtime {
  private readonly client = inject(SUPABASE_CLIENT);
  private readonly auth = inject(StaffAuth);
  private readonly sync = inject(SupabaseSync);
  private channel: RealtimeChannel | null = null;

  constructor() {
    const subscription = this.auth.watchSession().subscribe((session) => {
      void this.close();
      if (session) this.open(session.tenantId);
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      void this.close();
    });
  }

  private open(tenantId: Id): void {
    const filter = `tenant_id=eq.${tenantId}`;
    const changed = () => this.sync.changed();

    this.channel = this.client
      .channel(`agenda-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_blocks', filter }, changed)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_entries', filter }, changed)
      .subscribe();
  }

  private async close(): Promise<void> {
    if (!this.channel) return;
    const channel = this.channel;
    this.channel = null;
    await this.client.removeChannel(channel);
  }
}

// ─── linhas → modelos ────────────────────────────────────────────────────

function toTenant(row: TenantRow): Tenant {
  // Relação um-para-um: conforme a versão do PostgREST, vem como objeto ou
  // como lista de um item.
  const embedded = row.tenant_accounts as TenantRow['tenant_accounts'] | TenantRow['tenant_accounts'][];
  const account = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    address: (row.address as unknown as Address | null) ?? null,
    // Responsável e assinatura só chegam para a equipe; no app do cliente
    // ficam neutros (ele não os usa).
    admin: { name: account?.admin_name ?? '', email: account?.admin_email ?? '' },
    highlight: row.highlight,
    branding: {
      logoUrl: row.branding?.logoUrl ?? null,
      primaryColor: row.branding?.primaryColor ?? null,
    },
    subscription: account?.subscription ?? 'ativa',
    timeZone: row.time_zone,
    createdAt: iso(row.created_at),
  };
}

function toProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    photoUrl: row.photo_url,
    phone: row.phone,
    bio: row.bio,
    about: row.about,
    serviceIds: row.professional_services.map((link) => link.service_id),
    schedule: toWeeklySchedule(row.professional_schedule),
    active: row.active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/**
 * Linhas de expediente e intervalo → WeeklySchedule. Dia sem linha de
 * expediente é folga.
 */
function toWeeklySchedule(rows: ProfessionalRow['professional_schedule']): WeeklySchedule {
  const day = (weekday: Weekday): DaySchedule => {
    const of = (kind: 'expediente' | 'intervalo'): TimeWindow[] =>
      rows
        .filter((r) => r.weekday === weekday && r.kind === kind)
        .map((r) => ({ start: clock(r.starts), end: clock(r.ends) }))
        .sort((a, b) => a.start.localeCompare(b.start));

    const windows = of('expediente');
    return { working: windows.length > 0, windows, breaks: of('intervalo') };
  };

  return { 0: day(0), 1: day(1), 2: day(2), 3: day(3), 4: day(4), 5: day(5), 6: day(6) };
}

/**
 * WeeklySchedule → linhas, para save_professional. Dia de folga não vira
 * linha nenhuma — as janelas que a tela ainda guardava para ele somem, e a
 * pessoa redigita ao voltar a trabalhar naquele dia.
 */
function toScheduleRows(schedule: WeeklySchedule) {
  const rows: { weekday: number; kind: 'expediente' | 'intervalo'; starts: string; ends: string }[] = [];
  for (const weekday of [0, 1, 2, 3, 4, 5, 6] as Weekday[]) {
    const day = schedule[weekday];
    if (!day?.working) continue;
    for (const w of day.windows) rows.push({ weekday, kind: 'expediente', starts: w.start, ends: w.end });
    for (const b of day.breaks) rows.push({ weekday, kind: 'intervalo', starts: b.start, ends: b.end });
  }
  return rows;
}

/** "09:00:00" → "09:00"; "24:00:00" → "24:00". */
function clock(value: string): ClockTime {
  return value.slice(0, 5);
}

function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    price: row.price_cents,
    active: row.active,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    professionalId: row.professional_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    client: { clientId: row.client_id, name: row.client_name, phone: row.client_phone },
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    durationMinutes: row.duration_minutes,
    price: row.price_cents,
    status: row.status,
    payment: { status: row.payment_status, method: row.payment_method, paidAt: iso(row.paid_at) },
    notes: row.notes,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toFinanceEntry(row: FinanceRow): FinanceEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    description: row.description,
    amount: row.amount_cents,
    occurredAt: iso(row.occurred_at),
    method: row.method,
    appointmentId: row.appointment_id,
    professionalId: row.professional_id,
    category: row.category,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}
