import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PERIOD_LABEL, PeriodPreset } from '@atrio/data';
import { AtrIcon } from '@atrio/ui';

const PRESETS: readonly PeriodPreset[] = ['hoje', 'semana', 'mes'];

/**
 * Filtro de período em cápsulas.
 *
 * "Período personalizado" é um botão à parte porque abre um seletor de datas
 * em vez de aplicar um valor direto — misturar os dois comportamentos na
 * mesma fileira de pills confunde quem opera rápido. Por isso ele tem a sua
 * própria saída: a página decide como pedir as datas.
 *
 * Com um período escolhido, a cápsula passa a mostrá-lo ("01/10 a 15/10") em
 * vez do rótulo genérico. Sem isso o usuário perde de vista qual recorte está
 * olhando assim que o diálogo fecha.
 */
@Component({
  selector: 'adm-period-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'flex flex-wrap items-center gap-2' },
  template: `
    <div class="flex flex-wrap gap-2" role="group" aria-label="Período">
      @for (preset of presets; track preset) {
        <button
          type="button"
          class="pill"
          [attr.data-active]="selected() === preset"
          [attr.aria-pressed]="selected() === preset"
          (click)="selectedChange.emit(preset)"
        >
          {{ labels[preset] }}
        </button>
      }
      <button
        type="button"
        class="pill"
        [attr.data-active]="selected() === 'personalizado'"
        [attr.aria-pressed]="selected() === 'personalizado'"
        (click)="customRequested.emit()"
      >
        <atr-icon name="calendar-days" [size]="16" />
        {{ customLabel() ?? labels.personalizado }}
      </button>
    </div>
  `,
})
export class PeriodFilter {
  protected readonly presets = PRESETS;
  protected readonly labels = PERIOD_LABEL;

  readonly selected = input.required<PeriodPreset>();
  /** "01/10 a 15/10" quando já há um período escolhido. */
  readonly customLabel = input<string | null>(null);

  readonly selectedChange = output<PeriodPreset>();
  readonly customRequested = output<void>();
}
