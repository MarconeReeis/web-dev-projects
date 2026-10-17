import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Cents, FinanceSummary, formatMoney } from '@atrio/data';
import { AtrButton, AtrCard, AtrIcon } from '@atrio/ui';
import { BarsChart, ChartBucket } from './bars-chart';

/**
 * Balanço financeiro do período.
 *
 * Duas formas, conforme o filtro:
 *
 *  - Todos os profissionais: saldo da barbearia, recebimentos e despesas.
 *  - Um profissional: só o que ele recebeu e o que está pendente com ele.
 *    Despesa é da loja (aluguel, produtos) e não se divide por profissional —
 *    mostrar "saldo do Rafael" seria um número que não significa nada.
 *
 * "Saldo" é recebimentos menos despesas registradas. Não é lucro contábil e a
 * tela nunca usa essa palavra.
 */
@Component({
  selector: 'adm-finance-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrCard, AtrButton, AtrIcon, BarsChart],
  template: `
    <atr-card heading="Balanço financeiro" [subheading]="subtitle()">
      <a atrButton="outline" size="sm" routerLink="/financeiro" card-action>
        Ver financeiro
        <atr-icon name="arrow-up-right" [size]="16" />
      </a>

      @if (scopedToProfessional()) {
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl bg-success-soft p-4">
            <p class="text-sm font-medium text-success-soft-foreground">Recebido</p>
            <p class="tabular mt-1 text-2xl font-extrabold text-success-soft-foreground">
              {{ money(summary().received) }}
            </p>
          </div>
          <div class="rounded-2xl bg-warning-soft p-4">
            <p class="text-sm font-medium text-warning-soft-foreground">Pendente</p>
            <p class="tabular mt-1 text-2xl font-extrabold text-warning-soft-foreground">
              {{ money(summary().pending) }}
            </p>
            <p class="mt-1 text-xs text-warning-soft-foreground">
              {{ summary().pendingCount }}
              {{ summary().pendingCount === 1 ? 'atendimento' : 'atendimentos' }}
            </p>
          </div>
        </div>
      } @else {
        <!-- Painel escuro pontual: o contraste marca o número mais importante -->
        <div class="rounded-2xl bg-ink p-5 text-ink-foreground">
          <p class="text-sm text-ink-muted">Saldo de caixa</p>
          <p class="tabular mt-1 text-3xl font-extrabold">
            {{ money(summary().balance) }}
          </p>
          <p class="mt-1 text-xs text-ink-muted">
            Recebimentos menos despesas registradas
          </p>
        </div>

        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div class="rounded-2xl border border-border p-4">
            <p class="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span class="size-2 rounded-full bg-success"></span>
              Total recebido
            </p>
            <p class="tabular mt-1 text-xl font-extrabold">
              {{ money(summary().received) }}
            </p>
          </div>
          <div class="rounded-2xl border border-border p-4">
            <p class="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span class="size-2 rounded-full bg-destructive"></span>
              Despesas
            </p>
            <p class="tabular mt-1 text-xl font-extrabold">
              {{ money(summary().expenses) }}
            </p>
          </div>
        </div>
      }

      <div class="mt-6">
        <adm-bars-chart [buckets]="buckets()" />
      </div>
    </atr-card>
  `,
})
export class FinancePanel {
  readonly summary = input.required<FinanceSummary>();
  readonly buckets = input.required<readonly ChartBucket[]>();
  readonly scopedToProfessional = input(false);
  readonly subtitle = input<string | null>(null);

  protected money = (cents: Cents) => formatMoney(cents);
}
