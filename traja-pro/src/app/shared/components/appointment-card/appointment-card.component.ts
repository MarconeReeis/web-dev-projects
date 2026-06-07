import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { refreshOutline, closeOutline } from 'ionicons/icons';
import { Appointment } from '../../models';
import { AvatarComponent } from '../avatar/avatar.component';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';

addIcons({ refreshOutline, closeOutline });

@Component({
  selector: 'app-appointment-card',
  template: `
    <article class="appointment-card">
      <div class="appointment-card__header">
        <app-avatar [initials]="appointment().professionalInitials" size="md" />

        <div class="appointment-card__info">
          <h3 class="appointment-card__service">{{ appointment().serviceName }}</h3>
          <p class="appointment-card__professional">com {{ appointment().professionalName }}</p>
          <p class="appointment-card__datetime">{{ appointment().dateLabel }}</p>
        </div>

        <app-status-badge [status]="appointment().status" />
      </div>

      <div class="appointment-card__actions">
        <button type="button" class="appointment-card__btn" (click)="reschedule.emit(appointment().id)">
          <ion-icon name="refresh-outline" />
          Reagendar
        </button>
        <button
          type="button"
          class="appointment-card__btn appointment-card__btn--danger"
          (click)="cancel.emit(appointment().id)"
        >
          <ion-icon name="close-outline" />
          Cancelar
        </button>
      </div>
    </article>
  `,
  styles: `
    .appointment-card {
      background: var(--color-surface);
      border-radius: var(--radius-lg);
      padding: var(--spacing-md);
      box-shadow: var(--shadow-neon-card);
      backdrop-filter: blur(8px);
    }

    .appointment-card__header {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-md);
    }

    .appointment-card__info {
      flex: 1;
      min-width: 0;
    }

    .appointment-card__service {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .appointment-card__professional {
      margin: 2px 0 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-secondary);
    }

    .appointment-card__datetime {
      margin: 6px 0 0;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .appointment-card__actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .appointment-card__btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--color-text-primary);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      cursor: pointer;

      ion-icon {
        font-size: 16px;
      }
    }

    .appointment-card__btn--danger {
      color: var(--color-danger);
    }
  `,
  imports: [IonIcon, AvatarComponent, StatusBadgeComponent],
})
export class AppointmentCardComponent {
  readonly appointment = input.required<Appointment>();
  readonly reschedule = output<string>();
  readonly cancel = output<string>();
}
