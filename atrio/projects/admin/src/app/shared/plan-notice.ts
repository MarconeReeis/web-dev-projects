import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AtrIcon } from '@atrio/ui';

/**
 * Aviso de recurso do plano Barbearia, onde o plano Solo esbarra num limite.
 *
 * Diz o que fica de fora e por quê, em vez de esconder sem explicação — a
 * barbearia que cresce precisa saber que o recurso existe. Sem botão de
 * "assinar" enquanto a troca de plano é feita pelo Átrio.
 */
@Component({
  selector: 'adm-plan-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'block' },
  template: `
    <p
      class="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-card px-4 py-3.5 text-sm text-muted-foreground"
    >
      <atr-icon name="info" [size]="18" class="mt-px shrink-0 text-primary" />
      <span>
        <ng-content />
        Para mudar de plano, fale com o Átrio.
      </span>
    </p>
  `,
})
export class PlanNotice {}
