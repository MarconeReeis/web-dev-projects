import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TenantContext } from '@atrio/core';
import { AtrIcon } from '@atrio/ui';

/**
 * Moldura do app do cliente.
 *
 * Celular em pé é o dispositivo: conteúdo numa coluna estreita, centrada em
 * telas maiores. Barra inferior em vez de menu lateral porque o polegar
 * alcança a base da tela e não o topo.
 *
 * Só duas seções. Um app de barbearia tem exatamente dois assuntos — marcar e
 * acompanhar —, e uma barra com cinco ícones (como nas referências de
 * e-commerce) inventaria seções para preencher.
 */
@Component({
  selector: 'bkg-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AtrIcon],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <header
      class="sticky top-0 z-20 border-b border-border bg-card/90 backdrop-blur-sm"
    >
      <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        @if (tenant.branding()?.logoUrl; as logo) {
          <img [src]="logo" alt="" class="size-10 rounded-full object-cover" />
        } @else {
          <span
            class="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <atr-icon name="scissors" [size]="18" />
          </span>
        }
        <span class="min-w-0 flex-1 truncate font-bold">{{ tenant.name() }}</span>
      </div>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-28">
      <router-outlet />
    </main>

    <!-- Barra inferior. O padding de baixo respeita a barra de gestos do
         aparelho; sem ele o último item fica sob o indicador do iPhone. -->
    <nav
      class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]"
      aria-label="Seções"
    >
      <div class="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2">
        @for (item of navItems; track item.path) {
          <a
            [routerLink]="item.path"
            [routerLinkActiveOptions]="{ exact: item.exact }"
            routerLinkActive="bg-primary-soft! text-primary-soft-foreground!"
            class="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold text-muted-foreground transition-colors"
          >
            <atr-icon [name]="item.icon" [size]="20" />
            {{ item.label }}
          </a>
        }
      </div>
    </nav>
  `,
})
export class Shell {
  protected readonly tenant = inject(TenantContext);

  protected readonly navItems = [
    { path: './', label: 'Início', icon: 'store' as const, exact: true },
    {
      path: './meus-horarios',
      label: 'Meus horários',
      icon: 'calendar-days' as const,
      exact: false,
    },
  ];
}
