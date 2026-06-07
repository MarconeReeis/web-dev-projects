import { Component, inject } from '@angular/core';
import { BookingFlowService } from '../../../../core/services/booking-flow.service';
import { ServiceCardComponent } from '../../components/service-card/service-card.component';
import { listStaggerAnimation } from '../../animations/booking.animations';

@Component({
  selector: 'app-step-service',
  animations: [listStaggerAnimation],
  template: `
    <div class="step">
      <div class="step__heading">
        <h2 class="step__title">Selecione o serviço</h2>
        <p class="step__subtitle">Serviços de {{ flow.bookingDraft().professional?.name }}</p>
      </div>

      @if (flow.isLoadingServices()) {
        <div class="step__loading">Carregando serviços...</div>
      } @else {
        <div class="step__list" @listStagger>
          @for (service of flow.services(); track service.id) {
            <app-service-card
              [service]="service"
              [selected]="flow.bookingDraft().service?.id === service.id"
              (select)="flow.selectService($event)"
            />
          }
        </div>
      }

      <button type="button" class="step__cancel" (click)="flow.cancelFlow()">Cancelar</button>
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

    .step__cancel {
      display: block;
      width: 100%;
      margin-top: var(--spacing-xl);
      padding: var(--spacing-md);
      border: none;
      background: none;
      color: var(--color-text-muted);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
  `,
  imports: [ServiceCardComponent],
})
export class StepServiceComponent {
  readonly flow = inject(BookingFlowService);
}
