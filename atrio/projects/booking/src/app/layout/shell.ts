import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AtrAvatar, AtrIcon } from '@atrio/ui';
import { ClientSession } from '../shared/client-session';

/**
 * Moldura do app do cliente.
 *
 * Celular em pé é o dispositivo: conteúdo numa coluna estreita, centrada em
 * telas maiores. Barra inferior em vez de menu lateral porque o polegar
 * alcança a base da tela e não o topo.
 *
 * Três seções: Início (marcar), Meus horários (acompanhar) e Perfil (a
 * conta). A conta ganhou aba própria para "Sair" e "Excluir minha conta"
 * saírem de Meus horários, que é sobre horários.
 *
 * O topo é do Átrio — um produto só, o Átrio Agenda, com uma página por
 * barbearia. A barbearia aparece no conteúdo (o topo do Início), e o link
 * dela nunca mostra outra. O avatar à direita leva ao Perfil.
 */
@Component({
  selector: 'bkg-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, AtrAvatar, AtrIcon],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <!-- Moldura do Átrio: a marca do produto, discreta. A barbearia é o
         assunto de cada página (ver o topo do Início), não do cabeçalho. -->
    <header class="mx-auto w-full max-w-2xl px-5 pt-5">
      <div class="flex items-center gap-2.5">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          aria-hidden="true"
        >
          <atr-icon name="scissors" [size]="18" />
        </span>
        <p class="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight">
          Átrio <span class="font-medium text-muted-foreground">Agenda</span>
        </p>

        <a routerLink="./perfil" class="shrink-0 rounded-full" aria-label="Perfil">
          @if (session.signedIn()) {
            <atr-avatar [name]="session.name()" [photoUrl]="session.photoUrl()" />
          } @else {
            <span
              class="flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-card"
            >
              <atr-icon name="user-round" [size]="20" />
            </span>
          }
        </a>
      </div>
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-5 pt-5 pb-32">
      <router-outlet />
    </main>

    <!-- Barra inferior flutuante, grafite. A aba ativa cresce e vira um chip
         claro com o ícone num círculo da cor da barbearia; as outras ficam
         com ícone e rótulo, que com três seções é o que evita adivinhação.
         O padding de baixo respeita a barra de gestos do aparelho. -->
    <nav class="fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom)]" aria-label="Seções">
      <div class="mx-auto w-full max-w-md px-4 pb-4">
        <div class="floating flex items-center gap-1 rounded-full bg-ink p-1.5">
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              class="flex min-h-14 flex-col items-center justify-center gap-1 rounded-full text-xs font-semibold transition-all duration-300"
              [class]="
                isActive(item.section)
                  ? 'flex-[1.5] bg-card text-foreground'
                  : 'flex-1 text-ink-muted hover:text-ink-foreground'
              "
              [attr.aria-current]="isActive(item.section) ? 'page' : null"
            >
              @if (isActive(item.section)) {
                <span
                  class="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <atr-icon [name]="item.icon" [size]="16" />
                </span>
              } @else {
                <atr-icon [name]="item.icon" [size]="20" />
              }
              {{ item.label }}
            </a>
          }
        </div>
      </div>
    </nav>
  `,
})
export class Shell {
  protected readonly session = inject(ClientSession);

  private readonly router = inject(Router);

  protected readonly navItems = [
    { path: './', label: 'Início', icon: 'house' as const, section: 'inicio' as const },
    {
      path: './meus-horarios',
      label: 'Meus horários',
      icon: 'calendar-check' as const,
      section: 'horarios' as const,
    },
    { path: './perfil', label: 'Perfil', icon: 'user' as const, section: 'perfil' as const },
  ];

  /**
   * URL atual, como signal.
   *
   * `router.url` sozinho não é reativo, e `routerLinkActive` não dá conta
   * aqui: "./" em modo prefixo acende o Início em toda tela, e em modo exato
   * apaga em qualquer tela alcançada a partir dele — a barra fica sem item
   * ativo e parece morta. A regra é simples: fora de "Meus horários" e do Perfil, Início.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected isActive(section: 'inicio' | 'horarios' | 'perfil'): boolean {
    const url = this.url();
    const current = url.includes('/meus-horarios')
      ? 'horarios'
      : url.includes('/perfil')
        ? 'perfil'
        : 'inicio';
    return section === current;
  }
}
