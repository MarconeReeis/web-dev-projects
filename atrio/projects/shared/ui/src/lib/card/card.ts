import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Card padrão do Átrio.
 *
 * O cabeçalho é opcional: sem `heading`, o card é só a superfície branca com o
 * conteúdo projetado. A ação do cabeçalho entra pelo seletor [card-action],
 * que no mobile cai para baixo do título em vez de espremer a linha.
 *
 *   <atr-card heading="Balanço financeiro" subheading="Do período">
 *     <button atrButton="outline" size="sm" card-action>Ver financeiro</button>
 *     ...
 *   </atr-card>
 */
@Component({
  selector: 'atr-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'surface flex flex-col p-5 sm:p-6' },
  template: `
    @if (heading()) {
      <header
        class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0">
          <h2 class="text-lg font-bold">{{ heading() }}</h2>
          @if (subheading()) {
            <p class="mt-0.5 text-sm text-muted-foreground">{{ subheading() }}</p>
          }
        </div>
        <ng-content select="[card-action]" />
      </header>
    }
    <ng-content />
  `,
})
export class AtrCard {
  readonly heading = input<string | null>(null);
  readonly subheading = input<string | null>(null);
}
