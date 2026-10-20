import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  Appointment,
  AppointmentStatus,
  Id,
  IsoDateTime,
  Professional,
  TimeBlock,
  Weekday,
  clockToMinutes,
  expandWindows,
  formatTime,
  isSameDay,
  shopDay,
  shopInstant,
  shopMinutes,
} from '@atrio/data';
import { AtrAvatar } from '@atrio/ui';
import { AtrIcon } from '@atrio/ui';

/** Altura de um minuto, em pixels. 60 min = 84px. */
const PX_PER_MINUTE = 1.4;

/** Granularidade do toque em área livre. */
const SNAP_MINUTES = 15;

/** Um atendimento de 20 min ainda precisa caber duas linhas de texto. */
const MIN_BLOCK_MINUTES = 20;

/**
 * Uma coluna da grade.
 *
 * A abstração existe para a grade servir às duas visões sem duplicação:
 *
 *   Dia     uma coluna por profissional, todas na mesma data;
 *   Semana  uma coluna por dia, todas do mesmo profissional.
 *
 * Cada coluna carrega o seu par (profissional, data) porque o expediente
 * muda com o dia da semana — sábado abre mais cedo e fecha mais cedo.
 */
export interface GridColumn {
  readonly key: string;
  readonly label: string;
  /** Linha secundária do cabeçalho, como a data na visão semanal. */
  readonly sublabel: string | null;
  /** Mostra avatar quando a coluna representa uma pessoa. */
  readonly showAvatar: boolean;
  readonly professional: Professional;
  readonly date: Date;
}

/**
 * Aparência do atendimento na grade.
 *
 * Deliberadamente diferente do protótipo, que pintava TODO atendimento
 * concluído de verde. Ao fim do dia a grade inteira ficava verde e a cor
 * deixava de informar — além de gastar o verde, que o DESIGN.md reserva para
 * "pago".
 *
 * Aqui a intensidade segue a necessidade de atenção:
 *   em atendimento  roxo, o que está acontecendo agora
 *   agendado        branco com borda, o que ainda vai acontecer
 *   concluído       cinza discreto, já resolvido
 *   cancelado       vermelho suave, riscado
 *   não compareceu  laranja suave
 */
const BLOCK_STYLE: Readonly<Record<AppointmentStatus, string>> = {
  agendado: 'border-border bg-card hover:border-primary',
  em_atendimento: 'border-primary bg-primary-soft ring-1 ring-primary',
  concluido: 'border-border bg-secondary',
  cancelado: 'border-destructive-soft bg-destructive-soft line-through',
  nao_compareceu: 'border-warning-soft bg-warning-soft',
};

const TEXT_STYLE: Readonly<Record<AppointmentStatus, string>> = {
  agendado: 'text-foreground',
  em_atendimento: 'text-primary-soft-foreground',
  concluido: 'text-muted-foreground',
  cancelado: 'text-destructive-soft-foreground',
  nao_compareceu: 'text-warning-soft-foreground',
};

const STATUS_LABEL: Readonly<Record<AppointmentStatus, string>> = {
  agendado: 'Agendado',
  em_atendimento: 'Em atendimento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
};

interface Band {
  readonly top: number;
  readonly height: number;
}

interface PlacedAppointment extends Band {
  readonly appointment: Appointment;
}

interface PlacedBlock extends Band {
  readonly block: TimeBlock;
}

interface RenderedColumn {
  readonly column: GridColumn;
  readonly closed: readonly Band[];
  readonly blocks: readonly PlacedBlock[];
  readonly appointments: readonly PlacedAppointment[];
  readonly nowOffset: number | null;
}

/**
 * Grade de horários: horas em linhas, colunas conforme a visão.
 *
 * Posicionamento absoluto em pixels, e não linhas de CSS grid, porque
 * atendimento de 20, 45 e 75 minutos não cai em grade regular — e forçar uma
 * grade de 15 min criaria 50 linhas por dia só para posicionar.
 */
@Component({
  selector: 'adm-agenda-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrAvatar, AtrIcon],
  host: { class: 'block' },
  template: `
    <div class="min-w-max">
      <!-- Cabeçalho de colunas -->
      <div class="sticky top-0 z-20 flex border-b border-border bg-card">
        <div class="w-16 shrink-0"></div>
        @for (rendered of rows(); track rendered.column.key) {
          <div
            class="flex min-w-[190px] flex-1 items-center gap-2.5 border-l border-border px-4 py-3"
          >
            @if (rendered.column.showAvatar) {
              <atr-avatar [name]="rendered.column.professional.name" size="sm" />
            }
            <span class="min-w-0">
              <span class="block truncate text-sm font-bold">
                {{ rendered.column.label }}
              </span>
              @if (rendered.column.sublabel; as sub) {
                <span class="block truncate text-xs text-muted-foreground">{{ sub }}</span>
              }
            </span>
          </div>
        }
      </div>

      <!-- Corpo. O respiro no topo evita que o rótulo da primeira hora,
           centrado na linha, seja cortado pelo cabeçalho fixo. -->
      <div class="flex pt-3 pb-6">
        <!-- Régua de horas -->
        <div class="relative w-16 shrink-0" [style.height.px]="height()">
          @for (mark of hourMarks(); track mark.top) {
            <span
              class="tabular absolute right-2 -translate-y-1/2 text-xs text-muted-foreground"
              [style.top.px]="mark.top"
            >
              {{ mark.label }}
            </span>
          }
        </div>

        @for (rendered of rows(); track rendered.column.key) {
          <div
            class="relative min-w-[190px] flex-1 border-l border-border"
            [style.height.px]="height()"
            [style.background-image]="HOUR_LINES"
            [style.background-size]="'100% ' + hourHeight + 'px'"
            (click)="onBackgroundClick($event, rendered.column)"
          >
            <!-- Fora do expediente e intervalos -->
            @for (band of rendered.closed; track band.top) {
              <div
                class="hatch pointer-events-none absolute inset-x-0 bg-muted/50"
                [style.top.px]="band.top"
                [style.height.px]="band.height"
              ></div>
            }

            <!-- Bloqueios -->
            @for (item of rendered.blocks; track item.block.id) {
              <button
                type="button"
                class="hatch absolute inset-x-1 flex items-start gap-1.5 overflow-hidden rounded-xl border border-border bg-muted px-2.5 py-1.5 text-left text-xs font-semibold text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
                [style.top.px]="item.top"
                [style.height.px]="item.height"
                [attr.aria-label]="'Bloqueio: ' + (item.block.reason ?? 'sem motivo')"
                (click)="onBlockClick($event, item.block)"
              >
                <atr-icon name="lock" [size]="14" class="mt-px shrink-0" />
                <span class="truncate">{{ item.block.reason ?? 'Bloqueado' }}</span>
              </button>
            }

            <!-- Atendimentos -->
            @for (item of rendered.appointments; track item.appointment.id) {
              <button
                type="button"
                class="absolute inset-x-1 overflow-hidden rounded-xl border px-2.5 py-1.5 text-left transition-colors"
                [class]="blockClass(item.appointment.status)"
                [style.top.px]="item.top"
                [style.height.px]="item.height"
                (click)="onAppointmentClick($event, item.appointment)"
              >
                <span
                  class="flex items-center gap-1.5 text-xs font-bold"
                  [class]="textClass(item.appointment.status)"
                >
                  <span class="tabular">{{ time(item.appointment.startsAt) }}</span>
                  <span class="truncate">· {{ item.appointment.client.name }}</span>
                  @if (needsPayment(item.appointment)) {
                    <!-- Dinheiro parado que o balcão esquece de cobrar precisa
                         saltar na agenda. -->
                    <atr-icon
                      name="clock"
                      [size]="13"
                      class="ml-auto shrink-0 text-warning"
                      label="Pagamento pendente"
                    />
                  }
                </span>
                <span
                  class="mt-0.5 block truncate text-xs"
                  [class]="textClass(item.appointment.status)"
                >
                  {{ item.appointment.serviceName }} ·
                  {{ statusLabel(item.appointment.status) }}
                </span>
              </button>
            }

            <!-- Linha do agora -->
            @if (rendered.nowOffset !== null) {
              <div
                class="pointer-events-none absolute inset-x-0 z-10 border-t border-destructive"
                [style.top.px]="rendered.nowOffset"
              >
                <span class="absolute -top-1 -left-1 size-2 rounded-full bg-destructive"></span>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class AgendaGrid {
  readonly columns = input.required<readonly GridColumn[]>();
  readonly appointments = input.required<readonly Appointment[]>();
  readonly blocks = input.required<readonly TimeBlock[]>();
  /** Nulo quando nenhuma coluna é hoje: não existe "agora" em outro dia. */
  readonly now = input<Date | null>(null);

  readonly appointmentSelected = output<Appointment>();
  readonly blockSelected = output<TimeBlock>();
  readonly slotSelected = output<{ professionalId: Id; startsAt: IsoDateTime }>();

  protected time = formatTime;
  protected readonly hourHeight = 60 * PX_PER_MINUTE;
  protected readonly HOUR_LINES =
    'linear-gradient(to bottom, var(--border) 0 1px, transparent 1px)';

  protected blockClass = (status: AppointmentStatus) => BLOCK_STYLE[status];
  protected textClass = (status: AppointmentStatus) => TEXT_STYLE[status];
  protected statusLabel = (status: AppointmentStatus) => STATUS_LABEL[status];

  protected needsPayment(appointment: Appointment): boolean {
    return (
      appointment.status === 'concluido' && appointment.payment.status === 'pendente'
    );
  }

  /**
   * Janela visível, comum a todas as colunas.
   *
   * Calculada a partir do expediente E do que já está marcado: um atendimento
   * encaixado fora do horário — acontece — não pode ficar invisível.
   */
  private readonly window = computed(() => {
    const minutes: number[] = [];

    for (const column of this.columns()) {
      const weekday = column.date.getDay() as Weekday;
      for (const w of expandWindows(column.professional.schedule[weekday])) {
        minutes.push(clockToMinutes(w.start), clockToMinutes(w.end));
      }
      for (const item of this.itemsOf(column)) {
        minutes.push(
          minutesOf(item.startsAt, column.date),
          minutesOf(item.endsAt, column.date),
        );
      }
    }

    if (minutes.length === 0) return { start: 8 * 60, end: 20 * 60 };

    // Arredonda para a hora cheia dos dois lados: a régua fica legível.
    const start = Math.max(0, Math.floor(Math.min(...minutes) / 60) * 60);
    const end = Math.min(24 * 60, Math.ceil(Math.max(...minutes) / 60) * 60);
    return { start, end: Math.max(end, start + 60) };
  });

  protected readonly height = computed(() => {
    const { start, end } = this.window();
    return (end - start) * PX_PER_MINUTE;
  });

  protected readonly hourMarks = computed(() => {
    const { start, end } = this.window();
    const marks: { top: number; label: string }[] = [];
    for (let minute = start; minute <= end; minute += 60) {
      marks.push({
        top: (minute - start) * PX_PER_MINUTE,
        label: `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:00`,
      });
    }
    return marks;
  });

  protected readonly rows = computed<readonly RenderedColumn[]>(() => {
    const { start, end } = this.window();
    const now = this.now();

    return this.columns().map((column) => {
      const weekday = column.date.getDay() as Weekday;
      const open = expandWindows(column.professional.schedule[weekday]).map((w) => ({
        start: clockToMinutes(w.start),
        end: clockToMinutes(w.end),
      }));

      const nowMinute =
        now && isSameDay(shopDay(now), column.date) ? shopMinutes(now) : null;

      return {
        column,
        closed: closedBands(open, start, end),

        blocks: this.blocks()
          .filter(
            (b) =>
              (b.professionalId === null || b.professionalId === column.professional.id) &&
              isSameDay(shopDay(b.startsAt), column.date),
          )
          .map((block) => ({
            block,
            ...place(block.startsAt, block.endsAt, column.date, start),
          })),

        appointments: this.appointments()
          .filter(
            (a) =>
              a.professionalId === column.professional.id &&
              isSameDay(shopDay(a.startsAt), column.date),
          )
          .map((appointment) => ({
            appointment,
            ...place(appointment.startsAt, appointment.endsAt, column.date, start),
          })),

        nowOffset:
          nowMinute !== null && nowMinute >= start && nowMinute <= end
            ? (nowMinute - start) * PX_PER_MINUTE
            : null,
      };
    });
  });

  // ─── interação ────────────────────────────────────────────────────────

  protected onAppointmentClick(event: Event, appointment: Appointment): void {
    event.stopPropagation();
    this.appointmentSelected.emit(appointment);
  }

  protected onBlockClick(event: Event, block: TimeBlock): void {
    event.stopPropagation();
    this.blockSelected.emit(block);
  }

  /** Toque em área livre abre o agendamento já no horário tocado. */
  protected onBackgroundClick(event: MouseEvent, column: GridColumn): void {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetMinutes = (event.clientY - bounds.top) / PX_PER_MINUTE;
    const snapped =
      Math.round((this.window().start + offsetMinutes) / SNAP_MINUTES) * SNAP_MINUTES;

    const startsAt = shopInstant(column.date, snapped);

    this.slotSelected.emit({
      professionalId: column.professional.id,
      startsAt: startsAt.toISOString(),
    });
  }

  private itemsOf(column: GridColumn): { startsAt: string; endsAt: string }[] {
    return [
      ...this.appointments().filter(
        (a) =>
          a.professionalId === column.professional.id &&
          isSameDay(shopDay(a.startsAt), column.date),
      ),
      ...this.blocks().filter(
        (b) =>
          (b.professionalId === null || b.professionalId === column.professional.id) &&
          isSameDay(shopDay(b.startsAt), column.date),
      ),
    ];
  }
}

// ─── funções de posicionamento ──────────────────────────────────────────

/**
 * Minutos desde a meia-noite da coluna, no relógio da barbearia, preso aos
 * limites do dia.
 */
function minutesOf(instant: string, columnDate: Date): number {
  const day = shopDay(instant);
  if (!isSameDay(day, columnDate)) {
    return day < columnDate ? 0 : 24 * 60;
  }
  return shopMinutes(instant);
}

function place(
  startsAt: string,
  endsAt: string,
  columnDate: Date,
  windowStart: number,
): Band {
  const from = minutesOf(startsAt, columnDate);
  const to = minutesOf(endsAt, columnDate);

  return {
    top: (from - windowStart) * PX_PER_MINUTE,
    height: Math.max(to - from, MIN_BLOCK_MINUTES) * PX_PER_MINUTE,
  };
}

/** O complemento do expediente dentro da janela visível. */
function closedBands(
  open: readonly { start: number; end: number }[],
  windowStart: number,
  windowEnd: number,
): Band[] {
  const sorted = [...open].sort((a, b) => a.start - b.start);
  const bands: Band[] = [];
  let cursor = windowStart;

  for (const slot of sorted) {
    if (slot.start > cursor) {
      bands.push(toBand(cursor, Math.min(slot.start, windowEnd), windowStart));
    }
    cursor = Math.max(cursor, slot.end);
  }
  if (cursor < windowEnd) {
    bands.push(toBand(cursor, windowEnd, windowStart));
  }

  return bands.filter((band) => band.height > 0);
}

function toBand(from: number, to: number, windowStart: number): Band {
  return {
    top: (from - windowStart) * PX_PER_MINUTE,
    height: (to - from) * PX_PER_MINUTE,
  };
}
