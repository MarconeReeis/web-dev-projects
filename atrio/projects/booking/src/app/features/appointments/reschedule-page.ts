import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  Appointment,
  AppointmentRepository,
  IsoDateTime,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  TimeBlock,
  TimeBlockRepository,
  formatShortDay,
  formatTime,
  startOfDay,
} from '@atrio/data';
import { AtrButton, AtrCard, AtrEmptyState } from '@atrio/ui';
import { PageHeader } from '../../shared/page-header';
import { BOOKING_HORIZON_DAYS, ScheduleStep } from '../booking/components/schedule-step';
import { canChange } from './appointment-rules';
import { ownAppointment } from './own-appointment';

/**
 * Trocar o dia e a hora de um agendamento.
 *
 * Só dia e hora: o serviço e o profissional ficam. Quem quer trocar de
 * barbeiro ou de serviço está fazendo outro agendamento, e o caminho para
 * isso já existe — cancelar e marcar de novo.
 *
 * A reserva atual vale até a confirmação. Nada é desfeito ao abrir a tela,
 * então desistir no meio não custa o horário que a pessoa já tinha.
 */
@Component({
  selector: 'bkg-reschedule-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrButton, AtrCard, AtrEmptyState, PageHeader, ScheduleStep],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <bkg-page-header heading="Reagendar" (back)="back()" />

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 pt-2 pb-36">
      @if (appointment(); as item) {
        @if (!changeable()) {
          <atr-card>
            <atr-empty-state
              icon="calendar-x"
              heading="Não dá para reagendar por aqui"
              description="Este horário já passou, foi cancelado ou está a menos de 2h. Fale com a barbearia."
            >
              <a atrButton class="mt-2" [routerLink]="detailLink()">Voltar ao agendamento</a>
            </atr-empty-state>
          </atr-card>
        } @else if (service(); as chosen) {
          <p class="mb-5 text-sm text-balance text-muted-foreground">
            {{ item.serviceName }} com {{ professional()?.name ?? 'o profissional' }}. Sua
            reserva atual continua válida até você confirmar.
          </p>

          <bkg-schedule-step
            [service]="chosen"
            [professionals]="candidates()"
            [existing]="others()"
            [blocks]="blocks()"
            [date]="date()"
            [selected]="startsAt()"
            (dateChange)="chooseDate($event)"
            (selectedChange)="startsAt.set($event)"
          />

          @if (error(); as message) {
            <p
              class="mt-5 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
              role="alert"
            >
              {{ message }}
            </p>
          }
        } @else {
          <!-- O serviço saiu do catálogo depois da marcação. -->
          <atr-card>
            <atr-empty-state
              icon="calendar-x"
              heading="Serviço indisponível"
              description="Este serviço não está mais no catálogo. Para mudar o horário, fale com a barbearia."
            >
              <a atrButton class="mt-2" [routerLink]="detailLink()">Voltar ao agendamento</a>
            </atr-empty-state>
          </atr-card>
        }
      } @else if (appointment() === null) {
        <atr-card>
          <atr-empty-state
            icon="calendar-x"
            heading="Agendamento não encontrado"
            description="Ele pode ter sido removido, ou pertencer a outra conta."
          >
            <a atrButton class="mt-2" [routerLink]="['/b', slug(), 'meus-horarios']">
              Ver meus horários
            </a>
          </atr-empty-state>
        </atr-card>
      }
    </main>

    @if (changeable() && service()) {
      <div class="edge-top fixed inset-x-0 bottom-0 z-20 bg-card pb-[env(safe-area-inset-bottom)]">
        <div class="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 py-3">
          <div class="min-w-0 flex-1">
            <!-- Dia na linha de cima, hora na de baixo: juntos numa linha só,
                 ao lado do botão, a hora era cortada — e é ela que importa. -->
            <p class="truncate text-sm text-muted-foreground">
              {{ startsAt() ? 'Novo horário' : 'Horário atual' }} · {{ footerDay() }}
            </p>
            <p class="tabular truncate text-lg font-extrabold">{{ footerTime() }}</p>
          </div>
          <button
            type="button"
            atrButton
            size="lg"
            class="shrink-0"
            [disabled]="!startsAt() || unchanged() || busy()"
            (click)="confirm()"
          >
            {{ busy() ? 'Trocando…' : 'Confirmar troca' }}
          </button>
        </div>
      </div>
    }
  `,
})
export class ReschedulePage {
  private readonly repository = inject(AppointmentRepository);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly router = inject(Router);

  readonly slug = input<string>('');
  readonly id = input<string>('');

  protected readonly appointment = ownAppointment(this.id);

  protected readonly date = signal(startOfDay(new Date()));
  protected readonly startsAt = signal<IsoDateTime | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  /** Mesma janela do agendamento novo — ver `horizon` em booking-page. */
  private readonly horizon = (() => {
    const from = startOfDay(new Date());
    const to = new Date(from);
    to.setDate(to.getDate() + BOOKING_HORIZON_DAYS);
    return { from: from.toISOString(), to: to.toISOString() };
  })();

  private readonly horizonAppointments = toSignal(
    this.repository.watch({ range: this.horizon }),
    { initialValue: [] as readonly Appointment[] },
  );

  protected readonly blocks = toSignal(this.blocksRepo.watch(this.horizon), {
    initialValue: [] as readonly TimeBlock[],
  });

  constructor() {
    // Abre no dia do horário atual, quando ele ainda está na janela: quem
    // reagenda costuma mudar a hora no mesmo dia ou num próximo.
    // Uma vez só: depois disso o dia é de quem está escolhendo.
    let positioned = false;
    effect(() => {
      const item = this.appointment();
      if (!item || positioned) return;
      positioned = true;
      untracked(() => {
        const day = startOfDay(new Date(item.startsAt));
        if (day.getTime() >= startOfDay(new Date()).getTime()) this.date.set(day);
      });
    });
  }

  protected readonly changeable = computed(() => {
    const item = this.appointment();
    return item ? canChange(item) : false;
  });

  protected readonly professional = computed(() => {
    const item = this.appointment();
    return item ? (this.professionals().find((p) => p.id === item.professionalId) ?? null) : null;
  });

  /** Só quem já atende: trocar de profissional é outro agendamento. */
  protected readonly candidates = computed(() => {
    const professional = this.professional();
    return professional ? [professional] : [];
  });

  /**
   * O serviço do catálogo, mas com a duração CONGELADA no agendamento.
   *
   * Se a barbearia mudou a duração depois da marcação, o horário reservado
   * continua com a duração antiga — é o que vai para a agenda ao reagendar
   * (`reschedule` usa a do agendamento). Procurar vaga com a nova mostraria
   * horários que não batem com o que será gravado.
   */
  protected readonly service = computed<Service | null>(() => {
    const item = this.appointment();
    const found = item ? this.services().find((s) => s.id === item.serviceId) : null;
    return found && item ? { ...found, durationMinutes: item.durationMinutes } : null;
  });

  /**
   * A agenda sem o próprio agendamento. Sem isto, o horário atual apareceria
   * ocupado — por ele mesmo — e mudar 09:30 para 09:45 seria impossível.
   */
  protected readonly others = computed(() =>
    this.horizonAppointments().filter((item) => item.id !== this.id()),
  );

  protected readonly unchanged = computed(
    () => this.startsAt() !== null && this.startsAt() === this.appointment()?.startsAt,
  );

  /** O horário escolhido, ou o atual enquanto nada foi escolhido. */
  private readonly shown = computed(() => this.startsAt() ?? this.appointment()?.startsAt ?? null);

  protected readonly footerDay = computed(() => {
    const startsAt = this.shown();
    return startsAt ? formatShortDay(startsAt) : '';
  });

  protected readonly footerTime = computed(() => {
    const startsAt = this.shown();
    const item = this.appointment();
    if (!startsAt || !item) return '';

    const ends = new Date(startsAt);
    ends.setMinutes(ends.getMinutes() + item.durationMinutes);
    return `${formatTime(startsAt)} – ${formatTime(ends)}`;
  });

  protected readonly detailLink = computed(() => ['/b', this.slug(), 'meus-horarios', this.id()]);

  protected chooseDate(date: Date): void {
    this.date.set(date);
    this.startsAt.set(null);
    this.error.set(null);
  }

  protected back(): void {
    void this.router.navigate(this.detailLink());
  }

  protected async confirm(): Promise<void> {
    const startsAt = this.startsAt();
    if (!startsAt || this.unchanged()) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      await this.repository.reschedule(this.id(), startsAt);
      // replaceUrl: o "voltar" dos detalhes vai para a lista, não de novo
      // para esta tela de um reagendamento que já aconteceu.
      await this.router.navigate(this.detailLink(), {
        replaceUrl: true,
        state: { toast: 'Horário alterado!' },
      });
    } catch {
      // Entre escolher e confirmar, alguém pode ter marcado o mesmo horário.
      this.startsAt.set(null);
      this.error.set('Esse horário acabou de ser ocupado. Escolha outro.');
    } finally {
      this.busy.set(false);
    }
  }
}
