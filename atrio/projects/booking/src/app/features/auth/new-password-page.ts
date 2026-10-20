import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ClientAccount, ClientAuth, ClientAuthError } from '@atrio/data';
import { AtrButton, AtrIcon, AtrPasswordInput } from '@atrio/ui';
import { filter, firstValueFrom, timeout } from 'rxjs';
import { PageHeader } from '../../shared/page-header';

/** Mínimo do Supabase Auth — o mesmo do cadastro. */
const MIN_PASSWORD = 6;

/** Quanto esperar o link do e-mail abrir a sessão antes de dá-lo por vencido. */
const LINK_WAIT_MS = 3000;

type State = 'verificando' | 'formulario' | 'expirado' | 'pronto';

/**
 * Destino do link de "Esqueci minha senha".
 *
 * O link do e-mail abre uma sessão temporária — é ela a prova de que a
 * pessoa é dona do e-mail. Por isso a tela espera a sessão antes de mostrar
 * o formulário, e sem ela (link vencido, já usado, aberto em outro aparelho)
 * oferece pedir outro em vez de um formulário que falharia no fim.
 */
@Component({
  selector: 'bkg-new-password-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrButton, AtrIcon, PageHeader, AtrPasswordInput],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <bkg-page-header heading="Nova senha" (back)="goHome()" />

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 pt-2 pb-10">
      @switch (state()) {
        @case ('verificando') {
          <p class="py-16 text-center text-sm text-muted-foreground" role="status">
            Conferindo o link…
          </p>
        }

        @case ('formulario') {
          <h2 class="text-2xl font-extrabold tracking-tight">Crie uma senha nova</h2>
          <p class="mt-1 text-sm text-muted-foreground">
            Para a conta <strong class="font-semibold text-foreground">{{ account()?.email }}</strong>.
          </p>

          <form class="mt-6 flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); save()">
            <atr-password-input
              label="Nova senha"
              autocomplete="new-password"
              [error]="showErrors() ? passwordError() : null"
              [(value)]="password"
            />

            <atr-password-input
              label="Confirme a nova senha"
              autocomplete="new-password"
              [error]="showErrors() ? confirmError() : null"
              [(value)]="confirm"
            />

            @if (failure(); as message) {
              <p
                class="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
                role="alert"
              >
                {{ message }}
              </p>
            }

            <button type="submit" atrButton size="lg" class="mt-2 w-full" [disabled]="busy()">
              {{ busy() ? 'Salvando…' : 'Salvar senha' }}
            </button>
          </form>
        }

        @case ('pronto') {
          <div class="flex flex-col items-center pt-10 text-center">
            <span
              class="flex size-16 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground"
            >
              <atr-icon name="circle-check-big" [size]="30" />
            </span>
            <h2 class="mt-5 text-2xl font-extrabold tracking-tight">Senha alterada</h2>
            <p class="mt-1 text-sm text-muted-foreground">Você já está conectado.</p>
          </div>
          <div class="mt-8 flex flex-col gap-2">
            <a atrButton size="lg" class="w-full" [routerLink]="['/b', slug()]">Ir para o início</a>
            <a atrButton="ghost" size="lg" class="w-full" [routerLink]="['/b', slug(), 'meus-horarios']">
              Ver meus horários
            </a>
          </div>
        }

        @case ('expirado') {
          <div class="flex flex-col items-center pt-10 text-center">
            <span
              class="flex size-16 items-center justify-center rounded-full bg-secondary text-muted-foreground"
            >
              <atr-icon name="lock" [size]="28" />
            </span>
            <h2 class="mt-5 text-2xl font-extrabold tracking-tight">Link expirado</h2>
            <p class="mt-1 text-sm text-balance text-muted-foreground">
              Por segurança, o link vale por pouco tempo e só uma vez. Peça outro e use o
              mais recente.
            </p>
          </div>
          <a
            atrButton
            size="lg"
            class="mt-8 w-full"
            [routerLink]="['/b', slug(), 'meus-horarios']"
            [queryParams]="{ recuperar: 1 }"
          >
            Pedir outro link
          </a>
        }
      }
    </main>
  `,
})
export class NewPasswordPage {
  private readonly auth = inject(ClientAuth);
  private readonly router = inject(Router);

  readonly slug = input<string>('');

  protected readonly state = signal<State>('verificando');
  protected readonly account = signal<ClientAccount | null>(null);
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
      this.state.set('pronto');
    } catch (cause) {
      if (cause instanceof ClientAuthError && cause.code === 'link-invalido') {
        this.state.set('expirado');
        return;
      }
      this.failure.set(
        cause instanceof ClientAuthError
          ? cause.message
          : 'Não foi possível salvar agora. Tente de novo em instantes.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected goHome(): void {
    void this.router.navigate(['/b', this.slug()]);
  }

  /** O link abre a sessão sozinho, ao carregar o app; aqui só se espera por ela. */
  private async waitForLink(): Promise<void> {
    try {
      const account = await firstValueFrom(
        this.auth.watchSession().pipe(filter(Boolean), timeout({ first: LINK_WAIT_MS })),
      );
      this.account.set(account);
      this.state.set('formulario');
    } catch {
      this.state.set('expirado');
    }
  }
}
