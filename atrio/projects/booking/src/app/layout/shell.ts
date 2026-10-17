import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TenantContext } from '@atrio/core';
import { AtrAvatar, AtrIcon } from '@atrio/ui';
import { ClientIdentity } from '../shared/client-identity';

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
 *
 * O cabeçalho não tem borda nem fundo próprio: ele se dissolve no conteúdo,
 * como nas referências. Uma linha separando saudação de conteúdo dividiria a
 * tela em duas sem que haja duas coisas.
 */
@Component({
  selector: 'bkg-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AtrAvatar, AtrIcon],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <header class="mx-auto w-full max-w-2xl px-4 pt-5">
      <div class="flex items-center gap-3">
        @if (identity.known() && identity.name()) {
          <atr-avatar [name]="identity.name()" size="lg" />
        } @else {
          <span
            class="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
          >
            <atr-icon name="user-round" [size]="22" />
          </span>
        }

        <div class="min-w-0 flex-1">
          <p class="text-sm text-muted-foreground">{{ period() }}</p>
          <p class="truncate text-lg font-bold">{{ who() }}</p>
        </div>

        <!-- A marca da barbearia, sempre visível. Não é botão: é assinatura. -->
        @if (tenant.branding()?.logoUrl; as logo) {
          <img [src]="logo" [alt]="tenant.name()" class="size-11 rounded-full object-cover" />
        } @else {
          <span
            class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            [attr.aria-label]="tenant.name()"
          >
            <atr-icon name="scissors" [size]="20" />
          </span>
        }
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
  protected readonly identity = inject(ClientIdentity);

  protected readonly navItems = [
    { path: './', label: 'Início', icon: 'store' as const, exact: true },
    {
      path: './meus-horarios',
      label: 'Meus horários',
      icon: 'calendar-days' as const,
      exact: false,
    },
  ];

  protected readonly period = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bom dia!' : hour < 18 ? 'Boa tarde!' : 'Boa noite!';
  });

  /**
   * Quem está usando o app.
   *
   * Enquanto não há autenticação, o nome vem do último agendamento feito
   * neste aparelho. Sem nome, uma saudação genérica — melhor do que um campo
   * vazio ou um "visitante", que soa a cadastro faltando.
   */
  protected readonly who = computed(() => this.identity.name() || 'Olá!');
}
