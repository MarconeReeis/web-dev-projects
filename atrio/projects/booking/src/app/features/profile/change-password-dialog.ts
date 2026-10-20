import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ClientAuthError } from '@atrio/data';
import { AtrButton, AtrPasswordInput } from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { SheetFrame } from '../../shared/sheet-frame';

const MIN_PASSWORD = 6;

/**
 * Trocar a senha: a atual, a nova e a confirmação da nova — com "mostrar"
 * em cada uma, para conferir antes de enviar.
 *
 * Fecha com `true` quando trocou.
 */
@Component({
  selector: 'bkg-change-password-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetFrame, AtrButton, AtrPasswordInput],
  template: `
    <bkg-sheet-frame heading="Trocar senha" (closed)="ref.close(false)">
      <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
        <atr-password-input
          label="Senha atual"
          autocomplete="current-password"
          [error]="showErrors() ? currentError() : null"
          [(value)]="current"
        />
        <atr-password-input
          label="Nova senha"
          autocomplete="new-password"
          [error]="showErrors() ? nextError() : null"
          [(value)]="next"
        />
        <atr-password-input
          label="Confirmar nova senha"
          autocomplete="new-password"
          [error]="showErrors() ? confirmError() : null"
          [(value)]="confirmation"
        />

        @if (failure(); as message) {
          <p
            class="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <button type="submit" atrButton size="lg" class="mt-2 w-full shadow-cta" [disabled]="busy()">
          {{ busy() ? 'Salvando…' : 'Salvar nova senha' }}
        </button>
      </form>
    </bkg-sheet-frame>
  `,
})
export class ChangePasswordDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly session = inject(ClientSession);

  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly confirmation = signal('');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly currentError = computed(() => (this.current() ? null : 'Informe a senha atual.'));
  protected readonly nextError = computed(() => {
    if (this.next().length < MIN_PASSWORD) return `Use pelo menos ${MIN_PASSWORD} caracteres.`;
    if (this.next() === this.current()) return 'Escolha uma senha diferente da atual.';
    return null;
  });
  protected readonly confirmError = computed(() =>
    this.confirmation() === this.next() ? null : 'As senhas não são iguais.',
  );

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.currentError() || this.nextError() || this.confirmError() || this.busy()) return;

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
