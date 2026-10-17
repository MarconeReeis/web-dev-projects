import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Rótulo + controle + mensagem de erro.
 *
 * O `<label>` ENVOLVE o controle em vez de usar `for`/`id`. Associação
 * implícita não depende de gerar identificador único, não quebra quando o
 * mesmo formulário aparece duas vezes na tela (um diálogo sobre outro) e
 * amplia a área de toque do rótulo — tudo que importa num tablet.
 */
@Component({
  selector: 'atr-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <label class="block">
      <span class="mb-1.5 block text-sm font-semibold">
        {{ label() }}
        @if (optional()) {
          <span class="font-normal text-muted-foreground">(opcional)</span>
        }
      </span>
      <ng-content />
    </label>

    @if (error()) {
      <p class="mt-1.5 text-sm font-medium text-destructive" role="alert">
        {{ error() }}
      </p>
    } @else if (hint()) {
      <p class="mt-1.5 text-sm text-muted-foreground">{{ hint() }}</p>
    }
  `,
})
export class AtrField {
  readonly label = input.required<string>();
  readonly hint = input<string | null>(null);
  readonly error = input<string | null>(null);
  readonly optional = input(false);
}
