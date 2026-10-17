import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ProfessionalRepository } from '@atrio/data';
import { AtrAvatar, AtrBadge, AtrCard, AtrPageHeading } from '@atrio/ui';

/**
 * Lista de profissionais.
 *
 * Já lê do repositório para provar o caminho completo — dado, contrato, tela.
 * O cadastro e a edição (serviços, jornada, intervalos, bloqueios) entram na
 * sequência.
 */
@Component({
  selector: 'adm-professionals-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrPageHeading, AtrCard, AtrAvatar, AtrBadge],
  host: { class: 'mx-auto block w-full max-w-[1600px]' },
  template: `
    <atr-page-heading
      heading="Profissionais"
      description="Quem atende, o que faz e em que horários."
    />

    <atr-card class="mt-6">
      <ul class="flex flex-col gap-2">
        @for (professional of professionals(); track professional.id) {
          <li
            class="flex items-center gap-4 rounded-2xl border border-transparent p-3 hover:bg-accent"
          >
            <atr-avatar [name]="professional.name" />
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold">{{ professional.name }}</span>
              <span class="block truncate text-sm text-muted-foreground">
                {{ professional.phone ?? 'Sem telefone cadastrado' }}
              </span>
            </span>
            <atr-badge [tone]="professional.active ? 'success' : 'neutral'">
              {{ professional.active ? 'Ativo' : 'Inativo' }}
            </atr-badge>
          </li>
        }
      </ul>
    </atr-card>
  `,
})
export class ProfessionalsPage {
  private readonly repository = inject(ProfessionalRepository);

  /** Inclui inativos: o histórico depende deles e some-los esconde informação. */
  protected readonly professionals = toSignal(this.repository.watchAll(true), {
    initialValue: [],
  });
}
