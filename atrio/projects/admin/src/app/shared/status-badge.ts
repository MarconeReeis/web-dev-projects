import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  APPOINTMENT_STATUS_LABEL,
  AppointmentStatus,
  PaymentStatus,
} from '@atrio/data';
import { AtrBadge, AtrBadgeTone } from '@atrio/ui';

const STATUS_TONE: Readonly<Record<AppointmentStatus, AtrBadgeTone>> = {
  agendado: 'neutral',
  em_atendimento: 'primary',
  concluido: 'success',
  cancelado: 'destructive',
  nao_compareceu: 'warning',
};

/** Estado do atendimento. O texto é obrigatório; a cor só reforça. */
@Component({
  selector: 'adm-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrBadge],
  template: `
    <atr-badge [tone]="tone()" [dot]="true" [pulse]="status() === 'em_atendimento'">
      {{ label() }}
    </atr-badge>
  `,
})
export class StatusBadge {
  readonly status = input.required<AppointmentStatus>();

  protected readonly tone = computed(() => STATUS_TONE[this.status()]);
  protected readonly label = computed(() => APPOINTMENT_STATUS_LABEL[this.status()]);
}

/** Situação do pagamento, separada do estado do atendimento de propósito:
 *  atendimento concluído e pagamento pendente é o caso que mais aparece. */
@Component({
  selector: 'adm-payment-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrBadge],
  template: `
    <atr-badge [tone]="status() === 'pago' ? 'success' : 'warning'">
      {{ status() === 'pago' ? 'Pago' : 'Pagamento pendente' }}
    </atr-badge>
  `,
})
export class PaymentBadge {
  readonly status = input.required<PaymentStatus>();
}
