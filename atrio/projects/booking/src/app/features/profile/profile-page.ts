import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ATRIO_CONFIG, InstallPrompt } from '@atrio/core';
import { ClientAuthError, DEMO_CLIENT_CREDENTIALS } from '@atrio/data';
import { AtrAvatar, AtrButton, AtrIcon, AtrOverlay } from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { SignIn } from '../auth/sign-in';
import { ChangePasswordDialog } from './change-password-dialog';
import { EditProfileDialog } from './edit-profile-dialog';

/**
 * Perfil: a conta do cliente num lugar só (referência em
 * especificacoes-navalla-co.md, 5.9).
 *
 * "Sair" e "Excluir minha conta" moravam em Meus horários, que é sobre
 * horários. Excluir fica no fim, separado do "Sair" por outras seções: é um
 * direito (LGPD), não uma ação do dia a dia, e não pode estar a um toque
 * acidental dele.
 *
 * Política e termos abrem páginas próprias, que por enquanto avisam que o
 * texto está em preparação (item de LGPD do roadmap).
 */
@Component({
  selector: 'bkg-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrAvatar, AtrButton, AtrIcon, SignIn],
  host: { class: 'block' },
  template: `
    <h1 class="text-2xl font-bold">Perfil</h1>

    @if (session.account(); as account) {
      <section class="mt-5 flex items-center gap-4">
        <atr-avatar [name]="account.name" [photoUrl]="account.photoUrl" size="xl" />
        <div class="min-w-0">
          <p class="truncate font-display text-xl font-semibold tracking-tight">{{ account.name }}</p>
          <p class="mt-0.5 truncate text-sm text-muted-foreground">{{ account.email }}</p>
          @if (isDemo()) {
            <p class="mt-1 text-xs font-semibold text-primary">Conta demonstrativa</p>
          }
        </div>
      </section>

      <!-- Meus dados -->
      <section class="mt-6 border-t border-border pt-6">
        <div class="flex items-center justify-between gap-3">
          <h2 class="flex items-center gap-2 text-lg font-semibold">
            <atr-icon name="user" [size]="20" class="text-primary" />
            Meus dados
          </h2>
          <button
            type="button"
            class="min-h-11 rounded-full px-3 text-sm font-semibold text-primary hover:bg-primary-soft"
            (click)="editProfile()"
          >
            Editar
          </button>
        </div>

        <dl class="surface mt-3 flex flex-col gap-4 border-transparent p-5 text-sm">
          <div>
            <dt class="text-xs text-muted-foreground">Nome</dt>
            <dd class="mt-0.5 font-medium">{{ account.name }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground">Telefone</dt>
            <dd class="mt-0.5 font-medium">{{ account.phone || '—' }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted-foreground">E-mail · somente leitura</dt>
            <dd class="mt-0.5 font-medium break-all">{{ account.email }}</dd>
          </div>
        </dl>

        @if (notice(); as message) {
          <p
            class="mt-3 flex items-start gap-2 rounded-2xl bg-success-soft px-4 py-3 text-sm text-success-soft-foreground"
            role="status"
          >
            <atr-icon name="circle-check-big" [size]="18" class="mt-px shrink-0" />
            {{ message }}
          </p>
        }
      </section>

      <!-- Segurança -->
      <section class="mt-6 border-t border-border pt-6">
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <atr-icon name="lock" [size]="20" class="text-primary" />
          Segurança
        </h2>
        <button
          type="button"
          class="mt-3 flex min-h-12 w-full items-center justify-between gap-3 rounded-full border border-border bg-card px-5 text-sm font-medium transition-colors hover:border-primary"
          (click)="changePassword()"
        >
          Trocar senha
          <atr-icon name="chevron-right" [size]="18" />
        </button>
      </section>

      <!-- Privacidade -->
      <section class="mt-6 border-t border-border pt-6">
        <h2 class="flex items-center gap-2 text-lg font-semibold">
          <atr-icon name="shield-check" [size]="20" class="text-primary" />
          Privacidade
        </h2>
        <div class="mt-3 flex flex-col gap-3">
          @for (link of legalLinks; track link.path) {
            <a
              class="flex min-h-12 w-full items-center gap-3 rounded-full border border-border bg-card px-5 text-sm font-medium transition-colors hover:border-primary"
              [routerLink]="['/b', slug(), link.path]"
            >
              <atr-icon name="file-text" [size]="18" class="shrink-0" />
              <span class="flex-1">{{ link.label }}</span>
              <atr-icon name="chevron-right" [size]="18" />
            </a>
          }
        </div>
      </section>

      <button type="button" atrButton="outline" size="lg" class="mt-6 w-full" (click)="session.signOut()">
        <atr-icon name="log-out" [size]="18" />
        Sair da conta
      </button>

      <!-- Instalar: some quando o app já roda instalado. -->
      @if (install.state() !== 'instalado') {
        <section class="mt-6 border-t border-border pt-6">
          <h2 class="flex items-center gap-2 text-lg font-semibold">
            <atr-icon name="download" [size]="20" class="text-primary" />
            Instale o app
          </h2>
          @if (install.state() === 'disponivel') {
            <p class="mt-2 text-sm text-muted-foreground">Abre como aplicativo, sem passar pela loja.</p>
            <button type="button" atrButton="soft" class="mt-3" (click)="install.install()">
              Instalar agora
            </button>
          } @else {
            <p class="mt-2 text-sm text-muted-foreground">
              No iPhone, use Compartilhar → Adicionar à Tela de Início. No Android, abra o menu do
              navegador → Instalar app.
            </p>
          }
        </section>
      }

      <!-- Excluir: no fim, longe do "Sair". -->
      <section class="mt-6 border-t border-border pt-6">
        @if (deleteError(); as message) {
          <p
            class="mb-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }
        <button
          type="button"
          class="mx-auto flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground hover:text-destructive"
          [disabled]="deleting()"
          (click)="deleteAccount()"
        >
          <atr-icon name="trash-2" [size]="16" />
          {{ deleting() ? 'Excluindo conta…' : 'Excluir minha conta' }}
        </button>
      </section>
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
  protected readonly install = inject(InstallPrompt);
  private readonly overlay = inject(AtrOverlay);
  private readonly router = inject(Router);
  private readonly demoMode = inject(ATRIO_CONFIG).demoMode;

  protected readonly deleting = signal(false);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected readonly legalLinks = [
    { path: 'privacidade', label: 'Política de privacidade' },
    { path: 'termos', label: 'Termos de uso' },
  ] as const;

  protected readonly isDemo = computed(
    () => this.demoMode && this.session.account()?.email === DEMO_CLIENT_CREDENTIALS.email,
  );

  protected async editProfile(): Promise<void> {
    this.notice.set(null);
    const ref = this.overlay.openDialog<EditProfileDialog, unknown, boolean>(EditProfileDialog);
    if (await firstValueFrom(ref.closed)) this.notice.set('Dados atualizados.');
  }

  protected async changePassword(): Promise<void> {
    this.notice.set(null);
    const ref = this.overlay.openDialog<ChangePasswordDialog, unknown, boolean>(ChangePasswordDialog);
    if (await firstValueFrom(ref.closed)) this.notice.set('Senha trocada.');
  }

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
