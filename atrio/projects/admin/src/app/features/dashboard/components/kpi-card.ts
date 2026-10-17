import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AtrIcon, AtrioIconName } from '@atrio/ui';

/**
 * Indicador da primeira linha da Dashboard.
 *
 * Sem percentual de crescimento e sem gráfico de fundo: a barbearia tem
 * volume baixo e variação diária alta, então "+12% vs. ontem" seria ruído com
 * aparência de informação.
 *
 * `highlight` pinta o card de lilás — exatamente um por linha, para dar o
 * ponto de entrada visual. Mais de um e a hierarquia some.
 */
@Component({
  selector: 'adm-kpi-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'block' },
  template: `
    <div
      class="surface flex h-full flex-col gap-6 p-5"
      [class.bg-primary-soft]="highlight()"
      [class.border-transparent]="highlight()"
    >
      <div class="flex items-start justify-between gap-3">
        <span
          class="text-sm font-medium"
          [class]="highlight() ? 'text-primary-soft-foreground' : 'text-muted-foreground'"
        >
          {{ label() }}
        </span>
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full"
          [class]="
            highlight()
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground'
          "
        >
          <atr-icon [name]="icon()" [size]="18" />
        </span>
      </div>

      <div class="mt-auto">
        <p
          class="tabular text-3xl font-extrabold tracking-tight"
          [class.text-primary-soft-foreground]="highlight()"
        >
          {{ value() }}
        </p>
        @if (hint()) {
          <p class="mt-1 text-sm text-muted-foreground">{{ hint() }}</p>
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
  readonly highlight = input(false);
}
