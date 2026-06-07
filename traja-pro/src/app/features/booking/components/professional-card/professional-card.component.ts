import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { star, timeOutline } from 'ionicons/icons';
import { Professional } from '../../../../shared/models/booking.model';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';

addIcons({ star, timeOutline });

@Component({
  selector: 'app-professional-card',
  template: `
    <button
      type="button"
      class="professional-card"
      [class.professional-card--selected]="selected()"
      (click)="select.emit(professional())"
    >
      <app-avatar [initials]="professional().initials" size="md" />

      <div class="professional-card__info">
        <h3 class="professional-card__name">{{ professional().name }}</h3>
        <p class="professional-card__specialty">{{ professional().specialty }}</p>
        <div class="professional-card__meta">
          <ion-icon name="time-outline" />
          <span>{{ professional().experienceYears }} anos de experiência</span>
          <span class="professional-card__dot">·</span>
          <span>~{{ professional().avgDurationMinutes }}min</span>
        </div>
      </div>

      <div class="professional-card__rating">
        <ion-icon name="star" />
        <span>{{ professional().rating }}</span>
      </div>
    </button>
  `,
  styles: `
    .professional-card {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-md);
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

    .professional-card__info {
      flex: 1;
      min-width: 0;
    }

    .professional-card__name {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .professional-card__specialty {
      margin: 2px 0 var(--spacing-xs);
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .professional-card__meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      font-size: var(--font-size-xs);
      color: var(--color-text-muted);

      ion-icon {
        font-size: 13px;
        color: var(--color-primary);
      }
    }

    .professional-card__dot {
      opacity: 0.5;
    }

    .professional-card__rating {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);

      ion-icon {
        font-size: 14px;
        color: #fbbf24;
      }
    }
  `,
  imports: [IonIcon, AvatarComponent],
})
export class ProfessionalCardComponent {
  readonly professional = input.required<Professional>();
  readonly selected = input(false);
  readonly select = output<Professional>();
}
