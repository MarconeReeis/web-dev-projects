import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  AppointmentStatus,
  Id,
  IsoDateTime,
  PAYMENT_METHOD_LABEL,
  PaymentMethod,
  ProfessionalRepository,
  ServiceRepository,
  TimeBlockRepository,
  formatLongDate,
  formatMoney,
  formatTime,
  nextStatusIsAllowed,
  startOfDay,
} from '@atrio/data';
import { AtrAvatar, AtrButton, AtrField, AtrIcon, AtrInput, AtrSurfaceShell } from '@atrio/ui';
import { toDateInputValue } from '../../../shared/date-input';
import { PaymentBadge, StatusBadge } from '../../../shared/status-badge';
import { SlotPicker } from './slot-picker';

const METHODS: readonly PaymentMethod[] = ['pix', 'dinheiro', 'cartao'];

type Mode = 'detalhes' | 'pagamento' | 'reagendar' | 'cancelar' | 'faltou';

export interface AppointmentPanelData {
  readonly appointmentId: Id;
  /** Abre o painel já numa ação; o padrão são os detalhes. */
  readonly mode?: Mode;
}

/**
 * Painel lateral do atendimento.
 *
 * Abre sobre a Agenda sem tirar o contexto de trás — quem está no balcão
 * continua vendo o resto do dia enquanto resolve um atendimento.
 *
 * Recebe só o id e lê do repositório: depois de iniciar, finalizar ou
 * registrar pagamento, o painel reflete o novo estado sozinho, sem o chamador
 * ter de devolver nada.
 *
 * As ações oferecidas seguem `nextStatusIsAllowed`. Um atendimento concluído
 * não mostra "Cancelar": botão que existe só para dar erro é pior que botão
 * ausente.
 */
@Component({
  selector: 'adm-appointment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AtrSurfaceShell,
    AtrButton,
    AtrIcon,
    AtrAvatar,
    AtrField,
    AtrInput,
    StatusBadge,
    PaymentBadge,
    SlotPicker,
  ],
  template: `
    @if (appointment(); as appointment) {
      <atr-surface-shell
        heading="Atendimento"
        [description]="appointment.serviceName"
        (closed)="close()"
      >
        <!-- Cliente -->
        <div class="flex items-center gap-3">
          <atr-avatar [name]="appointment.client.name" size="lg" />
          <div class="min-w-0">
            <p class="truncate text-base font-bold">{{ appointment.client.name }}</p>
            @if (appointment.client.phone; as phone) {
              <a
                class="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
                [href]="'tel:' + phone"
              >
                <atr-icon name="phone" [size]="14" />
                {{ phone }}
              </a>
            } @else {
              <p class="text-sm text-muted-foreground">Sem telefone</p>
            }
          </div>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <adm-status-badge [status]="appointment.status" />
          <adm-payment-badge [status]="appointment.payment.status" />
        </div>

        <!-- Dados -->
        <dl class="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-border pt-5">
          <div>
            <dt class="text-sm text-muted-foreground">Profissional</dt>
            <dd class="mt-0.5 font-semibold">{{ professionalName() }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Preço</dt>
            <dd class="tabular mt-0.5 font-semibold">{{ money(appointment.price) }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Data</dt>
            <dd class="mt-0.5 font-semibold">{{ longDate(appointment.startsAt) }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted-foreground">Horário</dt>
            <dd class="tabular mt-0.5 font-semibold">
              {{ time(appointment.startsAt) }}–{{ time(appointment.endsAt) }}
              <span class="font-normal text-muted-foreground">
                ({{ appointment.durationMinutes }} min)
              </span>
            </dd>
          </div>
          @if (appointment.payment.paidAt; as paidAt) {
            <div class="col-span-2">
              <dt class="text-sm text-muted-foreground">Pagamento</dt>
              <dd class="mt-0.5 font-semibold">
                {{ methodLabel(appointment.payment.method) }} ·
                {{ longDate(paidAt) }} às {{ time(paidAt) }}
              </dd>
            </div>
          }
          @if (appointment.notes; as notes) {
            <div class="col-span-2">
              <dt class="text-sm text-muted-foreground">Observações</dt>
              <dd class="mt-0.5">{{ notes }}</dd>
            </div>
          }
        </dl>

        @if (error(); as message) {
          <p
            class="mt-5 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
            role="alert"
          >
            {{ message }}
          </p>
        }

        <!-- Registrar pagamento -->
        @if (mode() === 'pagamento') {
          <div class="mt-5 rounded-2xl border border-border p-4">
            <p class="font-bold">Como o cliente pagou?</p>
            <p class="tabular mt-0.5 text-sm text-muted-foreground">
              {{ money(appointment.price) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              @for (method of methods; track method) {
                <button
                  type="button"
                  atrButton="outline"
                  size="sm"
                  [disabled]="busy()"
                  (click)="registerPayment(method)"
                >
                  {{ methodLabel(method) }}
                </button>
              }
            </div>
          </div>
        }

        <!-- Reagendar -->
        @if (mode() === 'reagendar') {
          <div class="mt-5 rounded-2xl border border-border p-4">
            <p class="font-bold">Reagendar</p>
            <atr-field label="Nova data" class="mt-3">
              <input
                atrInput
                type="date"
                [value]="rescheduleDateValue()"
                (change)="onRescheduleDate($event)"
              />
            </atr-field>
            <div class="mt-3">
              <p class="mb-1.5 text-sm font-semibold">Horário disponível</p>
              <adm-slot-picker
                [professional]="professional()"
                [service]="service()"
                [date]="rescheduleDate()"
                [existing]="dayAppointments()"
                [blocks]="dayBlocks()"
                [selected]="newStartsAt()"
                (selectedChange)="newStartsAt.set($event)"
              />
            </div>
          </div>
        }

        <!-- Confirmações destrutivas -->
        @if (mode() === 'cancelar' || mode() === 'faltou') {
          <div class="mt-5 rounded-2xl border border-destructive bg-destructive-soft p-4">
            <p class="font-bold text-destructive-soft-foreground">
              {{
                mode() === 'cancelar'
                  ? 'Cancelar este atendimento?'
                  : 'Marcar como não compareceu?'
              }}
            </p>
            <p class="mt-0.5 text-sm text-destructive-soft-foreground">
              O horário fica livre de novo e a mudança não pode ser desfeita.
            </p>
          </div>
        }

        <!-- Ações -->
        <div shell-footer class="flex w-full flex-wrap justify-end gap-2">
          @switch (mode()) {
            @case ('detalhes') {
              @if (can('cancelado')) {
                <button type="button" atrButton="ghost" (click)="mode.set('cancelar')">
                  Cancelar
                </button>
              }
              @if (can('nao_compareceu')) {
                <button type="button" atrButton="ghost" (click)="mode.set('faltou')">
                  Não compareceu
                </button>
              }
              @if (canReschedule()) {
                <button type="button" atrButton="outline" (click)="startReschedule()">
                  Reagendar
                </button>
              }
              @if (appointment.payment.status === 'pendente' && appointment.status !== 'cancelado') {
                <button type="button" atrButton="soft" (click)="mode.set('pagamento')">
                  <atr-icon name="credit-card" [size]="16" />
                  Registrar pagamento
                </button>
              }
              @if (can('em_atendimento')) {
                <button type="button" atrButton [disabled]="busy()" (click)="changeStatus('em_atendimento')">
                  <atr-icon name="play" [size]="16" />
                  Iniciar atendimento
                </button>
              } @else if (can('concluido')) {
                <button type="button" atrButton [disabled]="busy()" (click)="changeStatus('concluido')">
                  <atr-icon name="check" [size]="16" />
                  Finalizar atendimento
                </button>
              }
            }
            @case ('reagendar') {
              <button type="button" atrButton="ghost" (click)="backToDetails()">Voltar</button>
              <button
                type="button"
                atrButton
                [disabled]="!newStartsAt() || busy()"
                (click)="confirmReschedule()"
              >
                Confirmar novo horário
              </button>
            }
            @case ('cancelar') {
              <button type="button" atrButton="ghost" (click)="backToDetails()">Voltar</button>
              <button
                type="button"
                atrButton="destructive"
                [disabled]="busy()"
                (click)="changeStatus('cancelado')"
              >
                Sim, cancelar
              </button>
            }
            @case ('faltou') {
              <button type="button" atrButton="ghost" (click)="backToDetails()">Voltar</button>
              <button
                type="button"
                atrButton="destructive"
                [disabled]="busy()"
                (click)="changeStatus('nao_compareceu')"
              >
                Sim, não compareceu
              </button>
            }
            @default {
              <button type="button" atrButton="ghost" (click)="backToDetails()">Voltar</button>
            }
          }
        </div>
      </atr-surface-shell>
    }
  `,
})
export class AppointmentPanel {
  private readonly ref = inject<DialogRef<void, AppointmentPanel>>(DialogRef);
  private readonly data = inject<AppointmentPanelData>(DIALOG_DATA);

  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);

  protected money = formatMoney;
  protected time = formatTime;
  protected longDate = formatLongDate;
  protected readonly methods = METHODS;

  // O Financeiro abre direto em "pagamento": quem clicou em Registrar já
  // decidiu o que quer fazer, e mostrar os detalhes antes seria um toque a
  // mais para chegar no mesmo lugar.
  protected readonly mode = signal<Mode>(this.data.mode ?? 'detalhes');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly newStartsAt = signal<IsoDateTime | null>(null);
  protected readonly rescheduleDate = signal(startOfDay(new Date()));

  protected readonly appointment = toSignal(
    this.appointmentsRepo.watchById(this.data.appointmentId),
    { initialValue: null },
  );

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [],
  });
  private readonly services = toSignal(this.servicesRepo.watchAll(true), {
    initialValue: [],
  });

  protected readonly professional = computed(
    () =>
      this.professionals().find((p) => p.id === this.appointment()?.professionalId) ??
      null,
  );

  protected readonly service = computed(
    () => this.services().find((s) => s.id === this.appointment()?.serviceId) ?? null,
  );

  protected readonly professionalName = computed(
    () => this.professional()?.name ?? 'Profissional',
  );

  /** Agenda do dia escolhido, para o cálculo de horários livres. */
  private readonly dayRange = computed(() => {
    const from = this.rescheduleDate();
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

  protected readonly rescheduleDateValue = computed(() =>
    toDateInputValue(this.rescheduleDate()),
  );

  protected methodLabel(method: PaymentMethod | null): string {
    return method ? PAYMENT_METHOD_LABEL[method] : '—';
  }

  protected can(status: AppointmentStatus): boolean {
    const current = this.appointment();
    return current ? nextStatusIsAllowed(current.status, status) : false;
  }

  protected canReschedule(): boolean {
    const status = this.appointment()?.status;
    return status === 'agendado';
  }

  // ─── ações ────────────────────────────────────────────────────────────

  protected close(): void {
    this.ref.close();
  }

  protected backToDetails(): void {
    this.mode.set('detalhes');
    this.error.set(null);
  }

  protected startReschedule(): void {
    const current = this.appointment();
    if (current) this.rescheduleDate.set(startOfDay(new Date(current.startsAt)));
    this.newStartsAt.set(null);
    this.mode.set('reagendar');
  }

  protected onRescheduleDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    this.rescheduleDate.set(startOfDay(new Date(`${value}T00:00:00`)));
    this.newStartsAt.set(null);
  }

  protected async changeStatus(status: AppointmentStatus): Promise<void> {
    await this.run(() => this.appointmentsRepo.changeStatus(this.data.appointmentId, status));
  }

  protected async registerPayment(method: PaymentMethod): Promise<void> {
    await this.run(() =>
      this.appointmentsRepo.registerPayment(this.data.appointmentId, method),
    );
  }

  protected async confirmReschedule(): Promise<void> {
    const startsAt = this.newStartsAt();
    if (!startsAt) return;
    await this.run(() =>
      this.appointmentsRepo.reschedule(this.data.appointmentId, startsAt),
    );
  }

  /**
   * Executa a escrita, trava os botões e traduz a falha para a tela.
   *
   * Erro silencioso aqui é inaceitável: quem está no balcão precisa saber na
   * hora se o pagamento foi registrado ou não.
   */
  private async run(operation: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await operation();
      this.mode.set('detalhes');
    } catch (cause) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Não foi possível concluir a ação.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

