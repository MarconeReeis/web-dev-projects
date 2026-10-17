import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentRepository,
  DateRange,
  Id,
  IsoDateTime,
  Professional,
  ProfessionalRepository,
  TimeBlock,
  TimeBlockRepository,
  formatLongDate,
  formatShortDate,
  isSameDay,
  startOfDay,
  startOfWeek,
} from '@atrio/data';
import { AtrButton, AtrCard, AtrEmptyState, AtrIcon, AtrOverlay, AtrPageHeading } from '@atrio/ui';
import { ProfessionalFilter } from '../../shared/professional-filter';
import { AgendaGrid, GridColumn } from './components/agenda-grid';
import { AppointmentPanel, toDateInputValue } from './components/appointment-panel';
import { BlockDialog, BlockDialogData } from './components/block-dialog';
import { NewAppointmentData, NewAppointmentDialog } from './components/new-appointment-dialog';

type View = 'dia' | 'semana';

const WEEKDAY_SHORT = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

/**
 * Agenda.
 *
 * Duas visões sobre a mesma grade:
 *
 *   Dia     todos os profissionais lado a lado — a tela do balcão.
 *   Semana  um profissional por vez, sete dias. Sete dias vezes quatro
 *           profissionais seriam 28 colunas, ilegíveis em qualquer tablet.
 */
@Component({
  selector: 'adm-agenda-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AtrPageHeading,
    AtrButton,
    AtrIcon,
    AtrCard,
    AtrEmptyState,
    ProfessionalFilter,
    AgendaGrid,
  ],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Agenda"
      description="Toque em um horário livre para agendar ou em um atendimento para ver detalhes."
    >
      <button type="button" atrButton="outline" (click)="openBlockDialog()">
        <atr-icon name="lock" [size]="16" />
        Bloquear horário
      </button>
      <button type="button" atrButton (click)="openNewAppointment()">
        <atr-icon name="plus" [size]="16" />
        Novo agendamento
      </button>
    </atr-page-heading>

    <!-- Filtros -->
    <div class="mt-6 flex flex-wrap items-center gap-3">
      <div class="flex gap-2" role="group" aria-label="Visão">
        <button
          type="button"
          class="pill"
          [attr.data-active]="view() === 'dia'"
          (click)="view.set('dia')"
        >
          Dia
        </button>
        <button
          type="button"
          class="pill"
          [attr.data-active]="view() === 'semana'"
          (click)="view.set('semana')"
        >
          Semana
        </button>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="pill w-11 px-0"
          [attr.aria-label]="view() === 'dia' ? 'Dia anterior' : 'Semana anterior'"
          (click)="shift(-1)"
        >
          <atr-icon name="chevron-left" [size]="18" />
        </button>
        <button type="button" class="pill" [attr.data-active]="isToday()" (click)="goToday()">
          Hoje
        </button>
        <button
          type="button"
          class="pill w-11 px-0"
          [attr.aria-label]="view() === 'dia' ? 'Próximo dia' : 'Próxima semana'"
          (click)="shift(1)"
        >
          <atr-icon name="chevron-right" [size]="18" />
        </button>
      </div>

      <input
        type="date"
        class="pill px-4"
        [value]="dateValue()"
        aria-label="Data"
        (change)="onDate($event)"
      />

      <adm-professional-filter
        [professionals]="professionals()"
        [selected]="professionalId()"
        (selectedChange)="professionalId.set($event)"
      />
    </div>

    @if (view() === 'semana' && !professionalId()) {
      <p class="mt-3 text-sm text-muted-foreground">
        A visão semanal mostra um profissional por vez — exibindo
        <strong class="font-semibold text-foreground">{{ weekProfessionalName() }}</strong
        >. Troque no filtro acima.
      </p>
    }

    <atr-card class="mt-4 overflow-hidden p-0!">
      <!-- Cabeçalho da grade -->
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"
      >
        <h2 class="text-lg font-bold">{{ rangeLabel() }}</h2>

        <div class="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span class="inline-flex items-center gap-1.5">
            <span class="size-3 rounded-sm border border-border bg-card"></span>
            Livre
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="hatch size-3 rounded-sm border border-border bg-muted"></span>
            Bloqueado / fora do expediente
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="h-px w-4 bg-destructive"></span>
            Agora
          </span>
        </div>
      </div>

      @if (columns().length === 0) {
        <atr-empty-state
          icon="users"
          heading="Nenhum profissional ativo"
          description="Cadastre um profissional para que a agenda tenha colunas."
        />
      } @else {
        <div class="max-h-[calc(100dvh-20rem)] overflow-auto">
          <adm-agenda-grid
            [columns]="columns()"
            [appointments]="appointments()"
            [blocks]="blocks()"
            [now]="now()"
            (appointmentSelected)="openAppointment($event.id)"
            (blockSelected)="removeBlock($event)"
            (slotSelected)="openNewAppointmentAt($event)"
          />
        </div>
      }
    </atr-card>
  `,
})
export class AgendaPage {
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly overlay = inject(AtrOverlay);

  /** Parâmetro de rota vindo da Dashboard: ?agendamento=<id>. */
  readonly agendamento = input<string | undefined>(undefined);

  protected readonly view = signal<View>('dia');
  protected readonly date = signal(startOfDay(new Date()));
  protected readonly professionalId = signal<Id | null>(null);

  /**
   * Releitura periódica do relógio para a linha do "agora" andar sozinha.
   *
   * Um minuto de resolução basta: a linha se move 1,4px por minuto, e um
   * intervalo mais curto só gastaria renderização.
   */
  protected readonly now = signal<Date | null>(new Date());

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  // ─── período ──────────────────────────────────────────────────────────

  private readonly range = computed<DateRange>(() => {
    const from = this.view() === 'dia' ? this.date() : startOfWeek(this.date());
    const to = new Date(from);
    to.setDate(to.getDate() + (this.view() === 'dia' ? 1 : 7));
    return { from: from.toISOString(), to: to.toISOString() };
  });

  protected readonly appointments = toSignal(
    toObservable(this.range).pipe(
      switchMap((range) => this.appointmentsRepo.watch({ range })),
    ),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly blocks = toSignal(
    toObservable(this.range).pipe(switchMap((range) => this.blocksRepo.watch(range))),
    { initialValue: [] as readonly TimeBlock[] },
  );

  // ─── colunas ──────────────────────────────────────────────────────────

  /** Na semana sempre há um profissional: o escolhido, ou o primeiro ativo. */
  private readonly weekProfessional = computed<Professional | null>(() => {
    const chosen = this.professionals().find((p) => p.id === this.professionalId());
    return chosen ?? this.professionals()[0] ?? null;
  });

  protected readonly weekProfessionalName = computed(
    () => this.weekProfessional()?.name ?? '—',
  );

  protected readonly columns = computed<readonly GridColumn[]>(() => {
    if (this.view() === 'semana') {
      const professional = this.weekProfessional();
      if (!professional) return [];

      const start = startOfWeek(this.date());
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start);
        day.setDate(day.getDate() + index);
        return {
          key: `d-${index}`,
          label: capitalize(WEEKDAY_SHORT.format(day).replace('.', '')),
          sublabel: formatShortDate(day),
          showAvatar: false,
          professional,
          date: day,
        };
      });
    }

    const visible = this.professionalId()
      ? this.professionals().filter((p) => p.id === this.professionalId())
      : this.professionals();

    return visible.map((professional) => ({
      key: professional.id,
      label: professional.name,
      sublabel: null,
      showAvatar: true,
      professional,
      date: this.date(),
    }));
  });

  // ─── rótulos ──────────────────────────────────────────────────────────

  protected readonly dateValue = computed(() => toDateInputValue(this.date()));

  protected readonly isToday = computed(() => isSameDay(this.date(), new Date()));

  protected readonly rangeLabel = computed(() => {
    if (this.view() === 'dia') {
      // Intl devolve "sexta-feira, 16 de outubro"; só a primeira letra sobe.
      // O `capitalize` do CSS viraria "Sexta-Feira, 16 De Outubro".
      return capitalize(formatLongDate(this.date()));
    }
    const start = startOfWeek(this.date());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${formatShortDate(start)} a ${formatShortDate(end)}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    effect((onCleanup) => {
      onCleanup(() => clearInterval(timer));
    });

    // Vindo da Dashboard com ?agendamento=<id>, abre o painel direto.
    effect(() => {
      const id = this.agendamento();
      if (id) this.openAppointment(id);
    });
  }

  // ─── navegação ────────────────────────────────────────────────────────

  protected shift(direction: 1 | -1): void {
    const next = new Date(this.date());
    next.setDate(next.getDate() + direction * (this.view() === 'dia' ? 1 : 7));
    this.date.set(startOfDay(next));
  }

  protected goToday(): void {
    this.date.set(startOfDay(new Date()));
  }

  protected onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.date.set(startOfDay(new Date(`${value}T00:00:00`)));
  }

  // ─── overlays ─────────────────────────────────────────────────────────

  protected openAppointment(appointmentId: Id): void {
    this.overlay.openSheet(AppointmentPanel, { appointmentId });
  }

  protected openNewAppointment(): void {
    this.openDialogWith({
      date: this.date(),
      professionalId: this.professionalId(),
      startsAt: null,
    });
  }

  protected openNewAppointmentAt(slot: {
    professionalId: Id;
    startsAt: IsoDateTime;
  }): void {
    this.openDialogWith({
      date: new Date(slot.startsAt),
      professionalId: slot.professionalId,
      // O toque dá o horário de partida; o seletor valida se ele cabe mesmo.
      startsAt: null,
    });
  }

  private openDialogWith(data: NewAppointmentData): void {
    const ref = this.overlay.openDialog<NewAppointmentDialog, NewAppointmentData, Appointment | null>(
      NewAppointmentDialog,
      data,
    );

    ref.closed.subscribe((created) => {
      // Leva a agenda para o dia do que acabou de ser marcado: confirmar um
      // agendamento e não vê-lo na tela parece que não funcionou.
      if (created) this.date.set(startOfDay(new Date(created.startsAt)));
    });
  }

  protected openBlockDialog(): void {
    this.overlay.openDialog<BlockDialog, BlockDialogData, boolean>(BlockDialog, {
      date: this.date(),
      professionalId: this.professionalId(),
    });
  }

  protected async removeBlock(block: TimeBlock): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Remover bloqueio',
      message: block.reason
        ? `O período bloqueado por "${block.reason}" volta a aceitar agendamentos.`
        : 'O período volta a aceitar agendamentos.',
      confirmLabel: 'Remover bloqueio',
      destructive: true,
    });
    if (confirmed) await this.blocksRepo.remove(block.id);
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
