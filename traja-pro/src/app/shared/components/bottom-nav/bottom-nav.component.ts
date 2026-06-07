import { Component, input, output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { cutOutline, calendarOutline } from 'ionicons/icons';

addIcons({ cutOutline, calendarOutline });

@Component({
  selector: 'app-bottom-nav',
  template: `
    <nav class="bottom-nav">
      <button
        type="button"
        class="bottom-nav__icon-btn"
        [class.bottom-nav__icon-btn--active]="activeTab() === 'home'"
        (click)="homeTab.emit()"
        aria-label="Início"
      >
        <ion-icon name="cut-outline" />
      </button>

      <button
        type="button"
        class="bottom-nav__icon-btn"
        [class.bottom-nav__icon-btn--active]="activeTab() === 'appointments'"
        (click)="appointmentsTab.emit()"
        aria-label="Meus agendamentos"
      >
        <ion-icon name="calendar-outline" />
      </button>

      <button type="button" class="bottom-nav__cta" (click)="book.emit()">
        Agendar
      </button>
    </nav>
  `,
  styles: `
    .bottom-nav {
      position: fixed;
      bottom: calc(var(--bottom-nav-offset-bottom) + env(safe-area-inset-bottom, 0px));
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 6px 6px 10px;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: var(--radius-full);
      box-shadow: var(--shadow-float);
      z-index: 1000;
      pointer-events: auto;
    }

    .bottom-nav__icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: var(--radius-full);
      background: transparent;
      color: var(--color-text-primary);
      cursor: pointer;

      ion-icon {
        font-size: 20px;
      }

      &--active {
        color: var(--color-primary);
      }
    }

    .bottom-nav__cta {
      flex-shrink: 0;
      height: 36px;
      padding: 0 16px;
      margin-left: 2px;
      border: none;
      border-radius: var(--radius-full);
      background: var(--color-primary);
      color: var(--color-primary-contrast);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      white-space: nowrap;
    }
  `,
  imports: [IonIcon],
})
export class BottomNavComponent {
  readonly activeTab = input<'home' | 'appointments'>('home');
  readonly homeTab = output<void>();
  readonly appointmentsTab = output<void>();
  readonly book = output<void>();
}
