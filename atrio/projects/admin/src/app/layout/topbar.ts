import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ATRIO_CONFIG, TenantContext } from '@atrio/core';
import { STAFF_ROLE_LABEL, StaffAuth } from '@atrio/data';
import { AtrAvatar, AtrIcon } from '@atrio/ui';
import { NotificationsMenu } from './notifications-menu';

/**
 * Barra superior.
 *
 * Deliberadamente enxuta: só controle do menu, selo de demonstração e a
 * conta de quem está logado — que abre o "Sair".
 *
 * O protótipo repetia aqui o título e a descrição da página — a mesma frase
 * aparecia duas vezes na tela, e num tablet em paisagem a altura é o recurso
 * mais escasso. Título e descrição agora pertencem só ao cabeçalho da página
 * (atr-page-heading).
 *
 * O sino traz o que o cliente fez pelo app (ver NotificationsMenu). Busca
 * global não há: nada ainda a alimenta, e controle que não faz nada ensina o
 * usuário a ignorar a interface.
 */
@Component({
  selector: 'adm-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon, AtrAvatar, NotificationsMenu],
  host: {
    class:
      'flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6',
    '(document:pointerdown)': 'closeOnOutside($event)',
    '(document:keydown.escape)': 'accountOpen.set(false)',
  },
  template: `
    <!-- No celular não há menu lateral: as seções ficam na barra inferior. -->
    @if (!phone()) {
      <button
        type="button"
        class="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        [attr.aria-label]="menuButtonLabel()"
        [attr.aria-expanded]="!collapsed()"
        (click)="toggleMenu.emit()"
      >
        <atr-icon [name]="collapsed() ? 'panel-left-open' : 'panel-left-close'" />
      </button>
    }

    <!-- No mobile o menu some, então a barbearia é identificada aqui. -->
    <span class="truncate font-bold lg:hidden">{{ tenant.name() }}</span>

    <span class="flex-1"></span>

    @if (config.demoMode) {
      <span
        class="hidden h-9 items-center rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary-soft-foreground sm:inline-flex"
      >
        Modo demonstração
      </span>
    }

    <adm-notifications-menu />

    <div class="relative" #account>
      <button
        type="button"
        class="flex min-h-11 items-center gap-3 rounded-full px-1.5 transition-colors hover:bg-accent sm:pr-4"
        aria-label="Conta"
        aria-haspopup="menu"
        [attr.aria-expanded]="accountOpen()"
        (click)="accountOpen.set(!accountOpen())"
      >
        <atr-avatar [name]="displayName()" size="default" />
        <span class="hidden text-left leading-tight sm:block">
          <span class="block text-sm font-bold">{{ displayName() }}</span>
          <span class="block text-xs text-muted-foreground">{{ roleLabel() }}</span>
        </span>
        <atr-icon name="chevron-down" [size]="16" class="hidden text-muted-foreground sm:block" />
      </button>

      @if (accountOpen()) {
        <div
          class="floating absolute top-full right-0 z-30 mt-2 w-64 rounded-surface border border-border bg-card p-2"
          role="menu"
        >
          <div class="px-3 py-2.5">
            <p class="truncate text-sm font-bold">{{ displayName() }}</p>
            <p class="truncate text-xs text-muted-foreground">{{ session()?.email }}</p>
          </div>
          <button
            type="button"
            role="menuitem"
            class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-destructive transition-colors hover:bg-destructive-soft"
            [disabled]="signingOut()"
            (click)="signOut()"
          >
            <atr-icon name="log-out" [size]="18" />
            {{ signingOut() ? 'Saindo…' : 'Sair' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class Topbar {
  protected readonly tenant = inject(TenantContext);
  protected readonly config = inject(ATRIO_CONFIG);

  private readonly auth = inject(StaffAuth);

  readonly collapsed = input(false);
  /** Painel de celular: sem o botão do menu lateral. */
  readonly phone = input(false);
  readonly toggleMenu = output<void>();

  protected readonly session = toSignal(this.auth.watchSession(), { initialValue: null });
  protected readonly displayName = computed(() => this.session()?.name ?? 'Equipe');
  protected readonly roleLabel = computed(() => {
    const role = this.session()?.role;
    return role ? STAFF_ROLE_LABEL[role] : '';
  });

  protected readonly accountOpen = signal(false);
  protected readonly signingOut = signal(false);
  private readonly account = viewChild.required<ElementRef<HTMLElement>>('account');

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      // A volta à tela de entrar é do shell, que reage ao fim da sessão
      // venha ela daqui ou de fora.
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
      this.accountOpen.set(false);
    }
  }

  /** Fecha o menu da conta ao tocar fora dele (o botão que abre está dentro). */
  protected closeOnOutside(event: PointerEvent): void {
    if (this.accountOpen() && !this.account().nativeElement.contains(event.target as Node)) {
      this.accountOpen.set(false);
    }
  }

  protected menuButtonLabel(): string {
    return this.collapsed() ? 'Abrir menu' : 'Recolher menu';
  }
}
