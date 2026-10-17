import { Directive, booleanAttribute, computed, input } from '@angular/core';

const BASE =
  'w-full min-h-11 rounded-xl border bg-card px-4 text-sm text-foreground ' +
  'transition-colors placeholder:text-muted-foreground ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted';

const NORMAL = 'border-input hover:border-muted-foreground focus:border-primary';
const INVALID = 'border-destructive focus:border-destructive';

/**
 * Controle de formulário do Átrio, como diretiva sobre o elemento nativo.
 *
 * Campos são retângulos arredondados, não cápsulas — cápsula é linguagem de
 * botão e de filtro. Misturar as duas formas faz o usuário tentar clicar no
 * campo esperando uma ação.
 *
 * A altura mínima de 44px vale também aqui: num tablet, campo baixo erra o
 * toque tanto quanto botão baixo.
 */
@Directive({
  selector:
    'input[atrInput], select[atrInput], textarea[atrInput]',
  host: {
    '[class]': 'classes()',
    '[attr.aria-invalid]': 'invalid() || null',
  },
})
export class AtrInput {
  readonly invalid = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(
    () => `${BASE} ${this.invalid() ? INVALID : NORMAL}`,
  );
}
