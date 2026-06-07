import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { timeOutline } from 'ionicons/icons';
import { Service } from '../../../../shared/models/booking.model';

addIcons({ timeOutline });

@Component({
  selector: 'app-service-card',
  template: `
    <button
      type="button"
      class="service-card"
      [class.service-card--selected]="selected()"
      (click)="select.emit(service())"
    >
      <div class="service-card__header">
        <h3 class="service-card__name">{{ service().name }}</h3>
        <span class="service-card__price">R$ {{ service().price }}</span>
      </div>
      <p class="service-card__description">{{ service().description }}</p>
      <div class="service-card__duration">
        <ion-icon name="time-outline" />
        <span>{{ service().durationMinutes }} min</span>
      </div>
    </button>
  `,
  styles: `
    .service-card {
      display: block;
      width: 100%;
      padding: var(--spacing-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-neon-card);
      backdrop-filter: blur(8px);
      text-align: left;
      cursor: pointer;
      transition: border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease;

      &:active {
        transform: scale(0.98);
      }

      &--selected {
        border-color: var(--color-primary);
        box-shadow: var(--shadow-neon-card), 0 0 16px rgba(0, 200, 127, 0.2);
      }
    }

    .service-card__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-xs);
    }

    .service-card__name {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .service-card__price {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      white-space: nowrap;
    }

    .service-card__description {
      margin: 0 0 var(--spacing-sm);
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      line-height: var(--line-height-normal);
    }

    .service-card__duration {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);

      ion-icon {
        font-size: 13px;
        color: var(--color-primary);
      }
    }
  `,
  imports: [IonIcon],
})
export class ServiceCardComponent {
  readonly service = input.required<Service>();
  readonly selected = input(false);
  readonly select = output<Service>();
}
