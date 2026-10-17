import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Id, Professional } from '@atrio/data';
import { AtrIcon } from '@atrio/ui';

/**
 * Filtro de profissional.
 *
 * `<select>` nativo, e não um dropdown próprio: num tablet o seletor do
 * sistema é mais rápido de usar com o dedo, funciona com leitor de tela sem
 * trabalho extra e não precisa de código para fechar ao tocar fora.
 * A cápsula é só a casca visual.
 */
@Component({
  selector: 'adm-professional-filter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrIcon],
  host: { class: 'relative inline-flex' },
  template: `
    <select
      class="pill min-w-[220px] appearance-none pr-11 text-left"
      [value]="selected() ?? ''"
      aria-label="Filtrar por profissional"
      (change)="onChange($event)"
    >
      <option value="">Todos os profissionais</option>
      @for (professional of professionals(); track professional.id) {
        <option [value]="professional.id">{{ professional.name }}</option>
      }
    </select>
    <atr-icon
      name="chevron-down"
      [size]="16"
      class="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground"
    />
  `,
})
export class ProfessionalFilter {
  readonly professionals = input.required<readonly Professional[]>();
  readonly selected = input<Id | null>(null);
  readonly selectedChange = output<Id | null>();

  protected onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedChange.emit(value || null);
  }
}
