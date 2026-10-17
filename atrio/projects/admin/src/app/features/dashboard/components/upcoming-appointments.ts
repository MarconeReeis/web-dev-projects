import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Appointment, Professional, formatTime } from '@atrio/data';
import { AtrAvatar, AtrButton, AtrCard, AtrEmptyState, AtrIcon } from '@atrio/ui';
import { StatusBadge } from '../../../shared/status-badge';

/**
 * Próximos atendimentos de hoje.
 *
 * Sempre o dia de hoje, mesmo quando os indicadores estão no mês: a pergunta
 * que esta lista responde é "quem entra na cadeira agora", e ela não muda
 * porque o dono foi olhar o faturamento do mês. O filtro de profissional,
 * esse sim, se aplica.
 *
 * O atendimento em andamento recebe borda roxa — num balcão movimentado, é o
 * que o olho precisa achar primeiro.
 */
@Component({
  selector: 'adm-upcoming-appointments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AtrCard,
    AtrButton,
    AtrAvatar,
    AtrIcon,
    AtrEmptyState,
    StatusBadge,
  ],
  template: `
    <atr-card heading="Próximos agendamentos de hoje" [subheading]="subtitle()">
      <a atrButton="outline" size="sm" routerLink="/agenda" card-action>
        Ver agenda
        <atr-icon name="arrow-up-right" [size]="16" />
      </a>

      @if (appointments().length === 0) {
        <atr-empty-state
          icon="calendar-check"
          heading="Nenhum atendimento restante hoje"
          description="Quando houver novos agendamentos para hoje, eles aparecem aqui."
        />
      } @else {
        <ul class="flex flex-col gap-2">
          @for (appointment of appointments(); track appointment.id) {
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-4 rounded-2xl border p-3 text-left transition-colors hover:bg-accent"
                [class]="
                  appointment.status === 'em_atendimento'
                    ? 'border-primary bg-primary-soft/40'
                    : 'border-transparent'
                "
                (click)="selected.emit(appointment)"
              >
                <span class="tabular w-14 shrink-0 text-sm font-bold">
                  {{ time(appointment.startsAt) }}
                </span>

                <atr-avatar [name]="appointment.client.name" size="sm" />

                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-bold">
                    {{ appointment.client.name }}
                  </span>
                  <span class="block truncate text-sm text-muted-foreground">
                    {{ appointment.serviceName }} ·
                    {{ professionalName(appointment.professionalId) }}
                  </span>
                </span>

                <adm-status-badge [status]="appointment.status" />
              </button>
            </li>
          }
        </ul>
      }
    </atr-card>
  `,
})
export class UpcomingAppointments {
  readonly appointments = input.required<readonly Appointment[]>();
  readonly professionals = input.required<readonly Professional[]>();
  readonly subtitle = input<string | null>(null);

  readonly selected = output<Appointment>();

  protected time = formatTime;

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? 'Profissional';
  }
}
