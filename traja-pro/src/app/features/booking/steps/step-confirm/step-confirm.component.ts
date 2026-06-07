import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BookingFlowService } from '../../../../core/services/booking-flow.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';

@Component({
  selector: 'app-step-confirm',
  template: `
    <div class="step">
      <div class="step__heading">
        <h2 class="step__title">Confirme seu agendamento</h2>
      </div>

      @if (draft.professional && draft.service) {
        <div class="confirm-card">
          <div class="confirm-card__pro">
            <app-avatar [initials]="draft.professional.initials" size="md" />
            <div>
              <h3 class="confirm-card__pro-name">{{ draft.professional.name }}</h3>
              <p class="confirm-card__pro-specialty">{{ draft.professional.specialty }}</p>
            </div>
          </div>

          <div class="confirm-card__divider"></div>

          <div class="confirm-card__row">
            <span class="confirm-card__label">Serviço</span>
            <span class="confirm-card__value">{{ draft.service.name }}</span>
          </div>
          <div class="confirm-card__row">
            <span class="confirm-card__label">Data</span>
            <span class="confirm-card__value">{{ dateLabel }}</span>
          </div>
          <div class="confirm-card__row">
            <span class="confirm-card__label">Horário</span>
            <span class="confirm-card__value">{{ draft.time }}</span>
          </div>
          <div class="confirm-card__row">
            <span class="confirm-card__label">Duração</span>
            <span class="confirm-card__value">{{ draft.service.durationMinutes }} minutos</span>
          </div>

          <div class="confirm-card__total">
            <span>Total</span>
            <span class="confirm-card__total-value">R$ {{ draft.service.price }},00</span>
          </div>
        </div>
      }

      <h3 class="step__form-title">Seus dados</h3>

      <div class="confirm-form">
        <label class="confirm-form__field">
          <span>Nome completo</span>
          <input
            type="text"
            placeholder="Como podemos te chamar?"
            [ngModel]="draft.customer.fullName"
            (ngModelChange)="flow.updateCustomer({ fullName: $event })"
          />
        </label>

        <label class="confirm-form__field">
          <span>Telefone</span>
          <input
            type="tel"
            placeholder="(11) 9 9999-0000"
            [ngModel]="draft.customer.phone"
            (ngModelChange)="flow.updateCustomer({ phone: $event })"
          />
        </label>

        <label class="confirm-form__field">
          <span>WhatsApp</span>
          <input
            type="tel"
            placeholder="Mesmo número?"
            [ngModel]="draft.customer.whatsapp"
            (ngModelChange)="flow.updateCustomer({ whatsapp: $event })"
          />
        </label>

        <label class="confirm-form__field">
          <span>E-mail (opcional)</span>
          <input
            type="email"
            placeholder="voce@email.com"
            [ngModel]="draft.customer.email"
            (ngModelChange)="flow.updateCustomer({ email: $event })"
          />
        </label>
      </div>

      @if (flow.submitErrorMessage()) {
        <p class="confirm-form__error">{{ flow.submitErrorMessage() }}</p>
      }

      <button
        type="button"
        class="confirm-form__submit"
        [class.confirm-form__submit--disabled]="!flow.canProceed() || flow.submitting()"
        [disabled]="!flow.canProceed() || flow.submitting()"
        (click)="flow.confirmBooking()"
      >
        {{ flow.submitting() ? 'Confirmando...' : 'Confirmar Agendamento' }}
      </button>
    </div>
  `,
  styles: `
    .step__heading {
      margin-bottom: var(--spacing-lg);
    }

    .step__title {
      margin: 0;
      font-size: var(--font-size-2xl);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
      line-height: var(--line-height-tight);
    }

    .confirm-card {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--color-surface);
      box-shadow: var(--shadow-neon-card);
      margin-bottom: var(--spacing-lg);
    }

    .confirm-card__pro {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }

    .confirm-card__pro-name {
      margin: 0;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
    }

    .confirm-card__pro-specialty {
      margin: 2px 0 0;
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .confirm-card__divider {
      height: 1px;
      margin: var(--spacing-md) 0;
      background: var(--color-border);
    }

    .confirm-card__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-xs) 0;
    }

    .confirm-card__label {
      font-size: var(--font-size-sm);
      color: var(--color-text-muted);
    }

    .confirm-card__value {
      font-size: var(--font-size-sm);
      font-weight: var(--font-weight-semibold);
      color: var(--color-text-primary);
      text-align: right;
      max-width: 60%;
    }

    .confirm-card__total {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      background: rgba(0, 200, 127, 0.12);

      span:first-child {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-semibold);
        color: var(--color-primary);
      }
    }

    .confirm-card__total-value {
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--color-primary);
    }

    .step__form-title {
      margin: 0 0 var(--spacing-md);
      font-size: var(--font-size-lg);
      font-weight: var(--font-weight-bold);
      color: var(--color-text-primary);
    }

    .confirm-form {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .confirm-form__error {
      margin: 0 0 var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-md);
      background: rgba(239, 68, 68, 0.12);
      color: var(--color-danger);
      font-size: var(--font-size-sm);
      text-align: center;
    }

    .confirm-form__field {
      display: flex;
      flex-direction: column;
      gap: 6px;

      span {
        font-size: var(--font-size-sm);
        font-weight: var(--font-weight-medium);
        color: var(--color-text-primary);
      }

      input {
        padding: 14px var(--spacing-md);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        color: var(--color-text-primary);
        font-family: var(--font-family);
        font-size: var(--font-size-base);
        outline: none;
        transition: border-color 200ms ease, box-shadow 200ms ease;

        &::placeholder {
          color: var(--color-text-muted);
        }

        &:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px rgba(0, 200, 127, 0.15);
        }
      }
    }

    .confirm-form__submit {
      width: 100%;
      padding: 16px;
      border: none;
      border-radius: var(--radius-full);
      background: #ffffff;
      color: #0a0f0d;
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-semibold);
      cursor: pointer;
      transition: opacity 200ms ease, transform 200ms ease;

      &:active:not(:disabled) {
        transform: scale(0.98);
      }

      &--disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
    }
  `,
  imports: [FormsModule, AvatarComponent],
})
export class StepConfirmComponent {
  readonly flow = inject(BookingFlowService);

  get draft() {
    return this.flow.bookingDraft();
  }

  get dateLabel(): string {
    if (!this.draft.date) return '';
    const [y, m, d] = this.draft.date.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const formatted = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    }).format(date);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }
}
