import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  TimeBlock,
  TimeBlockRepository,
  addDays,
  dayOf,
  dayRange,
  formatLongDate,
  formatShortDay,
  formatTime,
  isSameDay,
  shopDay,
  shopInstant,
} from '@atrio/data';
import { AtrButton, AtrIcon, AtrOverlay } from '@atrio/ui';
import { StatusBadge } from '../../shared/status-badge';
import { toDateInputValue } from '../../shared/date-input';
import { PinGate } from '../../shared/pin/pin-gate';
import { AppointmentPanel, AppointmentPanelData } from '../agenda/components/appointment-panel';
import { NewAppointmentData, NewAppointmentDialog } from '../agenda/components/new-appointment-dialog';

/** Até onde o "Hoje" procura pedidos para confirmar. */
const REQUEST_HORIZON_DAYS = 60;

type Row =
  | { readonly kind: 'atendimento'; readonly startsAt: string; readonly appointment: Appointment }
  | { readonly kind: 'bloqueio'; readonly startsAt: string; readonly block: TimeBlock };

/**
 * A agenda no celular, em lista.
 *
 * Duas abas usam esta tela (data da rota, `mode`):
 *
 * - "Hoje": os pedidos para confirmar no topo — de qualquer dia, porque o
 *   pedido tem prazo — e depois o dia de hoje;
 * - "Agenda": um dia de cada vez, com setas e calendário.
 *
 * Tocar num atendimento abre o mesmo painel de detalhes do tablet, com todas
 * as ações (confirmar, iniciar, receber, reagendar…). A grade de colunas,
 * que não cabe no celular, fica para o tablet.
 */
@Component({
  selector: 'adm-day-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrButton, AtrIcon, StatusBadge],
  host: { class: 'block' },
  template: `
    @if (mode() === 'hoje') {
      <h1 class="text-2xl font-bold tracking-tight">Hoje</h1>
      <p class="text-sm text-muted-foreground">{{ dayLabel() }}</p>
    } @else {
      <h1 class="text-2xl font-bold tracking-tight">Agenda</h1>
      <div class="mt-3 flex items-center gap-2">
        <button type="button" class="pill size-11 justify-center p-0" aria-label="Dia anterior" (click)="shift(-1)">
          <atr-icon name="chevron-left" [size]="18" />
        </button>
        <label class="relative flex min-h-11 flex-1 items-center justify-center rounded-full border border-border bg-card px-4 text-sm font-semibold">
          {{ dayLabel() }}
          <input
            type="date"
            class="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Escolher o dia"
            [value]="dateValue()"
            (change)="pickDate($event)"
          />
        </label>
        <button type="button" class="pill size-11 justify-center p-0" aria-label="Próximo dia" (click)="shift(1)">
          <atr-icon name="chevron-right" [size]="18" />
        </button>
      </div>
      @if (!isToday()) {
        <button type="button" class="mt-2 text-sm font-semibold text-primary" (click)="date.set(today())">
          Voltar para hoje
        </button>
      }
    }

    <!-- Pedidos para confirmar (barbearia que confirma cada agendamento). -->
    @if (mode() === 'hoje' && requests().length > 0) {
      <section class="mt-5">
        <h2 class="text-sm font-bold tracking-wide text-muted-foreground uppercase">
          Pedidos para confirmar
        </h2>
        <ul class="mt-2 flex flex-col gap-2">
          @for (request of requests(); track request.id) {
            <li class="rounded-2xl border border-dashed border-warning bg-warning-soft p-4">
              <button type="button" class="block w-full text-left" (click)="open(request)">
                <span class="block font-bold">{{ request.client.name }}</span>
                <span class="mt-0.5 block text-sm">
                  {{ when(request.startsAt) }} · {{ request.serviceName }}
                </span>
                @if (showProfessional()) {
                  <span class="block text-sm text-muted-foreground">com {{ professionalName(request.professionalId) }}</span>
                }
                @if (request.respondBy; as deadline) {
                  <span class="mt-1 block text-xs text-warning-soft-foreground">
                    Responda até {{ when(deadline).toLowerCase() }}
                  </span>
                }
              </button>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button type="button" atrButton="destructive-outline" [disabled]="busy()" (click)="decline(request)">
                  Recusar
                </button>
                <button type="button" atrButton [disabled]="busy()" (click)="confirm(request)">
                  <atr-icon name="check" [size]="16" />
                  Confirmar
                </button>
              </div>
            </li>
          }
        </ul>
      </section>
    }

    <!-- O dia -->
    <section class="mt-5">
      @if (mode() === 'hoje') {
        <h2 class="text-sm font-bold tracking-wide text-muted-foreground uppercase">Atendimentos de hoje</h2>
      }

      @if (rows().length === 0) {
        <p class="surface mt-2 px-5 py-8 text-center text-sm text-muted-foreground">
          Nenhum atendimento {{ isToday() ? 'hoje' : 'neste dia' }}.
        </p>
      } @else {
        <ul class="mt-2 flex flex-col gap-2">
          @for (row of rows(); track row.kind === 'atendimento' ? row.appointment.id : row.block.id) {
            @if (row.kind === 'atendimento') {
              <li>
                <button
                  type="button"
                  class="surface flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-primary"
                  [class.opacity-60]="row.appointment.status === 'cancelado' || row.appointment.status === 'nao_compareceu'"
                  (click)="open(row.appointment)"
                >
                  <span class="tabular w-12 shrink-0 pt-0.5 text-sm font-bold">{{ time(row.appointment.startsAt) }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-bold">{{ row.appointment.client.name }}</span>
                    <span class="block truncate text-sm text-muted-foreground">
                      {{ row.appointment.serviceName }} · até {{ time(row.appointment.endsAt) }}
                      @if (showProfessional()) {
                        · {{ professionalName(row.appointment.professionalId) }}
                      }
                    </span>
                    <adm-status-badge class="mt-2 inline-block" [status]="row.appointment.status" />
                  </span>
                  <atr-icon name="chevron-right" [size]="18" class="mt-0.5 shrink-0 text-muted-foreground" />
                </button>
              </li>
            } @else {
              <li class="hatch flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm text-muted-foreground">
                <atr-icon name="lock" [size]="16" class="shrink-0" />
                <span class="tabular font-semibold">{{ time(row.block.startsAt) }}–{{ time(row.block.endsAt) }}</span>
                <span class="min-w-0 truncate">
                  {{ row.block.reason || 'Bloqueado' }}
                  @if (showProfessional()) {
                    · {{ row.block.professionalId ? professionalName(row.block.professionalId) : 'Todos' }}
                  }
                </span>
              </li>
            }
          }
        </ul>
      }
    </section>

    <!-- Encaixar um cliente: acima da barra inferior. -->
    <button
      type="button"
      atrButton
      class="fixed right-4 bottom-24 z-20 size-14 rounded-full p-0 shadow-pop"
      aria-label="Novo agendamento"
      (click)="newAppointment()"
    >
      <atr-icon name="plus" [size]="24" />
    </button>
  `,
})
export class DayListPage {
  /** Da rota: 'hoje' ou 'dias'. */
  readonly mode = input<'hoje' | 'dias'>('hoje');

  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly overlay = inject(AtrOverlay);
  private readonly pinGate = inject(PinGate);

  protected readonly time = formatTime;

  protected readonly today = signal(shopDay());
  protected readonly date = signal(shopDay());
  protected readonly busy = signal(false);

  /** No "Hoje", sempre hoje; na "Agenda", o dia escolhido. */
  private readonly day = computed(() => (this.mode() === 'hoje' ? this.today() : this.date()));

  protected readonly isToday = computed(() => isSameDay(this.day(), this.today()));

  protected readonly dayLabel = computed(() => {
    const label = formatLongDate(shopInstant(this.day()));
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly dateValue = computed(() => toDateInputValue(this.day()));

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  /** Com um profissional só (plano Solo), dizer "com quem" é ruído. */
  protected readonly showProfessional = computed(() => this.professionals().length > 1);

  private readonly range = computed(() => dayRange(this.day()));

  private readonly appointments = toSignal(
    toObservable(this.range).pipe(switchMap((range) => this.appointmentsRepo.watch({ range }))),
    { initialValue: [] as readonly Appointment[] },
  );

  private readonly blocks = toSignal(
    toObservable(this.range).pipe(switchMap((range) => this.blocksRepo.watch(range))),
    { initialValue: [] as readonly TimeBlock[] },
  );

  /** Pedidos de hoje em diante: o prazo é o que importa, não o dia. */
  private readonly upcoming = toSignal(
    this.appointmentsRepo.watch({
      range: dayRange(shopDay(), REQUEST_HORIZON_DAYS),
      statuses: ['pendente'],
    }),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly requests = computed(() =>
    this.upcoming()
      .filter((appointment) => appointment.status === 'pendente')
      .sort((a, b) => (a.respondBy ?? a.startsAt).localeCompare(b.respondBy ?? b.startsAt)),
  );

  /**
   * Atendimentos e bloqueios do dia, em ordem de horário. No "Hoje", os
   * pedidos já aparecem lá em cima e não se repetem aqui.
   */
  protected readonly rows = computed<readonly Row[]>(() => {
    const appointments = this.appointments().filter(
      (appointment) => this.mode() !== 'hoje' || appointment.status !== 'pendente',
    );
    const rows: Row[] = [
      ...appointments.map((appointment) => ({
        kind: 'atendimento' as const,
        startsAt: appointment.startsAt,
        appointment,
      })),
      ...this.blocks().map((block) => ({ kind: 'bloqueio' as const, startsAt: block.startsAt, block })),
    ];
    return rows.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  });

  /** "Hoje às 16:00", "Amanhã às 09:30" ou "Sex, 24 de out às 10:00". */
  protected when(instant: string): string {
    const day = shopDay(instant);
    const today = this.today();
    const label = isSameDay(day, today)
      ? 'Hoje'
      : isSameDay(day, addDays(today, 1))
        ? 'Amanhã'
        : formatShortDay(instant);
    return `${label} às ${formatTime(instant)}`;
  }

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? '';
  }

  protected shift(days: number): void {
    this.date.set(addDays(this.date(), days));
  }

  protected pickDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.date.set(dayOf(value));
  }

  protected open(appointment: Appointment): void {
    this.overlay.openSheet<AppointmentPanel, AppointmentPanelData>(AppointmentPanel, {
      appointmentId: appointment.id,
    });
  }

  protected newAppointment(): void {
    const professionals = this.professionals();
    this.overlay.openDialog<NewAppointmentDialog, NewAppointmentData, Appointment | null>(NewAppointmentDialog, {
      date: this.day(),
      // Plano Solo: já vem com o único profissional escolhido.
      professionalId: professionals.length === 1 ? professionals[0].id : null,
      startsAt: null,
    });
  }

  protected async confirm(appointment: Appointment): Promise<void> {
    await this.run(() => this.appointmentsRepo.confirm(appointment.id));
  }

  /** Recusar libera o horário — como cancelar, pede o PIN do balcão. */
  protected async decline(appointment: Appointment): Promise<void> {
    if (!(await this.pinGate.ensure('recusar o pedido'))) return;
    await this.run(() => this.appointmentsRepo.decline(appointment.id));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } finally {
      this.busy.set(false);
    }
  }
}
