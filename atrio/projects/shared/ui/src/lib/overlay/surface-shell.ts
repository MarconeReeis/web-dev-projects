import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AtrIcon } from '../icon/icon';

/**
 * Moldura de diálogo e de painel lateral: cabeçalho fixo, corpo rolável,
 * rodapé fixo.
 *
 * Corpo rolável e rodapé fixo importam de verdade num tablet: com o teclado
 * virtual aberto, a altura útil cai pela metade, e o botão de confirmar não
 * pode sair da tela.
 */
@Component({
  selector: 'atr-surface-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'flex h-full max-h-full flex-col overflow-hidden bg-card' },
  template: `
    <header class="flex shrink-0 items-start gap-4 border-b border-border p-5 sm:p-6">
      <div class="min-w-0 flex-1">
        <h2 class="text-lg font-bold">{{ heading() }}</h2>
        @if (description()) {
          <p class="mt-0.5 text-sm text-muted-foreground">{{ description() }}</p>
        }
      </div>
      <button
        type="button"
        class="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        aria-label="Fechar"
        (click)="closed.emit()"
      >
        <atr-icon name="x" [size]="20" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <ng-content />
    </div>

    <footer
      class="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border p-5 sm:p-6"
    >
      <ng-content select="[shell-footer]" />
    </footer>
  `,
})
export class AtrSurfaceShell {
  readonly heading = input.required<string>();
  readonly description = input<string | null>(null);
  readonly closed = output<void>();
}
