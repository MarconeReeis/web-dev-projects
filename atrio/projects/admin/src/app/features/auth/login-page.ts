import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DEMO_STAFF_CREDENTIALS, StaffAuth, StaffAuthError } from '@atrio/data';
import { AtrButton, AtrField, AtrIcon, AtrInput, AtrPasswordInput } from '@atrio/ui';
import { environment } from '../../../environments/environment';

type Mode = 'entrar' | 'recuperar';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Entrar no painel.
 *
 * Sem "criar conta": conta de equipe nasce pela barbearia (ou pelo suporte do
 * Átrio), nunca por cadastro aberto — senão qualquer um criaria uma conta e
 * pediria para ver a agenda.
 *
 * A marca aqui é a do Átrio, não a da barbearia: antes de entrar, o painel
 * ainda não sabe de qual loja é quem está diante dele.
 */
@Component({
  selector: 'adm-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrButton, AtrField, AtrIcon, AtrInput, AtrPasswordInput],
  host: { class: 'grid min-h-dvh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]' },
  template: `
    <!-- Marca: só no tablet em paisagem e no computador. -->
    <aside class="on-ink relative hidden overflow-hidden bg-ink p-10 text-ink-foreground lg:flex lg:flex-col">
      <span
        class="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-primary/25 blur-3xl"
        aria-hidden="true"
      ></span>

      <div class="relative flex items-center gap-3">
        <span class="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <atr-icon name="scissors" [size]="22" />
        </span>
        <span class="text-xl font-extrabold tracking-tight">Átrio</span>
      </div>

      <div class="relative mt-auto max-w-md">
        <p class="text-3xl leading-tight font-extrabold tracking-tight text-balance">
          A agenda da barbearia, no balcão e no celular do cliente.
        </p>
        <p class="mt-3 text-ink-muted">Painel administrativo</p>
      </div>
    </aside>

    <main class="flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-sm">
        <!-- No celular, a marca vem em cima do formulário. -->
        <div class="mb-8 flex items-center gap-3 lg:hidden">
          <span class="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <atr-icon name="scissors" [size]="20" />
          </span>
          <span class="text-lg font-extrabold tracking-tight">Átrio</span>
        </div>

        <h1 class="text-3xl font-extrabold tracking-tight">{{ title() }}</h1>
        <p class="mt-1 text-sm text-balance text-muted-foreground">{{ subtitle() }}</p>

        @if (mode() === 'recuperar' && resetSent()) {
          <p
            class="mt-6 flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3.5 text-sm text-success-soft-foreground"
            role="status"
          >
            <atr-icon name="circle-check-big" [size]="20" class="mt-px shrink-0" />
            <span>
              Se houver uma conta com <strong class="font-bold">{{ email().trim() }}</strong>, o
              link chega em alguns minutos. Confira também o spam.
            </span>
          </p>
          <button type="button" atrButton size="lg" class="mt-6 w-full" (click)="switchTo('entrar')">
            Voltar para entrar
          </button>
        } @else {
          <form class="mt-7 flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); submit()">
            <atr-field label="E-mail" [error]="showErrors() ? emailError() : null">
              <input
                atrInput
                type="email"
                inputmode="email"
                autocomplete="username"
                autocapitalize="off"
                spellcheck="false"
                [invalid]="showErrors() && !!emailError()"
                [value]="email()"
                (input)="email.set($any($event.target).value)"
              />
            </atr-field>

            @if (mode() === 'entrar') {
              <atr-password-input
                label="Senha"
                autocomplete="current-password"
                [error]="showErrors() ? passwordError() : null"
                [(value)]="password"
              />

              <button
                type="button"
                class="self-start text-sm font-semibold text-primary"
                (click)="switchTo('recuperar')"
              >
                Esqueci minha senha
              </button>
            }

            @if (failure(); as message) {
              <p
                class="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
                role="alert"
              >
                {{ message }}
              </p>
            }

            <button type="submit" atrButton size="lg" class="mt-2 w-full" [disabled]="busy()">
              {{ busy() ? busyLabel() : submitLabel() }}
            </button>
          </form>

          @if (mode() === 'entrar' && demoLogin) {
            <div class="my-6 flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
              <span class="h-px flex-1 bg-border"></span>
              ou
              <span class="h-px flex-1 bg-border"></span>
            </div>
            <button
              type="button"
              atrButton="ink"
              size="lg"
              class="w-full"
              [disabled]="busy()"
              (click)="useDemo()"
            >
              Usar acesso demonstrativo
            </button>
          }

          @if (mode() === 'recuperar') {
            <p class="mt-8 text-center text-sm">
              Lembrou a senha?
              <button type="button" class="font-bold text-primary" (click)="switchTo('entrar')">
                Entrar
              </button>
            </p>
          } @else {
            <!-- Sem cadastro aberto: a conta vem da barbearia. -->
            <p class="mt-8 text-center text-sm text-muted-foreground">
              Ainda não tem acesso? Peça ao responsável pela sua barbearia.
            </p>
          }
        }
      </div>
    </main>
  `,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(StaffAuth);
  private readonly router = inject(Router);

  /** Para onde voltar depois de entrar (?voltar=/agenda). */
  readonly voltar = input<string | undefined>(undefined);

  /** ?recuperar=1 abre direto em "Recuperar senha" (vindo do link vencido). */
  readonly recuperar = input<string | undefined>(undefined);

  ngOnInit(): void {
    if (this.recuperar()) this.switchTo('recuperar');
  }

  protected readonly demoLogin = environment.auth === 'demo';

  protected readonly mode = signal<Mode>('entrar');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly resetSent = signal(false);

  protected readonly title = computed(() =>
    this.mode() === 'recuperar' ? 'Recuperar senha' : 'Entrar no painel',
  );
  protected readonly subtitle = computed(() =>
    this.mode() === 'recuperar'
      ? 'Informe o e-mail da sua conta e enviaremos um link para criar uma senha nova.'
      : 'Use o e-mail e a senha da sua conta na barbearia.',
  );
  protected readonly submitLabel = computed(() =>
    this.mode() === 'recuperar' ? 'Enviar link' : 'Entrar',
  );
  protected readonly busyLabel = computed(() =>
    this.mode() === 'recuperar' ? 'Enviando…' : 'Entrando…',
  );

  protected readonly emailError = computed(() =>
    EMAIL.test(this.email().trim()) ? null : 'Informe um e-mail válido.',
  );
  protected readonly passwordError = computed(() =>
    this.password() ? null : 'Informe a senha.',
  );

  protected switchTo(mode: Mode): void {
    this.mode.set(mode);
    this.password.set('');
    this.showErrors.set(false);
    this.failure.set(null);
    this.resetSent.set(false);
  }

  protected async submit(): Promise<void> {
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.emailError() || (this.mode() === 'entrar' && this.passwordError()) || this.busy()) {
      return;
    }

    if (this.mode() === 'recuperar') {
      await this.run(async () => {
        await this.auth.sendPasswordReset(this.email());
        this.resetSent.set(true);
      });
      return;
    }

    await this.run(async () => {
      await this.auth.signIn(this.email(), this.password());
      await this.enter();
    });
  }

  protected async useDemo(): Promise<void> {
    this.failure.set(null);
    await this.run(async () => {
      await this.auth.signIn(DEMO_STAFF_CREDENTIALS.email, DEMO_STAFF_CREDENTIALS.password);
      await this.enter();
    });
  }

  /**
   * Volta para onde a pessoa queria ir — mas só para dentro do painel. Um
   * `?voltar=https://outro-site` não pode virar redirecionamento para fora.
   */
  private async enter(): Promise<void> {
    const target = this.voltar();
    const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : '/';
    await this.router.navigateByUrl(safe, { replaceUrl: true });
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (cause) {
      this.failure.set(
        cause instanceof StaffAuthError
          ? cause.message
          : 'Não foi possível concluir agora. Tente de novo em instantes.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
