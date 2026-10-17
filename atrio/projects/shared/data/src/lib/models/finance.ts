import { Audited, Cents, Id, IsoDateTime, TenantScoped } from './common';
import { PaymentMethod } from './appointment';

export type EntryKind = 'recebimento' | 'despesa';

export type ExpenseCategory =
  | 'produtos'
  | 'aluguel'
  | 'energia'
  | 'agua'
  | 'internet'
  | 'manutencao'
  | 'marketing'
  | 'outros';

export const EXPENSE_CATEGORY_LABEL: Readonly<Record<ExpenseCategory, string>> = {
  produtos: 'Produtos',
  aluguel: 'Aluguel',
  energia: 'Energia',
  agua: 'Água',
  internet: 'Internet',
  manutencao: 'Manutenção',
  marketing: 'Marketing',
  outros: 'Outros',
};

/**
 * Movimentação financeira — a única fonte de verdade do caixa.
 *
 * Regras que esta modelagem existe para garantir:
 *
 *  1. Recebimento só vira lançamento quando o pagamento é REGISTRADO.
 *     Atendimento concluído e não pago não entra em "total recebido".
 *  2. `occurredAt` é a data do dinheiro, não a do atendimento. Corte feito
 *     sexta e pago sábado conta no sábado.
 *  3. `appointmentId` é único entre os recebimentos: é a trava contra
 *     lançamento duplicado se a tela for submetida duas vezes.
 *  4. Lançamento não se edita no lugar — estorna e relança. O histórico do
 *     caixa precisa reconstruir qualquer fechamento passado.
 */
export interface FinanceEntry extends TenantScoped, Audited {
  readonly id: Id;
  readonly kind: EntryKind;
  readonly description: string;
  /** Sempre positivo; o sinal vem de `kind`. */
  readonly amount: Cents;
  readonly occurredAt: IsoDateTime;

  /** Só em recebimento. */
  readonly method: PaymentMethod | null;
  readonly appointmentId: Id | null;
  readonly professionalId: Id | null;

  /** Só em despesa. */
  readonly category: ExpenseCategory | null;
}

export interface NewExpense {
  readonly description: string;
  readonly amount: Cents;
  readonly occurredAt: IsoDateTime;
  readonly category: ExpenseCategory;
}

/** Resumo de um período. Derivado dos lançamentos, nunca armazenado solto. */
export interface FinanceSummary {
  readonly received: Cents;
  readonly expenses: Cents;
  /** Recebimentos menos despesas. NÃO é lucro contábil; não chame de lucro. */
  readonly balance: Cents;
  readonly pending: Cents;
  readonly pendingCount: number;
}
