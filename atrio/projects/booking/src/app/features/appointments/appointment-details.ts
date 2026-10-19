import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  formatLongDate,
  formatMoney,
  formatTime,
} from '@atrio/data';
import { AtrBadge, AtrBadgeTone, AtrButton, AtrOverlay, AtrSurfaceShell } from '@atrio/ui';

export interface AppointmentDetailsData {
  readonly appointment: Appointment;
  readonly professionalName: string;
  readonly address: string | null;
  readonly tone: AtrBadgeTone;
  readonly canCancel: boolean;
  readonly cancelLimitHours: number;
}

/**
 * Detalhes de um horário, aberto ao tocar no card da lista.
 *
 * Existe para a lista ficar limpa como na referência — data, serviço,
 * duração e valor — sem esconder o cancelamento: ele mora aqui, um toque
 * adiante, com o contexto inteiro à vista antes de decidir.
 */
@Component({
  selector: 'bkg-appointment-details',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrBadge, AtrButton],
  host: { class: 'block h-full' },
  template: `
    <atr-surface-shell heading="Seu agendamento" (closed)="ref.close()">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="text-xl font-extrabold tracking-tight">{{ longDate() }}</p>
          <p class="tabular mt-0.5 text-lg font-bold text-primary">
            {{ time(item.startsAt) }} – {{ time(item.endsAt) }}
          </p>
        </div>
        <atr-badge [tone]="data.tone" [dot]="true">{{ status }}</atr-badge>
      </div>

      <dl class="mt-5 flex flex-col gap-3 border-t border-dashed border-border pt-5 text-sm">
        <div class="flex items-start justify-between gap-4">
          <dt class="text-muted-foreground">Serviço</dt>
          <dd class="text-right font-semibold">{{ item.serviceName }}</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt class="text-muted-foreground">Profissional</dt>
          <dd class="text-right font-semibold">{{ data.professionalName }}</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt class="text-muted-foreground">Duração</dt>
          <dd class="tabular text-right font-semibold">{{ item.durationMinutes }} min</dd>
        </div>
        <div class="flex items-start justify-between gap-4">
          <dt class="text-muted-foreground">Valor</dt>
          <dd class="tabular text-right font-semibold">{{ money(item.price) }} · na barbearia</dd>
        </div>
        @if (data.address; as address) {
          <div class="flex items-start justify-between gap-4">
            <dt class="shrink-0 text-muted-foreground">Endereço</dt>
            <dd class="text-right font-semibold text-balance">{{ address }}</dd>
          </div>
        }
        @if (item.notes) {
          <div class="flex items-start justify-between gap-4">
            <dt class="shrink-0 text-muted-foreground">Observações</dt>
            <dd class="text-right text-balance">{{ item.notes }}</dd>
          </div>
        }
      </dl>

      @if (item.status === 'agendado' && !data.canCancel) {
        <p class="mt-6 rounded-2xl bg-secondary px-4 py-3.5 text-sm text-muted-foreground">
          Para cancelar com menos de {{ data.cancelLimitHours }}h de antecedência, fale
          com a barbearia.
        </p>
      }

      @if (error(); as message) {
        <p
          class="mt-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
          role="alert"
        >
          {{ message }}
        </p>
      }

      <div shell-footer class="flex w-full flex-col gap-2">
        @if (data.canCancel) {
          <button
            type="button"
            atrButton="outline"
            size="lg"
            class="w-full"
            [disabled]="busy()"
            (click)="cancel()"
          >
            Cancelar horário
          </button>
        }
        <button type="button" atrButton="ghost" size="lg" class="w-full" (click)="ref.close()">
          Fechar
        </button>
      </div>
    </atr-surface-shell>
  `,
})
export class AppointmentDetails {
  protected readonly data = inject<AppointmentDetailsData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly repository = inject(AppointmentRepository);
  private readonly overlay = inject(AtrOverlay);

  protected readonly item = this.data.appointment;
  protected readonly status = APPOINTMENT_STATUS_LABEL[this.item.status];
  protected readonly money = formatMoney;
  protected readonly time = formatTime;

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected longDate(): string {
    const label = formatLongDate(this.item.startsAt);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected async cancel(): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Cancelar horário',
      message: `${this.item.serviceName} em ${this.longDate()} às ${formatTime(this.item.startsAt)}. O horário volta a ficar livre para outra pessoa.`,
      confirmLabel: 'Cancelar horário',
      cancelLabel: 'Manter',
      destructive: true,
    });
    if (!confirmed) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.repository.changeStatus(this.item.id, 'cancelado');
      this.ref.close(true);
    } catch {
      this.error.set('Não foi possível cancelar agora. Tente de novo ou fale com a barbearia.');
    } finally {
      this.busy.set(false);
    }
  }
}
