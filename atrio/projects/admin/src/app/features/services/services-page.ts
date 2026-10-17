import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ServiceRepository, formatMoney } from '@atrio/data';
import { AtrBadge, AtrCard, AtrPageHeading } from '@atrio/ui';

@Component({
  selector: 'adm-services-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrPageHeading, AtrCard, AtrBadge],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Serviços e preços"
      description="A tabela da barbearia. Reajuste vale só para agendamentos novos."
    />

    <atr-card class="mt-6">
      <ul class="flex flex-col gap-2">
        @for (service of services(); track service.id) {
          <li
            class="flex items-center gap-4 rounded-2xl border border-transparent p-3 hover:bg-accent"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold">{{ service.name }}</span>
              <span class="block truncate text-sm text-muted-foreground">
                {{ service.description }}
              </span>
            </span>
            <atr-badge tone="neutral">{{ service.durationMinutes }} min</atr-badge>
            <span class="tabular w-24 text-right font-extrabold">
              {{ money(service.price) }}
            </span>
          </li>
        }
      </ul>
    </atr-card>
  `,
})
export class ServicesPage {
  private readonly repository = inject(ServiceRepository);

  protected money = formatMoney;
  protected readonly services = toSignal(this.repository.watchAll(true), {
    initialValue: [],
  });
}
