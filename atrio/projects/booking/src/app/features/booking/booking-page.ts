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
import { NgTemplateOutlet } from '@angular/common';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  Appointment,
  AppointmentRepository,
  Id,
  IsoDateTime,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  TimeBlock,
  TimeBlockRepository,
  formatLongDate,
  formatMoney,
  formatTime,
  leastBusy,
  openSlots,
  startOfDay,
} from '@atrio/data';
import {
  AtrAvatar,
  AtrButton,
  AtrField,
  AtrIcon,
  AtrInput,
  initialsOf,
} from '@atrio/ui';
import { ClientIdentity } from '../../shared/client-identity';
import { ScheduleStep } from './components/schedule-step';

type Step = 'profissional' | 'servico' | 'horario' | 'confirmar' | 'pronto';

/**
 * Ordem canônica, única.
 *
 * Profissional primeiro porque a lista de serviços do passo seguinte sai
 * filtrada pelo que aquela pessoa realiza — o beco do "ele não faz barba"
 * deixa de existir. Numa barbearia a fidelidade ao barbeiro pesa mais que a
 * preferência por serviço, e quem não tem preferência escolhe "qualquer".
 *
 * Os atalhos da tela inicial apenas PRÉ-SELECIONAM; nenhum encurta o fluxo.
 * Antes havia três caminhos com contagens de passo diferentes, e manter isso
 * coerente custava mais do que valia.
 */
const ORDER: readonly Step[] = ['profissional', 'servico', 'horario', 'confirmar'];

const TITLES: Readonly<Record<Step, string>> = {
  profissional: 'Escolha o profissional',
  servico: 'Escolha o serviço',
  horario: 'Escolha o horário',
  confirmar: 'Confirme o agendamento',
  pronto: 'Agendado',
};

/** Sentinela de "sem preferência", distinta de "ainda não escolheu". */
const ANY = 'qualquer';
type ProfessionalChoice = Id | typeof ANY | null;

@Component({
  selector: 'bkg-booking-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    RouterLink,
    AtrButton,
    AtrIcon,
    AtrAvatar,
    AtrField,
    AtrInput,
    ScheduleStep,
  ],
  host: { class: 'flex min-h-dvh flex-col bg-background' },
  template: `
    <!-- Marcador de seleção, compartilhado pelos passos 1 e 2 -->
    <ng-template #radio let-marcado>
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
        [class]="marcado ? 'border-primary bg-primary text-primary-foreground' : 'border-input'"
        aria-hidden="true"
      >
        @if (marcado) {
          <atr-icon name="check" [size]="14" [strokeWidth]="3" />
        }
      </span>
    </ng-template>

    <!-- Cabeçalho -->
    <header class="sticky top-0 z-20 bg-background">
      <div class="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
        @if (step() === 'pronto') {
          <span class="flex-1 font-bold">{{ title() }}</span>
          <a
            class="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground"
            aria-label="Fechar"
            [routerLink]="['/b', slug()]"
          >
            <atr-icon name="x" [size]="20" />
          </a>
        } @else {
          <button
            type="button"
            class="floating inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors hover:bg-accent"
            aria-label="Voltar"
            (click)="back()"
          >
            <atr-icon name="chevron-left" [size]="20" />
          </button>
          <span class="min-w-0 flex-1 text-center">
            <span class="block truncate font-bold">{{ title() }}</span>
            <span class="block text-xs text-muted-foreground">
              Etapa {{ stepNumber() }} de {{ total }}
            </span>
          </span>
          <span class="size-11 shrink-0"></span>
        }
      </div>

      <!-- Progresso em segmentos: diz quantas etapas faltam, não só quanto já
           andou — uma barra contínua não informa isso. -->
      @if (step() !== 'pronto') {
        <div class="mx-auto flex w-full max-w-2xl gap-1.5 px-4 pb-3">
          @for (item of order; track item) {
            <span
              class="h-1.5 flex-1 rounded-full transition-colors"
              [class]="isDone(item) ? 'bg-primary' : 'bg-muted'"
            ></span>
          }
        </div>
      }
    </header>

    <main class="mx-auto w-full max-w-2xl flex-1 px-4 pt-2 pb-36">
      @switch (step()) {
        <!-- 1. Profissional -->
        @case ('profissional') {
          <ul class="flex flex-col gap-2">
            <li>
              <button
                type="button"
                class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                [class]="cardClass(choice() === ANY)"
                (click)="choose(ANY)"
              >
                <span
                  class="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                >
                  <atr-icon name="users" [size]="20" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block font-bold">Qualquer profissional</span>
                  <span class="block text-sm text-muted-foreground">
                    Mostra todos os horários livres
                  </span>
                </span>
                <ng-container
                  *ngTemplateOutlet="radio; context: { $implicit: choice() === ANY }"
                />
              </button>
            </li>

            @for (professional of professionals(); track professional.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                  [class]="cardClass(choice() === professional.id)"
                  (click)="choose(professional.id)"
                >
                  <atr-avatar
                    [name]="professional.name"
                    [photoUrl]="professional.photoUrl"
                    size="lg"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block font-bold">{{ professional.name }}</span>
                    @if (professional.bio) {
                      <span class="block text-sm font-semibold text-primary">
                        {{ professional.bio }}
                      </span>
                    }
                  </span>
                  <ng-container
                    *ngTemplateOutlet="
                      radio;
                      context: { $implicit: choice() === professional.id }
                    "
                  />
                </button>
              </li>
            }
          </ul>
        }

        <!-- 2. Serviço -->
        @case ('servico') {
          <!-- Ficha do profissional: foto à esquerda, identificação à
               direita. Lembra com quem o cliente vai — mudar de etapa apaga
               da tela a escolha anterior — e a apresentação ajuda quem ainda
               está decidindo se é mesmo aquele barbeiro. -->
          <div class="surface mb-5 flex items-start gap-4 p-4">
            @if (chosenProfessional(); as professional) {
              @if (professional.photoUrl; as photo) {
                <img
                  [src]="photo"
                  [alt]="professional.name"
                  class="size-20 shrink-0 rounded-2xl object-cover"
                />
              } @else {
                <span
                  class="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-xl font-extrabold text-primary-soft-foreground"
                  aria-hidden="true"
                >
                  {{ initials(professional.name) }}
                </span>
              }
              <span class="min-w-0 flex-1">
                <span class="block text-2xl font-extrabold tracking-tight text-balance">
                  {{ professional.name }}
                </span>
                @if (professional.bio) {
                  <span class="mt-0.5 block font-semibold text-primary">
                    {{ professional.bio }}
                  </span>
                }
                @if (professional.about) {
                  <span class="mt-1.5 block text-sm text-balance text-muted-foreground">
                    {{ professional.about }}
                  </span>
                }
              </span>
            } @else {
              <span
                class="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground"
              >
                <atr-icon name="users" [size]="28" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-2xl font-extrabold tracking-tight">
                  Qualquer profissional
                </span>
                <span class="mt-1.5 block text-sm text-muted-foreground">
                  Mostramos o catálogo completo e, no horário escolhido, quem
                  estiver livre atende você.
                </span>
              </span>
            }
          </div>

          <h2 class="mb-3 font-bold">Serviços</h2>

          @if (visibleServices().length === 0) {
            <p class="rounded-xl bg-warning-soft px-4 py-3.5 text-sm text-warning-soft-foreground">
              Este profissional ainda não tem serviços cadastrados.
            </p>
          } @else {
            <ul class="flex flex-col gap-2">
              @for (service of visibleServices(); track service.id) {
                <li>
                  <button
                    type="button"
                    class="flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors"
                    [class]="cardClass(service.id === serviceId())"
                    (click)="serviceId.set(service.id)"
                  >
                    <span class="min-w-0 flex-1">
                      <span class="block font-bold">{{ service.name }}</span>
                      @if (service.description) {
                        <span class="block text-sm text-balance text-muted-foreground">
                          {{ service.description }}
                        </span>
                      }
                      <span
                        class="tabular mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground"
                      >
                        <atr-icon name="clock" [size]="14" />
                        {{ service.durationMinutes }} min
                      </span>
                    </span>
                    <span class="tabular shrink-0 font-extrabold">
                      {{ money(service.price) }}
                    </span>
                    <ng-container
                      *ngTemplateOutlet="
                        radio;
                        context: { $implicit: service.id === serviceId() }
                      "
                    />
                  </button>
                </li>
              }
            </ul>
          }
        }

        <!-- 3. Dia e horário -->
        @case ('horario') {
          @if (service(); as chosen) {
            <bkg-schedule-step
              [service]="chosen"
              [professionals]="slotCandidates()"
              [existing]="dayAppointments()"
              [blocks]="dayBlocks()"
              [date]="date()"
              [selected]="startsAt()"
              (dateChange)="chooseDate($event)"
              (selectedChange)="startsAt.set($event)"
            />
          }
        }

        <!-- 4. Confirmação -->
        @case ('confirmar') {
          <div class="rounded-surface bg-ink p-5 text-ink-foreground">
            <p class="text-sm text-ink-muted">{{ service()?.name }}</p>
            <p class="tabular mt-1 text-2xl font-extrabold">
              {{ money(service()?.price ?? 0) }}
            </p>
            <div class="mt-4 flex flex-col gap-2 text-sm">
              <span class="inline-flex items-center gap-2">
                <atr-icon name="calendar-days" [size]="16" class="text-ink-muted" />
                {{ dateLabel() }}
              </span>
              <span class="tabular inline-flex items-center gap-2">
                <atr-icon name="clock" [size]="16" class="text-ink-muted" />
                {{ startsAt() ? time(startsAt()!) : '' }} ·
                {{ service()?.durationMinutes }} min
              </span>
              <span class="inline-flex items-center gap-2">
                <atr-icon name="user-round" [size]="16" class="text-ink-muted" />
                {{ assignedLabel() }}
              </span>
            </div>
          </div>

          <div class="mt-5 flex flex-col gap-4">
            <atr-field label="Seu nome" [error]="showErrors() ? nameError() : null">
              <input
                atrInput
                type="text"
                autocomplete="name"
                [invalid]="showErrors() && !!nameError()"
                [value]="name()"
                (input)="name.set($any($event.target).value)"
              />
            </atr-field>

            <atr-field
              label="Telefone"
              hint="A barbearia usa para falar com você se precisar."
              [error]="showErrors() ? phoneError() : null"
            >
              <input
                atrInput
                type="tel"
                inputmode="tel"
                autocomplete="tel"
                placeholder="(11) 98888-7777"
                [invalid]="showErrors() && !!phoneError()"
                [value]="phone()"
                (input)="phone.set($any($event.target).value)"
              />
            </atr-field>

            <atr-field label="Observações" [optional]="true">
              <textarea
                atrInput
                rows="2"
                class="py-3"
                placeholder="Alguma preferência?"
                (input)="notes.set($any($event.target).value)"
              >{{ notes() }}</textarea>
            </atr-field>
          </div>

          @if (error(); as message) {
            <p
              class="mt-4 rounded-xl bg-destructive-soft px-4 py-3 text-sm font-medium text-destructive-soft-foreground"
              role="alert"
            >
              {{ message }}
            </p>
          }
        }

        <!-- Pronto -->
        @case ('pronto') {
          <div class="flex flex-col items-center gap-4 py-10 text-center">
            <span
              class="flex size-20 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground"
            >
              <atr-icon name="check" [size]="36" [strokeWidth]="3" />
            </span>
            <h2 class="text-2xl font-extrabold tracking-tight">Horário confirmado</h2>
            <p class="text-balance text-muted-foreground">
              {{ dateLabel() }} às {{ startsAt() ? time(startsAt()!) : '' }}, com
              {{ assignedLabel() }}.
            </p>

            <div class="mt-4 flex w-full flex-col gap-2">
              <a atrButton class="w-full" [routerLink]="['/b', slug(), 'meus-horarios']">
                Ver meus horários
              </a>
              <a atrButton="ghost" class="w-full" [routerLink]="['/b', slug()]">
                Voltar ao início
              </a>
            </div>
          </div>
        }
      }
    </main>

    <!-- Rodapé: resumo da escolha + ação -->
    @if (step() !== 'pronto') {
      <div class="edge-top fixed inset-x-0 bottom-0 z-20 bg-card pb-[env(safe-area-inset-bottom)]">
        <div class="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 py-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-muted-foreground">{{ summaryLabel() }}</p>
            <p class="tabular truncate font-extrabold">{{ summaryValue() }}</p>
          </div>
          <button
            type="button"
            atrButton
            size="lg"
            class="shrink-0"
            [disabled]="!canAdvance() || busy()"
            (click)="advance()"
          >
            {{ ctaLabel() }}
          </button>
        </div>
      </div>
    }
  `,
})
export class BookingPage {
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);
  private readonly blocksRepo = inject(TimeBlockRepository);
  private readonly identity = inject(ClientIdentity);
  private readonly router = inject(Router);

  /**
   * Atalhos da tela inicial. Ambos só pré-selecionam; dá para voltar e trocar.
   *
   *   ?profissional=pro-caio   escolhe a pessoa e abre no serviço
   *   ?servico=svc-corte       deixa o serviço marcado para a etapa 2
   */
  readonly profissional = input<string | undefined>(undefined);
  readonly servico = input<string | undefined>(undefined);
  readonly slug = input<string>('');

  protected money = formatMoney;
  protected time = formatTime;
  protected initials = initialsOf;
  protected readonly order = ORDER;
  protected readonly total = ORDER.length;
  protected readonly ANY = ANY;

  protected readonly step = signal<Step>('profissional');
  protected readonly choice = signal<ProfessionalChoice>(null);
  protected readonly serviceId = signal<Id | null>(null);
  protected readonly date = signal(startOfDay(new Date()));
  protected readonly startsAt = signal<IsoDateTime | null>(null);

  protected readonly name = signal(this.identity.name());
  protected readonly phone = signal(this.identity.phone());
  protected readonly notes = signal('');

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  private readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  constructor() {
    effect(() => {
      const fromQuery = this.profissional();
      if (!fromQuery) return;

      untracked(() => {
        if (this.choice() !== null) return;
        this.choice.set(fromQuery);
        this.step.set('servico');
      });
    });

    effect(() => {
      const fromQuery = this.servico();
      if (!fromQuery) return;

      untracked(() => {
        if (this.serviceId() === null) this.serviceId.set(fromQuery);
      });
    });
  }

  // ─── derivados ────────────────────────────────────────────────────────

  /** Nulo quando o cliente escolheu "qualquer profissional". */
  private readonly professionalId = computed<Id | null>(() => {
    const value = this.choice();
    return value === null || value === ANY ? null : value;
  });

  protected readonly chosenProfessional = computed(
    () => this.professionals().find((item) => item.id === this.professionalId()) ?? null,
  );

  /** Só o que o profissional escolhido realiza; tudo, se não há preferência. */
  protected readonly visibleServices = computed(() => {
    const professional = this.chosenProfessional();
    if (!professional) return this.services();

    return this.services().filter((service) =>
      professional.serviceIds.includes(service.id),
    );
  });

  protected readonly service = computed(
    () => this.services().find((item) => item.id === this.serviceId()) ?? null,
  );

  /** Candidatos para o cálculo de horários. */
  protected readonly slotCandidates = computed(() => {
    const service = this.service();
    if (!service) return [];

    const professional = this.chosenProfessional();
    if (professional) return [professional];

    return this.professionals().filter((item) => item.serviceIds.includes(service.id));
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
    { initialValue: [] as readonly TimeBlock[] },
  );

  /** Congelado na confirmação — ver o comentário em confirm(). */
  private readonly confirmedWith = signal<Professional | null>(null);

  private readonly assigned = computed<Professional | null>(() => {
    const chosen = this.chosenProfessional();
    if (chosen) return chosen;

    const service = this.service();
    const startsAt = this.startsAt();
    if (!service || !startsAt) return null;

    const slot = openSlots({
      date: this.date(),
      service,
      professionals: this.slotCandidates(),
      existing: this.dayAppointments(),
      blocks: this.dayBlocks(),
      now: new Date(),
    }).find((item) => item.startsAt === startsAt);

    return slot ? leastBusy(slot.professionals, this.dayAppointments()) : null;
  });

  protected readonly assignedLabel = computed(
    () => (this.confirmedWith() ?? this.assigned())?.name ?? 'a definir',
  );

  // ─── cabeçalho e rodapé ───────────────────────────────────────────────

  protected readonly title = computed(() => TITLES[this.step()]);

  protected readonly stepNumber = computed(() => {
    const index = ORDER.indexOf(this.step());
    return index < 0 ? ORDER.length : index + 1;
  });

  protected isDone(item: Step): boolean {
    return ORDER.indexOf(item) <= ORDER.indexOf(this.step());
  }

  protected readonly dateLabel = computed(() => {
    const instant = this.startsAt() ?? this.date().toISOString();
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  /**
   * Resumo no rodapé, ao lado do botão que leva adiante.
   *
   * Num fluxo de quatro etapas é o que evita chegar na confirmação sem
   * lembrar o que foi marcado três telas atrás.
   */
  protected readonly summaryLabel = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return this.choice() === null ? 'Nenhum profissional escolhido' : 'Profissional';
      case 'servico':
        return this.service() ? 'Serviço' : 'Nenhum serviço selecionado';
      case 'horario':
        return this.startsAt() ? 'Horário' : 'Escolha um horário livre';
      default:
        return this.service()?.name ?? '';
    }
  });

  protected readonly summaryValue = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return this.choice() === null
          ? '—'
          : (this.chosenProfessional()?.name ?? 'Qualquer profissional');
      case 'servico': {
        const service = this.service();
        return service ? `${service.name} · ${formatMoney(service.price)}` : '—';
      }
      case 'horario': {
        const startsAt = this.startsAt();
        return startsAt ? `${this.dateLabel()} · ${formatTime(startsAt)}` : '—';
      }
      default:
        return formatMoney(this.service()?.price ?? 0);
    }
  });

  protected readonly ctaLabel = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return 'Ver serviços';
      case 'servico':
        return 'Escolher horário';
      case 'horario':
        return 'Continuar';
      default:
        return 'Confirmar';
    }
  });

  protected cardClass(selected: boolean): string {
    return selected
      ? 'border-primary bg-primary-soft'
      : 'border-border bg-card hover:border-primary';
  }

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe seu nome.' : null,
  );

  protected readonly phoneError = computed(() => {
    const digits = this.phone().replace(/\D/g, '');
    // 10 dígitos cobre fixo com DDD; 11, celular. Sem exigir formatação:
    // quem digita sem parênteses não deve ser barrado.
    return digits.length < 10 ? 'Informe um telefone com DDD.' : null;
  });

  protected readonly canAdvance = computed(() => {
    switch (this.step()) {
      case 'profissional':
        return this.choice() !== null;
      case 'servico':
        return this.serviceId() !== null;
      case 'horario':
        return this.startsAt() !== null;
      default:
        return true;
    }
  });

  // ─── navegação ────────────────────────────────────────────────────────

  protected choose(value: ProfessionalChoice): void {
    if (this.choice() !== value) {
      // Trocar de profissional pode invalidar o serviço: nem todos realizam
      // os mesmos. O horário cai junto, porque depende dos dois.
      this.serviceId.set(null);
      this.startsAt.set(null);
    }
    this.choice.set(value);
  }

  protected chooseDate(date: Date): void {
    this.date.set(date);
    this.startsAt.set(null);
  }

  protected back(): void {
    const index = ORDER.indexOf(this.step());

    // No primeiro passo, voltar sai do fluxo e devolve à vitrine.
    if (index <= 0) {
      void this.router.navigate(['/b', this.slug()]);
      return;
    }
    this.step.set(ORDER[index - 1]);
  }

  protected async advance(): Promise<void> {
    if (this.step() !== 'confirmar') {
      const index = ORDER.indexOf(this.step());
      this.step.set(ORDER[index + 1]);
      return;
    }
    await this.confirm();
  }

  private async confirm(): Promise<void> {
    this.showErrors.set(true);
    this.error.set(null);

    const service = this.service();
    const startsAt = this.startsAt();
    const professional = this.assigned();

    if (this.nameError() || this.phoneError() || !service || !startsAt) return;

    if (!professional) {
      this.error.set('Esse horário acabou de ser ocupado. Escolha outro.');
      this.step.set('horario');
      this.startsAt.set(null);
      return;
    }

    this.busy.set(true);
    try {
      await this.appointmentsRepo.create({
        professionalId: professional.id,
        serviceId: service.id,
        client: {
          clientId: null,
          name: this.name().trim(),
          phone: this.phone().trim(),
        },
        startsAt,
        notes: this.notes().trim() || null,
      });

      // `assigned` recalcula leastBusy assim que o novo agendamento entra na
      // lista do dia e passaria a apontar outra pessoa. A tela de sucesso
      // precisa dizer quem de fato ficou com o atendimento.
      this.confirmedWith.set(professional);
      this.identity.remember(this.name(), this.phone());
      this.step.set('pronto');
    } catch (cause) {
      // Entre escolher o horário e confirmar, alguém pode ter marcado.
      this.error.set(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível concluir o agendamento.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
