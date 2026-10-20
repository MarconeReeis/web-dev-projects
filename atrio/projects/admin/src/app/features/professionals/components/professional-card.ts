import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  DaySchedule,
  Professional,
  Service,
  TimeBlock,
  WEEKDAY_LABEL,
  Weekday,
  formatTime,
  shopFormat,
  formatPhone,
} from '@atrio/data';
import { AtrAvatar, AtrBadge, AtrButton, AtrIcon } from '@atrio/ui';
import { daysLabel } from '../../../shared/week-summary';

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

/** Iniciais dos dias, na ordem do calendário brasileiro. */
const WEEKDAY_INITIAL: Readonly<Record<Weekday, string>> = {
  0: 'D',
  1: 'S',
  2: 'T',
  3: 'Q',
  4: 'Q',
  5: 'S',
  6: 'S',
};

interface ScheduleGroup {
  /** "Seg–Qui", "Sex", "Seg, Qua, Sex". */
  readonly label: string;
  readonly shift: string;
  readonly breakTime: string;
}

interface ScheduleSummary {
  /** Todos os dias de trabalho compartilham o mesmo horário. */
  readonly uniform: boolean;
  readonly groups: readonly ScheduleGroup[];
}

/**
 * Cartão do profissional.
 *
 * Mostra, de cima para baixo, o que se pergunta sobre alguém da equipe: quem
 * é, se está ativo, em que dias trabalha, em que horário, o que faz, o que
 * está bloqueado e quanto já tem marcado.
 *
 * Profissional inativo fica esmaecido mas continua visível — o histórico de
 * atendimentos aponta para ele, e escondê-lo faria o dono achar que sumiu.
 */
@Component({
  selector: 'adm-professional-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrAvatar, AtrBadge, AtrButton, AtrIcon],
  host: { class: 'block' },
  template: `
    <article
      class="surface flex h-full flex-col gap-4 p-5"
      [class.opacity-60]="!professional().active"
    >
      <!-- Identificação -->
      <header class="flex items-start gap-3">
        <atr-avatar
          [name]="professional().name"
          [photoUrl]="professional().photoUrl"
          size="lg"
        />
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-lg font-bold">{{ professional().name }}</h3>
          @if (professional().phone; as phone) {
            <a class="tabular text-sm text-muted-foreground hover:text-primary" [href]="'tel:' + phone">
              {{ formatPhone(phone) }}
            </a>
          } @else {
            <p class="text-sm text-muted-foreground">Sem telefone</p>
          }
        </div>
        <atr-badge [tone]="professional().active ? 'success' : 'neutral'">
          {{ professional().active ? 'Ativo' : 'Inativo' }}
        </atr-badge>
      </header>

      <!-- Dias de trabalho -->
      <ul class="flex flex-wrap gap-1.5">
        @for (day of weekdays; track day) {
          <li
            class="flex size-9 items-center justify-center rounded-full text-sm font-semibold"
            [class]="
              worksOn(day)
                ? 'bg-primary-soft text-primary-soft-foreground'
                : 'bg-muted text-muted-foreground line-through'
            "
            [attr.title]="dayTitle(day)"
            [attr.aria-label]="dayTitle(day)"
          >
            <span aria-hidden="true">{{ initial(day) }}</span>
          </li>
        }
      </ul>

      <!-- Expediente -->
      @if (schedule().uniform) {
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-xl bg-muted px-4 py-3">
            <p class="text-xs text-muted-foreground">Expediente</p>
            <p class="tabular mt-0.5 font-bold">{{ schedule().groups[0].shift }}</p>
          </div>
          <div class="rounded-xl bg-muted px-4 py-3">
            <p class="text-xs text-muted-foreground">Intervalo</p>
            <p class="tabular mt-0.5 font-bold">{{ schedule().groups[0].breakTime }}</p>
          </div>
        </div>
      } @else {
        <div class="rounded-xl bg-muted px-4 py-3">
          <p class="text-xs text-muted-foreground">Expediente</p>
          <ul class="mt-1.5 flex flex-col gap-1.5">
            @for (group of schedule().groups; track group.label) {
              <li class="flex items-baseline justify-between gap-3 text-sm">
                <span class="shrink-0 font-bold">{{ group.label }}</span>
                <span class="tabular min-w-0 truncate text-right">
                  {{ group.shift }}
                  @if (group.breakTime !== '—') {
                    <span class="text-muted-foreground">· int. {{ group.breakTime }}</span>
                  }
                </span>
              </li>
            }
          </ul>
        </div>
      }

      <!-- Serviços realizados -->
      @if (serviceNames().length > 0) {
        <ul class="flex flex-wrap gap-2">
          @for (name of serviceNames(); track name) {
            <li
              class="inline-flex h-8 items-center rounded-full border border-border px-3 text-sm font-medium"
            >
              {{ name }}
            </li>
          }
        </ul>
      } @else {
        <p class="text-sm text-muted-foreground">
          Nenhum serviço associado — este profissional não aparece no agendamento.
        </p>
      }

      <!-- Bloqueios -->
      @if (blocks().length > 0) {
        <ul class="flex flex-col gap-2">
          @for (block of blocks(); track block.id) {
            <li
              class="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground"
            >
              <atr-icon name="lock" [size]="14" class="shrink-0" />
              <span class="tabular min-w-0 flex-1 truncate">
                {{ blockLabel(block) }}
              </span>
              <button
                type="button"
                class="inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-destructive-soft hover:text-destructive"
                [attr.aria-label]="'Remover bloqueio de ' + blockLabel(block)"
                (click)="blockRemoved.emit(block)"
              >
                <atr-icon name="trash-2" [size]="16" />
              </button>
            </li>
          }
        </ul>
      }

      <p class="text-sm text-muted-foreground">{{ futureLabel() }}</p>

      <!-- Ações -->
      <footer class="mt-auto grid grid-cols-2 gap-3 pt-1">
        <button type="button" atrButton="outline" (click)="edited.emit()">
          <atr-icon name="pencil" [size]="16" />
          Editar
        </button>
        <button
          type="button"
          atrButton="soft"
          [disabled]="!professional().active"
          (click)="blocked.emit()"
        >
          <atr-icon name="lock" [size]="16" />
          Bloqueio
        </button>
      </footer>
    </article>
  `,
})
export class ProfessionalCard {
  protected readonly formatPhone = formatPhone;
  readonly professional = input.required<Professional>();
  readonly services = input.required<readonly Service[]>();
  readonly blocks = input.required<readonly TimeBlock[]>();
  readonly futureAppointments = input.required<number>();

  readonly edited = output<void>();
  readonly blocked = output<void>();
  readonly blockRemoved = output<TimeBlock>();

  protected readonly weekdays = WEEKDAYS;

  protected initial = (day: Weekday) => WEEKDAY_INITIAL[day];

  /** A inicial sozinha é ambígua (dois S, dois Q); o rótulo resolve. */
  protected dayTitle(day: Weekday): string {
    return `${WEEKDAY_LABEL[day]} — ${this.worksOn(day) ? 'trabalha' : 'folga'}`;
  }

  protected worksOn(day: Weekday): boolean {
    return this.professional().schedule[day].working;
  }

  protected readonly serviceNames = computed(() => {
    const ids = this.professional().serviceIds;
    return this.services()
      .filter((service) => ids.includes(service.id))
      .map((service) => service.name);
  });

  protected readonly futureLabel = computed(() => {
    const count = this.futureAppointments();
    if (count === 0) return 'Nenhum agendamento futuro';
    return `${count} agendamento${count === 1 ? '' : 's'} futuro${count === 1 ? '' : 's'}`;
  });

  /**
   * Resumo do expediente, agrupado por horário.
   *
   * A referência mostrava uma faixa só, o que funciona quando a jornada é
   * igual todo dia. Barbearia raramente é: sexta fecha mais tarde e sábado
   * abre mais cedo. Exibir o horário de um dia como se valesse para todos
   * seria mentira, e um "Varia" genérico não informa nada.
   *
   * Então: dois blocos quando o horário é único (igual à referência), e uma
   * lista agrupada — "Seg–Qui 09:00 – 20:00" — quando não é.
   */
  protected readonly schedule = computed<ScheduleSummary>(() => {
    const working = WEEKDAYS.filter((day) => this.professional().schedule[day].working);

    if (working.length === 0) {
      return { uniform: true, groups: [{ label: '—', shift: '—', breakTime: '—' }] };
    }

    // Agrupa preservando a ordem da semana, para "Seg–Qui" sair contíguo.
    const groups: { days: Weekday[]; shift: string; breakTime: string }[] = [];

    for (const day of working) {
      const schedule = this.professional().schedule[day];
      const shift = shiftOf(schedule);
      const breakTime = breakOf(schedule);
      const existing = groups.find((g) => g.shift === shift && g.breakTime === breakTime);

      if (existing) existing.days.push(day);
      else groups.push({ days: [day], shift, breakTime });
    }

    return {
      uniform: groups.length === 1,
      groups: groups.map((group) => ({
        label: daysLabel(group.days),
        shift: group.shift,
        breakTime: group.breakTime,
      })),
    };
  });

  protected blockLabel(block: TimeBlock): string {
    const date = shopFormat({ day: 'numeric', month: 'short' }).format(new Date(block.startsAt));
    const range = `${formatTime(block.startsAt)}–${formatTime(block.endsAt)}`;
    return block.reason ? `${date} · ${range} · ${block.reason}` : `${date} · ${range}`;
  }
}

function shiftOf(day: DaySchedule): string {
  if (day.windows.length === 0) return '—';
  const first = day.windows[0];
  const last = day.windows[day.windows.length - 1];
  return `${first.start} – ${last.end}`;
}

function breakOf(day: DaySchedule): string {
  if (day.breaks.length === 0) return '—';
  return day.breaks.map((item) => `${item.start} – ${item.end}`).join(', ');
}

