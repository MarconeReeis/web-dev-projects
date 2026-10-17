import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { PERIOD_LABEL, PeriodPreset } from '@atrio/data';
import { AtrIcon } from '@atrio/ui';

const PRESETS: readonly PeriodPreset[] = ['hoje', 'semana', 'mes'];

/**
 * Filtro de período em cápsulas.
 *
 * "Período personalizado" é um botão à parte porque abre um seletor de datas
 * em vez de aplicar um valor direto — misturar os dois comportamentos na
 * mesma fileira de pills confunde quem opera rápido.
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
        (click)="selectedChange.emit('personalizado')"
      >
        <atr-icon name="calendar-days" [size]="16" />
        {{ labels.personalizado }}
      </button>
    </div>
  `,
})
export class PeriodFilter {
  protected readonly presets = PRESETS;
  protected readonly labels = PERIOD_LABEL;

  readonly selected = input.required<PeriodPreset>();
  readonly selectedChange = output<PeriodPreset>();
}
