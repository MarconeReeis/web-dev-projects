import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  Appointment,
  IsoDateTime,
  Professional,
  Service,
  TimeBlock,
  availableSlots,
  formatTime,
} from '@atrio/data';

/**
 * Horários livres de um profissional para um serviço, num dia.
 *
 * Mostra só o que REALMENTE cabe: o motor de disponibilidade considera a
 * duração inteira do atendimento, os intervalos e os bloqueios. Oferecer um
 * horário que depois é recusado na confirmação é pior que não oferecer.
 *
 * A lista some quando falta profissional ou serviço — sem os dois não dá para
 * calcular duração, e um campo de horário livre vazio pareceria um erro.
 */
@Component({
  selector: 'adm-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (!professional() || !service()) {
      <p class="rounded-xl bg-muted px-4 py-3.5 text-sm text-muted-foreground">
        Escolha profissional e serviço para ver os horários livres.
      </p>
    } @else if (slots().length === 0) {
      <p class="rounded-xl bg-warning-soft px-4 py-3.5 text-sm font-medium text-warning-soft-foreground">
        Nenhum horário livre nesse dia para este profissional e serviço.
      </p>
    } @else {
      <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Horário disponível">
        @for (slot of slots(); track slot) {
          <button
            type="button"
            role="radio"
            class="pill px-4"
            [attr.data-active]="slot === selected()"
            [attr.aria-checked]="slot === selected()"
            (click)="selectedChange.emit(slot)"
          >
            {{ time(slot) }}
          </button>
        }
      </div>
    }
  `,
})
export class SlotPicker {
  readonly professional = input<Professional | null>(null);
  readonly service = input<Service | null>(null);
  readonly date = input.required<Date>();
  readonly existing = input.required<readonly Appointment[]>();
  readonly blocks = input.required<readonly TimeBlock[]>();
  readonly now = input<Date | null>(null);
  readonly selected = input<IsoDateTime | null>(null);

  readonly selectedChange = output<IsoDateTime>();

  protected time = formatTime;

  protected readonly slots = computed<readonly IsoDateTime[]>(() => {
    const professional = this.professional();
    const service = this.service();
    if (!professional || !service) return [];

    return availableSlots({
      date: this.date(),
      professional,
      service,
      existing: this.existing(),
      blocks: this.blocks(),
      now: this.now() ?? undefined,
    });
  });
}
