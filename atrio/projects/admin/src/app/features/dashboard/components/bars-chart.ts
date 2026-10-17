import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Cents, formatMoney } from '@atrio/data';

export interface ChartBucket {
  readonly label: string;
  readonly received: Cents;
  readonly expenses: Cents;
}

const HEIGHT = 160;
const GAP = 4;

/**
 * Barras de recebimentos e despesas por período.
 *
 * SVG escrito à mão em vez de uma biblioteca de gráficos: são duas séries e
 * um eixo. Uma dependência de charting custaria mais de 100 kB no bundle e
 * traria um tema inteiro para brigar com os tokens do Átrio.
 *
 * O gráfico é complementar — os números exatos estão nos cards ao lado. Por
 * isso a tabela de dados acessível fica em sr-only, e não um `aria-label`
 * genérico que não diz valor nenhum.
 */
@Component({
  selector: 'adm-bars-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (buckets().length === 0) {
      <p class="py-8 text-center text-sm text-muted-foreground">
        Sem movimentação no período.
      </p>
    } @else {
      <figure class="m-0">
        <svg
          [attr.viewBox]="'0 0 ' + width() + ' ' + totalHeight"
          class="h-48 w-full"
          role="img"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          <!-- Linhas de grade -->
          @for (line of gridLines(); track line) {
            <line
              x1="0"
              [attr.y1]="line"
              [attr.x2]="width()"
              [attr.y2]="line"
              stroke="var(--border)"
              stroke-width="1"
              vector-effect="non-scaling-stroke"
            />
          }

          @for (bar of bars(); track bar.label) {
            <rect
              [attr.x]="bar.x"
              [attr.y]="bar.receivedY"
              [attr.width]="barWidth()"
              [attr.height]="bar.receivedH"
              rx="3"
              fill="var(--chart-1)"
            />
            <rect
              [attr.x]="bar.x + barWidth() + 2"
              [attr.y]="bar.expensesY"
              [attr.width]="barWidth()"
              [attr.height]="bar.expensesH"
              rx="3"
              fill="var(--chart-2)"
            />
          }
        </svg>

        <div class="mt-2 flex justify-between text-xs text-muted-foreground">
          @for (bucket of buckets(); track bucket.label) {
            <span class="flex-1 text-center">{{ bucket.label }}</span>
          }
        </div>

        <figcaption class="mt-4 flex flex-wrap gap-4 text-sm">
          <span class="inline-flex items-center gap-2">
            <span class="size-2.5 rounded-full bg-chart-1"></span>
            Recebido
          </span>
          <span class="inline-flex items-center gap-2">
            <span class="size-2.5 rounded-full bg-chart-2"></span>
            Despesas
          </span>
        </figcaption>

        <table class="sr-only">
          <caption>
            Recebimentos e despesas por período
          </caption>
          <tbody>
            @for (bucket of buckets(); track bucket.label) {
              <tr>
                <th scope="row">{{ bucket.label }}</th>
                <td>Recebido {{ money(bucket.received) }}</td>
                <td>Despesas {{ money(bucket.expenses) }}</td>
              </tr>
            }
          </tbody>
        </table>
      </figure>
    }
  `,
})
export class BarsChart {
  readonly buckets = input.required<readonly ChartBucket[]>();

  protected readonly totalHeight = HEIGHT;
  protected money = formatMoney;

  protected readonly width = computed(() => Math.max(this.buckets().length, 1) * 40);

  protected readonly barWidth = computed(() => {
    const slot = this.width() / Math.max(this.buckets().length, 1);
    return Math.max((slot - GAP * 2 - 2) / 2, 2);
  });

  private readonly max = computed(() =>
    Math.max(
      1,
      ...this.buckets().flatMap((b) => [b.received, b.expenses]),
    ),
  );

  protected readonly gridLines = computed(() =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(HEIGHT * f)),
  );

  protected readonly bars = computed(() => {
    const max = this.max();
    const slot = this.width() / Math.max(this.buckets().length, 1);
    const barWidth = this.barWidth();

    return this.buckets().map((bucket, index) => {
      const receivedH = (bucket.received / max) * HEIGHT;
      const expensesH = (bucket.expenses / max) * HEIGHT;
      return {
        label: bucket.label,
        x: index * slot + (slot - barWidth * 2 - 2) / 2,
        receivedH,
        receivedY: HEIGHT - receivedH,
        expensesH,
        expensesY: HEIGHT - expensesH,
      };
    });
  });
}
