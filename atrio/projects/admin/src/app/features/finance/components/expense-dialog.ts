import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  Cents,
  EXPENSE_CATEGORY_LABEL,
  ExpenseCategory,
  FinanceEntry,
  FinanceRepository,
  formatAmount,
  parseMoney,
} from '@atrio/data';
import { AtrButton, AtrField, AtrInput, AtrSurfaceShell } from '@atrio/ui';
import { fromDateInputValue, toDateInputValue } from '../../../shared/date-input';

const CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseCategory[];

export interface ExpenseDialogData {
  /** Nulo em lançamento novo. */
  readonly expense: FinanceEntry | null;
  /** Data sugerida quando é um lançamento novo. */
  readonly date: Date;
}

/**
 * Lançamento de despesa.
 *
 * Editar é permitido aqui, e só aqui: despesa é lançamento manual, digitado às
 * pressas no balcão, e valor trocado acontece. Recebimento vindo de
 * atendimento continua imutável — ele tem contrapartida no atendimento, e
 * mexer num lado sem o outro desalinha o caixa.
 *
 * A data é a do gasto, não a do lançamento: compra feita na segunda e digitada
 * na quarta conta na segunda.
 */
@Component({
  selector: 'adm-expense-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrInput],
  template: `
    <atr-surface-shell
      [heading]="isNew ? 'Nova despesa' : 'Editar despesa'"
      description="Despesas reduzem o saldo de caixa do período."
      (closed)="close()"
    >
      <div class="flex flex-col gap-4">
        <atr-field label="Descrição" [error]="showErrors() ? descriptionError() : null">
          <input
            atrInput
            type="text"
            autocomplete="off"
            placeholder="Pomada, aluguel, conta de luz…"
            [invalid]="showErrors() && !!descriptionError()"
            [value]="description()"
            (input)="description.set($any($event.target).value)"
          />
        </atr-field>

        <atr-field label="Categoria">
          <select atrInput [value]="category()" (change)="onCategory($event)">
            @for (option of categories; track option) {
              <option [value]="option">{{ labels[option] }}</option>
            }
          </select>
        </atr-field>

        <div class="grid grid-cols-2 gap-4">
          <atr-field label="Data" hint="Data do gasto">
            <input atrInput type="date" [value]="date()" (change)="date.set($any($event.target).value)" />
          </atr-field>

          <atr-field label="Valor (R$)" [error]="showErrors() ? amountError() : null">
            <input
              atrInput
              type="text"
              inputmode="decimal"
              [invalid]="showErrors() && !!amountError()"
              [value]="amountText()"
              (input)="amountText.set($any($event.target).value)"
            />
          </atr-field>
        </div>

        @if (error(); as message) {
          <p
            class="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }
      </div>

      <div shell-footer class="flex w-full justify-end gap-2">
        <button type="button" atrButton="ghost" (click)="close()">Cancelar</button>
        <button type="button" atrButton [disabled]="busy()" (click)="save()">Salvar</button>
      </div>
    </atr-surface-shell>
  `,
})
export class ExpenseDialog {
  private readonly ref = inject<DialogRef<boolean, ExpenseDialog>>(DialogRef);
  private readonly data = inject<ExpenseDialogData>(DIALOG_DATA);
  private readonly repository = inject(FinanceRepository);

  private readonly current = this.data.expense;
  protected readonly isNew = this.current === null;
  protected readonly categories = CATEGORIES;
  protected readonly labels = EXPENSE_CATEGORY_LABEL;

  protected readonly description = signal(this.current?.description ?? '');
  protected readonly category = signal<ExpenseCategory>(this.current?.category ?? 'produtos');
  protected readonly date = signal(
    toDateInputValue(new Date(this.current?.occurredAt ?? this.data.date)),
  );
  protected readonly amountText = signal(
    this.current ? formatAmount(this.current.amount) : '',
  );

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly descriptionError = computed(() =>
    this.description().trim().length < 2 ? 'Informe a descrição.' : null,
  );

  private readonly parsedAmount = computed<Cents | null>(() => parseMoney(this.amountText()));

  protected readonly amountError = computed(() => {
    const value = this.parsedAmount();
    if (value === null) return 'Informe o valor.';
    if (value <= 0) return 'O valor precisa ser maior que zero.';
    return null;
  });

  protected onCategory(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value as ExpenseCategory);
  }

  protected close(): void {
    this.ref.close(false);
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.error.set(null);

    if (this.descriptionError() || this.amountError()) return;

    const expense = {
      description: this.description().trim(),
      amount: this.parsedAmount()!,
      occurredAt: fromDateInputValue(this.date()).toISOString(),
      category: this.category(),
    };

    this.busy.set(true);
    try {
      if (this.current) await this.repository.updateExpense(this.current.id, expense);
      else await this.repository.addExpense(expense);
      this.ref.close(true);
    } catch (cause) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Não foi possível salvar a despesa.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
