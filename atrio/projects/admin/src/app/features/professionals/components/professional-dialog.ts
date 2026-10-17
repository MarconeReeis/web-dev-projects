import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TenantContext } from '@atrio/core';
import {
  EMPTY_DAY,
  Id,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  WEEKDAY_LABEL,
  WeeklySchedule,
  Weekday,
  clockToMinutes,
  workingDay,
} from '@atrio/data';
import {
  AtrAvatar,
  AtrButton,
  AtrField,
  AtrIcon,
  AtrInput,
  AtrOverlay,
  AtrSurfaceShell,
  AtrSwitch,
} from '@atrio/ui';
import { readSquareAvatar } from '../../../shared/photo';

const WEEKDAYS: readonly Weekday[] = [0, 1, 2, 3, 4, 5, 6];

const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

export interface ProfessionalDialogData {
  /** Nulo em cadastro novo. */
  readonly professional: Professional | null;
  readonly futureAppointments: number;
}

/**
 * Cadastro e edição de profissional.
 *
 * O formulário define UM horário e aplica a todos os dias selecionados, como
 * na referência. O modelo guarda jornada por dia e suporta mais do que isso,
 * então editar alguém que tenha sábado diferente achataria a diferença — por
 * isso o formulário avisa antes de salvar, em vez de apagar em silêncio.
 *
 * Desativar alguém com agendamentos futuros também pede confirmação: os
 * atendimentos já marcados continuam de pé, e o dono precisa saber disso
 * antes e não depois.
 */
@Component({
  selector: 'adm-professional-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AtrSurfaceShell,
    AtrButton,
    AtrField,
    AtrInput,
    AtrIcon,
    AtrAvatar,
    AtrSwitch,
  ],
  template: `
    <atr-surface-shell
      [heading]="isNew ? 'Novo profissional' : 'Editar profissional'"
      description="Os horários definem a disponibilidade na agenda."
      (closed)="close()"
    >
      <div class="flex flex-col gap-4">
        <!-- Foto -->
        <div class="flex items-center gap-4">
          <atr-avatar [name]="name() || '?'" [photoUrl]="photoUrl()" size="lg" />
          <button type="button" atrButton="outline" size="sm" (click)="picker.click()">
            <atr-icon name="image" [size]="16" />
            Foto (opcional)
          </button>
          @if (photoUrl()) {
            <button type="button" atrButton="ghost" size="sm" (click)="photoUrl.set(null)">
              Remover
            </button>
          }
          <input
            #picker
            type="file"
            accept="image/*"
            class="sr-only"
            (change)="onPhoto($event)"
          />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <atr-field label="Nome" [error]="showErrors() ? nameError() : null">
            <input
              atrInput
              type="text"
              autocomplete="off"
              [invalid]="showErrors() && !!nameError()"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
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

        <!-- Serviços -->
        <fieldset>
          <legend class="mb-1.5 text-sm font-semibold">Serviços realizados</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            @for (service of services(); track service.id) {
              <label
                class="flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
                [class]="
                  hasService(service.id)
                    ? 'border-primary bg-primary-soft'
                    : 'border-border hover:border-input'
                "
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  [checked]="hasService(service.id)"
                  (change)="toggleService(service.id)"
                />
                <span
                  class="flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                  [class]="
                    hasService(service.id)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  "
                >
                  @if (hasService(service.id)) {
                    <atr-icon name="check" [size]="12" [strokeWidth]="3" />
                  }
                </span>
                <span class="min-w-0 truncate font-semibold">
                  {{ service.name }}
                  @if (!service.active) {
                    <span class="font-normal text-muted-foreground">(inativo)</span>
                  }
                </span>
              </label>
            }
          </div>
          @if (serviceIds().length === 0) {
            <p class="mt-1.5 text-sm text-muted-foreground">
              Sem serviço associado, este profissional não aparece no agendamento.
            </p>
          }
        </fieldset>

        <!-- Dias -->
        <fieldset>
          <legend class="mb-1.5 text-sm font-semibold">Dias de trabalho</legend>
          <div class="flex flex-wrap gap-2">
            @for (day of weekdays; track day) {
              <button
                type="button"
                class="pill min-w-16"
                [attr.data-active]="worksOn(day)"
                [attr.aria-pressed]="worksOn(day)"
                [attr.aria-label]="weekdayLabel(day)"
                (click)="toggleDay(day)"
              >
                {{ shortLabel(day) }}
              </button>
            }
          </div>
          @if (days().length === 0) {
            <p class="mt-1.5 text-sm text-muted-foreground">
              Sem dia selecionado, a agenda deste profissional fica fechada.
            </p>
          }
        </fieldset>

        <!-- Horários -->
        @if (hadMixedSchedule) {
          <p
            class="rounded-xl bg-warning-soft px-4 py-3 text-sm font-medium text-warning-soft-foreground"
          >
            Este profissional tem horários diferentes conforme o dia. Salvar vai
            aplicar o mesmo horário a todos os dias selecionados.
          </p>
        }

        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <atr-field label="Início">
            <input atrInput type="time" step="900" [value]="start()" (change)="start.set($any($event.target).value)" />
          </atr-field>
          <atr-field label="Fim" [error]="showErrors() ? shiftError() : null">
            <input atrInput type="time" step="900" [value]="end()" (change)="end.set($any($event.target).value)" />
          </atr-field>
          <atr-field label="Intervalo de" [optional]="true">
            <input atrInput type="time" step="900" [value]="breakStart()" (change)="breakStart.set($any($event.target).value)" />
          </atr-field>
          <atr-field label="até" [error]="showErrors() ? breakError() : null">
            <input atrInput type="time" step="900" [value]="breakEnd()" (change)="breakEnd.set($any($event.target).value)" />
          </atr-field>
        </div>

        <atr-switch
          [(checked)]="active"
          label="Profissional ativo"
          [description]="activeHint()"
        />

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
        <button type="button" atrButton [disabled]="busy()" (click)="save()">Salvar</button>
      </div>
    </atr-surface-shell>
  `,
})
export class ProfessionalDialog {
  private readonly ref = inject<DialogRef<boolean, ProfessionalDialog>>(DialogRef);
  private readonly data = inject<ProfessionalDialogData>(DIALOG_DATA);
  private readonly repository = inject(ProfessionalRepository);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly tenant = inject(TenantContext);
  private readonly overlay = inject(AtrOverlay);

  private readonly current = this.data.professional;
  protected readonly isNew = this.current === null;
  protected readonly weekdays = WEEKDAYS;

  /** Inclui inativos: o profissional pode já estar associado a um deles. */
  protected readonly services = toSignal(this.servicesRepo.watchAll(true), {
    initialValue: [] as readonly Service[],
  });

  protected readonly name = signal(this.current?.name ?? '');
  protected readonly phone = signal(this.current?.phone ?? '');
  protected readonly photoUrl = signal<string | null>(this.current?.photoUrl ?? null);
  protected readonly serviceIds = signal<readonly Id[]>(this.current?.serviceIds ?? []);
  protected readonly active = signal(this.current?.active ?? true);
  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);

  private readonly initial = readSchedule(this.current?.schedule);
  protected readonly hadMixedSchedule = this.initial.mixed;

  protected readonly days = signal<readonly Weekday[]>(this.initial.days);
  protected readonly start = signal(this.initial.start);
  protected readonly end = signal(this.initial.end);
  protected readonly breakStart = signal(this.initial.breakStart);
  protected readonly breakEnd = signal(this.initial.breakEnd);

  protected shortLabel = (day: Weekday) => WEEKDAY_SHORT[day];
  protected weekdayLabel = (day: Weekday) => WEEKDAY_LABEL[day];

  protected readonly activeHint = computed(() =>
    this.active()
      ? 'Aparece na agenda e aceita novos agendamentos.'
      : 'Some do agendamento, mas o histórico e os atendimentos já marcados continuam.',
  );

  // ─── seleção ──────────────────────────────────────────────────────────

  protected hasService(id: Id): boolean {
    return this.serviceIds().includes(id);
  }

  protected toggleService(id: Id): void {
    this.serviceIds.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  protected worksOn(day: Weekday): boolean {
    return this.days().includes(day);
  }

  protected toggleDay(day: Weekday): void {
    this.days.update((days) =>
      days.includes(day) ? days.filter((item) => item !== day) : [...days, day].sort(),
    );
  }

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe o nome.' : null,
  );

  protected readonly shiftError = computed(() => {
    // Campo de hora vazio produz NaN na comparação, e NaN <= n e falso: sem
    // esta guarda o formulario salvaria um expediente em branco, que some da
    // agenda sem dizer por que.
    if (!this.start() || !this.end()) return 'Informe o horário de trabalho.';

    return clockToMinutes(this.end()) <= clockToMinutes(this.start())
      ? 'O fim precisa ser depois do início.'
      : null;
  });

  protected readonly breakError = computed(() => {
    const from = this.breakStart();
    const to = this.breakEnd();
    if (!from && !to) return null;
    if (!from || !to) return 'Preencha as duas horas do intervalo.';
    if (clockToMinutes(to) <= clockToMinutes(from)) return 'O fim precisa ser depois do início.';
    if (
      clockToMinutes(from) < clockToMinutes(this.start()) ||
      clockToMinutes(to) > clockToMinutes(this.end())
    ) {
      return 'O intervalo precisa ficar dentro do expediente.';
    }
    return null;
  });

  // ─── ações ────────────────────────────────────────────────────────────

  protected async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.photoUrl.set(await readSquareAvatar(file));
      this.error.set(null);
    } catch (cause) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Não foi possível ler a imagem.',
      );
    } finally {
      // Permite escolher o mesmo arquivo de novo depois de remover.
      input.value = '';
    }
  }

  protected close(): void {
    this.ref.close(false);
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.error.set(null);

    if (this.nameError() || this.shiftError() || this.breakError()) return;

    // Atendimentos já marcados não somem quando alguém é desativado; quem
    // está no balcão precisa saber disso antes de confirmar.
    if (this.current?.active && !this.active() && this.data.futureAppointments > 0) {
      const count = this.data.futureAppointments;
      const confirmed = await this.overlay.confirm({
        heading: 'Desativar profissional',
        message:
          `${this.current.name} tem ${count} agendamento${count === 1 ? '' : 's'} futuro${count === 1 ? '' : 's'}. ` +
          'Eles continuam de pé e aparecem na agenda; o profissional só deixa de aceitar novos.',
        confirmLabel: 'Desativar mesmo assim',
        destructive: true,
      });
      if (!confirmed) return;
    }

    const stamp = new Date().toISOString();
    const professional: Professional = {
      id: this.current?.id ?? `pro-${Date.now().toString(36)}`,
      tenantId: this.current?.tenantId ?? this.tenant.id() ?? '',
      name: this.name().trim(),
      photoUrl: this.photoUrl(),
      phone: this.phone().trim() || null,
      serviceIds: this.serviceIds(),
      schedule: this.buildSchedule(),
      active: this.active(),
      createdAt: this.current?.createdAt ?? stamp,
      updatedAt: stamp,
    };

    this.busy.set(true);
    try {
      await this.repository.save(professional);
      this.ref.close(true);
    } catch (cause) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private buildSchedule(): WeeklySchedule {
    const breaks =
      this.breakStart() && this.breakEnd()
        ? [{ start: this.breakStart(), end: this.breakEnd() }]
        : [];

    const day = workingDay(this.start(), this.end(), breaks);
    const selected = this.days();

    return Object.fromEntries(
      WEEKDAYS.map((weekday) => [weekday, selected.includes(weekday) ? day : EMPTY_DAY]),
    ) as unknown as WeeklySchedule;
  }
}

interface ScheduleForm {
  readonly days: readonly Weekday[];
  readonly start: string;
  readonly end: string;
  readonly breakStart: string;
  readonly breakEnd: string;
  /** Os dias de trabalho não têm todos o mesmo horário. */
  readonly mixed: boolean;
}

/**
 * Achata a jornada semanal nos campos únicos do formulário.
 *
 * Usa o horário do primeiro dia de trabalho como valor dos campos e sinaliza
 * quando os demais divergem, para o formulário poder avisar.
 */
function readSchedule(schedule: WeeklySchedule | undefined): ScheduleForm {
  const fallback: ScheduleForm = {
    days: [1, 2, 3, 4, 5, 6],
    start: '09:00',
    end: '19:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    mixed: false,
  };

  if (!schedule) return fallback;

  const days = WEEKDAYS.filter((day) => schedule[day].working);
  if (days.length === 0) return { ...fallback, days: [] };

  const signatures = new Set(
    days.map((day) => {
      const value = schedule[day];
      const window = value.windows[0];
      const pause = value.breaks[0];
      return `${window?.start}-${window?.end}|${pause?.start ?? ''}-${pause?.end ?? ''}`;
    }),
  );

  const first = schedule[days[0]];

  return {
    days,
    start: toTimeInput(first.windows[0]?.start) || fallback.start,
    end: toTimeInput(first.windows[first.windows.length - 1]?.end) || fallback.end,
    breakStart: toTimeInput(first.breaks[0]?.start),
    breakEnd: toTimeInput(first.breaks[0]?.end),
    mixed: signatures.size > 1,
  };
}

/**
 * Adapta uma hora do modelo ao que o <input type="time"> aceita.
 *
 * O modelo admite "24:00" como fim do dia, e o motor de disponibilidade conta
 * com isso. O input nao: seu intervalo valido termina em 23:59, e um valor
 * fora dele e descartado em silencio -- o campo aparece vazio e o usuario nao
 * descobre por que. Um minuto de diferenca nao muda nenhuma agenda real.
 */
function toTimeInput(clock: string | undefined): string {
  if (!clock) return '';
  return clock === '24:00' ? '23:59' : clock;
}
