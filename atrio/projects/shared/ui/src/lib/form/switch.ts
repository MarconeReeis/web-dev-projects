import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

/**
 * Chave liga/desliga.
 *
 * A linha inteira é o botão, não só o trilho: num tablet, acertar um alvo de
 * 44×24px com o dedo é irritante, e o rótulo ao lado é área morta desperdiçada.
 *
 * `role="switch"` em vez de checkbox porque o efeito é imediato — não existe
 * "salvar" entre marcar e valer. Leitores de tela anunciam "ativado/desativado"
 * em vez de "marcado", que é o que descreve o controle.
 */
@Component({
  selector: 'atr-switch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <button
      type="button"
      role="switch"
      class="flex min-h-14 w-full items-center justify-between gap-4 rounded-xl border border-border px-4 text-left transition-colors hover:border-input disabled:cursor-not-allowed disabled:opacity-50"
      [attr.aria-checked]="checked()"
      [disabled]="disabled()"
      (click)="toggle()"
    >
      <span class="min-w-0">
        <span class="block font-semibold">{{ label() }}</span>
        @if (description()) {
          <span class="block text-sm text-muted-foreground">{{ description() }}</span>
        }
      </span>

      <span
        class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors"
        [class]="checked() ? 'bg-primary' : 'bg-input'"
      >
        <span
          class="absolute size-5 rounded-full bg-card shadow-sm transition-[left]"
          [class]="checked() ? 'left-6' : 'left-1'"
        ></span>
      </span>
    </button>
  `,
})
export class AtrSwitch {
  readonly checked = model.required<boolean>();
  readonly label = input.required<string>();
  readonly description = input<string | null>(null);
  readonly disabled = input(false);

  protected toggle(): void {
    if (!this.disabled()) this.checked.update((value) => !value);
  }
}
