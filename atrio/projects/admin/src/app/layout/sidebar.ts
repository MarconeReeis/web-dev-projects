import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ATRIO_CONFIG, TenantContext } from '@atrio/core';
import { AtrIcon } from '@atrio/ui';
import { NAV_ITEMS } from './nav-items';

/**
 * Menu lateral em grafite.
 *
 * Recolhido vira uma faixa só de ícones — num tablet em paisagem isso devolve
 * ~180px de largura para a agenda, que é onde a tela aperta.
 *
 * O topo mostra a barbearia (o tenant), não o produto: quem opera precisa
 * saber de qual loja é a agenda na tela. A marca Átrio fica no rodapé.
 */
@Component({
  selector: 'adm-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, AtrIcon],
  host: {
    class: 'on-ink flex h-full flex-col bg-ink text-ink-foreground',
  },
  template: `
    <!-- Identificação da barbearia -->
    <div class="flex items-center gap-3 px-4 py-5" [class.justify-center]="collapsed()">
      <span
        class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <atr-icon name="scissors" [size]="20" />
      </span>
      @if (!collapsed()) {
        <span class="min-w-0">
          <span class="block truncate font-bold">{{ tenant.name() || 'Barbearia' }}</span>
          <span class="block truncate text-xs text-ink-muted">Painel administrativo</span>
        </span>
      }
    </div>

    <!-- Navegação -->
    <nav class="flex-1 overflow-y-auto px-3 py-2" aria-label="Seções do painel">
      <ul class="flex flex-col gap-1">
        @for (item of navItems; track item.path) {
          <li>
            <a
              [routerLink]="item.path"
              routerLinkActive="bg-primary! text-primary-foreground!"
              class="flex min-h-11 items-center gap-3 rounded-full px-3 text-sm font-semibold
                     text-ink-muted transition-colors hover:bg-ink-elevated hover:text-ink-foreground"
              [class.justify-center]="collapsed()"
              [attr.title]="collapsed() ? item.label : null"
              (click)="navigated.emit()"
            >
              <atr-icon [name]="item.icon" [size]="20" />
              @if (!collapsed()) {
                <span class="truncate">{{ item.label }}</span>
              }
            </a>
          </li>
        }
      </ul>
    </nav>

    <!-- Rodapé: aviso de demonstração e assinatura do produto -->
    <div class="px-3 pb-4">
      @if (config.demoMode && !collapsed()) {
        <div class="mb-3 rounded-2xl bg-ink-elevated p-4">
          <span
            class="inline-flex h-6 items-center rounded-full bg-primary px-2.5 text-xs font-semibold text-primary-foreground"
          >
            Demonstração
          </span>
          <p class="mt-2 text-xs leading-relaxed text-ink-muted">
            Dados fictícios, salvos apenas neste dispositivo.
          </p>
        </div>
      }
      <p
        class="text-center text-xs text-ink-muted"
        [class.sr-only]="collapsed()"
      >
        {{ config.productName }}
      </p>
    </div>
  `,
})
export class Sidebar {
  protected readonly tenant = inject(TenantContext);
  protected readonly config = inject(ATRIO_CONFIG);
  protected readonly navItems = NAV_ITEMS;

  readonly collapsed = input(false);
  /** O shell escuta para fechar a gaveta no mobile depois de navegar. */
  readonly navigated = output<void>();
}
