import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ATRIO_ICONS, AtrioIconName } from './icon-set';

/**
 * Cache por nome: a marcação é constante de build, então sanitiza uma vez só
 * para o app inteiro em vez de uma vez por instância.
 */
const MARKUP_CACHE = new Map<AtrioIconName, SafeHtml>();

/**
 * Ícone do conjunto Lucide, embutido no bundle.
 *
 * `size` define width/height como atributo de apresentação — a menor
 * especificidade possível. Isso deixa qualquer classe de CSS (ex.: o
 * `[&_svg]:size-4` do botão) sobrescrever sem !important.
 *
 * Sem `label`, o ícone é decorativo e sai da árvore de acessibilidade.
 */
@Component({
  selector: 'atr-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'inline-flex shrink-0 items-center justify-center',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label()',
    '[attr.aria-hidden]': 'label() ? null : "true"',
  },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      [attr.width]="size()"
      [attr.height]="size()"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      [innerHTML]="markup()"
    ></svg>
  `,
})
export class AtrIcon {
  private readonly sanitizer = inject(DomSanitizer);

  readonly name = input.required<AtrioIconName>();
  readonly size = input(20);
  readonly strokeWidth = input(2);
  /** Preencha só quando o ícone carrega significado sozinho. */
  readonly label = input<string | null>(null);

  protected readonly markup = computed<SafeHtml>(() => {
    const name = this.name();
    let cached = MARKUP_CACHE.get(name);
    if (!cached) {
      // Conteúdo gerado em build a partir do lucide-static: origem confiável.
      cached = this.sanitizer.bypassSecurityTrustHtml(ATRIO_ICONS[name]);
      MARKUP_CACHE.set(name, cached);
    }
    return cached;
  });
}
