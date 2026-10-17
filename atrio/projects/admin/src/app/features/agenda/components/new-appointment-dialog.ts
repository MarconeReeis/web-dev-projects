import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentRepository,
  Cents,
  Id,
  IsoDateTime,
  ProfessionalRepository,
  ServiceRepository,
  TimeBlockRepository,
  formatAmount,
  formatMoney,
  parseMoney,
  startOfDay,
} from '@atrio/data';
import { AtrButton, AtrField, AtrInput, AtrSurfaceShell } from '@atrio/ui';
import { SlotPicker } from './slot-picker';
import { toDateInputValue } from '../../../shared/date-input';

export interface NewAppointmentData {
  readonly date: Date;
  readonly professionalId: Id | null;
  /** Horário tocado na grade, quando a origem foi um espaço livre. */
  readonly startsAt: IsoDateTime | null;
}

/**
 * Cadastro de agendamento.
 *
 * O cliente é digitado no balcão, sem conta e sem cadastro prévio — é assim
 * que a barbearia trabalha, e exigir conta aqui quebraria o fluxo real.
 *
 * Duração e preço vêm do serviço. O preço continua editável (desconto
 * combinado acontece), mas o valor digitado é gravado no atendimento, não na
 * tabela: o acerto vale para este cliente, não para os próximos.
 */
@Component({
  selector: 'adm-new-appointment-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrInput, SlotPicker],
  template: `
    <atr-surface-shell
      heading="Novo agendamento"
      description="Cliente cadastrado na hora, sem necessidade de conta."
      (closed)="close()"
    >
      <div class="flex flex-col gap-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <atr-field label="Nome do cliente" [error]="showErrors() ? nameError() : null">
            <input
              atrInput
              type="text"
              autocomplete="off"
              [invalid]="showErrors() && !!nameError()"
              [value]="clientName()"
              (input)="clientName.set($any($event.target).value)"
            />
          </atr-field>

          <atr-field label="Telefone" [optional]="true">
            <input
              atrInput
              type="tel"
              inputmode="tel"
              placeholder="(11) 98888-7777"
              [value]="phone()"
              (input)="phone.set($any($event.target).value)"
            />
          </atr-field>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <atr-field label="Profissional">
            <select atrInput [value]="professionalId() ?? ''" (change)="onProfessional($event)">
              <option value="">Selecione</option>
              @for (professional of professionals(); track professional.id) {
                <option [value]="professional.id">{{ professional.name }}</option>
              }
            </select>
          </atr-field>

          <atr-field label="Serviço" [hint]="serviceHint()">
            <select
              atrInput
              [value]="serviceId() ?? ''"
              [disabled]="!professionalId()"
              (change)="onService($event)"
            >
              <option value="">Selecione</option>
              @for (service of availableServices(); track service.id) {
                <option [value]="service.id">{{ service.name }}</option>
              }
            </select>
          </atr-field>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <atr-field label="Data">
            <input atrInput type="date" [value]="dateValue()" (change)="onDate($event)" />
          </atr-field>

          <atr-field label="Duração">
            <input atrInput type="text" readonly [value]="durationLabel()" />
          </atr-field>

          <atr-field label="Preço" [error]="showErrors() ? priceError() : null">
            <input
              atrInput
              type="text"
              inputmode="decimal"
              [invalid]="showErrors() && !!priceError()"
              [value]="priceText()"
              (input)="priceText.set($any($event.target).value)"
            />
          </atr-field>
        </div>

        <div>
          <p class="mb-1.5 text-sm font-semibold">Horário disponível</p>
          <adm-slot-picker
            [professional]="professional()"
            [service]="service()"
            [date]="date()"
            [existing]="dayAppointments()"
            [blocks]="dayBlocks()"
            [now]="now"
            [selected]="startsAt()"
            (selectedChange)="startsAt.set($event)"
          />
          @if (showErrors() && !startsAt()) {
            <p class="mt-1.5 text-sm font-medium text-destructive" role="alert">
              Escolha um horário.
            </p>
          }
        </div>

        <atr-field label="Observações" [optional]="true">
          <textarea
            atrInput
            rows="2"
            class="py-3"
            placeholder="Preferências do cliente, combinados…"
            (input)="notes.set($any($event.target).value)"
          >{{ notes() }}</textarea>
        </atr-field>

        @if (error(); as message) {
          <p
            class="rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }
      </div>

      <div shell-footer class="flex w-full justify-end gap-2">
        <button type="button" atrButton="ghost" (click)="close()">Cancelar</button>
        <button type="button" atrButton [disabled]="busy()" (click)="confirm()">
          Confirmar agendamento
        </button>
      </div>
    </atr-surface-shell>
  `,
})
export class NewAppointmentDialog {
  private readonly ref = inject<DialogRef<Appointment | null, NewAppointmentDialog>>(DialogRef);
  private readonly data = inject<NewAppointmentData>(DIALOG_DATA);

  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);

  protected readonly now = new Date();

  protected readonly clientName = signal('');
  protected readonly phone = signal('');
  protected readonly professionalId = signal<Id | null>(this.data.professionalId);
  protected readonly serviceId = signal<Id | null>(null);
  protected readonly date = signal(startOfDay(this.data.date));
  protected readonly priceText = signal('');
  protected readonly notes = signal('');
  protected readonly startsAt = signal<IsoDateTime | null>(this.data.startsAt);

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [],
  });
  private readonly services = toSignal(this.servicesRepo.watchAll(), { initialValue: [] });

  protected readonly professional = computed(
    () => this.professionals().find((p) => p.id === this.professionalId()) ?? null,
  );

  protected readonly service = computed(
    () => this.services().find((s) => s.id === this.serviceId()) ?? null,
  );

  /** Só os serviços que este profissional realiza. */
  protected readonly availableServices = computed(() => {
    const professional = this.professional();
    if (!professional) return [];
    return this.services().filter((s) => professional.serviceIds.includes(s.id));
  });

  protected readonly serviceHint = computed(() =>
    this.professionalId() ? null : 'Escolha o profissional primeiro.',
  );

  protected readonly durationLabel = computed(() => {
    const service = this.service();
    return service ? `${service.durationMinutes} min` : '—';
  });

  private readonly dayRange = computed(() => {
    const from = this.date();
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from: from.toISOString(), to: to.toISOString() };
  });

  protected readonly dayAppointments = toSignal(
    toObservable(this.dayRange).pipe(
      switchMap((range) => this.appointmentsRepo.watch({ range })),
    ),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly dayBlocks = toSignal(
    toObservable(this.dayRange).pipe(switchMap((range) => this.blocksRepo.watch(range))),
    { initialValue: [] },
  );

  protected readonly dateValue = computed(() => toDateInputValue(this.date()));

  constructor() {
    // Trocar de serviço traz o preço de tabela; o usuário pode sobrescrever
    // depois. Efeito, e não computed, porque o campo continua editável.
    effect(() => {
      const service = this.service();
      if (service) this.priceText.set(formatAmount(service.price));
    });
  }

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.clientName().trim().length < 2 ? 'Informe o nome do cliente.' : null,
  );

  protected readonly priceError = computed(() => {
    const value = this.parsedPrice();
    if (value === null) return 'Valor inválido.';
    if (value < 0) return 'O valor não pode ser negativo.';
    return null;
  });

  private readonly parsedPrice = computed<Cents | null>(() => parseMoney(this.priceText()));

  // ─── eventos ──────────────────────────────────────────────────────────

  protected onProfessional(event: Event): void {
    this.professionalId.set((event.target as HTMLSelectElement).value || null);
    // O serviço anterior pode não ser realizado pelo novo profissional.
    this.serviceId.set(null);
    this.startsAt.set(null);
  }

  protected onService(event: Event): void {
    this.serviceId.set((event.target as HTMLSelectElement).value || null);
    // A duração mudou, então o horário escolhido pode não caber mais.
    this.startsAt.set(null);
  }

  protected onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    this.date.set(startOfDay(new Date(`${value}T00:00:00`)));
    this.startsAt.set(null);
  }

  protected close(): void {
    this.ref.close(null);
  }

  protected async confirm(): Promise<void> {
    this.showErrors.set(true);
    this.error.set(null);

    const startsAt = this.startsAt();
    const service = this.service();
    const professionalId = this.professionalId();
    const price = this.parsedPrice();

    if (this.nameError() || this.priceError() || !startsAt || !service || !professionalId) {
      return;
    }

    this.busy.set(true);
    try {
      const created = await this.appointmentsRepo.create({
        professionalId,
        serviceId: service.id,
        client: {
          clientId: null,
          name: this.clientName().trim(),
          phone: this.phone().trim() || null,
        },
        startsAt,
        notes: this.notes().trim() || null,
        priceOverride: price !== service.price ? (price ?? undefined) : undefined,
      });
      this.ref.close(created);
    } catch (cause) {
      // Conflito de horário chega aqui. A lista de horários livres já filtra,
      // mas entre abrir o diálogo e confirmar alguém pode ter marcado.
      this.error.set(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível criar o agendamento.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected money = formatMoney;
}
