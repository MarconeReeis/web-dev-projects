import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AtrIcon } from '@atrio/ui';

/**
 * Cabeçalho das telas fora do shell: voltar à esquerda, título centralizado.
 *
 * O espaço vazio à direita, do tamanho do botão, é o que mantém o título no
 * centro da tela, e não no centro do que sobra depois do botão.
 */
@Component({
  selector: 'bkg-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'sticky top-0 z-20 block bg-background' },
  template: `
    <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
      <button
        type="button"
        class="floating inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors hover:bg-accent"
        aria-label="Voltar"
        (click)="back.emit()"
      >
        <atr-icon name="chevron-left" [size]="20" />
      </button>
      <h1 class="min-w-0 flex-1 truncate text-center font-bold">{{ heading() }}</h1>
      <span class="size-11 shrink-0"></span>
    </div>
  `,
})
export class PageHeader {
  readonly heading = input.required<string>();
  readonly back = output<void>();
}
