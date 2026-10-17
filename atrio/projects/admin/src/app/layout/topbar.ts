import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { ATRIO_CONFIG, TenantContext } from '@atrio/core';
import { AtrAvatar, AtrIcon } from '@atrio/ui';

/**
 * Barra superior.
 *
 * Deliberadamente enxuta: só controle do menu, selo de demonstração e perfil.
 *
 * O protótipo repetia aqui o título e a descrição da página — a mesma frase
 * aparecia duas vezes na tela, e num tablet em paisagem a altura é o recurso
 * mais escasso. Título e descrição agora pertencem só ao cabeçalho da página
 * (atr-page-heading).
 *
 * Também não há busca global nem sino de notificação: nada ainda os alimenta,
 * e controle que não faz nada ensina o usuário a ignorar a interface.
 */
@Component({
  selector: 'adm-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon, AtrAvatar],
  host: {
    class:
      'flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6',
  },
  template: `
    <button
      type="button"
      class="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      [attr.aria-label]="menuButtonLabel()"
      [attr.aria-expanded]="!collapsed()"
      (click)="toggleMenu.emit()"
    >
      <atr-icon [name]="collapsed() ? 'panel-left-open' : 'panel-left-close'" />
    </button>

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

    <button
      type="button"
      class="flex min-h-11 items-center gap-3 rounded-full px-1.5 transition-colors hover:bg-accent sm:pr-4"
      aria-label="Conta do administrador"
    >
      <atr-avatar [name]="displayName() ?? userRole()" size="default" />
      <span class="hidden text-left leading-tight sm:block">
        @if (displayName(); as name) {
          <span class="block text-sm font-bold">{{ name }}</span>
          <span class="block text-xs text-muted-foreground">{{ userRole() }}</span>
        } @else {
          <span class="block text-sm font-bold">{{ userRole() }}</span>
        }
      </span>
    </button>
  `,
})
export class Topbar {
  protected readonly tenant = inject(TenantContext);
  protected readonly config = inject(ATRIO_CONFIG);

  readonly collapsed = input(false);

  /**
   * Nome de quem está logado. Enquanto não há autenticação fica nulo e o
   * perfil cai no contato cadastrado em Configurações — melhor do que repetir
   * "Administrador" em duas linhas.
   */
  readonly userName = input<string | null>(null);
  readonly userRole = input('Administrador');
  readonly toggleMenu = output<void>();

  protected readonly displayName = computed(
    () => this.userName() ?? this.tenant.tenant()?.admin.name ?? null,
  );

  protected menuButtonLabel(): string {
    return this.collapsed() ? 'Abrir menu' : 'Recolher menu';
  }
}
