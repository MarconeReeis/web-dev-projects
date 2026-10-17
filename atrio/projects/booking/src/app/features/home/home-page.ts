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
 * A ordem responde ao que a pessoa abriu o app para fazer: primeiro o que já
 * está marcado (se houver), depois marcar de novo, depois o catálogo. Quem
 * abre sem agendamento cai direto no botão de agendar.
 */
@Component({
  selector: 'bkg-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AtrCard, AtrButton, AtrIcon, AtrAvatar],
  host: { class: 'block' },
  template: `
    <!-- Saudação -->
    <h1 class="text-2xl font-extrabold tracking-tight">
      {{ greeting() }}
    </h1>
    <p class="mt-1 text-sm text-muted-foreground">
      {{ tenant.name() }} · {{ cityLabel() }}
    </p>

    <!-- Próximo agendamento -->
    @if (nextAppointment(); as next) {
      <div class="mt-5 rounded-surface bg-ink p-5 text-ink-foreground">
        <p class="text-sm text-ink-muted">Seu próximo horário</p>
        <p class="mt-1 text-xl font-extrabold">{{ next.serviceName }}</p>
        <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span class="inline-flex items-center gap-2">
            <atr-icon name="calendar-days" [size]="16" class="text-ink-muted" />
            {{ dateLabel(next.startsAt) }}
          </span>
          <span class="tabular inline-flex items-center gap-2">
            <atr-icon name="clock" [size]="16" class="text-ink-muted" />
            {{ time(next.startsAt) }}
          </span>
          <span class="inline-flex items-center gap-2">
            <atr-icon name="user-round" [size]="16" class="text-ink-muted" />
            {{ professionalName(next.professionalId) }}
          </span>
        </div>
        <a
          atrButton="soft"
          size="sm"
          class="mt-4"
          routerLink="../meus-horarios"
        >
          Ver meus horários
        </a>
      </div>
    }

    <!-- Ação principal -->
    <a atrButton size="lg" class="mt-5 w-full" [routerLink]="['../agendar']">
      <atr-icon name="plus" [size]="18" />
      Agendar horário
    </a>

    <!-- Serviços -->
    <atr-card heading="Serviços" subheading="Toque para agendar." class="mt-5">
      <ul class="flex flex-col gap-2">
        @for (service of services(); track service.id) {
          <li>
            <a
              class="flex w-full items-center gap-4 rounded-2xl border border-border p-4 transition-colors hover:border-primary"
              [routerLink]="['../agendar']"
              [queryParams]="{ servico: service.id }"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-bold">{{ service.name }}</span>
                <span class="block text-sm text-balance text-muted-foreground">
                  {{ service.durationMinutes }} min
                  @if (service.description) {
                    · {{ service.description }}
                  }
                </span>
              </span>
              <span class="tabular shrink-0 font-extrabold">
                {{ money(service.price) }}
              </span>
              <atr-icon name="chevron-right" [size]="18" class="shrink-0 text-muted-foreground" />
            </a>
          </li>
        }
      </ul>
    </atr-card>

    <!-- Equipe -->
    @if (professionals().length > 0) {
      <atr-card heading="Quem atende" class="mt-4">
        <ul class="flex flex-wrap gap-4">
          @for (professional of professionals(); track professional.id) {
            <li class="flex w-20 flex-col items-center gap-2 text-center">
              <atr-avatar
                [name]="professional.name"
                [photoUrl]="professional.photoUrl"
                size="lg"
              />
              <span class="text-xs leading-tight font-semibold">
                {{ professional.name }}
              </span>
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

  /**
   * Saudação pela hora do aparelho.
   *
   * Com nome quando já conhecemos a pessoa de um agendamento anterior — é o
   * único uso que o app faz dessa lembrança antes de ela pedir algo.
   */
  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const name = this.identity.name().split(' ')[0];
    return name ? `${period}, ${name}` : period;
  });

  protected readonly cityLabel = computed(() => {
    const address = this.tenant.tenant()?.address;
    return address?.city ? `${address.district}, ${address.city}` : 'Barbearia';
  });

  protected readonly addressLabel = computed(() => {
    const address = this.tenant.tenant()?.address;
    if (!address?.street) return null;

    const line = [address.street, address.number].filter(Boolean).join(', ');
    const extra = [address.complement, address.district].filter(Boolean).join(' · ');
    const city = [address.city, address.state].filter(Boolean).join(' - ');

    return [line, extra, city].filter(Boolean).join(' — ');
  });

  protected professionalName(id: string): string {
    return this.professionals().find((p) => p.id === id)?.name ?? 'Profissional';
  }

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
