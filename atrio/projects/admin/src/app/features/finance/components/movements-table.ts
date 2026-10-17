import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  Appointment,
  EXPENSE_CATEGORY_LABEL,
  FinanceEntry,
  PAYMENT_METHOD_LABEL,
  Professional,
  formatMoney,
  formatShortDate,
} from '@atrio/data';
import { AtrBadge, AtrButton, AtrEmptyState, AtrIcon } from '@atrio/ui';

export type MovementTab = 'todos' | 'recebimentos' | 'pendentes' | 'despesas';

export const MOVEMENT_TABS: readonly { id: MovementTab; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'recebimentos', label: 'Recebimentos' },
  { id: 'pendentes', label: 'Pendentes' },
  { id: 'despesas', label: 'Despesas' },
];

/**
 * Lista de movimentações do período.
 *
 * "Pendentes" é separado de propósito e NÃO é uma movimentação: enquanto o
 * pagamento não é registrado, não houve dinheiro e não existe lançamento. A
 * aba existe porque é trabalho de balcão — o que falta cobrar —, mas quando
 * está ativa a tabela troca de cabeçalho, perde a coluna "Forma" (não há
 * forma de pagamento ainda) e ganha a ação de registrar o pagamento. Misturar
 * as duas coisas na mesma lista convidaria a somar pendência com recebimento.
 */
@Component({
  selector: 'adm-movements-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrBadge, AtrButton, AtrIcon, AtrEmptyState],
  host: { class: 'block' },
  template: `
    @if (tab() === 'pendentes') {
      @if (pending().length === 0) {
        <atr-empty-state
          icon="circle-check-big"
          heading="Nada a receber no período"
          description="Todos os atendimentos concluídos já foram pagos."
        />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full min-w-[46rem] border-collapse text-sm">
            <caption class="sr-only">
              Atendimentos concluídos aguardando pagamento
            </caption>
            <thead>
              <tr class="border-b border-border text-left text-muted-foreground">
                <th scope="col" class="px-2 pb-3 font-medium">Atendimento</th>
                <th scope="col" class="px-2 pb-3 font-medium">Data</th>
                <th scope="col" class="px-2 pb-3 font-medium">Situação</th>
                <th scope="col" class="px-2 pb-3 text-right font-medium">Valor</th>
                <th scope="col" class="px-2 pb-3 text-right font-medium">
                  <span class="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              @for (appointment of pending(); track appointment.id) {
                <tr class="border-b border-border last:border-0">
                  <td class="px-2 py-3.5">
                    <span class="block font-semibold">
                      {{ appointment.serviceName }} · {{ appointment.client.name }}
                    </span>
                    <span class="block text-muted-foreground">
                      {{ professionalName(appointment.professionalId) }}
                    </span>
                  </td>
                  <td class="tabular px-2 py-3.5 text-muted-foreground">
                    {{ date(appointment.startsAt) }}
                  </td>
                  <td class="px-2 py-3.5">
                    <atr-badge tone="warning">Aguardando pagamento</atr-badge>
                  </td>
                  <td class="tabular px-2 py-3.5 text-right font-bold">
                    {{ money(appointment.price) }}
                  </td>
                  <td class="px-2 py-3.5 text-right">
                    <button
                      type="button"
                      atrButton="soft"
                      size="sm"
                      (click)="paymentRequested.emit(appointment)"
                    >
                      <atr-icon name="credit-card" [size]="15" />
                      Registrar
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else if (entries().length === 0) {
      <atr-empty-state
        icon="wallet"
        heading="Nenhuma movimentação no período"
        description="Recebimentos aparecem aqui quando o pagamento é registrado; despesas, quando lançadas."
      />
    } @else {
      <div class="overflow-x-auto">
        <table class="w-full min-w-[46rem] border-collapse text-sm">
          <caption class="sr-only">
            Recebimentos e despesas do período
          </caption>
          <thead>
            <tr class="border-b border-border text-left text-muted-foreground">
              <th scope="col" class="px-2 pb-3 font-medium">Descrição</th>
              <th scope="col" class="px-2 pb-3 font-medium">Data</th>
              <th scope="col" class="px-2 pb-3 font-medium">Forma</th>
              <th scope="col" class="px-2 pb-3 font-medium">Situação</th>
              <th scope="col" class="px-2 pb-3 text-right font-medium">Valor</th>
              <th scope="col" class="px-2 pb-3 text-right font-medium">
                <span class="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (entry of entries(); track entry.id) {
              <tr class="border-b border-border last:border-0">
                <td class="px-2 py-3.5">
                  <span class="block font-semibold">{{ entry.description }}</span>
                  <span class="block text-muted-foreground">{{ subtitle(entry) }}</span>
                </td>
                <td class="tabular px-2 py-3.5 text-muted-foreground">
                  {{ date(entry.occurredAt) }}
                </td>
                <td class="px-2 py-3.5 text-muted-foreground">
                  {{ entry.method ? methods[entry.method] : '—' }}
                </td>
                <td class="px-2 py-3.5">
                  <atr-badge [tone]="entry.kind === 'recebimento' ? 'success' : 'neutral'">
                    {{ entry.kind === 'recebimento' ? 'Recebido' : 'Despesa' }}
                  </atr-badge>
                </td>
                <td
                  class="tabular px-2 py-3.5 text-right font-bold"
                  [class.text-muted-foreground]="entry.kind === 'despesa'"
                >
                  {{ entry.kind === 'despesa' ? '−' : '' }}{{ money(entry.amount) }}
                </td>
                <td class="px-2 py-3.5">
                  <div class="flex justify-end gap-1">
                    @if (entry.appointmentId) {
                      <button
                        type="button"
                        atrButton="ghost"
                        size="sm"
                        (click)="appointmentRequested.emit(entry.appointmentId!)"
                      >
                        Ver
                      </button>
                    } @else if (entry.kind === 'despesa') {
                      <button
                        type="button"
                        class="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        [attr.aria-label]="'Editar despesa ' + entry.description"
                        (click)="expenseEdited.emit(entry)"
                      >
                        <atr-icon name="pencil" [size]="16" />
                      </button>
                      <button
                        type="button"
                        class="inline-flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive"
                        [attr.aria-label]="'Excluir despesa ' + entry.description"
                        (click)="expenseRemoved.emit(entry)"
                      >
                        <atr-icon name="trash-2" [size]="16" />
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class MovementsTable {
  readonly tab = input.required<MovementTab>();
  readonly entries = input.required<readonly FinanceEntry[]>();
  readonly pending = input.required<readonly Appointment[]>();
  readonly professionals = input.required<readonly Professional[]>();

  readonly appointmentRequested = output<string>();
  readonly paymentRequested = output<Appointment>();
  readonly expenseEdited = output<FinanceEntry>();
  readonly expenseRemoved = output<FinanceEntry>();

  protected money = formatMoney;
  protected date = formatShortDate;
  protected readonly methods = PAYMENT_METHOD_LABEL;

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? 'Profissional';
  }

  /** Recebimento mostra quem atendeu; despesa mostra a categoria. */
  protected subtitle(entry: FinanceEntry): string {
    if (entry.kind === 'despesa') {
      return entry.category ? EXPENSE_CATEGORY_LABEL[entry.category] : 'Despesa';
    }
    return entry.professionalId ? this.professionalName(entry.professionalId) : '';
  }

  protected readonly hasRows = computed(
    () => this.entries().length > 0 || this.pending().length > 0,
  );
}
