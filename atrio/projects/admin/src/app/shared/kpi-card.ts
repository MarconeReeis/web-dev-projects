import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AtrIcon, AtrioIconName } from '@atrio/ui';

/**
 * `plain` é o padrão; `soft` e `ink` marcam hierarquia.
 *
 * Um de cada por linha, no máximo: o destaque só funciona por contraste com
 * os vizinhos, e três cards realçados não realçam nada.
 */
export type KpiTone = 'plain' | 'soft' | 'ink';

const SURFACE: Readonly<Record<KpiTone, string>> = {
  plain: 'surface',
  soft: 'surface border-transparent bg-primary-soft',
  ink: 'surface border-transparent bg-ink text-ink-foreground',
};

const LABEL: Readonly<Record<KpiTone, string>> = {
  plain: 'text-muted-foreground',
  soft: 'text-primary-soft-foreground',
  ink: 'text-ink-muted',
};

const VALUE: Readonly<Record<KpiTone, string>> = {
  plain: '',
  soft: 'text-primary-soft-foreground',
  ink: 'text-ink-foreground',
};

const BADGE: Readonly<Record<KpiTone, string>> = {
  plain: 'bg-secondary text-muted-foreground',
  soft: 'bg-primary text-primary-foreground',
  ink: 'bg-ink-elevated text-ink-foreground',
};

/**
 * Indicador numérico.
 *
 * Sem percentual de crescimento e sem gráfico de fundo: a barbearia tem
 * volume baixo e variação diária alta, então "+12% vs. ontem" seria ruído com
 * aparência de informação.
 */
@Component({
  selector: 'adm-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'block' },
  template: `
    <div class="flex h-full flex-col gap-6 p-5" [class]="surfaceClass()">
      <div class="flex items-start justify-between gap-3">
        <span class="text-sm font-medium" [class]="labelClass()">{{ label() }}</span>
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full"
          [class]="badgeClass()"
        >
          <atr-icon [name]="icon()" [size]="18" />
        </span>
      </div>

      <div class="mt-auto">
        <p
          class="tabular text-3xl font-extrabold tracking-tight"
          [class]="valueClass()"
        >
          {{ value() }}
        </p>
        @if (hint()) {
          <p class="mt-1 text-sm" [class]="labelClass()">{{ hint() }}</p>
        }
      </div>
    </div>
  `,
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly icon = input.required<AtrioIconName>();
  readonly hint = input<string | null>(null);
  readonly tone = input<KpiTone>('plain');

  protected readonly surfaceClass = computed(() => SURFACE[this.tone()]);
  protected readonly labelClass = computed(() => LABEL[this.tone()]);
  protected readonly valueClass = computed(() => VALUE[this.tone()]);
  protected readonly badgeClass = computed(() => BADGE[this.tone()]);
}
