import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TenantContext } from '@atrio/core';
import {
  Cents,
  Id,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  formatAmount,
  formatMoney,
  parseMoney,
  newEntityId,
} from '@atrio/data';
import {
  AtrButton,
  AtrField,
  AtrIcon,
  AtrInput,
  AtrOverlay,
  AtrSurfaceShell,
  AtrSwitch,
} from '@atrio/ui';

/** Nenhum serviço de barbearia passa de oito horas. */
const MAX_DURATION_MINUTES = 480;

export interface ServiceDialogData {
  /** Nulo em cadastro novo. */
  readonly service: Service | null;
  /**
   * Quem já realiza este serviço.
   *
   * Vem pronto da página em vez de ser derivado aqui: o vínculo mora em
   * `Professional.serviceIds`, e derivá-lo no construtor dependeria da lista
   * de profissionais já ter chegado. Com a implementação em memória chega;
   * com o Firestore, não — e a seleção inicial sairia vazia, apagando o
   * vínculo no primeiro salvar.
   */
  readonly professionalIds: readonly Id[];
  /** Agendamentos futuros deste serviço, para avisar ao desativar. */
  readonly futureAppointments: number;
}

/**
 * Cadastro e edição de serviço.
 *
 * "Profissionais habilitados" edita o OUTRO lado de `Professional.serviceIds`
 * — o vínculo mora só lá, e a gravação vai por
 * `ProfessionalRepository.setServiceAssignment`, que é uma operação só.
 *
 * O aviso sobre preço aparece apenas quando o valor muda de fato. A referência
 * mostrava sempre; aviso que está sempre na tela vira parte do cenário e
 * ninguém lê justamente na vez em que importa.
 */
@Component({
  selector: 'adm-service-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrInput, AtrIcon, AtrSwitch],
  template: `
    <atr-surface-shell
      [heading]="isNew ? 'Novo serviço' : 'Editar serviço'"
      description="Duração e preço são preenchidos automaticamente nos agendamentos."
      (closed)="close()"
    >
      <div class="flex flex-col gap-4">
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

        <atr-field label="Descrição" [optional]="true">
          <textarea
            atrInput
            rows="2"
            class="py-3"
            placeholder="O que está incluso no serviço"
            (input)="description.set($any($event.target).value)"
          >{{ description() }}</textarea>
        </atr-field>

        <div class="grid grid-cols-2 gap-4">
          <atr-field label="Duração (min)" [error]="showErrors() ? durationError() : null">
            <input
              atrInput
              type="number"
              inputmode="numeric"
              min="5"
              step="5"
              [invalid]="showErrors() && !!durationError()"
              [value]="duration()"
              (input)="duration.set($any($event.target).value)"
            />
          </atr-field>

          <atr-field label="Preço (R$)" [error]="showErrors() ? priceError() : null">
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

        <!-- Profissionais habilitados -->
        <fieldset>
          <legend class="mb-1.5 text-sm font-semibold">Profissionais habilitados</legend>
          <div class="grid gap-2 sm:grid-cols-2">
            @for (professional of professionals(); track professional.id) {
              <label
                class="flex min-h-13 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors"
                [class]="
                  hasProfessional(professional.id)
                    ? 'border-primary bg-primary-soft'
                    : 'border-border hover:border-input'
                "
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  [checked]="hasProfessional(professional.id)"
                  (change)="toggleProfessional(professional.id)"
                />
                <span
                  class="flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                  [class]="
                    hasProfessional(professional.id)
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  "
                >
                  @if (hasProfessional(professional.id)) {
                    <atr-icon name="check" [size]="12" [strokeWidth]="3" />
                  }
                </span>
                <span class="min-w-0 truncate font-semibold">
                  {{ professional.name }}
                  @if (!professional.active) {
                    <span class="font-normal text-muted-foreground">(inativo)</span>
                  }
                </span>
              </label>
            }
          </div>
          @if (professionalIds().length === 0) {
            <p class="mt-1.5 text-sm text-muted-foreground">
              Sem ninguém habilitado, este serviço não aparece no agendamento.
            </p>
          }
        </fieldset>

        <atr-switch
          [(checked)]="active"
          label="Serviço ativo"
          [description]="activeHint()"
        />

        @if (priceChanged()) {
          <p
            class="flex items-start gap-2.5 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary-soft-foreground"
          >
            <atr-icon name="info" [size]="16" class="mt-0.5 shrink-0" />
            <span>
              O preço passa de {{ money(original!.price) }} para
              {{ money(parsedPrice() ?? 0) }}. Os agendamentos já marcados mantêm
              o valor combinado; o novo preço vale para os próximos.
            </span>
          </p>
        }

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
export class ServiceDialog {
  private readonly ref = inject<DialogRef<boolean, ServiceDialog>>(DialogRef);
  private readonly data = inject<ServiceDialogData>(DIALOG_DATA);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly tenant = inject(TenantContext);
  private readonly overlay = inject(AtrOverlay);

  protected readonly original = this.data.service;
  protected readonly isNew = this.original === null;

  protected money = formatMoney;

  /** Inclui inativos: o serviço pode continuar vinculado a um deles. */
  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(true), {
    initialValue: [] as readonly Professional[],
  });

  protected readonly name = signal(this.original?.name ?? '');
  protected readonly description = signal(this.original?.description ?? '');
  protected readonly duration = signal(String(this.original?.durationMinutes ?? 30));
  protected readonly priceText = signal(
    this.original ? formatAmount(this.original.price) : '',
  );
  protected readonly active = signal(this.original?.active ?? true);
  protected readonly professionalIds = signal<readonly Id[]>(this.data.professionalIds);

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly activeHint = computed(() =>
    this.active()
      ? 'Aparece no agendamento e no app do cliente.'
      : 'Some do agendamento; os atendimentos já marcados continuam.',
  );

  // ─── seleção ──────────────────────────────────────────────────────────

  protected hasProfessional(id: Id): boolean {
    return this.professionalIds().includes(id);
  }

  protected toggleProfessional(id: Id): void {
    this.professionalIds.update((ids) =>
      ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id],
    );
  }

  // ─── validação ────────────────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe o nome do serviço.' : null,
  );

  protected readonly parsedDuration = computed(() => {
    const value = Number.parseInt(this.duration(), 10);
    return Number.isFinite(value) ? value : null;
  });

  protected readonly durationError = computed(() => {
    const value = this.parsedDuration();
    if (value === null || value <= 0) return 'Informe a duração em minutos.';
    if (value > MAX_DURATION_MINUTES) return 'Duração máxima de 8 horas.';
    return null;
  });

  protected readonly parsedPrice = computed<Cents | null>(() =>
    parseMoney(this.priceText()),
  );

  protected readonly priceError = computed(() => {
    const value = this.parsedPrice();
    if (value === null) return 'Informe o preço.';
    if (value < 0) return 'O preço não pode ser negativo.';
    return null;
  });

  /** Só avisa quando o valor muda de verdade. */
  protected readonly priceChanged = computed(() => {
    const current = this.original;
    const next = this.parsedPrice();
    return current !== null && next !== null && next !== current.price;
  });

  // ─── ações ────────────────────────────────────────────────────────────

  protected close(): void {
    this.ref.close(false);
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    this.error.set(null);

    if (this.nameError() || this.durationError() || this.priceError()) return;

    const duration = this.parsedDuration()!;
    const price = this.parsedPrice()!;

    if (this.original?.active && !this.active() && this.data.futureAppointments > 0) {
      const count = this.data.futureAppointments;
      const confirmed = await this.overlay.confirm({
        heading: 'Desativar serviço',
        message:
          `${this.original.name} tem ${count} agendamento${count === 1 ? '' : 's'} futuro${count === 1 ? '' : 's'}. ` +
          'Eles continuam de pé com o valor já combinado; o serviço só deixa de aceitar novos.',
        confirmLabel: 'Desativar mesmo assim',
        destructive: true,
      });
      if (!confirmed) return;
    }

    const stamp = new Date().toISOString();
    const service: Service = {
      id: this.original?.id ?? newEntityId(),
      tenantId: this.original?.tenantId ?? this.tenant.id() ?? '',
      name: this.name().trim(),
      description: this.description().trim() || null,
      durationMinutes: duration,
      price,
      active: this.active(),
      createdAt: this.original?.createdAt ?? stamp,
      updatedAt: stamp,
    };

    this.busy.set(true);
    try {
      await this.servicesRepo.save(service);
      await this.professionalsRepo.setServiceAssignment(service.id, this.professionalIds());
      this.ref.close(true);
    } catch (cause) {
      this.error.set(
        cause instanceof Error ? cause.message : 'Não foi possível salvar.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
