import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AtrIcon } from '../icon/icon';
import { AtrioIconName } from '../icon/icon-set';

/**
 * Estado vazio.
 *
 * Diz o que aconteceu e o que fazer a seguir. Lista vazia sem explicação passa
 * a impressão de app quebrado — principalmente num tablet operado por quem não
 * tem familiaridade com software.
 */
@Component({
  selector: 'atr-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: {
    class: 'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
  },
  template: `
    <span
      class="mb-1 inline-flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
    >
      <atr-icon [name]="icon()" [size]="24" />
    </span>
    <p class="text-base font-bold">{{ heading() }}</p>
    @if (description()) {
      <p class="max-w-xs text-sm text-balance text-muted-foreground">
        {{ description() }}
      </p>
    }
    <ng-content />
  `,
})
export class AtrEmptyState {
  readonly icon = input<AtrioIconName>('info');
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
}
