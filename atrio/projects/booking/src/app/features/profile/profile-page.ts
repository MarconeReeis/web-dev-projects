import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClientAuthError } from '@atrio/data';
import { AtrAvatar, AtrButton, AtrIcon, AtrOverlay } from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { SignIn } from '../auth/sign-in';

/**
 * Perfil: a conta do cliente num lugar só.
 *
 * "Sair" e "Excluir minha conta" moravam em Meus horários, que é sobre
 * horários, não sobre a conta. Versão inicial: dados da conta, sair e
 * excluir. Editar nome e telefone e trocar a senha entram com o layout de
 * referência do Perfil.
 */
@Component({
  selector: 'bkg-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrAvatar, AtrButton, AtrIcon, SignIn],
  host: { class: 'block' },
  template: `
    <h1 class="text-2xl font-bold">Perfil</h1>

    @if (session.account(); as account) {
      <section class="surface mt-5 p-5">
        <div class="flex items-center gap-4">
          <atr-avatar [name]="account.name" [photoUrl]="account.photoUrl" size="lg" />
          <div class="min-w-0">
            <p class="truncate font-display text-lg font-semibold">{{ account.name }}</p>
            <p class="truncate text-sm text-muted-foreground">{{ account.email }}</p>
          </div>
        </div>

        <dl class="mt-5 flex flex-col gap-3 border-t border-border pt-4 text-sm">
          <div class="flex items-center gap-3">
            <atr-icon name="phone" [size]="18" class="shrink-0 text-primary" />
            <dt class="sr-only">Telefone</dt>
            <dd>{{ account.phone || 'Sem telefone' }}</dd>
          </div>
          <div class="flex items-center gap-3">
            <atr-icon name="mail-check" [size]="18" class="shrink-0 text-primary" />
            <dt class="sr-only">E-mail</dt>
            <dd class="min-w-0 truncate">{{ account.email }}</dd>
          </div>
        </dl>
      </section>

      <button type="button" atrButton="outline" size="lg" class="mt-5 w-full" (click)="session.signOut()">
        <atr-icon name="log-out" [size]="18" />
        Sair da conta
      </button>

      <!-- Discreto e longe do "Sair": é um direito (LGPD), não uma ação do
           dia a dia, e não pode estar a um toque acidental dele. -->
      @if (deleteError(); as message) {
        <p
          class="mt-6 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
          role="alert"
        >
          {{ message }}
        </p>
      }
      <button
        type="button"
        class="mt-10 w-full text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-destructive"
        [disabled]="deleting()"
        (click)="deleteAccount()"
      >
        {{ deleting() ? 'Excluindo conta…' : 'Excluir minha conta' }}
      </button>
    } @else {
      <bkg-sign-in
        class="mt-5"
        heading="Entre na sua conta"
        lead="Com uma conta você acompanha, reagenda e cancela seus horários."
      />
    }
  `,
})
export class ProfilePage {
  /** Os links são absolutos — ver o comentário de `slug` na home. */
  readonly slug = input<string>('');

  protected readonly session = inject(ClientSession);
  private readonly overlay = inject(AtrOverlay);
  private readonly router = inject(Router);

  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  /**
   * Exclusão de conta (LGPD). A confirmação diz exatamente o que acontece —
   * inclusive o que NÃO sai (o histórico, sem o nome, fica com a barbearia).
   */
  protected async deleteAccount(): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Excluir sua conta?',
      message:
        'Seu e-mail, nome e telefone serão apagados, e seus horários futuros, cancelados. ' +
        'Os atendimentos que já aconteceram ficam com a barbearia, sem o seu nome. ' +
        'Isso não pode ser desfeito.',
      confirmLabel: 'Sim, excluir minha conta',
      cancelLabel: 'Manter conta',
      destructive: true,
      stacked: true,
    });
    if (!confirmed) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    try {
      await this.session.deleteAccount();
      await this.router.navigate(['/b', this.slug()], { state: { contaExcluida: true } });
    } catch (cause) {
      this.deleteError.set(
        cause instanceof ClientAuthError
          ? cause.message
          : 'Não foi possível excluir a conta agora. Tente de novo em instantes.',
      );
    } finally {
      this.deleting.set(false);
    }
  }
}
