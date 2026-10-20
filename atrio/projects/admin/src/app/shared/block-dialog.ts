import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Id,
  ProfessionalRepository,
  TimeBlockRepository,
  clockToMinutes,
  dayOf,
  shopInstant,
} from '@atrio/data';
import { TenantContext } from '@atrio/core';
import { AtrButton, AtrField, AtrInput, AtrSurfaceShell } from '@atrio/ui';
import { toDateInputValue } from './date-input';

export interface BlockDialogData {
  /** O DIA (ver period.ts) em que o bloqueio começa. */
  readonly date: Date;
  readonly professionalId: Id | null;
}

/**
 * Bloqueio de horário: folga, almoço estendido, consulta médica, feriado.
 *
 * O campo de profissional traz "Toda a barbearia" — a referência só oferecia
 * profissionais individuais, mas feriado e manutenção fecham a loja inteira,
 * e sem essa opção o atendente teria de criar um bloqueio por profissional e
 * lembrar de apagar todos depois.
 */
@Component({
  selector: 'adm-block-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrInput],
  template: `
    <atr-surface-shell
      heading="Bloquear horário"
      description="O período fica indisponível para novos agendamentos."
      (closed)="close()"
    >
      <div class="flex flex-col gap-4">
        <atr-field label="Profissional">
          <select atrInput [value]="professionalId() ?? ''" (change)="onProfessional($event)">
            <option value="">Toda a barbearia</option>
            @for (professional of professionals(); track professional.id) {
              <option [value]="professional.id">{{ professional.name }}</option>
            }
          </select>
        </atr-field>

        <atr-field label="Data">
          <input atrInput type="date" [value]="dateValue()" (change)="onDate($event)" />
        </atr-field>

        <div class="grid grid-cols-2 gap-4">
          <atr-field label="Início">
            <input atrInput type="time" step="900" [value]="start()" (change)="onStart($event)" />
          </atr-field>
          <atr-field label="Fim" [error]="rangeError()">
            <input atrInput type="time" step="900" [value]="end()" (change)="onEnd($event)" />
          </atr-field>
        </div>

        <atr-field label="Motivo" [optional]="true">
          <input
            atrInput
            type="text"
            placeholder="Almoço, consulta, folga…"
            [value]="reason()"
            (input)="reason.set($any($event.target).value)"
          />
        </atr-field>
      </div>

      <div shell-footer class="flex w-full justify-end gap-2">
        <button type="button" atrButton="ghost" (click)="close()">Cancelar</button>
        <button type="button" atrButton [disabled]="!valid() || busy()" (click)="confirm()">
          Bloquear
        </button>
      </div>
    </atr-surface-shell>
  `,
})
export class BlockDialog {
  private readonly ref = inject<DialogRef<boolean, BlockDialog>>(DialogRef);
  private readonly data = inject<BlockDialogData>(DIALOG_DATA);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly tenant = inject(TenantContext);

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [],
  });

  protected readonly professionalId = signal<Id | null>(this.data.professionalId);
  protected readonly date = signal(this.data.date);
  protected readonly start = signal('12:00');
  protected readonly end = signal('13:00');
  protected readonly reason = signal('');
  protected readonly busy = signal(false);

  protected readonly dateValue = computed(() => toDateInputValue(this.date()));

  protected readonly rangeError = computed(() =>
    clockToMinutes(this.end()) <= clockToMinutes(this.start())
      ? 'O fim precisa ser depois do início.'
      : null,
  );

  protected readonly valid = computed(() => this.rangeError() === null);

  protected onProfessional(event: Event): void {
    this.professionalId.set((event.target as HTMLSelectElement).value || null);
  }

  protected onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (value) this.date.set(dayOf(value));
  }

  protected onStart(event: Event): void {
    this.start.set((event.target as HTMLInputElement).value);
  }

  protected onEnd(event: Event): void {
    this.end.set((event.target as HTMLInputElement).value);
  }

  protected close(): void {
    this.ref.close(false);
  }

  protected async confirm(): Promise<void> {
    if (!this.valid()) return;

    this.busy.set(true);
    try {
      await this.blocksRepo.create({
        tenantId: this.tenant.id() ?? '',
        professionalId: this.professionalId(),
        startsAt: this.at(this.start()).toISOString(),
        endsAt: this.at(this.end()).toISOString(),
        reason: this.reason().trim() || null,
      });
      this.ref.close(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Combina o dia escolhido com a hora do relógio da barbearia. */
  private at(clock: string): Date {
    return shopInstant(this.date(), clockToMinutes(clock));
  }
}
