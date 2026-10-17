import { Signal, computed, signal } from '@angular/core';
import { DateRange, PeriodPreset, formatShortDate, rangeFor } from '@atrio/data';

/**
 * Estado do filtro de período, compartilhado pela Dashboard e pelo Financeiro.
 *
 * Existe porque as duas telas precisam da mesma combinação — preset, intervalo
 * personalizado, intervalo efetivo e rótulo — e duplicar isso significaria
 * duas chances de a regra do fim exclusivo divergir entre elas.
 *
 * Não é serviço injetável: cada tela tem o seu próprio período, e um singleton
 * faria o filtro do Financeiro mexer no da Dashboard.
 */
export class PeriodSelection {
  private readonly presetValue = signal<PeriodPreset>('hoje');
  private readonly customValue = signal<DateRange | null>(null);

  readonly preset: Signal<PeriodPreset> = this.presetValue.asReadonly();

  /** Intervalo efetivo, já resolvido. Fim exclusivo. */
  readonly range: Signal<DateRange> = computed(() => {
    const custom = this.customValue();
    if (this.presetValue() === 'personalizado' && custom) return custom;
    return rangeFor(this.presetValue());
  });

  /** "01/10 a 15/10", ou nulo quando não há período personalizado escolhido. */
  readonly customLabel: Signal<string | null> = computed(() => {
    const custom = this.customValue();
    if (!custom) return null;

    // O fim é exclusivo; o rótulo mostra o último dia que entra no período.
    const lastDay = new Date(new Date(custom.to).getTime() - 1);
    return `${formatShortDate(custom.from)} a ${formatShortDate(lastDay)}`;
  });

  constructor(initial: PeriodPreset = 'hoje') {
    this.presetValue.set(initial);
  }

  select(preset: PeriodPreset): void {
    this.presetValue.set(preset);
  }

  applyCustom(range: DateRange): void {
    this.customValue.set(range);
    this.presetValue.set('personalizado');
  }

  /** Datas sugeridas ao abrir o seletor: o período atual. */
  suggestion(): { from: Date; to: Date } {
    const current = this.range();
    return {
      from: new Date(current.from),
      to: new Date(new Date(current.to).getTime() - 1),
    };
  }
}
