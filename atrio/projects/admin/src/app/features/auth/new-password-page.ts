import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { StaffAuth, StaffAuthError, StaffSession } from '@atrio/data';
import { AtrButton, AtrField, AtrIcon, AtrInput } from '@atrio/ui';
import { filter, firstValueFrom, timeout } from 'rxjs';

const MIN_PASSWORD = 6;
const LINK_WAIT_MS = 3000;

type State = 'verificando' | 'formulario' | 'expirado';

/**
 * Destino do link de "Esqueci minha senha" do painel.
 *
 * Antes desta tela o link levava a "Entrar" — e, como o link já abre a
 * sessão, a pessoa caía direto no painel sem nunca definir a senha nova.
 * Aqui a sessão do link é usada para uma coisa só: trocar a senha.
 */
@Component({
  selector: 'adm-new-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrButton, AtrField, AtrIcon, AtrInput],
  host: { class: 'flex min-h-dvh items-center justify-center bg-background px-6 py-12' },
  template: `
    <div class="w-full max-w-sm">
      <div class="mb-8 flex items-center gap-3">
        <span class="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <atr-icon name="scissors" [size]="20" />
        </span>
        <span class="text-lg font-extrabold tracking-tight">Átrio</span>
      </div>

      @switch (state()) {
        @case ('verificando') {
          <p class="text-sm text-muted-foreground" role="status">Conferindo o link…</p>
        }

        @case ('formulario') {
          <h1 class="text-3xl font-extrabold tracking-tight">Crie uma senha nova</h1>
          <p class="mt-1 text-sm text-muted-foreground">
            Para a conta <strong class="font-semibold text-foreground">{{ session()?.email }}</strong>.
          </p>

          <form class="mt-7 flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
            <atr-field label="Nova senha" [error]="showErrors() ? passwordError() : null">
              <input
                atrInput
                type="password"
                autocomplete="new-password"
                [invalid]="showErrors() && !!passwordError()"
                [value]="password()"
                (input)="password.set($any($event.target).value)"
              />
            </atr-field>
            <atr-field label="Confirme a nova senha" [error]="showErrors() ? confirmError() : null">
              <input
                atrInput
                type="password"
                autocomplete="new-password"
                [invalid]="showErrors() && !!confirmError()"
                [value]="confirm()"
                (input)="confirm.set($any($event.target).value)"
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

            <button type="submit" atrButton size="lg" class="mt-2 w-full" [disabled]="busy()">
              {{ busy() ? 'Salvando…' : 'Salvar e entrar' }}
            </button>
          </form>
        }

        @case ('expirado') {
          <h1 class="text-3xl font-extrabold tracking-tight">Link expirado</h1>
          <p class="mt-1 text-sm text-balance text-muted-foreground">
            Por segurança, o link vale por pouco tempo e só uma vez. Peça outro e use o mais
            recente.
          </p>
          <a
            atrButton
            size="lg"
            class="mt-7 w-full"
            routerLink="/entrar"
            [queryParams]="{ recuperar: 1 }"
          >
            Pedir outro link
          </a>
        }
      }
    </div>
  `,
})
export class NewPasswordPage {
  private readonly auth = inject(StaffAuth);
  private readonly router = inject(Router);

  protected readonly state = signal<State>('verificando');
  protected readonly session = signal<StaffSession | null>(null);
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly passwordError = computed(() => {
    const value = this.password();
    if (!value) return 'Informe a senha nova.';
    return value.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : null;
  });

  protected readonly confirmError = computed(() =>
    this.confirm() === this.password() ? null : 'As senhas não são iguais.',
  );

  constructor() {
    void this.waitForLink();
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.passwordError() || this.confirmError() || this.busy()) return;

    this.busy.set(true);
    try {
      await this.auth.updatePassword(this.password());
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (cause) {
      if (cause instanceof StaffAuthError && cause.code === 'link-invalido') {
        this.state.set('expirado');
        return;
      }
      this.failure.set(
        cause instanceof StaffAuthError
          ? cause.message
          : 'Não foi possível salvar agora. Tente de novo em instantes.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Conta do link que não é da equipe também aparece como sessão nula aqui
   * (o vínculo com a barbearia não existe) — e cai em "expirado", que é o
   * desfecho certo: não há senha de painel para trocar.
   */
  private async waitForLink(): Promise<void> {
    try {
      const session = await firstValueFrom(
        this.auth.watchSession().pipe(filter(Boolean), timeout({ first: LINK_WAIT_MS })),
      );
      this.session.set(session);
      this.state.set('formulario');
    } catch {
      this.state.set('expirado');
    }
  }
}
