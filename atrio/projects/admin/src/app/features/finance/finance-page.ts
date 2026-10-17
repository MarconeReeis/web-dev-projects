import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentRepository,
  Cents,
  DateRange,
  FinanceEntry,
  FinanceRepository,
  Id,
  PeriodPreset,
  Professional,
  ProfessionalRepository,
  formatMoney,
} from '@atrio/data';
import {
  AtrButton,
  AtrCard,
  AtrIcon,
  AtrOverlay,
  AtrPageHeading,
} from '@atrio/ui';
import {
  AppointmentPanel,
  AppointmentPanelData,
} from '../agenda/components/appointment-panel';
import { CustomPeriodDialog, CustomPeriodData } from '../../shared/custom-period-dialog';
import { KpiCard } from '../../shared/kpi-card';
import { PeriodFilter } from '../../shared/period-filter';
import { PeriodSelection } from '../../shared/period-selection';
import { ProfessionalFilter } from '../../shared/professional-filter';
import { ExpenseDialog, ExpenseDialogData } from './components/expense-dialog';
import {
  MOVEMENT_TABS,
  MovementTab,
  MovementsTable,
} from './components/movements-table';

/**
 * Financeiro.
 *
 * Duas perguntas, nesta ordem: quanto entrou e quanto falta entrar.
 *
 * O período filtra os recebimentos pela DATA DO PAGAMENTO, não pela do
 * atendimento — é o que a descrição da página promete e o que faz o caixa
 * fechar. As pendências, que ainda não têm data de pagamento, são filtradas
 * pela data do atendimento.
 *
 * Com um profissional selecionado, despesas e saldo somem: despesa é da loja
 * (aluguel, produtos) e não se divide por profissional. "Saldo do Rafael"
 * seria um número que não significa nada.
 */
@Component({
  selector: 'adm-finance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AtrPageHeading,
    AtrButton,
    AtrIcon,
    AtrCard,
    KpiCard,
    PeriodFilter,
    ProfessionalFilter,
    MovementsTable,
  ],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Financeiro"
      description="Recebimentos contam pela data do pagamento."
    >
      <button type="button" atrButton (click)="openExpense(null)">
        <atr-icon name="plus" [size]="16" />
        Nova despesa
      </button>
    </atr-page-heading>

    <div class="mt-6 flex flex-wrap items-center gap-3">
      <adm-period-filter
        [selected]="period.preset()"
        [customLabel]="period.customLabel()"
        (selectedChange)="period.select($event)"
        (customRequested)="openCustomPeriod()"
      />
      <adm-professional-filter
        [professionals]="professionals()"
        [selected]="professionalId()"
        (selectedChange)="professionalId.set($event)"
      />
    </div>

    <!-- Indicadores -->
    <div class="mt-6 grid gap-4 sm:grid-cols-2" [class]="gridClass()">
      <adm-kpi-card
        label="Total recebido"
        [value]="money(received())"
        icon="banknote"
        tone="soft"
      />
      <adm-kpi-card
        label="Pagamentos pendentes"
        [value]="money(pendingTotal())"
        icon="clock"
        [hint]="pendingHint()"
      />
      @if (!professionalId()) {
        <adm-kpi-card label="Despesas" [value]="money(expenses())" icon="receipt" />
        <adm-kpi-card
          label="Saldo de caixa"
          [value]="money(balance())"
          icon="wallet"
          hint="Recebido menos despesas"
          tone="ink"
        />
      }
    </div>

    <!-- Movimentações -->
    <atr-card class="mt-4" heading="Movimentações" [subheading]="movementsHint()">
      <div card-action class="flex flex-wrap gap-2" role="group" aria-label="Filtrar lançamentos">
        @for (option of tabs; track option.id) {
          <button
            type="button"
            class="pill"
            [attr.data-active]="tab() === option.id"
            [attr.aria-pressed]="tab() === option.id"
            (click)="tab.set(option.id)"
          >
            {{ option.label }}
          </button>
        }
      </div>

      <adm-movements-table
        [tab]="tab()"
        [entries]="visibleEntries()"
        [pending]="pending()"
        [professionals]="professionals()"
        (appointmentRequested)="openAppointment($event)"
        (paymentRequested)="registerPayment($event)"
        (expenseEdited)="openExpense($event)"
        (expenseRemoved)="removeExpense($event)"
      />
    </atr-card>
  `,
})
export class FinancePage {
  private readonly financeRepo = inject(FinanceRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly overlay = inject(AtrOverlay);

  protected money = formatMoney;
  protected readonly tabs = MOVEMENT_TABS;

  /** O Financeiro abre no mês; a Dashboard, no dia. */
  protected readonly period = new PeriodSelection('mes');
  protected readonly professionalId = signal<Id | null>(null);
  protected readonly tab = signal<MovementTab>('todos');

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  private readonly query = computed(() => ({
    range: this.period.range(),
    professionalId: this.professionalId(),
  }));

  private readonly entries = toSignal(
    toObservable(this.query).pipe(
      switchMap((query) => this.financeRepo.watchEntries(query)),
    ),
    { initialValue: [] as readonly FinanceEntry[] },
  );

  /**
   * Atendimentos do período que ainda não foram pagos.
   *
   * Filtrados pela data do ATENDIMENTO, não do pagamento: não existe data de
   * pagamento num atendimento pendente.
   */
  private readonly periodAppointments = toSignal(
    toObservable(this.query).pipe(
      switchMap((query) =>
        this.appointmentsRepo.watch({
          range: query.range as DateRange,
          professionalId: query.professionalId,
          statuses: ['concluido'],
        }),
      ),
    ),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly pending = computed(() =>
    this.periodAppointments().filter(
      (appointment) => appointment.payment.status === 'pendente',
    ),
  );

  // ─── totais ───────────────────────────────────────────────────────────

  protected readonly received = computed(() =>
    sum(this.entries().filter((e) => e.kind === 'recebimento').map((e) => e.amount)),
  );

  protected readonly expenses = computed(() =>
    sum(this.entries().filter((e) => e.kind === 'despesa').map((e) => e.amount)),
  );

  protected readonly balance = computed(() => this.received() - this.expenses());

  protected readonly pendingTotal = computed(() =>
    sum(this.pending().map((appointment) => appointment.price)),
  );

  protected readonly pendingHint = computed(() => {
    const count = this.pending().length;
    if (count === 0) return 'Nada em aberto';
    return `${count} atendimento${count === 1 ? '' : 's'}`;
  });

  /** Três colunas quando despesas e saldo somem, quatro na visão da loja. */
  protected readonly gridClass = computed(() =>
    this.professionalId() ? 'xl:grid-cols-2' : 'xl:grid-cols-4',
  );

  // ─── lista ────────────────────────────────────────────────────────────

  protected readonly visibleEntries = computed(() => {
    const entries = this.entries();
    switch (this.tab()) {
      case 'recebimentos':
        return entries.filter((entry) => entry.kind === 'recebimento');
      case 'despesas':
        return entries.filter((entry) => entry.kind === 'despesa');
      default:
        return entries;
    }
  });

  protected readonly movementsHint = computed(() =>
    this.tab() === 'pendentes'
      ? 'Atendimentos concluídos aguardando pagamento — ainda não são lançamentos.'
      : 'Lançamentos do período, pela data do dinheiro.',
  );

  // ─── ações ────────────────────────────────────────────────────────────

  protected openCustomPeriod(): void {
    const ref = this.overlay.openDialog<
      CustomPeriodDialog,
      CustomPeriodData,
      DateRange | null
    >(CustomPeriodDialog, this.period.suggestion());

    ref.closed.subscribe((range) => {
      if (range) this.period.applyCustom(range);
    });
  }

  protected openAppointment(appointmentId: string): void {
    this.overlay.openSheet<AppointmentPanel, AppointmentPanelData>(AppointmentPanel, {
      appointmentId,
    });
  }

  protected registerPayment(appointment: Appointment): void {
    // Abre direto na escolha da forma de pagamento: quem clicou em Registrar
    // já decidiu o que quer fazer.
    this.overlay.openSheet<AppointmentPanel, AppointmentPanelData>(AppointmentPanel, {
      appointmentId: appointment.id,
      mode: 'pagamento',
    });
  }

  protected openExpense(expense: FinanceEntry | null): void {
    this.overlay.openDialog<ExpenseDialog, ExpenseDialogData, boolean>(ExpenseDialog, {
      expense,
      date: new Date(this.period.range().from),
    });
  }

  protected async removeExpense(expense: FinanceEntry): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Excluir despesa',
      message: `"${expense.description}" (${formatMoney(expense.amount)}) sai do caixa do período. A ação não pode ser desfeita.`,
      confirmLabel: 'Excluir despesa',
      destructive: true,
    });
    if (confirmed) await this.financeRepo.removeExpense(expense.id);
  }
}

function sum(values: readonly Cents[]): Cents {
  return values.reduce((total, value) => total + value, 0);
}
