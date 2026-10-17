import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Professional, Service, formatMoney } from '@atrio/data';
import { AtrAvatar, AtrBadge, AtrButton, AtrIcon } from '@atrio/ui';

/**
 * Cartão do serviço.
 *
 * O preço é o elemento maior do cartão porque é o que se confere com mais
 * frequência — o dono olha a tela para conferir a tabela, não para ler
 * descrição.
 *
 * Os avatares mostram quem realiza o serviço. Um serviço sem ninguém
 * habilitado não pode ser agendado, e o cartão diz isso em texto em vez de
 * simplesmente não mostrar avatar nenhum.
 */
@Component({
  selector: 'adm-service-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrAvatar, AtrBadge, AtrButton, AtrIcon],
  host: { class: 'block' },
  template: `
    <article
      class="surface flex h-full flex-col gap-3 p-5"
      [class.opacity-60]="!service().active"
    >
      <header class="flex items-start gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="truncate text-lg font-bold">{{ service().name }}</h3>
          <p class="mt-0.5 text-sm text-muted-foreground">
            {{ service().description || 'Sem descrição' }}
          </p>
        </div>
        <atr-badge [tone]="service().active ? 'success' : 'neutral'">
          {{ service().active ? 'Ativo' : 'Inativo' }}
        </atr-badge>
      </header>

      <div class="flex items-end justify-between gap-3">
        <p class="tabular text-3xl font-extrabold tracking-tight">
          {{ money(service().price) }}
        </p>
        <p class="flex items-center gap-1.5 pb-1 text-sm text-muted-foreground">
          <atr-icon name="clock" [size]="15" />
          <span class="tabular">{{ service().durationMinutes }} min</span>
        </p>
      </div>

      @if (professionals().length > 0) {
        <ul class="flex -space-x-2">
          @for (professional of professionals(); track professional.id) {
            <li>
              <atr-avatar
                class="rounded-full ring-2 ring-card"
                [name]="professional.name"
                [photoUrl]="professional.photoUrl"
                size="sm"
              />
            </li>
          }
        </ul>
      } @else {
        <p class="text-sm font-medium text-warning">
          Nenhum profissional habilitado — este serviço não pode ser agendado.
        </p>
      }

      <footer class="mt-auto pt-2">
        <button type="button" atrButton="outline" class="w-full" (click)="edited.emit()">
          <atr-icon name="pencil" [size]="16" />
          Editar
        </button>
      </footer>
    </article>
  `,
})
export class ServiceCard {
  readonly service = input.required<Service>();
  /** Já filtrados pela página: só quem realiza este serviço. */
  readonly professionals = input.required<readonly Professional[]>();

  readonly edited = output<void>();

  protected money = formatMoney;
}
