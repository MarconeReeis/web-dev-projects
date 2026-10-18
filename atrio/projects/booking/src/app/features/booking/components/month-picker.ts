import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { isSameDay, startOfDay } from '@atrio/data';
import { AtrIcon } from '@atrio/ui';

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

/** Iniciais fixas: Intl devolve "dom.", "seg." e a lista fica com ruído. */
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

interface Cell {
  readonly date: Date;
  readonly day: number;
  /** Fora do mês mostrado: aparece esmaecido, só para fechar a semana. */
  readonly outside: boolean;
  readonly selectable: boolean;
  readonly today: boolean;
}

/**
 * Calendário do mês, para quando a faixa de dias não alcança.
 *
 * Complementa a faixa, não a substitui: marcar para a semana que vem é a
 * ação comum e continua a um toque; marcar para daqui a um mês é rara e
 * ganha o calendário.
 *
 * O que fica fora da janela de agendamento é desabilitado — inclusive o
 * passado, que o calendário mostraria de qualquer jeito por completar a
 * primeira semana. Disponibilidade real (dia sem vaga) NÃO é tratada aqui:
 * calcular a agenda de um mês inteiro para pintar o calendário custaria uma
 * consulta por dia, e o dia escolhido sem vaga já cai no estado vazio da
 * tela, que oferece a próxima data livre.
 */
@Component({
  selector: 'bkg-month-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: {
    class:
      'floating absolute right-0 top-full z-30 mt-2 w-[19rem] rounded-surface border border-border bg-card p-3',
    role: 'dialog',
    'aria-label': 'Escolher data',
    '(document:keydown.escape)': 'dismiss.emit()',
  },
  template: `
    <div class="flex items-center justify-between">
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-30"
        aria-label="Mês anterior"
        [disabled]="!canGoBack()"
        (click)="shiftMonth(-1)"
      >
        <atr-icon name="chevron-left" [size]="18" />
      </button>
      <span class="font-bold">{{ monthLabel() }}</span>
      <button
        type="button"
        class="inline-flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent disabled:opacity-30"
        aria-label="Próximo mês"
        [disabled]="!canGoForward()"
        (click)="shiftMonth(1)"
      >
        <atr-icon name="chevron-right" [size]="18" />
      </button>
    </div>

    <div class="mt-2 grid grid-cols-7 gap-y-1 text-center">
      @for (label of weekdays; track label) {
        <span class="py-1 text-xs font-semibold text-muted-foreground">{{ label }}</span>
      }

      @for (cell of cells(); track cell.date.getTime()) {
        <button
          type="button"
          class="tabular mx-auto flex size-9 items-center justify-center rounded-full text-sm transition-colors"
          [class]="cellClass(cell)"
          [disabled]="!cell.selectable"
          [attr.aria-current]="cell.today ? 'date' : null"
          (click)="pick.emit(cell.date)"
        >
          {{ cell.day }}
        </button>
      }
    </div>
  `,
})
export class MonthPicker {
  /** Dia marcado hoje na tela. */
  readonly selected = input.required<Date>();
  /** Limites da janela de agendamento, inclusivos. */
  readonly min = input.required<Date>();
  readonly max = input.required<Date>();

  readonly pick = output<Date>();
  readonly dismiss = output<void>();

  protected readonly weekdays = WEEKDAYS;

  /** Mês visível. Começa no do dia marcado e anda com as setas. */
  private readonly cursor = signal<Date | null>(null);

  private readonly month = computed(() => {
    const base = this.cursor() ?? this.selected();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  protected readonly monthLabel = computed(() => {
    const label = MONTH.format(this.month());
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly canGoBack = computed(
    () => this.month().getTime() > firstOfMonth(this.min()).getTime(),
  );

  protected readonly canGoForward = computed(
    () => this.month().getTime() < firstOfMonth(this.max()).getTime(),
  );

  protected readonly cells = computed<Cell[]>(() => {
    const month = this.month();
    const today = startOfDay(new Date());
    const min = startOfDay(this.min()).getTime();
    const max = startOfDay(this.max()).getTime();

    // Recua até o domingo que abre a primeira semana e avança em semanas
    // inteiras: a grade só fecha quando o mês acabou E a linha terminou.
    const first = new Date(month);
    first.setDate(1 - first.getDay());

    const cells: Cell[] = [];
    const cursor = new Date(first);

    do {
      for (let i = 0; i < 7; i++) {
        const date = new Date(cursor);
        const time = date.getTime();
        cells.push({
          date,
          day: date.getDate(),
          outside: date.getMonth() !== month.getMonth(),
          selectable: time >= min && time <= max,
          today: isSameDay(date, today),
        });
        cursor.setDate(cursor.getDate() + 1);
      }
    } while (cursor.getMonth() === month.getMonth());

    return cells;
  });

  protected shiftMonth(delta: number): void {
    const next = new Date(this.month());
    next.setMonth(next.getMonth() + delta);
    this.cursor.set(next);
  }

  protected cellClass(cell: Cell): string {
    if (isSameDay(cell.date, this.selected())) {
      return 'bg-primary font-bold text-primary-foreground';
    }
    if (!cell.selectable) return 'text-muted-foreground/50';
    if (cell.today) return 'bg-primary-soft font-bold text-primary-soft-foreground';
    return cell.outside
      ? 'text-muted-foreground hover:bg-accent'
      : 'font-semibold text-foreground hover:bg-accent';
  }
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
