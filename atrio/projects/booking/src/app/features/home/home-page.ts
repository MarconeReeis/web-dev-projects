import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TenantContext } from '@atrio/core';
import { ServiceRepository, formatMoney } from '@atrio/data';
import { AtrButton, AtrCard, AtrIcon } from '@atrio/ui';

/**
 * Vitrine da barbearia — a primeira tela que o cliente final vê.
 *
 * É aqui que o white-label aparece: logo, nome e cor são da barbearia. O
 * Átrio assina discreto no rodapé e em lugar nenhum mais.
 *
 * Instalação como PWA, escolha de serviço, profissional e horário entram na
 * sequência; esta tela já prova que a identidade visual troca sozinha.
 */
@Component({
  selector: 'bkg-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrCard, AtrButton, AtrIcon],
  host: { class: 'mx-auto block w-full max-w-2xl px-4 py-8 sm:px-6' },
  template: `
    <header class="flex items-center gap-4">
      <span
        class="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      >
        <atr-icon name="scissors" [size]="26" />
      </span>
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-extrabold tracking-tight">
          {{ tenant.name() }}
        </h1>
        <p class="text-sm text-muted-foreground">Agende seu horário</p>
      </div>
    </header>

    <atr-card heading="Serviços" subheading="Escolha o que você quer fazer." class="mt-6">
      <ul class="flex flex-col gap-2">
        @for (service of services(); track service.id) {
          <li
            class="flex items-center gap-4 rounded-2xl border border-border p-4"
          >
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold">{{ service.name }}</span>
              <span class="block truncate text-sm text-muted-foreground">
                {{ service.durationMinutes }} min
              </span>
            </span>
            <span class="tabular font-extrabold">{{ money(service.price) }}</span>
            <button atrButton size="sm" disabled>Agendar</button>
          </li>
        }
      </ul>
    </atr-card>

    <p class="mt-8 text-center text-xs text-muted-foreground">
      Agendamento por Átrio
    </p>
  `,
})
export class HomePage {
  protected readonly tenant = inject(TenantContext);
  private readonly repository = inject(ServiceRepository);

  protected money = formatMoney;
  protected readonly services = toSignal(this.repository.watchAll(), {
    initialValue: [],
  });
}
