import { Injectable, inject } from '@angular/core';
import { Observable, map, of, switchMap, throwError } from 'rxjs';
import {
  Appointment,
  AppointmentStatus,
  NewAppointment,
  NewBooking,
  PaymentMethod,
} from '../models/appointment';
import { ClockTime, DateRange, Id, IsoDateTime } from '../models/common';
import { Professional } from '../models/professional';
import { BusyInterval, DaySchedule, TimeWindow, Weekday, WeeklySchedule } from '../models/schedule';
import { Service } from '../models/service';
import { Address, Tenant } from '../models/tenant';
import {
  AppointmentQuery,
  AppointmentRepository,
  AvailabilityRepository,
  ClientAuth,
  ProfessionalRepository,
  ServiceRepository,
  TenantRepository,
} from '../repositories/repositories';
import { sortProfessionals } from '../demo/demo-seed';
import {
  AppointmentRow,
  BusyRow,
  ProfessionalRow,
  SUPABASE_CLIENT,
  ServiceRow,
  SupabaseSync,
  SupabaseTenantScope,
  TenantRow,
  iso,
  notWired,
  toAppError,
} from './supabase-core';

/**
 * Repositórios do app do cliente sobre o Supabase.
 *
 * Leitura: vitrine (barbearia, profissionais, serviços), horários ocupados e
 * os agendamentos da própria conta. Escrita: só pelas funções do banco
 * (marcar, reagendar, cancelar) — é lá que moram expediente, conflito e a
 * regra das 2h.
 *
 * O que só a equipe faz (salvar profissional, receber pagamento…) responde
 * com erro explicando que o painel ainda não está ligado: ele depende do
 * login da equipe, que vem depois. Até lá o painel usa o modo demonstração.
 */

@Injectable()
export class SupabaseTenantRepository extends TenantRepository {
  private readonly scope = inject(SupabaseTenantScope);
  private readonly sync = inject(SupabaseSync);

  watchCurrent(): Observable<Tenant | null> {
    return this.sync.live(async () => {
      const row = await this.scope.row;
      return row ? toTenant(row) : null;
    });
  }

  save(): Promise<void> {
    return Promise.reject(notWired('Salvar a barbearia'));
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

  save(): Promise<void> {
    return Promise.reject(notWired('Salvar profissional'));
  }

  setActive(): Promise<void> {
    return Promise.reject(notWired('Ativar profissional'));
  }

  setServiceAssignment(): Promise<void> {
    return Promise.reject(notWired('Definir quem faz o serviço'));
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

  save(): Promise<void> {
    return Promise.reject(notWired('Salvar serviço'));
  }

  setActive(): Promise<void> {
    return Promise.reject(notWired('Ativar serviço'));
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
  private readonly auth = inject(ClientAuth);

  watch(_query: AppointmentQuery): Observable<readonly Appointment[]> {
    return throwError(() => notWired('Agenda da barbearia'));
  }

  /** A RLS só devolve o que quem pergunta pode ver. */
  watchById(id: Id): Observable<Appointment | null> {
    return this.auth.watchSession().pipe(
      switchMap(() =>
        this.sync.live(async () => {
          const { data, error } = await this.client
            .from('appointments')
            .select('*')
            .eq('id', id)
            .maybeSingle();
          if (error) throw error;
          return data ? toAppointment(data as AppointmentRow) : null;
        }),
      ),
    );
  }

  /**
   * Pela ficha ligada à conta: primeiro as fichas da pessoa nesta barbearia,
   * depois os agendamentos delas. A RLS já restringiria aos próprios — o
   * filtro explícito existe para alguém da equipe, logado no app do cliente,
   * não ver a agenda inteira como se fosse sua.
   */
  watchMine(range: DateRange): Observable<readonly Appointment[]> {
    return this.auth.watchSession().pipe(
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

  create(_input: NewAppointment): Promise<Appointment> {
    return Promise.reject(notWired('Marcar pelo balcão'));
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

  changeStatus(_id: Id, _status: AppointmentStatus): Promise<void> {
    return Promise.reject(notWired('Mudar status'));
  }

  registerPayment(_id: Id, _method: PaymentMethod): Promise<void> {
    return Promise.reject(notWired('Registrar pagamento'));
  }
}

// ─── linhas → modelos ────────────────────────────────────────────────────

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    phone: row.phone,
    address: (row.address as unknown as Address | null) ?? null,
    // Dados da conta (responsável, assinatura) não são públicos e o app do
    // cliente não os usa: ficam neutros aqui.
    admin: { name: '', email: '' },
    highlight: row.highlight,
    branding: {
      logoUrl: row.branding?.logoUrl ?? null,
      primaryColor: row.branding?.primaryColor ?? null,
    },
    subscription: 'ativa',
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
