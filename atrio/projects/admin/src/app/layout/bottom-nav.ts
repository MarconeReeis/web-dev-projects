import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AtrIcon, AtrioIconName } from '@atrio/ui';

interface PhoneTab {
  readonly label: string;
  readonly path: string;
  readonly icon: AtrioIconName;
}

/**
 * As quatro abas do painel no celular. O que se faz de pé, entre um cliente
 * e outro: ver o dia, olhar a semana, ajustar horários e folgas — e, em
 * "Mais", o resto.
 */
const TABS: readonly PhoneTab[] = [
  { label: 'Hoje', path: '/hoje', icon: 'calendar-check' },
  { label: 'Agenda', path: '/dias', icon: 'calendar-days' },
  { label: 'Horários', path: '/profissionais', icon: 'clock' },
  { label: 'Mais', path: '/mais', icon: 'menu' },
];

@Component({
  selector: 'adm-bottom-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, AtrIcon],
  host: {
    class: 'fixed inset-x-0 bottom-0 z-30 block border-t border-border bg-card pb-[env(safe-area-inset-bottom)]',
  },
  template: `
    <nav class="mx-auto flex max-w-lg items-stretch" aria-label="Seções do painel">
      @for (tab of tabs; track tab.path) {
        <a
          [routerLink]="tab.path"
          routerLinkActive
          #active="routerLinkActive"
          class="group flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors"
          [class]="active.isActive ? 'text-primary' : 'text-muted-foreground'"
          [attr.aria-current]="active.isActive ? 'page' : null"
        >
          <span
            class="flex h-8 w-14 items-center justify-center rounded-full transition-colors"
            [class.bg-primary-soft]="active.isActive"
          >
            <atr-icon [name]="tab.icon" [size]="20" />
          </span>
          {{ tab.label }}
        </a>
      }
    </nav>
  `,
})
export class BottomNav {
  protected readonly tabs = TABS;
}
