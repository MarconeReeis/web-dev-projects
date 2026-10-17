import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentRepository,
  Cents,
  DateRange,
  FinanceEntry,
  FinanceRepository,
  FinanceSummary,
  Id,
  PeriodPreset,
  ProfessionalRepository,
  formatLongDate,
  formatMoney,
  rangeFor,
} from '@atrio/data';
import { AtrButton, AtrIcon, AtrPageHeading } from '@atrio/ui';
import { PeriodFilter } from '../../shared/period-filter';
import { ProfessionalFilter } from '../../shared/professional-filter';
import { BarsChart, ChartBucket } from './components/bars-chart';
import { FinancePanel } from './components/finance-panel';
import { KpiCard } from './components/kpi-card';
import { UpcomingAppointments } from './components/upcoming-appointments';

const DAY_MS = 86_400_000;

/**
 * Dashboard — a tela que fica aberta no tablet o dia inteiro.
 *
 * Responde três perguntas, nesta ordem de urgência:
 *   1. Quem é o próximo atendimento?
 *   2. Como está o movimento do período?
 *   3. Quanto entrou e quanto falta receber?
 *
 * Os filtros de período e profissional ficam em signals e alimentam as
 * consultas via toObservable + switchMap: mudar o filtro refaz a consulta,
 * sem nenhum "recarregar" manual.
 */
@Component({
  selector: 'adm-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AtrPageHeading,
    AtrButton,
    AtrIcon,
    PeriodFilter,
    ProfessionalFilter,
    KpiCard,
    UpcomingAppointments,
    FinancePanel,
  ],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Visão geral"
      description="Acompanhe a agenda e o financeiro da sua barbearia."
    >
      <a atrButton routerLink="/agenda">
        <atr-icon name="plus" [size]="16" />
        Novo agendamento
      </a>
    </atr-page-heading>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <adm-period-filter [selected]="preset()" (selectedChange)="preset.set($event)" />
      <adm-professional-filter
        [professionals]="professionals()"
        [selected]="professionalId()"
        (selectedChange)="professionalId.set($event)"
      />
    </div>

    <!-- Indicadores do período -->
    <div class="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <adm-kpi-card
        label="Agendamentos"
        [value]="scheduledCount().toString()"
        icon="calendar-days"
        [highlight]="true"
      />
      <adm-kpi-card
        label="Atendimentos concluídos"
        [value]="completedCount().toString()"
        icon="circle-check-big"
      />
      <adm-kpi-card
        label="Total recebido"
        [value]="money(summary().received)"
        icon="credit-card"
      />
      <adm-kpi-card
        label="Pagamentos pendentes"
        [value]="money(summary().pending)"
        icon="clock"
        [hint]="pendingHint()"
      />
    </div>

    <!-- Agenda de hoje e financeiro do período -->
    <div class="mt-4 grid gap-4 xl:grid-cols-5">
      <div class="xl:col-span-3">
        <adm-upcoming-appointments
          [appointments]="upcomingToday()"
          [professionals]="professionals()"
          [subtitle]="todayLabel()"
          (selected)="openAppointment($event)"
        />
      </div>
      <div class="xl:col-span-2">
        <adm-finance-panel
          [summary]="summary()"
          [buckets]="buckets()"
          [scopedToProfessional]="professionalId() !== null"
          [subtitle]="periodLabel()"
        />
      </div>
    </div>
  `,
})
export class DashboardPage {
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly financeRepo = inject(FinanceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly router = inject(Router);

  protected money = formatMoney;

  // ─── filtros ──────────────────────────────────────────────────────────

  protected readonly preset = signal<PeriodPreset>('hoje');
  protected readonly professionalId = signal<Id | null>(null);

  private readonly range = computed<DateRange>(() => rangeFor(this.preset()));
  private readonly todayRange = computed<DateRange>(() => rangeFor('hoje'));

  // ─── dados ────────────────────────────────────────────────────────────

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [],
  });

  private readonly periodAppointments = toSignal(
    toObservable(
      computed(() => ({
        range: this.range(),
        professionalId: this.professionalId(),
      })),
    ).pipe(switchMap((query) => this.appointmentsRepo.watch(query))),
    { initialValue: [] as readonly Appointment[] },
  );

  /**
   * Esta lista é SEMPRE de hoje, qualquer que seja o período dos indicadores:
   * "quem é o próximo" não muda porque o dono foi ver o mês. O filtro de
   * profissional, esse sim, se aplica.
   */
  private readonly todayAppointments = toSignal(
    toObservable(
      computed(() => ({
        range: this.todayRange(),
        professionalId: this.professionalId(),
      })),
    ).pipe(switchMap((query) => this.appointmentsRepo.watch(query))),
    { initialValue: [] as readonly Appointment[] },
  );

  private readonly entries = toSignal(
    toObservable(
      computed(() => ({
        range: this.range(),
        professionalId: this.professionalId(),
      })),
    ).pipe(switchMap((query) => this.financeRepo.watchEntries(query))),
    { initialValue: [] as readonly FinanceEntry[] },
  );

  // ─── derivados ────────────────────────────────────────────────────────

  protected readonly upcomingToday = computed(() => {
    const now = Date.now();
    return this.todayAppointments().filter(
      (a) =>
        (a.status === 'agendado' || a.status === 'em_atendimento') &&
        new Date(a.endsAt).getTime() >= now,
    );
  });

  /** Cancelados não contam como agendamento do período. */
  protected readonly scheduledCount = computed(
    () => this.periodAppointments().filter((a) => a.status !== 'cancelado').length,
  );

  protected readonly completedCount = computed(
    () => this.periodAppointments().filter((a) => a.status === 'concluido').length,
  );

  protected readonly summary = computed<FinanceSummary>(() => {
    const entries = this.entries();

    const received = sum(
      entries.filter((e) => e.kind === 'recebimento').map((e) => e.amount),
    );
    const expenses = sum(
      entries.filter((e) => e.kind === 'despesa').map((e) => e.amount),
    );

    // Pendente vem do atendimento, não do financeiro: o lançamento só existe
    // depois que o pagamento é registrado — é o que impede somar duas vezes.
    const pendingAppointments = this.periodAppointments().filter(
      (a) => a.status === 'concluido' && a.payment.status === 'pendente',
    );

    return {
      received,
      expenses,
      balance: received - expenses,
      pending: sum(pendingAppointments.map((a) => a.price)),
      pendingCount: pendingAppointments.length,
    };
  });

  protected readonly pendingHint = computed(() => {
    const count = this.summary().pendingCount;
    if (count === 0) return 'Nada em aberto';
    return `${count} ${count === 1 ? 'atendimento' : 'atendimentos'}`;
  });

  protected readonly buckets = computed<readonly ChartBucket[]>(() =>
    bucketize(this.entries(), this.range()),
  );

  // ─── rótulos ──────────────────────────────────────────────────────────

  protected readonly todayLabel = computed(() => {
    const who = this.professionalId()
      ? (this.professionals().find((p) => p.id === this.professionalId())?.name ??
        'Profissional')
      : 'Todos os profissionais';
    return `${who} · ${formatLongDate(new Date())}`;
  });

  protected readonly periodLabel = computed(() =>
    this.professionalId()
      ? 'Recebimentos do profissional no período'
      : 'Recebimentos e despesas do período',
  );

  // ─── ações ────────────────────────────────────────────────────────────

  protected openAppointment(appointment: Appointment): void {
    // O painel lateral de detalhes entra junto com a tela de Agenda; por
    // enquanto a Dashboard leva para lá em vez de abrir um controle morto.
    void this.router.navigate(['/agenda'], {
      queryParams: { agendamento: appointment.id },
    });
  }
}

function sum(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * Agrupa os lançamentos em barras.
 *
 * A granularidade segue o tamanho do período: um dia vira faixas de duas
 * horas, uma semana vira dias, e períodos maiores viram semanas. Trinta barras
 * num card de 400px não comunicam nada.
 */
function bucketize(
  entries: readonly FinanceEntry[],
  range: DateRange,
): readonly ChartBucket[] {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);

  if (days <= 1) {
    const slots = [8, 10, 12, 14, 16, 18, 20];
    return slots.map((hour) => ({
      label: `${hour}h`,
      ...totalsIn(entries, (date) => {
        const h = date.getHours();
        return h >= hour && h < hour + 2;
      }),
    }));
  }

  if (days <= 7) {
    return Array.from({ length: days }, (_, index) => {
      const day = new Date(from);
      day.setDate(day.getDate() + index);
      return {
        label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
          .format(day)
          .replace('.', ''),
        ...totalsIn(entries, (date) => sameDay(date, day)),
      };
    });
  }

  const weeks = Math.ceil(days / 7);
  return Array.from({ length: weeks }, (_, index) => {
    const start = new Date(from);
    start.setDate(start.getDate() + index * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
        .format(start),
      ...totalsIn(entries, (date) => date >= start && date < end),
    };
  });
}

function totalsIn(
  entries: readonly FinanceEntry[],
  matches: (date: Date) => boolean,
): { received: Cents; expenses: Cents } {
  let received = 0;
  let expenses = 0;

  for (const entry of entries) {
    if (!matches(new Date(entry.occurredAt))) continue;
    if (entry.kind === 'recebimento') received += entry.amount;
    else expenses += entry.amount;
  }

  return { received, expenses };
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
