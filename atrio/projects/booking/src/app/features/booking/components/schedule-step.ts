import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  BusyAppointment,
  BusyBlock,
  IsoDateTime,
  OpenSlot,
  Professional,
  Service,
  formatTime,
  isSameDay,
  openSlots,
  startOfDay,
} from '@atrio/data';
import { AtrIcon } from '@atrio/ui';
import { MonthPicker } from './month-picker';

/**
 * Quantos dias, contando hoje, o cliente pode marcar.
 *
 * Exportado porque a página consulta agendamentos e bloqueios desta janela
 * inteira de uma vez — ver `horizon` em booking-page.
 */
export const BOOKING_HORIZON_DAYS = 21;

const WEEK = 7;

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const SHORT_DATE = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

interface DayOption {
  readonly date: Date;
  readonly label: string;
  readonly day: number;
  /** Algum candidato tem vaga. Falso para fechado, lotado ou já encerrado. */
  readonly available: boolean;
}

/**
 * Escolha de dia e horário.
 *
 * Os dias andam em semanas, com duas setas e um calendário, no lugar da faixa
 * rolável de antes. A faixa escondia os dias fora da tela e não dizia até
 * onde dava para ir; e rolar na horizontal dentro de uma página que rola na
 * vertical é o gesto que mais escapa do polegar. Sete colunas fixas cabem em
 * 375px sem rolar, e o calendário cobre o caso raro de marcar longe.
 *
 * A semana é contada a partir de hoje, não de domingo: a primeira coluna é
 * sempre o primeiro dia que se pode marcar, então nenhuma semana abre com
 * dias mortos.
 *
 * Dia sem vaga aparece esmaecido e não aceita toque. A conta é a real —
 * expediente, atendimentos, bloqueios e o horário que já passou — e não só
 * "o profissional trabalha nesse dia da semana": um sábado lotado é tão
 * inútil quanto um domingo fechado.
 */
@Component({
  selector: 'bkg-schedule-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon, MonthPicker],
  host: {
    class: 'block',
    '(document:pointerdown)': 'closeOnOutside($event)',
  },
  template: `
    <!-- Mês + navegação -->
    <div class="relative flex items-center gap-2" #anchor>
      <h2 class="min-w-0 flex-1 truncate text-xl font-extrabold tracking-tight">
        {{ monthLabel() }}
      </h2>

      <button
        type="button"
        class="floating inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-opacity disabled:opacity-40 disabled:shadow-none"
        aria-label="Semana anterior"
        [disabled]="weekIndex() === 0"
        (click)="shiftWeek(-1)"
      >
        <atr-icon name="chevron-left" [size]="20" />
      </button>
      <button
        type="button"
        class="floating inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-opacity disabled:opacity-40 disabled:shadow-none"
        aria-label="Próxima semana"
        [disabled]="weekIndex() === lastWeek"
        (click)="shiftWeek(1)"
      >
        <atr-icon name="chevron-right" [size]="20" />
      </button>
      <button
        type="button"
        class="floating inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
        [class]="pickerOpen() ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'"
        aria-label="Escolher no calendário"
        [attr.aria-expanded]="pickerOpen()"
        (click)="pickerOpen.set(!pickerOpen())"
      >
        <atr-icon name="calendar-days" [size]="20" />
      </button>

      @if (pickerOpen()) {
        <bkg-month-picker
          [selected]="date()"
          [min]="firstDay()"
          [max]="lastDay()"
          (pick)="pickFromCalendar($event)"
          (dismiss)="pickerOpen.set(false)"
        />
      }
    </div>

    <!-- Semana -->
    <ul class="mt-4 grid grid-cols-7 gap-1" role="radiogroup" aria-label="Dia">
      @for (option of week(); track option.date.getTime()) {
        <li>
          <button
            type="button"
            role="radio"
            class="flex w-full flex-col items-center gap-1.5 rounded-2xl py-1 disabled:cursor-not-allowed"
            [disabled]="!option.available"
            [attr.aria-checked]="isSelectedDay(option.date)"
            [attr.aria-label]="option.label + ', ' + option.day"
            (click)="chooseDay(option.date)"
          >
            <span class="text-xs capitalize" [class]="labelClass(option)">
              {{ option.label }}
            </span>
            <span
              class="tabular flex size-10 items-center justify-center rounded-full text-base font-bold transition-colors"
              [class]="circleClass(option)"
            >
              {{ option.day }}
            </span>
          </button>
        </li>
      }
    </ul>

    <!-- Horários -->
    <h2 class="mt-7 text-xl font-extrabold tracking-tight">Horários disponíveis</h2>

    @if (slots().length === 0) {
      <div class="surface mt-4 flex flex-col items-center px-5 py-7 text-center">
        <atr-icon name="calendar-x" [size]="30" class="text-muted-foreground" />
        <p class="mt-3 font-bold">Sem horários neste dia</p>
        <p class="mt-1 text-sm text-balance text-muted-foreground">
          {{ emptyReason() }}
        </p>

        @if (nextOpenDay(); as next) {
          <button
            type="button"
            class="mt-5 rounded-full bg-primary-soft px-5 py-3 text-sm font-semibold text-primary-soft-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
            (click)="chooseDay(next)"
          >
            Ver próxima data: {{ shortDate(next) }}
          </button>
        } @else {
          <p class="mt-4 text-sm font-semibold text-foreground">
            Nenhuma vaga nas próximas {{ horizonWeeks }} semanas.
          </p>
        }
      </div>
    } @else {
      <ul class="mt-4 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        @for (slot of slots(); track slot.startsAt) {
          <li>
            <button
              type="button"
              class="tabular h-12 w-full rounded-2xl text-base font-semibold transition-colors"
              [class]="
                slot.startsAt === selected()
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background'
                  : 'shadow-card bg-card text-foreground hover:text-primary'
              "
              [attr.aria-pressed]="slot.startsAt === selected()"
              (click)="selectedChange.emit(slot.startsAt)"
            >
              {{ time(slot.startsAt) }}
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class ScheduleStep {
  readonly service = input.required<Service>();
  /** Já filtrados: quem o cliente escolheu, ou todos os habilitados. */
  readonly professionals = input.required<readonly Professional[]>();
  /** Da janela inteira de agendamento, não só do dia — ver BOOKING_HORIZON_DAYS. */
  readonly existing = input.required<readonly BusyAppointment[]>();
  readonly blocks = input.required<readonly BusyBlock[]>();
  readonly date = input.required<Date>();
  readonly selected = input<IsoDateTime | null>(null);

  readonly dateChange = output<Date>();
  readonly selectedChange = output<IsoDateTime>();

  protected readonly time = formatTime;
  protected readonly horizonWeeks = Math.ceil(BOOKING_HORIZON_DAYS / WEEK);
  protected readonly lastWeek = this.horizonWeeks - 1;

  protected readonly pickerOpen = signal(false);
  private readonly anchor = viewChild.required<ElementRef<HTMLElement>>('anchor');

  /** Qual semana da janela está à mostra: 0 é a que começa hoje. */
  protected readonly weekIndex = signal(0);

  protected readonly firstDay = computed(() => startOfDay(new Date()));

  protected readonly lastDay = computed(() =>
    addDays(this.firstDay(), BOOKING_HORIZON_DAYS - 1),
  );

  constructor() {
    // A semana acompanha o dia escolhido quando ele vem de fora da faixa —
    // pelo calendário ou pelo "ver próxima data". Só `date` é rastreado: o
    // índice é escrito sem rastrear, então andar pelas setas não puxa a faixa
    // de volta para o dia marcado.
    effect(() => {
      const index = Math.floor(daysBetween(this.firstDay(), this.date()) / WEEK);
      untracked(() => {
        if (index >= 0 && index <= this.lastWeek) this.weekIndex.set(index);
      });
    });
  }

  protected readonly week = computed<DayOption[]>(() => {
    const today = this.firstDay();
    const start = addDays(today, this.weekIndex() * WEEK);

    return Array.from({ length: WEEK }, (_, offset) => {
      const date = addDays(start, offset);
      const inHorizon = daysBetween(today, date) < BOOKING_HORIZON_DAYS;

      return {
        date,
        label: isSameDay(date, today) ? 'Hoje' : WEEKDAY.format(date).replace('.', ''),
        day: date.getDate(),
        available: inHorizon && this.slotsFor(date).length > 0,
      };
    });
  });

  /**
   * Mês da semana à mostra. Pelo dia do meio, que é sempre o mês da maioria:
   * uma semana de 31/10 a 6/11 é de novembro, não de outubro.
   */
  protected readonly monthLabel = computed(() => {
    const label = MONTH.format(this.week()[3].date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly slots = computed<readonly OpenSlot[]>(() => this.slotsFor(this.date()));

  /**
   * Primeiro dia com vaga depois do escolhido, dentro da janela.
   *
   * Só calcula quando o dia escolhido está vazio — é o único momento em que
   * a tela mostra o atalho.
   */
  protected readonly nextOpenDay = computed<Date | null>(() => {
    if (this.slots().length > 0) return null;

    const last = this.lastDay().getTime();
    for (let day = addDays(this.date(), 1); day.getTime() <= last; day = addDays(day, 1)) {
      if (this.slotsFor(day).length > 0) return day;
    }
    return null;
  });

  protected readonly emptyReason = computed(() => {
    const candidates = this.professionals();
    const service = this.service().name;

    if (candidates.length === 1) {
      const first = candidates[0].name.split(' ')[0];
      return `${first} não tem vagas para ${service} nesta data.`;
    }
    return `Nenhum profissional tem vaga para ${service} nesta data.`;
  });

  protected isSelectedDay(date: Date): boolean {
    return isSameDay(date, this.date());
  }

  protected labelClass(option: DayOption): string {
    if (this.isSelectedDay(option.date)) return 'font-bold text-primary';
    return option.available ? 'font-medium text-muted-foreground' : 'text-muted-foreground/50';
  }

  protected circleClass(option: DayOption): string {
    if (this.isSelectedDay(option.date)) {
      return 'floating bg-primary text-primary-foreground';
    }
    return option.available
      ? 'bg-secondary text-foreground hover:bg-primary-soft hover:text-primary-soft-foreground'
      : 'bg-muted/60 text-muted-foreground/50';
  }

  protected shortDate(date: Date): string {
    return SHORT_DATE.format(date).replaceAll('.', '');
  }

  protected shiftWeek(delta: number): void {
    const next = this.weekIndex() + delta;
    if (next >= 0 && next <= this.lastWeek) this.weekIndex.set(next);
  }

  protected chooseDay(date: Date): void {
    this.dateChange.emit(date);
  }

  protected pickFromCalendar(date: Date): void {
    this.pickerOpen.set(false);
    this.chooseDay(date);
  }

  /**
   * Fecha o calendário ao tocar fora dele.
   *
   * O limite é o cabeçalho inteiro, não só o calendário: o botão que abre
   * também está ali dentro. Se o toque nele fechasse por aqui, o clique logo
   * em seguida reabriria — e o botão nunca conseguiria fechar.
   */
  protected closeOnOutside(event: PointerEvent): void {
    if (!this.pickerOpen()) return;
    if (!this.anchor().nativeElement.contains(event.target as Node)) {
      this.pickerOpen.set(false);
    }
  }

  private slotsFor(date: Date): readonly OpenSlot[] {
    return openSlots({
      date,
      service: this.service(),
      professionals: this.professionals(),
      existing: this.existing(),
      blocks: this.blocks(),
      // Horário que já passou não é livre, mesmo estando vago na agenda.
      now: new Date(),
    });
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Dias de calendário entre duas datas; arredonda por causa do horário de verão. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}
