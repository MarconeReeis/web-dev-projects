import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  APPOINTMENT_STATUS_LABEL,
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  formatLongDate,
  formatMoney,
  formatTime,
  startOfDay,
} from '@atrio/data';
import {
  AtrBadge,
  AtrBadgeTone,
  AtrButton,
  AtrCard,
  AtrEmptyState,
  AtrIcon,
  AtrOverlay,
} from '@atrio/ui';
import { ClientSession } from '../../shared/client-session';
import { SignIn } from '../auth/sign-in';

/** Janela consultada: três meses para trás, quatro para frente. */
const PAST_DAYS = 90;
const AHEAD_DAYS = 120;

/**
 * Antecedência mínima para o cliente cancelar sozinho.
 *
 * Sem regra, a pessoa cancela cinco minutos antes e a cadeira fica vazia sem
 * chance de reocupar. Com duas horas, a barbearia ainda consegue encaixar
 * alguém — e quem precisa cancelar em cima da hora liga, que é o que já
 * acontece hoje.
 */
const CANCEL_LIMIT_HOURS = 2;

const TONE: Readonly<Record<Appointment['status'], AtrBadgeTone>> = {
  agendado: 'primary',
  em_atendimento: 'primary',
  concluido: 'success',
  cancelado: 'destructive',
  nao_compareceu: 'warning',
};

/**
 * Agendamentos do cliente, só com a conta aberta.
 *
 * Antes bastava digitar um telefone, o que deixava qualquer pessoa ver — e
 * cancelar — os horários de outra. Agora é a mesma entrada do agendamento.
 *
 * A consulta ainda é pelo telefone DA CONTA: é o que liga a pessoa aos
 * horários marcados no balcão, antes de ela ter conta. Com o Firebase, a
 * leitura passa a ser filtrada pelas regras de segurança (Client.userId), e
 * não pela tela.
 */
@Component({
  selector: 'bkg-appointments-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AtrCard,
    AtrBadge,
    AtrButton,
    AtrIcon,
    AtrEmptyState,
    SignIn,
  ],
  host: { class: 'block' },
  template: `
    <h1 class="text-2xl font-extrabold tracking-tight">Meus horários</h1>

    @if (!session.signedIn()) {
      <bkg-sign-in
        class="mt-5"
        heading="Entre para ver seus horários"
        lead="Seus agendamentos ficam na sua conta, e só você consegue ver ou cancelar."
      />
    } @else {
      @if (upcoming().length === 0 && past().length === 0) {
        <atr-card class="mt-5">
          <atr-empty-state
            icon="calendar-days"
            heading="Nada marcado ainda"
            description="Quando você agendar, seus horários aparecem aqui."
          >
            <a atrButton class="mt-2" routerLink="../agendar">Agendar horário</a>
          </atr-empty-state>
        </atr-card>
      }

      @if (upcoming().length > 0) {
        <h2 class="mt-6 font-bold">Próximos</h2>
        <ul class="mt-3 flex flex-col gap-3">
          @for (appointment of upcoming(); track appointment.id) {
            <li class="surface p-5">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-bold">{{ appointment.serviceName }}</p>
                  <p class="text-sm text-muted-foreground">
                    com {{ professionalName(appointment.professionalId) }}
                  </p>
                </div>
                <atr-badge [tone]="tone(appointment.status)">
                  {{ statusLabel(appointment.status) }}
                </atr-badge>
              </div>

              <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span class="inline-flex items-center gap-2">
                  <atr-icon name="calendar-days" [size]="16" class="text-muted-foreground" />
                  {{ dateLabel(appointment.startsAt) }}
                </span>
                <span class="tabular inline-flex items-center gap-2">
                  <atr-icon name="clock" [size]="16" class="text-muted-foreground" />
                  {{ time(appointment.startsAt) }}
                </span>
                <span class="tabular inline-flex items-center gap-2 font-semibold">
                  {{ money(appointment.price) }}
                </span>
              </div>

              @if (canCancel(appointment)) {
                <button
                  type="button"
                  atrButton="outline"
                  size="sm"
                  class="mt-4"
                  (click)="cancel(appointment)"
                >
                  Cancelar
                </button>
              } @else {
                <p class="mt-4 text-sm text-muted-foreground">
                  Para cancelar com menos de {{ cancelLimit }}h de antecedência,
                  fale com a barbearia.
                </p>
              }
            </li>
          }
        </ul>
      }

      @if (past().length > 0) {
        <h2 class="mt-7 font-bold">Anteriores</h2>
        <ul class="mt-3 flex flex-col gap-2">
          @for (appointment of past(); track appointment.id) {
            <li class="flex items-center gap-3 rounded-2xl border border-border p-4">
              <span class="min-w-0 flex-1">
                <span class="block truncate font-semibold">
                  {{ appointment.serviceName }}
                </span>
                <span class="tabular block text-sm text-muted-foreground">
                  {{ dateLabel(appointment.startsAt) }} ·
                  {{ time(appointment.startsAt) }}
                </span>
              </span>
              <atr-badge [tone]="tone(appointment.status)">
                {{ statusLabel(appointment.status) }}
              </atr-badge>
            </li>
          }
        </ul>
      }

      <button
        type="button"
        atrButton="ghost"
        size="sm"
        class="mt-8 w-full"
        (click)="session.signOut()"
      >
        Sair da conta
      </button>
    }
  `,
})
export class AppointmentsPage {
  private readonly repository = inject(AppointmentRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly overlay = inject(AtrOverlay);

  protected readonly session = inject(ClientSession);
  protected readonly cancelLimit = CANCEL_LIMIT_HOURS;

  protected money = formatMoney;
  protected time = formatTime;

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  private readonly appointments = toSignal(
    toObservable(this.session.phone).pipe(
      switchMap((phone) => this.repository.watchByClientPhone(phone, horizon())),
    ),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly upcoming = computed(() => {
    const now = Date.now();
    return this.appointments().filter(
      (appointment) =>
        new Date(appointment.startsAt).getTime() >= now &&
        appointment.status !== 'cancelado',
    );
  });

  protected readonly past = computed(() => {
    const now = Date.now();
    return this.appointments()
      .filter(
        (appointment) =>
          new Date(appointment.startsAt).getTime() < now ||
          appointment.status === 'cancelado',
      )
      .reverse();
  });

  protected tone(status: Appointment['status']): AtrBadgeTone {
    return TONE[status];
  }

  protected statusLabel(status: Appointment['status']): string {
    return APPOINTMENT_STATUS_LABEL[status];
  }

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? 'Profissional';
  }

  protected dateLabel(instant: string): string {
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected canCancel(appointment: Appointment): boolean {
    if (appointment.status !== 'agendado') return false;

    const limit = Date.now() + CANCEL_LIMIT_HOURS * 3_600_000;
    return new Date(appointment.startsAt).getTime() > limit;
  }

  protected async cancel(appointment: Appointment): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Cancelar horário',
      message: `${appointment.serviceName} em ${this.dateLabel(appointment.startsAt)} às ${formatTime(appointment.startsAt)}. O horário volta a ficar livre para outra pessoa.`,
      confirmLabel: 'Cancelar horário',
      cancelLabel: 'Manter',
      destructive: true,
    });

    if (confirmed) await this.repository.changeStatus(appointment.id, 'cancelado');
  }
}

function horizon() {
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - PAST_DAYS);

  const to = startOfDay(new Date());
  to.setDate(to.getDate() + AHEAD_DAYS);

  return { from: from.toISOString(), to: to.toISOString() };
}
