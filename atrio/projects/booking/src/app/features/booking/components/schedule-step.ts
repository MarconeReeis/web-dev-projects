import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  Appointment,
  IsoDateTime,
  OpenSlot,
  Professional,
  Service,
  TimeBlock,
  formatTime,
  isSameDay,
  openSlots,
  startOfDay,
} from '@atrio/data';
import { AtrIcon } from '@atrio/ui';

/** Quantos dias para frente o cliente pode marcar. */
const DAYS_AHEAD = 21;

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });
const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

interface DayOption {
  readonly date: Date;
  readonly weekday: string;
  readonly day: number;
  readonly isToday: boolean;
}

/**
 * Escolha de dia e horário.
 *
 * Os dias são uma faixa rolável horizontal, como nas referências: cabe no
 * polegar e não esconde os horários atrás de um calendário em modal. Três
 * semanas à frente dão folga sem virar uma régua infinita.
 *
 * Os horários vêm do motor de disponibilidade, já descontando a duração do
 * serviço, os intervalos e os bloqueios. Quando o cliente não escolheu
 * profissional, a lista é a união de todos os que fazem aquele serviço — é
 * por isso que uma agenda cheia de um barbeiro não esconde o horário livre
 * do outro.
 */
@Component({
  selector: 'bkg-schedule-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'block' },
  template: `
    <p class="text-sm font-semibold text-muted-foreground">{{ monthLabel() }}</p>

    <!-- Dias -->
    <div class="-mx-4 mt-2 overflow-x-auto px-4">
      <ul class="flex gap-2 pb-1" role="radiogroup" aria-label="Dia">
        @for (option of days(); track option.day) {
          <li>
            <button
              type="button"
              role="radio"
              class="flex h-20 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border transition-colors"
              [class]="
                isSelectedDay(option.date)
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:border-primary'
              "
              [attr.aria-checked]="isSelectedDay(option.date)"
              (click)="dateChange.emit(option.date)"
            >
              <span class="text-xs font-medium capitalize opacity-80">
                {{ option.weekday }}
              </span>
              <span class="tabular text-xl font-extrabold">{{ option.day }}</span>
              @if (option.isToday) {
                <span class="text-[0.625rem] font-semibold opacity-80">hoje</span>
              }
            </button>
          </li>
        }
      </ul>
    </div>

    <!-- Horários -->
    <h2 class="mt-6 font-bold">Horários livres</h2>

    @if (slots().length === 0) {
      <div
        class="mt-3 flex items-start gap-3 rounded-2xl bg-warning-soft px-4 py-3.5 text-sm text-warning-soft-foreground"
      >
        <atr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0" />
        <span>
          Nenhum horário livre nesse dia para
          <strong class="font-semibold">{{ service().name }}</strong>. Tente outra
          data.
        </span>
      </div>
    } @else {
      <ul class="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        @for (slot of slots(); track slot.startsAt) {
          <li>
            <button
              type="button"
              class="tabular h-12 w-full rounded-2xl border text-sm font-semibold transition-colors"
              [class]="
                slot.startsAt === selected()
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card hover:border-primary'
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
  readonly existing = input.required<readonly Appointment[]>();
  readonly blocks = input.required<readonly TimeBlock[]>();
  readonly date = input.required<Date>();
  readonly selected = input<IsoDateTime | null>(null);

  readonly dateChange = output<Date>();
  readonly selectedChange = output<IsoDateTime>();

  protected time = formatTime;

  protected readonly days = computed<DayOption[]>(() => {
    const today = startOfDay(new Date());

    return Array.from({ length: DAYS_AHEAD }, (_, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() + index);

      return {
        date,
        weekday: WEEKDAY.format(date).replace('.', ''),
        day: date.getDate(),
        isToday: index === 0,
      };
    });
  });

  protected readonly monthLabel = computed(() => {
    const label = MONTH.format(this.date());
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly slots = computed<readonly OpenSlot[]>(() =>
    openSlots({
      date: this.date(),
      service: this.service(),
      professionals: this.professionals(),
      existing: this.existing(),
      blocks: this.blocks(),
      // Horário que já passou não é livre, mesmo estando vago na agenda.
      now: new Date(),
    }),
  );

  protected isSelectedDay(date: Date): boolean {
    return isSameDay(date, this.date());
  }
}
