import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { ATRIO_CONFIG, InstallPrompt, TenantContext } from '@atrio/core';
import {
  Address,
  DemoStore,
  Professional,
  ProfessionalRepository,
  Tenant,
  TenantRepository,
  Weekday,
  clockToMinutes,
  expandWindows,
  minutesToClock,
} from '@atrio/data';
import {
  AtrAvatar,
  AtrButton,
  AtrCard,
  AtrField,
  AtrIcon,
  AtrInput,
  AtrOverlay,
  AtrPageHeading,
} from '@atrio/ui';
import { readSquareAvatar } from '../../shared/photo';
import { WEEKDAYS, daysLabel, groupWeek } from '../../shared/week-summary';

const EMPTY_ADDRESS: Address = {
  street: '',
  number: '',
  complement: null,
  district: '',
  city: '',
  state: '',
  zipCode: '',
};

/**
 * Configurações.
 *
 * Duas decisões que afastam esta tela da referência, pelo mesmo motivo:
 *
 *  - o **endereço** é estruturado, não texto livre. O app do cliente vai
 *    precisar dele separado para exibir e abrir no mapa, e extrair cidade de
 *    uma string digitada à mão não funciona;
 *  - o **horário de funcionamento** é exibido, não editado. Ele é a união das
 *    jornadas dos profissionais. Um campo editável seria uma segunda fonte de
 *    verdade, e a vitrine anunciaria horários em que ninguém trabalha.
 */
@Component({
  selector: 'adm-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AtrPageHeading,
    AtrCard,
    AtrButton,
    AtrField,
    AtrInput,
    AtrIcon,
    AtrAvatar,
  ],
  host: { class: 'mx-auto block w-full max-w-4xl' },
  template: `
    <atr-page-heading
      heading="Configurações"
      description="Informações exibidas no painel e no aplicativo do cliente."
    >
      <button type="button" atrButton [disabled]="!dirty() || busy()" (click)="save()">
        {{ dirty() ? 'Salvar alterações' : 'Tudo salvo' }}
      </button>
    </atr-page-heading>

    <!-- Dados da barbearia -->
    <atr-card heading="Dados da barbearia" class="mt-6">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <atr-avatar [name]="name() || 'Barbearia'" [photoUrl]="logoUrl()" size="lg" />
          <button type="button" atrButton="outline" size="sm" (click)="picker.click()">
            <atr-icon name="image" [size]="16" />
            Alterar logo
          </button>
          @if (logoUrl()) {
            <button type="button" atrButton="ghost" size="sm" (click)="logoUrl.set(null)">
              Remover
            </button>
          }
          <input #picker type="file" accept="image/*" class="sr-only" (change)="onLogo($event)" />
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <atr-field label="Nome" [error]="showErrors() ? nameError() : null">
            <input
              atrInput
              type="text"
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
              placeholder="(11) 3333-4444"
              [value]="phone()"
              (input)="phone.set($any($event.target).value)"
            />
          </atr-field>
        </div>

        <!-- Endereço estruturado -->
        <fieldset class="grid gap-4 sm:grid-cols-6">
          <legend class="mb-1.5 text-sm font-semibold">Endereço</legend>

          <atr-field label="CEP" class="sm:col-span-2">
            <input
              atrInput
              type="text"
              inputmode="numeric"
              placeholder="01304-001"
              [value]="address().zipCode"
              (input)="patchAddress({ zipCode: $any($event.target).value })"
            />
          </atr-field>
          <atr-field label="Rua" class="sm:col-span-4">
            <input
              atrInput
              type="text"
              [value]="address().street"
              (input)="patchAddress({ street: $any($event.target).value })"
            />
          </atr-field>

          <atr-field label="Número" class="sm:col-span-1">
            <input
              atrInput
              type="text"
              [value]="address().number"
              (input)="patchAddress({ number: $any($event.target).value })"
            />
          </atr-field>
          <atr-field label="Complemento" class="sm:col-span-2" [optional]="true">
            <input
              atrInput
              type="text"
              [value]="address().complement ?? ''"
              (input)="patchAddress({ complement: $any($event.target).value || null })"
            />
          </atr-field>
          <atr-field label="Bairro" class="sm:col-span-3">
            <input
              atrInput
              type="text"
              [value]="address().district"
              (input)="patchAddress({ district: $any($event.target).value })"
            />
          </atr-field>

          <atr-field label="Cidade" class="sm:col-span-5">
            <input
              atrInput
              type="text"
              [value]="address().city"
              (input)="patchAddress({ city: $any($event.target).value })"
            />
          </atr-field>
          <atr-field label="UF" class="sm:col-span-1">
            <input
              atrInput
              type="text"
              maxlength="2"
              class="uppercase"
              [value]="address().state"
              (input)="patchAddress({ state: $any($event.target).value.toUpperCase() })"
            />
          </atr-field>
        </fieldset>
      </div>
    </atr-card>

    <!-- Horário derivado -->
    <atr-card
      heading="Horário de funcionamento"
      subheading="Calculado a partir da jornada dos profissionais ativos."
      class="mt-4"
    >
      <a atrButton="outline" size="sm" routerLink="/profissionais" card-action>
        Ajustar em Profissionais
        <atr-icon name="arrow-up-right" [size]="15" />
      </a>

      @if (openingHours().length === 0) {
        <p class="text-sm text-muted-foreground">
          Nenhum profissional ativo com jornada definida — a barbearia aparece
          fechada para o cliente.
        </p>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (group of openingHours(); track group.label) {
            <li class="flex items-baseline justify-between gap-4 border-b border-border pb-2 last:border-0">
              <span class="font-semibold">{{ group.label }}</span>
              <span class="tabular text-muted-foreground">{{ group.value }}</span>
            </li>
          }
          @if (closedDays(); as closed) {
            <li class="flex items-baseline justify-between gap-4">
              <span class="font-semibold">{{ closed }}</span>
              <span class="text-muted-foreground">Fechado</span>
            </li>
          }
        </ul>
      }
    </atr-card>

    <!-- Administrador -->
    <atr-card
      heading="Administrador"
      subheading="Contato responsável pela conta no Átrio."
      class="mt-4"
    >
      <div class="grid gap-4 sm:grid-cols-2">
        <atr-field label="Nome">
          <input
            atrInput
            type="text"
            [value]="adminName()"
            (input)="adminName.set($any($event.target).value)"
          />
        </atr-field>
        <atr-field label="E-mail" [error]="showErrors() ? emailError() : null">
          <input
            atrInput
            type="email"
            inputmode="email"
            [invalid]="showErrors() && !!emailError()"
            [value]="adminEmail()"
            (input)="adminEmail.set($any($event.target).value)"
          />
        </atr-field>
      </div>
    </atr-card>

    <!-- Instalação -->
    <atr-card class="on-ink mt-4 bg-ink text-ink-foreground">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2.5 text-lg font-bold">
            <atr-icon name="smartphone" [size]="20" />
            Instalar como aplicativo
          </h2>
          <p class="mt-1 text-sm text-ink-muted">{{ installHint() }}</p>
        </div>

        @if (install.state() === 'disponivel') {
          <button type="button" atrButton (click)="runInstall()">
            <atr-icon name="download" [size]="16" />
            Instalar agora
          </button>
        }
      </div>

      @if (install.state() === 'manual') {
        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          @for (step of installSteps; track step.title) {
            <div class="rounded-2xl bg-ink-elevated p-4">
              <p class="flex items-center gap-2 font-bold">
                <atr-icon [name]="step.icon" [size]="16" />
                {{ step.title }}
              </p>
              <p class="mt-1.5 text-sm leading-relaxed text-ink-muted">{{ step.body }}</p>
            </div>
          }
        </div>
      }
    </atr-card>

    <!-- Demonstração -->
    @if (config.demoMode) {
      <atr-card
        heading="Ambiente de demonstração"
        subheading="Os dados são fictícios e ficam salvos apenas neste dispositivo."
        class="mt-4 mb-8"
      >
        <button type="button" atrButton="outline" size="sm" card-action (click)="resetDemo()">
          Restaurar dados de exemplo
        </button>
      </atr-card>
    }
  `,
})
export class SettingsPage {
  private readonly tenantRepo = inject(TenantRepository);
  private readonly professionalsRepo = inject(ProfessionalRepository);
  private readonly overlay = inject(AtrOverlay);
  private readonly demo = inject(DemoStore);

  protected readonly tenant = inject(TenantContext);
  protected readonly config = inject(ATRIO_CONFIG);
  protected readonly install = inject(InstallPrompt);

  protected readonly name = signal('');
  protected readonly phone = signal('');
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly address = signal<Address>(EMPTY_ADDRESS);
  protected readonly adminName = signal('');
  protected readonly adminEmail = signal('');

  protected readonly busy = signal(false);
  protected readonly showErrors = signal(false);

  /** Instantâneo do que foi carregado, para saber o que mudou. */
  private readonly loaded = signal<string>('');

  private readonly professionals = toSignal(this.professionalsRepo.watchAll(), {
    initialValue: [] as readonly Professional[],
  });

  constructor() {
    // O tenant chega do repositório; com Firestore isso é assíncrono, então o
    // formulário se preenche quando o dado chega, e não no construtor.
    //
    // O corpo vai dentro de untracked porque ele LÊ os campos do formulário
    // (em fingerprint) além de escrevê-los. Sem isso, o efeito passa a
    // depender dos próprios campos: digitar no telefone o dispara de novo, e
    // ele recarrega tudo do tenant, apagando o que acabou de ser digitado.
    effect(() => {
      const current = this.tenant.tenant();
      if (!current) return;

      untracked(() => {
        this.name.set(current.name);
        this.phone.set(current.phone ?? '');
        this.logoUrl.set(current.branding.logoUrl);
        this.address.set(current.address ?? EMPTY_ADDRESS);
        this.adminName.set(current.admin.name);
        this.adminEmail.set(current.admin.email);
        this.loaded.set(this.fingerprint());
      });
    });
  }

  // ─── horário derivado ─────────────────────────────────────────────────

  /**
   * Horário da barbearia: a união das jornadas dos profissionais ativos.
   *
   * Abre quando o primeiro começa e fecha quando o último termina — é o que o
   * cliente enxerga como "aberto", porque é quando existe alguém para atender.
   */
  protected readonly openingHours = computed(() =>
    groupWeek((day: Weekday) => {
      const windows = this.professionals()
        .filter((professional) => professional.active)
        .flatMap((professional) => expandWindows(professional.schedule[day]));

      if (windows.length === 0) return null;

      const opens = Math.min(...windows.map((w) => clockToMinutes(w.start)));
      const closes = Math.max(...windows.map((w) => clockToMinutes(w.end)));
      return `${minutesToClock(opens)} – ${minutesToClock(closes)}`;
    }),
  );

  protected readonly closedDays = computed(() => {
    const open = new Set(this.openingHours().flatMap((group) => group.days));
    const closed = WEEKDAYS.filter((day) => !open.has(day));
    if (closed.length === 0 || closed.length === WEEKDAYS.length) return null;
    return daysLabel(closed);
  });

  // ─── validação e estado ───────────────────────────────────────────────

  protected readonly nameError = computed(() =>
    this.name().trim().length < 2 ? 'Informe o nome da barbearia.' : null,
  );

  protected readonly emailError = computed(() => {
    const value = this.adminEmail().trim();
    if (!value) return 'Informe o e-mail.';
    // Validação deliberadamente frouxa: regex de e-mail rigorosa rejeita
    // endereços válidos, e quem confirma de verdade é o envio.
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return 'E-mail inválido.';
    return null;
  });

  protected readonly dirty = computed(() => this.fingerprint() !== this.loaded());

  protected readonly installHint = computed(() => {
    switch (this.install.state()) {
      case 'instalado':
        return 'O painel já está instalado neste dispositivo.';
      case 'disponivel':
        return 'Use o painel em tela cheia, com ícone na tela inicial do tablet.';
      default:
        return 'Use o painel em tela cheia, com ícone na tela inicial. A instalação só funciona no endereço publicado, em HTTPS.';
    }
  });

  protected readonly installSteps = [
    {
      icon: 'smartphone' as const,
      title: 'iPad / iPhone (Safari)',
      body: 'Toque em Compartilhar e depois em "Adicionar à Tela de Início".',
    },
    {
      icon: 'smartphone' as const,
      title: 'Android (Chrome)',
      body: 'Abra o menu e toque em "Instalar app" ou "Adicionar à tela inicial".',
    },
    {
      icon: 'download' as const,
      title: 'Computador (Chrome/Edge)',
      body: 'Clique no ícone de instalação na barra de endereço.',
    },
  ];

  // ─── ações ────────────────────────────────────────────────────────────

  protected patchAddress(patch: Partial<Address>): void {
    this.address.update((current) => ({ ...current, ...patch }));
  }

  protected async onLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      this.logoUrl.set(await readSquareAvatar(file));
    } finally {
      input.value = '';
    }
  }

  protected async runInstall(): Promise<void> {
    await this.install.install();
  }

  protected async save(): Promise<void> {
    this.showErrors.set(true);
    const current = this.tenant.tenant();
    if (!current || this.nameError() || this.emailError()) return;

    const next: Tenant = {
      ...current,
      name: this.name().trim(),
      phone: this.phone().trim() || null,
      address: this.address(),
      branding: { ...current.branding, logoUrl: this.logoUrl() },
      admin: { name: this.adminName().trim(), email: this.adminEmail().trim() },
    };

    this.busy.set(true);
    try {
      await this.tenantRepo.save(next);
      this.loaded.set(this.fingerprint());
      this.showErrors.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  protected async resetDemo(): Promise<void> {
    const confirmed = await this.overlay.confirm({
      heading: 'Restaurar dados de exemplo',
      message:
        'Tudo que você criou ou alterou na demonstração é descartado e os dados fictícios voltam ao estado original.',
      confirmLabel: 'Restaurar',
      destructive: true,
    });
    if (confirmed) this.demo.reset();
  }

  /**
   * Resumo do formulário, para comparar com o que foi carregado.
   *
   * Serializar é mais simples e mais confiável que comparar campo a campo:
   * acrescentar um campo novo ao formulário passa a contar sozinho, sem
   * ninguém lembrar de atualizar a comparação.
   */
  private fingerprint(): string {
    return JSON.stringify([
      this.name(),
      this.phone(),
      this.logoUrl(),
      this.address(),
      this.adminName(),
      this.adminEmail(),
    ]);
  }
}
