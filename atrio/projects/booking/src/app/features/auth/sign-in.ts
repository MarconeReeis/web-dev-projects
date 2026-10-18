import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ATRIO_CONFIG } from '@atrio/core';
import { ClientAuth, ClientAuthError, DEMO_CLIENT_CREDENTIALS } from '@atrio/data';
import { AtrButton, AtrField, AtrIcon, AtrInput } from '@atrio/ui';

type Mode = 'entrar' | 'cadastro' | 'recuperar';

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
            hint="A barbearia usa para falar com você se precisar."
            [error]="showErrors() ? phoneError() : null"
          >
            <input
              atrInput
              type="tel"
              inputmode="tel"
              autocomplete="tel"
              placeholder="(11) 98888-7777"
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
            [hint]="mode() === 'cadastro' ? 'Pelo menos ' + minPassword + ' caracteres.' : null"
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

      @if (mode() === 'entrar' && demoMode) {
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
        <p class="mt-2 text-center text-sm text-muted-foreground">
          Conta fictícia para testar o protótipo.
        </p>
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
  protected readonly minPassword = MIN_PASSWORD;

  protected readonly mode = signal<Mode>('entrar');
  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly resetSent = signal(false);

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
        return 'Leva menos de um minuto, e da próxima vez é só entrar.';
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
