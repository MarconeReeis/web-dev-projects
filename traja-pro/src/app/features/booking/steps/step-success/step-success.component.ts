import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmark, arrowForward, homeOutline, calendarOutline } from 'ionicons/icons';
import { BookingFlowService } from '../../../../core/services/booking-flow.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { scaleInAnimation, fadeInUpAnimation } from '../../animations/booking.animations';
import { environment } from '../../../../../environments/environment';

addIcons({ checkmark, arrowForward, homeOutline, calendarOutline });

@Component({
  selector: 'app-step-success',
  animations: [scaleInAnimation, fadeInUpAnimation],
  template: `
    @if (confirmation) {
      <div class="success">
        <div class="success__icon" @scaleIn>
          <ion-icon name="checkmark" />
        </div>

        <div @fadeInUp>
          <h2 class="success__title">Seu horário foi reservado!</h2>
          <p class="success__subtitle">
            Te esperamos no {{ businessName }}. Você receberá uma confirmação via WhatsApp.
          </p>
        </div>

        <div class="success-card" @fadeInUp>
          <div class="success-card__header">
            <span class="success-card__label">AGENDAMENTO</span>
            <span class="success-card__id">{{ confirmation.id }}</span>
          </div>

          <div class="success-card__service">
            <app-avatar [initials]="confirmation.professional.initials" size="md" />
            <div>
              <h3 class="success-card__service-name">{{ confirmation.service.name }}</h3>
              <p class="success-card__pro">com {{ confirmation.professional.name }}</p>
            </div>
          </div>

          <div class="success-card__datetime">
            <div class="success-card__datetime-info">
              <ion-icon name="calendar-outline" />
              <span>{{ confirmation.dateLabel }}</span>
            </div>
            <span class="success-card__time">{{ confirmation.time }}</span>
          </div>
        </div>

        <div class="success__actions" @fadeInUp>
          <button type="button" class="success__btn success__btn--primary" (click)="goToAppointments()">
            Ver Meus Agendamentos
            <ion-icon name="arrow-forward" />
          </button>
          <button type="button" class="success__btn success__btn--secondary" (click)="goHome()">
            <ion-icon name="home-outline" />
            Voltar para Home
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .success {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding-top: var(--spacing-lg);
    }

    .success__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 80px;
      height: 80px;
      margin-bottom: var(--spacing-lg);
      border-radius: var(--radius-full);
      background: var(--color-primary);
      box-shadow: 0 0 32px rgba(0, 200, 127, 0.4);

      ion-icon {
        font-size: 40px;
        color: var(--color-primary-contrast);
        font-weight: bold;
      }
    }

    .success__title {
      margin: 0 0 var(--spacing-sm);
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      line-height: var(--line-height-tight);
    }

    .success__subtitle {
      margin: 0 0 var(--spacing-xl);
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
      line-height: var(--line-height-normal);
      max-width: 300px;
    }

    .success-card {
      width: 100%;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-neon-card);
      text-align: left;
      margin-bottom: var(--spacing-xl);
    }

    .success-card__header {
      display: flex;
      justify-content: space-between;
      margin-bottom: var(--spacing-md);
    }

    .success-card__label,
    .success-card__id {
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      color: var(--color-text-muted);
      letter-spacing: 0.5px;
    }

    .success-card__service {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .success-card__service-name {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .success-card__pro {
      margin: 2px 0 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .success-card__datetime {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      background: rgba(0, 0, 0, 0.25);
    }

    .success-card__datetime-info {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);

      ion-icon {
        font-size: 18px;
        color: var(--color-primary);
      }
    }

    .success-card__time {
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
    }

    .success__actions {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      width: 100%;
    }

    .success__btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      width: 100%;
      padding: 16px;
      border-radius: var(--radius-full);
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: transform 200ms ease;

      &:active {
        transform: scale(0.98);
      }

      &--primary {
        border: none;
        background: #ffffff;
        color: #0a0f0d;
      }

      &--secondary {
        border: 1px solid rgba(255, 255, 255, 0.25);
        background: transparent;
        color: var(--color-text-primary);
      }
    }
  `,
  imports: [IonIcon, AvatarComponent],
})
export class StepSuccessComponent {
  private readonly flow = inject(BookingFlowService);
  private readonly router = inject(Router);

  readonly businessName = environment.businessName;

  get confirmation() {
    return this.flow.bookingConfirmation();
  }

  goHome(): void {
    this.flow.reset();
    this.router.navigate(['/']);
  }

  goToAppointments(): void {
    this.flow.reset();
    this.router.navigate(['/agendamentos']);
  }
}
