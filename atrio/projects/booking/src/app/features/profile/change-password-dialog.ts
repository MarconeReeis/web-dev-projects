import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ClientAuthError } from '@atrio/data';
import { AtrButton, AtrField, AtrInput, AtrSurfaceShell } from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';

const MIN_PASSWORD = 6;

/**
 * Trocar a senha: a atual e a nova, uma vez só. Pedir a nova duas vezes
 * protege pouco — quem errar a digitação usa "Esqueci minha senha" — e
 * dobra o trabalho no celular.
 *
 * Fecha com `true` quando trocou.
 */
@Component({
  selector: 'bkg-change-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrInput],
  template: `
    <atr-surface-shell heading="Trocar senha" (closed)="ref.close(false)">
      <form id="perfil-senha" class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
        <atr-field label="Senha atual" [error]="showErrors() ? currentError() : null">
          <input
            atrInput
            type="password"
            autocomplete="current-password"
            [invalid]="showErrors() && !!currentError()"
            [value]="current()"
            (input)="current.set($any($event.target).value)"
          />
        </atr-field>

        <atr-field label="Nova senha" [error]="showErrors() ? nextError() : null">
          <input
            atrInput
            type="password"
            autocomplete="new-password"
            [invalid]="showErrors() && !!nextError()"
            [value]="next()"
            (input)="next.set($any($event.target).value)"
          />
        </atr-field>

        @if (failure(); as message) {
          <p
            class="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }
      </form>

      <div shell-footer class="flex w-full justify-end gap-2">
        <button type="button" atrButton="ghost" (click)="ref.close(false)">Cancelar</button>
        <button type="submit" form="perfil-senha" atrButton [disabled]="busy()">
          {{ busy() ? 'Trocando…' : 'Trocar senha' }}
        </button>
      </div>
    </atr-surface-shell>
  `,
})
export class ChangePasswordDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly session = inject(ClientSession);

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly currentError = computed(() => (this.current() ? null : 'Informe a senha atual.'));
  protected readonly nextError = computed(() => {
    if (this.next().length < MIN_PASSWORD) return `Use pelo menos ${MIN_PASSWORD} caracteres.`;
    if (this.next() === this.current()) return 'Escolha uma senha diferente da atual.';
    return null;
  });

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.currentError() || this.nextError() || this.busy()) return;

    this.busy.set(true);
    try {
      await this.session.changePassword(this.current(), this.next());
      this.ref.close(true);
    } catch (cause) {
      this.failure.set(
        cause instanceof ClientAuthError
          ? cause.message
          : 'Não foi possível trocar a senha agora. Tente de novo em instantes.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
