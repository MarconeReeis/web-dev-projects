import { Component, input } from '@angular/core';

@Component({
  selector: 'app-booking-progress',
  template: `
    <div class="booking-progress" role="progressbar" [attr.aria-valuenow]="currentStep()" [attr.aria-valuemin]="1" [attr.aria-valuemax]="totalSteps()">
      @for (step of steps; track step) {
        <div
          class="booking-progress__segment"
          [class.booking-progress__segment--active]="step <= currentStep()"
        ></div>
      }
    </div>
  `,
  styles: `
    .booking-progress {
      display: flex;
      gap: 6px;
      margin-bottom: var(--spacing-lg);
    }

    .booking-progress__segment {
      flex: 1;
      height: 4px;
      border-radius: var(--radius-full);
      background: rgba(255, 255, 255, 0.12);
      transition: background 300ms ease, box-shadow 300ms ease;

      &--active {
        background: var(--color-primary);
        box-shadow: 0 0 8px rgba(0, 200, 127, 0.5);
      }
    }
  `,
})
export class BookingProgressComponent {
  readonly currentStep = input.required<number>();
  readonly totalSteps = input(4);

  get steps(): number[] {
    return Array.from({ length: this.totalSteps() }, (_, i) => i + 1);
  }
}
