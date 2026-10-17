import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
} from '@atrio/data';
import { AtrButton, AtrCard, AtrEmptyState, AtrIcon, initialsOf } from '@atrio/ui';

/**
 * Escolha do profissional como porta de entrada.
 *
 * O fluxo canônico começa pelo serviço — a duração define quais horários
 * cabem, e nem todo profissional faz tudo. Mas quem é fiel ao barbeiro pensa
 * primeiro na pessoa, e obrigá-lo a passar pelo catálogo antes é atrito à
 * toa.
 *
 * Esta tela resolve sem inverter o fluxo: daqui o cliente entra no
 * agendamento com a pessoa já travada, e o passo "Com quem?" desaparece.
 *
 * A especialidade é o que decide a escolha — a lista de serviços diz o que o
 * profissional PODE fazer, não o que ele faz bem. Sem especialidade
 * cadastrada, cai nos serviços, que é melhor que um espaço em branco.
 */
@Component({
  selector: 'bkg-professionals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrCard, AtrButton, AtrIcon, AtrEmptyState],
  host: { class: 'block' },
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight text-balance">
      Com quem você quer agendar?
    </h1>
    <p class="mt-1 text-sm text-muted-foreground">
      Escolha o profissional e veja os serviços que ele realiza.
    </p>

    @if (professionals().length === 0) {
      <atr-card class="mt-5">
        <atr-empty-state
          icon="users"
          heading="Nenhum profissional disponível"
          description="A barbearia ainda não cadastrou quem atende."
        />
      </atr-card>
    } @else {
      <ul class="mt-5 grid grid-cols-2 gap-3">
        @for (professional of professionals(); track professional.id) {
          <li>
            <a
              class="surface flex h-full flex-col overflow-hidden transition-colors hover:border-primary"
              [routerLink]="['../agendar']"
              [queryParams]="{ profissional: professional.id }"
            >
              @if (professional.photoUrl; as photo) {
                <img
                  [src]="photo"
                  [alt]="professional.name"
                  class="h-32 w-full object-cover"
                />
              } @else {
                <!-- Sem foto: iniciais grandes, mesmo tratamento dos cards de
                     serviço. A barbearia sobe a foto pelo painel. -->
                <span
                  class="flex h-32 items-center justify-center bg-primary-soft text-2xl font-extrabold text-primary-soft-foreground"
                >
                  {{ initials(professional.name) }}
                </span>
              }

              <span class="flex flex-1 flex-col gap-3 p-3.5">
                <span class="flex flex-col">
                  <span class="font-bold text-balance">{{ professional.name }}</span>
                  <span class="mt-0.5 text-sm text-balance text-muted-foreground">
                    {{ describe(professional) }}
                  </span>
                </span>

                <!-- mt-auto, e não mt-3: a especialidade pode ocupar uma ou
                     duas linhas, e sem isso o botão flutua no meio do card
                     mais baixo da fileira. -->
                <span
                  class="mt-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary-soft px-3 pt-0 text-sm font-semibold text-primary-soft-foreground"
                  aria-hidden="true"
                >
                  Ver serviços
                  <atr-icon name="chevron-right" [size]="15" />
                </span>
              </span>
            </a>
          </li>
        }
      </ul>
    }

    <a atrButton="ghost" class="mt-6 w-full" routerLink="../">
      <atr-icon name="chevron-left" [size]="16" />
      Voltar ao início
    </a>
  `,
})
export class ProfessionalsPage {
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly servicesRepo = inject(ServiceRepository);

  protected initials = initialsOf;

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  private readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  private readonly serviceNames = computed(
    () => new Map(this.services().map((service) => [service.id, service.name])),
  );

  protected describe(professional: Professional): string {
    if (professional.bio) return professional.bio;

    const names = this.serviceNames();
    const list = professional.serviceIds
      .map((id) => names.get(id))
      .filter((name): name is string => !!name);

    return list.length > 0 ? list.join(', ') : 'Sem serviços cadastrados';
  }
}
