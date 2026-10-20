import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TenantContext } from '@atrio/core';
import { AtrIcon } from '@atrio/ui';
import { PageHeader } from '../../shared/page-header';

export type LegalDocument = 'privacidade' | 'termos';

const TITLE: Readonly<Record<LegalDocument, string>> = {
  privacidade: 'Política de privacidade',
  termos: 'Termos de uso',
};

/**
 * Política de privacidade e Termos de uso.
 *
 * Os textos ainda não existem — são o item de LGPD do roadmap. Até lá a
 * página diz isso com todas as letras e aponta quem responde dúvidas: um
 * botão que abrisse uma página vazia pareceria app quebrado. Quando os
 * textos chegarem, entram aqui, no lugar do aviso.
 */
@Component({
  selector: 'bkg-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader, AtrIcon],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <bkg-page-header [heading]="title()" (back)="back()" />

    <main class="mx-auto w-full max-w-2xl flex-1 px-5 pt-4 pb-10">
      <section class="surface flex flex-col items-center border-transparent px-6 py-8 text-center">
        <span
          class="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
          aria-hidden="true"
        >
          <atr-icon name="file-text" [size]="26" />
        </span>
        <h2 class="mt-4 text-xl font-semibold">Documento em preparação</h2>
        <p class="mt-2 text-sm text-balance text-muted-foreground">
          Este documento está sendo finalizado e logo estará disponível aqui.
          @if (tenant.tenant()?.phone; as phone) {
            Dúvidas sobre os seus dados? Fale com a {{ tenant.name() }} pelo {{ phone }}.
          }
        </p>
      </section>
    </main>
  `,
})
export class LegalPage {
  /** Vem do `data` da rota. */
  readonly document = input.required<LegalDocument>();
  readonly slug = input<string>('');

  protected readonly tenant = inject(TenantContext);
  private readonly router = inject(Router);

  protected readonly title = computed(() => TITLE[this.document()]);

  protected back(): void {
    void this.router.navigate(['/b', this.slug(), 'perfil']);
  }
}
