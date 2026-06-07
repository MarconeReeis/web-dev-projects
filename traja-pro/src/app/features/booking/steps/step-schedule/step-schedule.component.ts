import { Component, computed, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { BookingFlowService } from '../../../../core/services/booking-flow.service';
import { listStaggerAnimation } from '../../animations/booking.animations';

addIcons({ chevronBackOutline, chevronForwardOutline });

@Component({
  selector: 'app-step-schedule',
  animations: [listStaggerAnimation],
  template: `
    <div class="step">
      <div class="step__heading">
        <h2 class="step__title">Escolha o horário</h2>
        <p class="step__subtitle">Apenas horários disponíveis</p>
      </div>

      <div class="schedule__month">
        <button type="button" class="schedule__nav" (click)="prevMonth()" aria-label="Mês anterior">
          <ion-icon name="chevron-back-outline" />
        </button>
        <span class="schedule__month-label">{{ monthLabel() }}</span>
        <button type="button" class="schedule__nav" (click)="nextMonth()" aria-label="Próximo mês">
          <ion-icon name="chevron-forward-outline" />
        </button>
      </div>

      <div class="schedule__dates">
        @for (date of visibleDates(); track date.key) {
          <button
            type="button"
            class="schedule__date"
            [class.schedule__date--selected]="flow.bookingDraft().date === date.key"
            (click)="flow.selectDate(date.key)"
          >
            <span class="schedule__date-weekday">{{ date.weekday }}</span>
            <span class="schedule__date-day">{{ date.day }}</span>
          </button>
        }
      </div>

      @if (flow.bookingDraft().date) {
        <p class="schedule__available">
          {{ flow.availableSlotsCount() }} horários disponíveis
        </p>

        @if (flow.isLoadingSlots()) {
          <div class="step__loading">Carregando horários...</div>
        } @else {
          <div class="schedule__times" @listStagger>
            @for (slot of flow.timeSlots(); track slot.time) {
              <button
                type="button"
                class="schedule__time"
                [class.schedule__time--selected]="flow.bookingDraft().time === slot.time"
                [class.schedule__time--unavailable]="!slot.available"
                [disabled]="!slot.available"
                (click)="flow.selectTime(slot.time)"
              >
                {{ slot.time }}
              </button>
            }
          </div>
        }
      }

      @if (!flow.bookingDraft().time) {
        <p class="schedule__hint">Selecione um horário para continuar</p>
      }
    </div>
  `,
  styles: `
    .step__heading {
      margin-bottom: var(--spacing-lg);
    }

    .step__title {
      margin: 0 0 var(--spacing-xs);
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      line-height: var(--line-height-tight);
    }

    .step__subtitle {
      margin: 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .schedule__month {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--spacing-md);
    }

    .schedule__month-label {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .schedule__nav {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      color: var(--color-text-primary);
      cursor: pointer;

      ion-icon { font-size: 16px; }
    }

    .schedule__dates {
      display: flex;
      gap: var(--spacing-sm);
      overflow-x: auto;
      padding-bottom: var(--spacing-sm);
      margin-bottom: var(--spacing-lg);
      scrollbar-width: none;

      &::-webkit-scrollbar { display: none; }
    }

    .schedule__date {
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 72px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      cursor: pointer;
      transition: all 200ms ease;

      &--selected {
        background: #ffffff;
        border-color: #ffffff;

        .schedule__date-weekday,
        .schedule__date-day {
          color: #0a0f0d;
        }
      }
    }

    .schedule__date-weekday {
      font-size: 10px;
      font-weight: var(--font-weight-medium);
      text-transform: uppercase;
      color: var(--color-text-muted);
      letter-spacing: 0.5px;
    }

    .schedule__date-day {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
    }

    .schedule__available {
      margin: 0 0 var(--spacing-md);
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .schedule__times {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--spacing-sm);
    }

    .schedule__time {
      padding: 12px 8px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      color: var(--color-text-primary);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;
      transition: all 200ms ease;

      &--selected {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-primary-contrast);
        box-shadow: 0 0 12px rgba(0, 200, 127, 0.4);
      }

      &--unavailable {
        opacity: 0.35;
        cursor: not-allowed;
        text-decoration: line-through;
      }
    }

    .schedule__hint,
    .step__loading {
      margin-top: var(--spacing-lg);
      text-align: center;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }
  `,
  imports: [IonIcon],
})
export class StepScheduleComponent {
  readonly flow = inject(BookingFlowService);

  private readonly monthOffset = signal(0);

  readonly monthLabel = computed(() => {
    const date = this.getMonthDate();
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(date);
  });

  readonly visibleDates = computed(() => {
    const dates = this.flow.availableDates();
    const offset = this.monthOffset();
    const start = offset * 7;
    const slice = dates.slice(start, start + 7);

    return slice.map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
        .format(date)
        .replace('.', '')
        .toUpperCase();
      return { key, weekday, day: String(d).padStart(2, '0') };
    });
  });

  prevMonth(): void {
    if (this.monthOffset() > 0) {
      this.monthOffset.update((v) => v - 1);
    }
  }

  nextMonth(): void {
    const maxOffset = Math.floor(this.flow.availableDates().length / 7) - 1;
    if (this.monthOffset() < maxOffset) {
      this.monthOffset.update((v) => v + 1);
    }
  }

  private getMonthDate(): Date {
    const dates = this.flow.availableDates();
    const idx = this.monthOffset() * 7;
    const key = dates[idx] ?? dates[0];
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
}
