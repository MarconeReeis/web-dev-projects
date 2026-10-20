import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AtrIcon } from '@atrio/ui';

/**
 * Moldura dos diálogos do app do cliente, no desenho da referência: título
 * centralizado, sem linhas divisórias, ação principal larga no fim do corpo.
 *
 * O painel usa `atr-surface-shell`, com rodapé à direita — bom para a mesa
 * do balcão, frio para o celular. O comportamento é o mesmo: corpo rolável
 * quando o teclado virtual encolhe a tela.
 *
 * O "fechar" vem por último no HTML (e fica no canto por posição absoluta):
 * o diálogo foca o primeiro elemento tocável, e esse deve ser o primeiro
 * campo, não o X.
 */
@Component({
  selector: 'bkg-sheet-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'relative flex max-h-full flex-col overflow-hidden bg-background' },
  template: `
    <header class="shrink-0 px-12 pt-6 pb-1 text-center">
      <h2 class="text-xl font-semibold">{{ heading() }}</h2>
      @if (description()) {
        <p class="mt-1 text-sm text-balance text-muted-foreground">{{ description() }}</p>
      }
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">
      <ng-content />
    </div>

    <button
      type="button"
      class="absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      aria-label="Fechar"
      (click)="closed.emit()"
    >
      <atr-icon name="x" [size]="20" />
    </button>
  `,
})
export class SheetFrame {
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
  readonly closed = output<void>();
}
