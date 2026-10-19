import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { TenantContext } from '@atrio/core';
import { AtrAvatar, AtrIcon } from '@atrio/ui';
import { ClientSession } from '../shared/client-session';

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
  imports: [RouterOutlet, RouterLink, AtrAvatar, AtrIcon],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <header class="mx-auto w-full max-w-2xl px-4 pt-5">
      <div class="flex items-center gap-3">
        @if (session.signedIn()) {
          <atr-avatar [name]="session.name()" [photoUrl]="session.photoUrl()" size="lg" />
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

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 pt-5 pb-32">
      <router-outlet />
    </main>

    <!-- Barra inferior flutuante.
         Sem linha de separação: a cápsula já se destaca por sombra, e a linha
         cortava a tela em duas. O padding de baixo respeita a barra de gestos
         do aparelho; sem ele a cápsula encosta no indicador do iPhone.

         Só o item ativo mostra o rótulo. Com dois itens, ícone sozinho seria
         ambíguo — um calendário pode ser qualquer coisa —, e exibir os dois
         rótulos o tempo todo engorda a barra sem informar nada novo. -->
    <nav class="fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]" aria-label="Seções">
      <div class="mx-auto w-full max-w-2xl px-4 pb-4">
        <div class="floating flex items-center gap-1 rounded-full bg-card p-1.5">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              class="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors"
              [class]="
                isActive(item.section)
                  ? 'bg-primary-soft text-primary-soft-foreground'
                  : 'text-muted-foreground'
              "
              [attr.aria-current]="isActive(item.section) ? 'page' : null"
            >
              <atr-icon [name]="item.icon" [size]="20" />
              @if (isActive(item.section)) {
                {{ item.label }}
              }
            </a>
          }
        </div>
      </div>
    </nav>
  `,
})
export class Shell {
  protected readonly tenant = inject(TenantContext);
  protected readonly session = inject(ClientSession);

  private readonly router = inject(Router);

  protected readonly navItems = [
    { path: './', label: 'Início', icon: 'store' as const, section: 'inicio' as const },
    {
      path: './meus-horarios',
      label: 'Meus horários',
      icon: 'calendar-days' as const,
      section: 'horarios' as const,
    },
  ];

  /**
   * URL atual, como signal.
   *
   * `router.url` sozinho não é reativo, e `routerLinkActive` não dá conta
   * aqui: "./" em modo prefixo acende o Início em toda tela, e em modo exato
   * apaga em qualquer tela alcançada a partir dele — a barra fica sem item
   * ativo e parece morta. A regra é simples: fora de "Meus horários", Início.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected isActive(section: 'inicio' | 'horarios'): boolean {
    const onSchedule = this.url().includes('/meus-horarios');
    return section === 'horarios' ? onSchedule : !onSchedule;
  }

  protected readonly period = computed(() => {
    const hour = new Date().getHours();
    return hour < 12 ? 'Bom dia!' : hour < 18 ? 'Boa tarde!' : 'Boa noite!';
  });

  /**
   * Quem está usando o app.
   *
   * Com sessão, o nome da conta. Sem, uma saudação genérica — melhor do que
   * um campo vazio ou um "visitante", que soa a cadastro faltando.
   */
  protected readonly who = computed(() => this.session.name() || 'Olá!');
}
