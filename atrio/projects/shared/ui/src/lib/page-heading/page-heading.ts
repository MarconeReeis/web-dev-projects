import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Cabeçalho de página: título, descrição curta e ações.
 *
 * Toda tela do admin abre com este bloco — é o que dá o mesmo ritmo visual à
 * Dashboard, à Agenda e ao Financeiro sem cada uma reinventar o espaçamento.
 */
@Component({
  selector: 'atr-page-heading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
  },
  template: `
    <div class="min-w-0">
      <h1 class="text-3xl font-extrabold tracking-tight sm:text-4xl">
        {{ heading() }}
      </h1>
      @if (description()) {
        <p class="mt-1.5 text-sm text-muted-foreground sm:text-base">
          {{ description() }}
        </p>
      }
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <ng-content />
    </div>
  `,
})
export class AtrPageHeading {
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
}
