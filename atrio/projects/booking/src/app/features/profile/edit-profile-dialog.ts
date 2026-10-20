import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ClientAuthError, maskPhone, maskPhoneInput } from '@atrio/data';
import { AtrButton, AtrField, AtrInput } from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { SheetFrame } from '../../shared/sheet-frame';

/**
 * Editar nome e telefone. O e-mail fica de fora: ele é o login, e trocá-lo
 * pede confirmação no endereço novo — outro fluxo.
 *
 * Fecha com `true` quando salvou.
 */
@Component({
  selector: 'bkg-edit-profile-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetFrame, AtrButton, AtrField, AtrInput],
  template: `
    <bkg-sheet-frame heading="Meus dados" (closed)="ref.close(false)">
      <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
        <atr-field label="Nome" [error]="showErrors() ? nameError() : null">
          <input
            atrInput
            type="text"
            autocomplete="name"
            [invalid]="showErrors() && !!nameError()"
            [value]="name()"
            (input)="name.set($any($event.target).value)"
          />
        </atr-field>

        <atr-field label="Telefone" [error]="showErrors() ? phoneError() : null">
          <input
            atrInput
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="(11) 90000-0000"
            [invalid]="showErrors() && !!phoneError()"
            [value]="phone()"
            (input)="phone.set(maskPhoneInput($any($event.target)))"
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

        <button type="submit" atrButton size="lg" class="mt-2 w-full shadow-cta" [disabled]="busy()">
          {{ busy() ? 'Salvando…' : 'Salvar' }}
        </button>
      </form>
    </bkg-sheet-frame>
  `,
})
export class EditProfileDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly session = inject(ClientSession);

  protected readonly name = signal(this.session.name());
  protected readonly phone = signal(maskPhone(this.session.phone()));
  protected readonly maskPhoneInput = maskPhoneInput;
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);

  // Mesmas regras do cadastro (e do banco): nome com 2 letras, telefone com DDD.
  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe seu nome.' : null,
  );
  protected readonly phoneError = computed(() =>
    this.phone().replace(/\D/g, '').length < 10 ? 'Informe um telefone com DDD.' : null,
  );

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.nameError() || this.phoneError() || this.busy()) return;

    this.busy.set(true);
    try {
      await this.session.updateProfile({ name: this.name(), phone: this.phone() });
      this.ref.close(true);
    } catch (cause) {
      this.failure.set(
        cause instanceof ClientAuthError
          ? cause.message
          : 'Não foi possível salvar agora. Tente de novo em instantes.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
