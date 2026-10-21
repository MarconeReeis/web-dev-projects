import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { TenantContext } from '@atrio/core';
import { TERMS_VERSION } from '@atrio/data';
import { PageHeader } from '../../shared/page-header';
import { LegalSection, privacyPolicy, termsOfUse } from './legal-texts';

export type LegalDocument = 'privacidade' | 'termos';

const TITLE: Readonly<Record<LegalDocument, string>> = {
  privacidade: 'Política de privacidade',
  termos: 'Termos de uso',
};

/**
 * Política de privacidade e Termos de uso — os mesmos que a pessoa aceita
 * ao criar a conta, na versão em vigor (TERMS_VERSION).
 *
 * Abre do Perfil e, numa aba nova, do cadastro. Na aba nova não há para
 * onde voltar, então o "voltar" leva à página da barbearia.
 */
@Component({
  selector: 'bkg-legal-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeader],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <bkg-page-header [heading]="title()" (back)="back()" />

    <main class="mx-auto w-full max-w-2xl flex-1 px-5 pt-4 pb-10">
      <p class="text-sm text-muted-foreground">Versão de {{ version }}</p>

      @for (section of sections(); track section.title) {
        <section class="mt-6">
          <h2 class="text-base font-bold">{{ section.title }}</h2>
          @for (paragraph of section.paragraphs; track $index) {
            <p class="mt-2 text-sm leading-relaxed text-muted-foreground">{{ paragraph }}</p>
          }
          @if (section.items; as items) {
            <ul class="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
              @for (item of items; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          }
        </section>
      }
    </main>
  `,
})
export class LegalPage {
  /** Vem do `data` da rota. */
  readonly document = input.required<LegalDocument>();
  readonly slug = input<string>('');

  private readonly tenant = inject(TenantContext);
  private readonly router = inject(Router);

  protected readonly title = computed(() => TITLE[this.document()]);

  /** 2026-10-21 → 21/10/2026. */
  protected readonly version = TERMS_VERSION.split('-').reverse().join('/');

  protected readonly sections = computed<readonly LegalSection[]>(() => {
    const shop = this.tenant.name() || 'barbearia';
    return this.document() === 'privacidade' ? privacyPolicy(shop) : termsOfUse(shop);
  });

  protected back(): void {
    // Veio do Perfil: volta para ele. Abriu sozinha (aba nova do cadastro):
    // vai para a página da barbearia.
    const cameFromApp = !!this.router.lastSuccessfulNavigation()?.previousNavigation;
    void this.router.navigate(cameFromApp ? ['/', this.slug(), 'perfil'] : ['/', this.slug()]);
  }
}
