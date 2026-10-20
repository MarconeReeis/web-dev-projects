import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';
import { AtrIcon } from '../icon/icon';
import { AtrField } from './field';
import { AtrInput } from './input';

/**
 * Campo de senha com "mostrar/ocultar".
 *
 * No celular e no tablet, digitar senha sem ver é onde mais se erra — e o
 * erro só aparece depois de enviar. O olho deixa conferir antes.
 *
 *   <atr-password-input label="Senha" [error]="erro" [(value)]="senha" />
 */
@Component({
  selector: 'atr-password-input',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrField, AtrIcon, AtrInput],
  template: `
    <atr-field [label]="label()" [error]="error()">
      <div class="relative">
        <input
          atrInput
          class="pr-12"
          [type]="visible() ? 'text' : 'password'"
          [attr.autocomplete]="autocomplete()"
          autocapitalize="off"
          spellcheck="false"
          [invalid]="!!error()"
          [value]="value()"
          (input)="value.set($any($event.target).value)"
        />
        <button
          type="button"
          class="absolute inset-y-0 right-1 inline-flex w-11 items-center justify-center rounded-full text-foreground"
          [attr.aria-label]="visible() ? 'Ocultar senha' : 'Mostrar senha'"
          [attr.aria-pressed]="visible()"
          (click)="visible.set(!visible())"
        >
          <atr-icon [name]="visible() ? 'eye-off' : 'eye'" [size]="20" />
        </button>
      </div>
    </atr-field>
  `,
})
export class AtrPasswordInput {
  readonly label = input.required<string>();
  readonly error = input<string | null>(null);
  readonly autocomplete = input<'current-password' | 'new-password'>('current-password');
  readonly value = model('');

  protected readonly visible = signal(false);
}
