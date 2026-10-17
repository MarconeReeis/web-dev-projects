import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AtrCard, AtrEmptyState, AtrPageHeading } from '@atrio/ui';

@Component({
  selector: 'adm-finance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrPageHeading, AtrCard, AtrEmptyState],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Financeiro"
      description="Recebimentos, despesas e saldo do período."
    />
    <atr-card class="mt-6">
      <atr-empty-state
        icon="wallet"
        heading="Financeiro em construção"
        description="Filtros por período, cards de resumo, lista de movimentações, registro de pagamento e cadastro de despesas."
      />
    </atr-card>
  `,
})
export class FinancePage {}
