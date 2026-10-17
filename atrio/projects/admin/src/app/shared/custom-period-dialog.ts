import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DateRange, customRange } from '@atrio/data';
import { AtrButton, AtrField, AtrInput, AtrSurfaceShell } from '@atrio/ui';
import { toDateInputValue } from './date-input';

export interface CustomPeriodData {
  readonly from: Date;
  readonly to: Date;
}

/** Além de um ano o relatório deixa de ser útil e a consulta fica cara. */
const MAX_SPAN_DAYS = 366;

/**
 * Escolha de período personalizado.
 *
 * Existia na referência como um botão que não abria nada — tanto aqui quanto
 * na Dashboard, onde selecionar "Período personalizado" silenciosamente caía
 * no dia de hoje. Agora ele pergunta as duas datas.
 *
 * O intervalo devolvido inclui o dia final inteiro: quem escolhe 1 a 31 espera
 * o mês fechado, não até a meia-noite do dia 31.
 */
@Component({
  selector: 'adm-custom-period-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrInput],
  template: `
    <atr-surface-shell
      heading="Período personalizado"
      description="As duas datas entram no período."
      (closed)="close()"
    >
      <div class="grid grid-cols-2 gap-4">
        <atr-field label="De">
          <input atrInput type="date" [value]="from()" (change)="from.set($any($event.target).value)" />
        </atr-field>
        <atr-field label="Até" [error]="error()">
          <input
            atrInput
            type="date"
            [invalid]="!!error()"
            [value]="to()"
            (change)="to.set($any($event.target).value)"
          />
        </atr-field>
      </div>

      <div shell-footer class="flex w-full justify-end gap-2">
        <button type="button" atrButton="ghost" (click)="close()">Cancelar</button>
        <button type="button" atrButton [disabled]="!!error()" (click)="confirm()">
          Aplicar período
        </button>
      </div>
    </atr-surface-shell>
  `,
})
export class CustomPeriodDialog {
  private readonly ref = inject<DialogRef<DateRange | null, CustomPeriodDialog>>(DialogRef);
  private readonly data = inject<CustomPeriodData>(DIALOG_DATA);

  protected readonly from = signal(toDateInputValue(this.data.from));
  protected readonly to = signal(toDateInputValue(this.data.to));

  protected readonly error = computed(() => {
    const from = this.from();
    const to = this.to();
    if (!from || !to) return 'Informe as duas datas.';
    if (to < from) return 'A data final precisa ser igual ou posterior à inicial.';

    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days > MAX_SPAN_DAYS) return 'Período máximo de um ano.';

    return null;
  });

  protected close(): void {
    this.ref.close(null);
  }

  protected confirm(): void {
    if (this.error()) return;
    this.ref.close(customRange(this.from(), this.to()));
  }
}
