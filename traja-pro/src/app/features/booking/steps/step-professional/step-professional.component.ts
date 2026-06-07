import { Component, inject } from '@angular/core';
import { BookingFlowService } from '../../../../core/services/booking-flow.service';
import { ProfessionalCardComponent } from '../../components/professional-card/professional-card.component';
import { listStaggerAnimation } from '../../animations/booking.animations';

@Component({
  selector: 'app-step-professional',
  animations: [listStaggerAnimation],
  template: `
    <div class="step">
      <div class="step__heading">
        <h2 class="step__title">Escolha o profissional</h2>
        <p class="step__subtitle">Quem você quer no comando hoje?</p>
      </div>

      @if (flow.isLoadingProfessionals()) {
        <div class="step__loading">Carregando profissionais...</div>
      } @else {
        <div class="step__list" @listStagger>
          @for (professional of flow.professionals(); track professional.id) {
            <app-professional-card
              [professional]="professional"
              [selected]="flow.bookingDraft().professional?.id === professional.id"
              (select)="flow.selectProfessional($event)"
            />
          }
        </div>
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

    .step__list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .step__loading {
      padding: var(--spacing-xl);
      text-align: center;
      color: var(--color-text-muted);
      font-size: var(--font-size-sm);
    }
  `,
  imports: [ProfessionalCardComponent],
})
export class StepProfessionalComponent {
  readonly flow = inject(BookingFlowService);
}
