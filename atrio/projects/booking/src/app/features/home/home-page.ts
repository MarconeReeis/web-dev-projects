import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { InstallPrompt, TenantContext } from '@atrio/core';
import {
  Appointment,
  AppointmentRepository,
  Professional,
  ProfessionalRepository,
  Service,
  ServiceRepository,
  formatLongDate,
  formatMoney,
  formatTime,
  startOfDay,
} from '@atrio/data';
import { AtrAvatar, AtrButton, AtrCard, AtrIcon } from '@atrio/ui';
import { ClientIdentity } from '../../shared/client-identity';

const HORIZON_DAYS = 120;

/**
 * Vitrine da barbearia e ponto de partida do agendamento.
 *
 * Ordem da tela: destaque da barbearia, o que já está marcado (quando há),
 * a ação de agendar e o catálogo. A saudação subiu para o cabeçalho — ver
 * o shell.
 */
@Component({
  selector: 'bkg-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrCard, AtrButton, AtrIcon, AtrAvatar],
  host: { class: 'block' },
  template: `
    <!-- Destaque da barbearia -->
    @if (highlight(); as promo) {
      <section class="rounded-surface relative overflow-hidden bg-ink p-5 text-ink-foreground">
        <!-- Brilho decorativo: dá profundidade sem imagem, que a barbearia
             não tem como cadastrar ainda. -->
        <span
          class="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-primary/30 blur-2xl"
          aria-hidden="true"
        ></span>

        <div class="relative">
          <h2 class="text-xl font-extrabold text-balance">{{ promo.title }}</h2>
          @if (promo.subtitle) {
            <p class="mt-1.5 text-sm text-balance text-ink-muted">{{ promo.subtitle }}</p>
          }
          @if (promo.ctaLabel) {
            <a atrButton size="sm" class="mt-4" [routerLink]="['../agendar']">
              {{ promo.ctaLabel }}
            </a>
          }
        </div>
      </section>
    }

    <!-- Próximo agendamento -->
    @if (nextAppointment(); as next) {
      <a
        class="mt-4 flex items-center gap-4 rounded-surface border border-primary bg-primary-soft p-4 transition-colors hover:brightness-97"
        routerLink="../meus-horarios"
      >
        <span
          class="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <atr-icon name="calendar-check" [size]="20" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm text-primary-soft-foreground">Seu próximo horário</span>
          <span class="block truncate font-bold text-primary-soft-foreground">
            {{ dateLabel(next.startsAt) }} · {{ time(next.startsAt) }}
          </span>
        </span>
        <atr-icon name="chevron-right" [size]="18" class="shrink-0 text-primary-soft-foreground" />
      </a>
    }

    <!-- Agendar -->
    <a atrButton size="lg" class="mt-4 w-full" [routerLink]="['../agendar']">
      <atr-icon name="plus" [size]="18" />
      Agendar horário
    </a>

    <!-- Serviços -->
    <div class="mt-7 flex items-baseline justify-between gap-3">
      <h2 class="text-lg font-bold">Serviços</h2>
      <a class="text-sm font-semibold text-primary" [routerLink]="['../agendar']">Ver todos</a>
    </div>

    <ul class="mt-3 grid grid-cols-2 gap-3">
      @for (service of services(); track service.id) {
        <li>
          <a
            class="surface flex h-full flex-col overflow-hidden transition-colors hover:border-primary"
            [routerLink]="['../agendar']"
            [queryParams]="{ servico: service.id }"
          >
            <span
              class="flex h-24 items-center justify-center bg-primary-soft text-primary-soft-foreground"
            >
              <atr-icon name="scissors" [size]="30" />
            </span>

            <span class="flex flex-1 flex-col p-3.5">
              <span class="font-bold text-balance">{{ service.name }}</span>
              <span class="tabular mt-0.5 text-sm text-muted-foreground">
                {{ service.durationMinutes }} min
              </span>

              <span class="mt-3 flex items-center justify-between gap-2">
                <span class="tabular font-extrabold">{{ money(service.price) }}</span>
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-hidden="true"
                >
                  <atr-icon name="plus" [size]="16" />
                </span>
              </span>
            </span>
          </a>
        </li>
      }
    </ul>

    <!-- Equipe -->
    @if (professionals().length > 0) {
      <atr-card
        heading="Quem atende"
        subheading="Toque para agendar com quem você prefere."
        class="mt-4"
      >
        <a atrButton="outline" size="sm" routerLink="../profissionais" card-action>
          Ver todos
          <atr-icon name="chevron-right" [size]="15" />
        </a>

        <ul class="flex flex-wrap gap-4">
          @for (professional of professionals(); track professional.id) {
            <li>
              <a
                class="flex w-20 flex-col items-center gap-2 rounded-2xl p-1 text-center transition-colors hover:bg-accent"
                [routerLink]="['../agendar']"
                [queryParams]="{ profissional: professional.id }"
              >
                <atr-avatar
                  [name]="professional.name"
                  [photoUrl]="professional.photoUrl"
                  size="lg"
                />
                <span class="text-xs leading-tight font-semibold">
                  {{ professional.name }}
                </span>
              </a>
            </li>
          }
        </ul>
      </atr-card>
    }

    <!-- Onde e quando -->
    <atr-card heading="A barbearia" class="mt-4">
      <dl class="flex flex-col gap-4 text-sm">
        @if (addressLabel(); as address) {
          <div class="flex items-start gap-3">
            <atr-icon name="map-pin" [size]="18" class="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <dt class="sr-only">Endereço</dt>
              <dd>{{ address }}</dd>
            </div>
          </div>
        }
        @if (tenant.tenant()?.phone; as phone) {
          <div class="flex items-start gap-3">
            <atr-icon name="phone" [size]="18" class="mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <dt class="sr-only">Telefone</dt>
              <dd><a class="hover:text-primary" [href]="'tel:' + phone">{{ phone }}</a></dd>
            </div>
          </div>
        }
      </dl>
    </atr-card>

    <!-- Instalação -->
    @if (install.state() !== 'instalado') {
      <atr-card class="mt-4">
        <div class="flex items-start gap-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground"
          >
            <atr-icon name="smartphone" [size]="18" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-bold">Deixe na tela inicial</p>
            <p class="mt-0.5 text-sm text-muted-foreground">
              {{
                install.state() === 'disponivel'
                  ? 'Abre como aplicativo, sem passar pela loja.'
                  : 'No menu do navegador, toque em "Adicionar à tela de início".'
              }}
            </p>
            @if (install.state() === 'disponivel') {
              <button type="button" atrButton="soft" size="sm" class="mt-3" (click)="addToHome()">
                <atr-icon name="download" [size]="15" />
                Adicionar
              </button>
            }
          </div>
        </div>
      </atr-card>
    }
  `,
})
export class HomePage {
  protected readonly tenant = inject(TenantContext);
  protected readonly install = inject(InstallPrompt);
  private readonly identity = inject(ClientIdentity);
  private readonly servicesRepo = inject(ServiceRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly appointmentsRepo = inject(AppointmentRepository);

  protected money = formatMoney;
  protected time = formatTime;

  protected readonly services = toSignal(this.servicesRepo.watchAll(), {
    initialValue: [] as readonly Service[],
  });

  protected readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  private readonly myAppointments = toSignal(
    this.appointmentsRepo.watchByClientPhone(this.identity.phone(), horizon()),
    { initialValue: [] as readonly Appointment[] },
  );

  /** Banner só aparece quando a barbearia tem algo a dizer. */
  protected readonly highlight = computed(() => {
    const promo = this.tenant.tenant()?.highlight;
    return promo?.active ? promo : null;
  });

  protected readonly nextAppointment = computed(() => {
    const now = Date.now();
    return (
      this.myAppointments().find(
        (appointment) =>
          appointment.status === 'agendado' &&
          new Date(appointment.startsAt).getTime() >= now,
      ) ?? null
    );
  });

  protected readonly addressLabel = computed(() => {
    const address = this.tenant.tenant()?.address;
    if (!address?.street) return null;

    const line = [address.street, address.number].filter(Boolean).join(', ');
    const extra = [address.complement, address.district].filter(Boolean).join(' · ');
    const city = [address.city, address.state].filter(Boolean).join(' - ');

    return [line, extra, city].filter(Boolean).join(' — ');
  });

  protected dateLabel(instant: string): string {
    const label = formatLongDate(instant);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  protected async addToHome(): Promise<void> {
    await this.install.install();
  }
}

/** Daqui a quatro meses: nenhuma barbearia marca além disso. */
function horizon() {
  const from = startOfDay(new Date());
  const to = new Date(from);
  to.setDate(to.getDate() + HORIZON_DAYS);
  return { from: from.toISOString(), to: to.toISOString() };
}
