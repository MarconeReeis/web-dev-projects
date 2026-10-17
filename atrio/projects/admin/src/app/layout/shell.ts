import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/**
 * Moldura do painel: menu lateral fixo + conteúdo rolável.
 *
 * Dois comportamentos de menu, decididos pela largura:
 *
 *  - a partir de lg (tablet em paisagem, o dispositivo principal): coluna
 *    fixa, que pode ser recolhida para só ícones;
 *  - abaixo disso: gaveta sobre o conteúdo, aberta pelo cabeçalho.
 *
 * O estado de recolhido fica no localStorage porque o tablet da barbearia é
 * sempre o mesmo aparelho e a preferência é de quem opera o balcão.
 */
@Component({
  selector: 'adm-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, Sidebar, Topbar],
  host: { class: 'flex h-dvh w-full overflow-hidden bg-background' },
  template: `
    <!-- Menu em telas grandes -->
    <aside
      class="hidden shrink-0 transition-[width] duration-200 lg:block"
      [style.width.px]="collapsed() ? 76 : 252"
    >
      <adm-sidebar [collapsed]="collapsed()" />
    </aside>

    <!-- Gaveta em telas pequenas -->
    @if (drawerOpen()) {
      <div
        class="fixed inset-0 z-40 bg-ink/50 lg:hidden"
        (click)="closeDrawer()"
        aria-hidden="true"
      ></div>
      <aside class="fixed inset-y-0 left-0 z-50 w-64 shadow-pop lg:hidden">
        <adm-sidebar (navigated)="closeDrawer()" />
      </aside>
    }

    <div class="flex min-w-0 flex-1 flex-col">
      <adm-topbar [collapsed]="collapsed()" (toggleMenu)="toggleMenu()" />

      <main class="flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  private static readonly STORAGE_KEY = 'atrio.admin.sidebar-collapsed';

  protected readonly collapsed = signal(Shell.readCollapsed());
  protected readonly drawerOpen = signal(false);

  /** O mesmo botão recolhe em tela grande e abre a gaveta em tela pequena. */
  protected toggleMenu(): void {
    if (window.matchMedia('(min-width: 1024px)').matches) {
      this.collapsed.update((value) => {
        Shell.writeCollapsed(!value);
        return !value;
      });
    } else {
      this.drawerOpen.update((open) => !open);
    }
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closeDrawer();
  }

  private static readCollapsed(): boolean {
    try {
      return localStorage.getItem(Shell.STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private static writeCollapsed(value: boolean): void {
    try {
      localStorage.setItem(Shell.STORAGE_KEY, String(value));
    } catch {
      // Armazenamento bloqueado: a preferência vale só para esta sessão.
    }
  }
}
