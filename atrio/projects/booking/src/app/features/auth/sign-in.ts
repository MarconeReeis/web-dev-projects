import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ATRIO_CONFIG } from '@atrio/core';
import { ClientAuth, ClientAuthError, DEMO_CLIENT_CREDENTIALS } from '@atrio/data';
import { AtrButton, AtrField, AtrIcon, AtrInput } from '@atrio/ui';

export type SignInMode = 'entrar' | 'cadastro' | 'recuperar';
type Mode = SignInMode;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mínimo do Firebase Auth. Exigir mais aqui só barraria quem ele aceitaria. */
const MIN_PASSWORD = 6;

/**
 * Entrar, criar conta e recuperar senha — uma tela, três modos.
 *
 * Não navega nem avisa ninguém ao terminar: quem a usa observa a sessão
 * (`ClientSession`) e troca de tela sozinho quando ela abre. É o que deixa a
 * mesma peça servir ao fluxo de agendamento, que não pode perder as escolhas
 * feitas, e a "Meus horários", que só precisa mostrar a lista.
 *
 * Os modos trocam no lugar, sem rota própria, pelo mesmo motivo: sair da
 * página de agendamento descartaria profissional, serviço e horário.
 */
@Component({
  selector: 'bkg-sign-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrButton, AtrField, AtrIcon, AtrInput],
  host: { class: 'block' },
  template: `
    <h2 class="text-2xl font-extrabold tracking-tight text-balance">{{ title() }}</h2>
    <p class="mt-1 text-sm text-balance text-muted-foreground">{{ subtitle() }}</p>

    @if (mode() === 'recuperar' && resetSent()) {
      <!-- Pedido de nova senha enviado -->
      <p
        class="mt-6 flex items-start gap-3 rounded-2xl bg-success-soft px-4 py-3.5 text-sm text-success-soft-foreground"
        role="status"
      >
        <atr-icon name="circle-check-big" [size]="20" class="mt-px shrink-0" />
        <span>
          Se houver uma conta com <strong class="font-bold">{{ email().trim() }}</strong>,
          o link chega em alguns minutos. Confira também o spam.
        </span>
      </p>
      <button type="button" atrButton size="lg" class="mt-6 w-full" (click)="switchTo('entrar')">
        Voltar para entrar
      </button>
    } @else {
      <form class="mt-6 flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); submit()">
        @if (mode() === 'cadastro') {
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

          <atr-field
            label="Telefone"
            [error]="showErrors() ? phoneError() : null"
          >
            <input
              atrInput
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="(11) 90000-0000"
              [invalid]="showErrors() && !!phoneError()"
              [value]="phone()"
              (input)="phone.set($any($event.target).value)"
            />
          </atr-field>
        }

        <atr-field label="E-mail" [error]="showErrors() ? emailError() : null">
          <input
            atrInput
            type="email"
            inputmode="email"
            autocomplete="email"
            autocapitalize="off"
            spellcheck="false"
            [invalid]="showErrors() && !!emailError()"
            [value]="email()"
            (input)="email.set($any($event.target).value)"
          />
        </atr-field>

        @if (mode() !== 'recuperar') {
          <atr-field
            label="Senha"
            [error]="showErrors() ? passwordError() : null"
          >
            <input
              atrInput
              type="password"
              [attr.autocomplete]="mode() === 'cadastro' ? 'new-password' : 'current-password'"
              [invalid]="showErrors() && !!passwordError()"
              [value]="password()"
              (input)="password.set($any($event.target).value)"
            />
          </atr-field>
        }

        @if (mode() === 'entrar') {
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

      <!-- Google tanto para entrar quanto para criar conta: com ele, as
           duas coisas são o mesmo toque. -->
      @if (mode() !== 'recuperar') {
        <div class="my-6 flex items-center gap-3 text-sm text-muted-foreground" aria-hidden="true">
          <span class="h-px flex-1 bg-border"></span>
          ou
          <span class="h-px flex-1 bg-border"></span>
        </div>

        <!-- Google ainda não está ligado (precisa do cliente OAuth no
             Google Cloud e do provedor ativo no Supabase). Até lá o botão
             responde dizendo isso — botão que não faz nada parece app
             quebrado. -->
        <button
          type="button"
          atrButton="ink"
          size="lg"
          class="w-full"
          [disabled]="busy()"
          (click)="googleSoon.set(true)"
        >
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
          </svg>
          Continuar com Google
        </button>
        @if (googleSoon()) {
          <p class="mt-2 text-center text-sm text-muted-foreground" role="status">
            Entrar com Google chega em breve. Por enquanto, use e-mail e senha.
          </p>
        }

        <!-- Só na demonstração: entrar sem saber a senha da conta fictícia. -->
        @if (demoMode && mode() === 'entrar') {
          <button
            type="button"
            class="mt-4 w-full text-center text-sm font-semibold text-muted-foreground underline underline-offset-4"
            [disabled]="busy()"
            (click)="useDemo()"
          >
            Entrar com a conta de demonstração
          </button>
        }
      }

      <p class="mt-8 text-center text-sm">
        @switch (mode()) {
          @case ('entrar') {
            Ainda não tem conta?
            <button type="button" class="font-bold text-primary" (click)="switchTo('cadastro')">
              Cadastre-se
            </button>
          }
          @case ('cadastro') {
            Já tem conta?
            <button type="button" class="font-bold text-primary" (click)="switchTo('entrar')">
              Entrar
            </button>
          }
          @case ('recuperar') {
            Lembrou a senha?
            <button type="button" class="font-bold text-primary" (click)="switchTo('entrar')">
              Entrar
            </button>
          }
        }
      </p>
    }
  `,
})
export class SignIn {
  private readonly auth = inject(ClientAuth);

  /** Título e apoio do modo "entrar", que mudam conforme quem pede o login. */
  readonly heading = input('Entre na sua conta');
  readonly lead = input('Com uma conta você acompanha, reagenda e cancela seus horários.');

  protected readonly demoMode = inject(ATRIO_CONFIG).demoMode;

  protected readonly mode = signal<Mode>('entrar');

  /** Para quem usa a tela ajustar o próprio título ("Criar conta"). */
  readonly modeChange = output<Mode>();
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly resetSent = signal(false);
  protected readonly googleSoon = signal(false);

  protected readonly title = computed(() => {
    switch (this.mode()) {
      case 'cadastro':
        return 'Crie sua conta';
      case 'recuperar':
        return 'Recuperar senha';
      default:
        return this.heading();
    }
  });

  protected readonly subtitle = computed(() => {
    switch (this.mode()) {
      case 'cadastro':
        return 'Com uma conta você acompanha, reagenda e cancela seus horários.';
      case 'recuperar':
        return 'Informe o e-mail da conta e enviaremos um link para criar uma senha nova.';
      default:
        return this.lead();
    }
  });

  protected readonly submitLabel = computed(() => {
    switch (this.mode()) {
      case 'cadastro':
        return 'Criar conta';
      case 'recuperar':
        return 'Enviar link';
      default:
        return 'Entrar';
    }
  });

  protected readonly busyLabel = computed(() =>
    this.mode() === 'cadastro' ? 'Criando conta…' : this.mode() === 'recuperar' ? 'Enviando…' : 'Entrando…',
  );

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe seu nome.' : null,
  );

  protected readonly phoneError = computed(() =>
    this.phone().replace(/\D/g, '').length < 10 ? 'Informe um telefone com DDD.' : null,
  );

  protected readonly emailError = computed(() =>
    EMAIL.test(this.email().trim()) ? null : 'Informe um e-mail válido.',
  );

  protected readonly passwordError = computed(() => {
    const value = this.password();
    if (!value) return 'Informe a senha.';
    // No "entrar" não se cobra tamanho: a senha certa é a que a conta tem, e
    // dizer "curta demais" para uma senha errada só confunde.
    if (this.mode() === 'cadastro' && value.length < MIN_PASSWORD) {
      return `Use pelo menos ${MIN_PASSWORD} caracteres.`;
    }
    return null;
  });

  private readonly invalid = computed(() => {
    switch (this.mode()) {
      case 'cadastro':
        return !!(this.nameError() || this.phoneError() || this.emailError() || this.passwordError());
      case 'recuperar':
        return !!this.emailError();
      default:
        return !!(this.emailError() || this.passwordError());
    }
  });

  // ─── ações ────────────────────────────────────────────────────────────

  protected switchTo(mode: Mode): void {
    // O e-mail atravessa os modos: quem errou a senha e foi recuperar não
    // deveria digitá-lo de novo. A senha, não.
    this.mode.set(mode);
    this.modeChange.emit(mode);
    this.googleSoon.set(false);
    this.password.set('');
    this.showErrors.set(false);
    this.failure.set(null);
    this.resetSent.set(false);
  }

  protected async submit(): Promise<void> {
    this.showErrors.set(true);
    this.failure.set(null);
    if (this.invalid() || this.busy()) return;

    await this.run(async () => {
      switch (this.mode()) {
        case 'cadastro':
          await this.auth.signUp({
            name: this.name(),
            phone: this.phone(),
            email: this.email(),
            password: this.password(),
          });
          return;
        case 'recuperar':
          await this.auth.sendPasswordReset(this.email().trim());
          this.resetSent.set(true);
          return;
        default:
          await this.auth.signIn(this.email(), this.password());
      }
    });
  }

  protected async useDemo(): Promise<void> {
    this.failure.set(null);
    await this.run(() =>
      this.auth.signIn(DEMO_CLIENT_CREDENTIALS.email, DEMO_CLIENT_CREDENTIALS.password),
    );
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (cause) {
      this.failure.set(
        cause instanceof ClientAuthError
          ? cause.message
          : 'Não foi possível concluir agora. Tente de novo em instantes.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
