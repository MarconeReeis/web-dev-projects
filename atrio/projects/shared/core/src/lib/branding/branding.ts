import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Branding } from '@atrio/data';
import { deriveBrandScale } from './oklch';

/**
 * Aplica a identidade visual da barbearia — SÓ no app do cliente.
 *
 * O admin é um produto único com a marca Átrio; quem muda de cara conforme o
 * tenant é a vitrine que o cliente final vê. Por isso este serviço é usado
 * pelo `booking` e não pelo `admin`.
 *
 * Funciona sobrescrevendo as primitivas `--atr-brand-*` no :root. Toda a
 * camada semântica (`--primary`, `--accent`, `--ring`...) aponta para elas, e
 * os componentes usam só a camada semântica — ninguém precisa saber que houve
 * personalização.
 */
@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly document = inject(DOCUMENT);

  private static readonly VARS = [
    '--atr-brand',
    '--atr-brand-strong',
    '--atr-brand-deep',
    '--atr-brand-soft',
    '--atr-brand-contrast',
  ] as const;

  apply(branding: Branding | null): void {
    const root = this.document.documentElement;

    if (!branding?.primaryColor) {
      this.reset();
      return;
    }

    const scale = deriveBrandScale(branding.primaryColor);
    if (!scale) {
      // Cor inválida no cadastro não derruba o app: fica no roxo padrão.
      this.reset();
      return;
    }

    root.style.setProperty('--atr-brand', scale.brand);
    root.style.setProperty('--atr-brand-strong', scale.strong);
    root.style.setProperty('--atr-brand-deep', scale.deep);
    root.style.setProperty('--atr-brand-soft', scale.soft);
    root.style.setProperty('--atr-brand-contrast', scale.contrast);

    this.setThemeColor(branding.primaryColor);
  }

  reset(): void {
    const root = this.document.documentElement;
    for (const variable of BrandingService.VARS) {
      root.style.removeProperty(variable);
    }
  }

  /** Cor da barra do sistema quando o PWA está instalado. */
  private setThemeColor(hex: string): void {
    const meta = this.document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    meta?.setAttribute('content', hex);
  }
}
