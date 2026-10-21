import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TenantContext } from '@atrio/core';
import { PLAN_LABEL, StaffAuth } from '@atrio/data';
import { AtrButton, AtrIcon, AtrioIconName } from '@atrio/ui';
import { environment } from '../../../environments/environment';

interface MoreLink {
  readonly label: string;
  readonly hint: string;
  readonly path: string;
  readonly icon: AtrioIconName;
}

/**
 * "Mais", no painel de celular: o que não cabe nas três abas do dia a dia —
 * catálogo, caixa, resumo, configurações — e o link da página da barbearia,
 * para mandar ao cliente pelo WhatsApp.
 */
@Component({
  selector: 'adm-more-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrButton, AtrIcon],
  host: { class: 'block' },
  template: `
    <h1 class="text-2xl font-bold tracking-tight">{{ tenant.name() }}</h1>
    @if (tenant.tenant(); as current) {
      <p class="text-sm text-muted-foreground">Plano {{ planLabel[current.plan] }}</p>
    }

    <!-- A página da barbearia: o link que ela divulga. -->
    @if (pageUrl(); as url) {
      <section class="surface mt-5 p-4">
        <p class="text-sm font-bold">Minha página de agendamento</p>
        <p class="mt-1 truncate text-sm text-muted-foreground">{{ url }}</p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button type="button" atrButton="outline" (click)="copy(url)">
            <atr-icon [name]="copied() ? 'check' : 'download'" [size]="16" />
            {{ copied() ? 'Copiado' : 'Copiar link' }}
          </button>
          <a atrButton="soft" [href]="url" target="_blank" rel="noopener">
            <atr-icon name="arrow-up-right" [size]="16" />
            Abrir
          </a>
        </div>
      </section>
    }

    <ul class="surface mt-4 divide-y divide-border overflow-hidden">
      @for (link of links; track link.path) {
        <li>
          <a [routerLink]="link.path" class="flex min-h-16 items-center gap-3 px-4 transition-colors hover:bg-accent">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary">
              <atr-icon [name]="link.icon" [size]="18" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold">{{ link.label }}</span>
              <span class="block truncate text-sm text-muted-foreground">{{ link.hint }}</span>
            </span>
            <atr-icon name="chevron-right" [size]="18" class="shrink-0 text-muted-foreground" />
          </a>
        </li>
      }
    </ul>

    <button
      type="button"
      atrButton="outline"
      size="lg"
      class="mt-4 w-full text-destructive!"
      [disabled]="signingOut()"
      (click)="signOut()"
    >
      <atr-icon name="log-out" [size]="18" />
      {{ signingOut() ? 'Saindo…' : 'Sair' }}
    </button>
  `,
})
export class MorePage {
  protected readonly tenant = inject(TenantContext);
  private readonly auth = inject(StaffAuth);

  protected readonly planLabel = PLAN_LABEL;
  protected readonly copied = signal(false);
  protected readonly signingOut = signal(false);

  protected readonly links: readonly MoreLink[] = [
    { label: 'Serviços e preços', hint: 'O que a barbearia oferece', path: '/servicos', icon: 'scissors' },
    { label: 'Caixa', hint: 'O que entrou e o que está pendente', path: '/financeiro', icon: 'wallet' },
    { label: 'Resumo', hint: 'O dia e o período em números', path: '/dashboard', icon: 'layout-dashboard' },
    { label: 'Configurações', hint: 'Barbearia, confirmação, avisos e PIN', path: '/configuracoes', icon: 'settings' },
  ];

  protected readonly pageUrl = computed(() => {
    const slug = this.tenant.tenant()?.slug;
    return slug ? `${environment.bookingUrl}/${slug}` : null;
  });

  protected async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o link continua à mostra.
    }
  }

  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      // A volta à tela de entrar é do shell, que reage ao fim da sessão.
      await this.auth.signOut();
    } finally {
      this.signingOut.set(false);
    }
  }
}
