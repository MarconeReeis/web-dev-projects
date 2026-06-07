import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, sunnyOutline, moonOutline } from 'ionicons/icons';

addIcons({ arrowBackOutline, sunnyOutline, moonOutline });

@Component({
  selector: 'app-booking-header',
  template: `
    <header class="booking-header">
      <button type="button" class="booking-header__back" (click)="back.emit()" aria-label="Voltar">
        <ion-icon name="arrow-back-outline" />
      </button>

      @if (stepLabel()) {
        <span class="booking-header__step">{{ stepLabel() }}</span>
      } @else {
        <span class="booking-header__step booking-header__step--empty"></span>
      }

      <button
        type="button"
        class="booking-header__theme"
        (click)="toggleTheme.emit()"
        [attr.aria-label]="isLightTheme() ? 'Ativar tema escuro' : 'Ativar tema claro'"
      >
        <ion-icon [name]="isLightTheme() ? 'moon-outline' : 'sunny-outline'" />
      </button>
    </header>
  `,
  styles: `
    .booking-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--spacing-md);
    }

    .booking-header__back,
    .booking-header__theme {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      color: var(--color-text-primary);
      box-shadow: var(--shadow-neon-card);
      cursor: pointer;

      ion-icon {
        font-size: 20px;
      }
    }

    .booking-header__step {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);

      &--empty {
        visibility: hidden;
      }
    }
  `,
  imports: [IonIcon],
})
export class BookingHeaderComponent {
  readonly stepLabel = input<string | null>(null);
  readonly isLightTheme = input(false);
  readonly back = output<void>();
  readonly toggleTheme = output<void>();
}
