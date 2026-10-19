import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CounterPin, PinCheck, StaffAuthError, formatTime } from '@atrio/data';
import { AtrButton, AtrField, AtrIcon, AtrInput, AtrSurfaceShell } from '@atrio/ui';

const LENGTH = 4;

export interface PinDialogData {
  /** 'desbloquear': pedir o PIN para uma ação. 'trocar': Configurações. */
  readonly purpose: 'desbloquear' | 'trocar';
  /** Para quê — "abrir o Financeiro", "remover o bloqueio". */
  readonly reason?: string;
}

type Step =
  | 'carregando'
  | 'verificar'
  | 'atual'
  | 'novo'
  | 'confirmar'
  | 'senha'
  | 'travado';

/**
 * Teclado do PIN do balcão.
 *
 * Teclas grandes porque é tablet no balcão, com o dedo — e o teclado do
 * sistema, num campo de senha, cobriria metade da tela. Aceita também o
 * teclado físico. Confere sozinho ao completar os 4 números.
 *
 * Um diálogo para os quatro caminhos: pedir o PIN, criar o primeiro, trocar
 * (atual → novo → confirmar) e "esqueci" (senha da conta → novo →
 * confirmar). Fecha com `true` quando o PIN foi aceito ou definido.
 */
@Component({
  selector: 'adm-pin-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AtrSurfaceShell, AtrButton, AtrField, AtrIcon, AtrInput],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <atr-surface-shell [heading]="heading()" [description]="description()" (closed)="ref.close(false)">
      @switch (step()) {
        @case ('carregando') {
          <p class="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
        }

        @case ('travado') {
          <div class="flex flex-col items-center py-6 text-center">
            <span class="flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <atr-icon name="lock" [size]="26" />
            </span>
            <p class="mt-4 font-bold">Muitas tentativas</p>
            <p class="mt-1 text-sm text-muted-foreground">
              O PIN está travado até as {{ lockedLabel() }}. Se esqueceu, crie outro com a senha da
              conta.
            </p>
            <button type="button" class="mt-5 text-sm font-semibold text-primary" (click)="goTo('senha')">
              Esqueci o PIN
            </button>
          </div>
        }

        @case ('senha') {
          <form class="flex flex-col gap-4" novalidate (submit)="$event.preventDefault(); checkPassword()">
            <atr-field label="Senha da conta" [error]="error()">
              <input
                atrInput
                type="password"
                autocomplete="current-password"
                [invalid]="!!error()"
                [value]="password()"
                (input)="password.set($any($event.target).value)"
              />
            </atr-field>
            <button type="submit" atrButton [disabled]="!password()">Continuar</button>
          </form>
        }

        @default {
          <!-- Os 4 pontos: quantos números já foram -->
          <div class="flex justify-center gap-4 py-2" aria-live="polite" [attr.aria-label]="digits().length + ' de 4 números'">
            @for (slot of slots; track slot) {
              <span
                class="size-4 rounded-full transition-colors"
                [class]="slot < digits().length ? 'bg-primary' : 'bg-border'"
              ></span>
            }
          </div>

          <p class="mt-3 min-h-5 text-center text-sm" [class]="error() ? 'font-medium text-destructive' : 'text-muted-foreground'" role="status">
            {{ error() ?? hint() }}
          </p>

          <div class="mx-auto mt-4 grid max-w-72 grid-cols-3 gap-3">
            @for (key of keys; track key) {
              <button
                type="button"
                class="tabular flex h-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-bold transition-colors hover:bg-accent active:bg-primary-soft disabled:opacity-50"
                [disabled]="busy()"
                (click)="press(key)"
              >
                {{ key }}
              </button>
            }
            <span></span>
            <button
              type="button"
              class="tabular flex h-16 items-center justify-center rounded-2xl bg-secondary text-2xl font-bold transition-colors hover:bg-accent active:bg-primary-soft disabled:opacity-50"
              [disabled]="busy()"
              (click)="press('0')"
            >
              0
            </button>
            <button
              type="button"
              class="flex h-16 items-center justify-center rounded-2xl text-muted-foreground transition-colors hover:bg-accent disabled:opacity-50"
              aria-label="Apagar"
              [disabled]="busy() || !digits()"
              (click)="erase()"
            >
              <atr-icon name="chevron-left" [size]="24" />
            </button>
          </div>

          @if (step() === 'verificar' || step() === 'atual') {
            <button type="button" class="mx-auto mt-5 block text-sm font-semibold text-primary" (click)="goTo('senha')">
              Esqueci o PIN
            </button>
          }
        }
      }

      <div shell-footer class="flex w-full justify-end">
        <button type="button" atrButton="ghost" (click)="ref.close(false)">Cancelar</button>
      </div>
    </atr-surface-shell>
  `,
})
export class PinDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  private readonly data = inject<PinDialogData>(DIALOG_DATA);
  private readonly pin = inject(CounterPin);

  protected readonly slots = [0, 1, 2, 3];
  protected readonly keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  protected readonly step = signal<Step>('carregando');
  protected readonly digits = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly password = signal('');
  private readonly lockedUntil = signal<string | null>(null);

  /** O PIN atual (trocar) e o novo, guardados entre os passos. */
  private current: string | null = null;
  private chosen = '';
  /** Chegou ao "novo" pela senha da conta (esqueci), não pelo PIN atual. */
  private viaPassword = false;

  protected readonly heading = computed(() => {
    switch (this.step()) {
      case 'novo':
        return this.viaPassword || this.data.purpose === 'trocar' ? 'Novo PIN' : 'Crie o PIN do balcão';
      case 'confirmar':
        return 'Confirme o PIN';
      case 'atual':
        return 'PIN atual';
      case 'senha':
        return 'Esqueci o PIN';
      case 'travado':
        return 'PIN travado';
      default:
        return 'PIN do balcão';
    }
  });

  protected readonly description = computed(() => {
    switch (this.step()) {
      case 'verificar':
        return this.data.reason ? `Para ${this.data.reason}.` : null;
      case 'novo':
        return 'Quatro números. Ele protege o Financeiro e as ações que apagam ou cancelam.';
      case 'senha':
        return 'Confirme a senha da conta para criar um PIN novo.';
      default:
        return null;
    }
  });

  protected readonly hint = computed(() => {
    switch (this.step()) {
      case 'confirmar':
        return 'Digite o mesmo PIN de novo.';
      case 'atual':
        return 'Digite o PIN que você usa hoje.';
      default:
        return ' ';
    }
  });

  protected readonly lockedLabel = computed(() => {
    const until = this.lockedUntil();
    return until ? formatTime(until) : '';
  });

  constructor() {
    void this.start();
  }

  protected goTo(step: Step): void {
    this.error.set(null);
    this.digits.set('');
    this.step.set(step);
  }

  protected press(key: string): void {
    if (this.busy() || this.digits().length >= LENGTH) return;
    this.error.set(null);
    this.digits.update((value) => value + key);
    if (this.digits().length === LENGTH) void this.complete(this.digits());
  }

  protected erase(): void {
    this.digits.update((value) => value.slice(0, -1));
  }

  /** Teclado físico: números, Backspace e Esc (o Esc já fecha o diálogo). */
  protected onKey(event: KeyboardEvent): void {
    if (this.step() === 'senha' || this.step() === 'travado' || this.step() === 'carregando') return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      this.press(event.key);
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      this.erase();
    }
  }

  protected async checkPassword(): Promise<void> {
    // A senha só é conferida no fim, junto com o PIN novo (reset): aqui só
    // segue para escolher o PIN.
    this.viaPassword = true;
    this.goTo('novo');
  }

  private async start(): Promise<void> {
    try {
      const status = await this.pin.status();
      if (status.lockedUntil) {
        this.lockedUntil.set(status.lockedUntil);
        this.step.set('travado');
      } else if (!status.configured) {
        this.step.set('novo');
      } else {
        this.step.set(this.data.purpose === 'trocar' ? 'atual' : 'verificar');
      }
    } catch {
      this.error.set('Não foi possível conferir o PIN agora.');
      this.step.set('verificar');
    }
  }

  private async complete(value: string): Promise<void> {
    switch (this.step()) {
      case 'verificar':
        return this.check(() => this.pin.verify(value), () => this.ref.close(true));
      case 'atual':
        return this.check(
          () => this.pin.verify(value),
          () => {
            this.current = value;
            this.goTo('novo');
          },
        );
      case 'novo':
        this.chosen = value;
        this.goTo('confirmar');
        return;
      case 'confirmar':
        if (value !== this.chosen) {
          this.digits.set('');
          this.step.set('novo');
          this.error.set('Os PINs não são iguais. Escolha de novo.');
          return;
        }
        return this.save(value);
    }
  }

  private async save(value: string): Promise<void> {
    this.busy.set(true);
    try {
      if (this.viaPassword) {
        await this.pin.reset(this.password(), value);
        this.ref.close(true);
        return;
      }
      const result = await this.pin.change(value, this.current);
      if (result.ok) {
        this.ref.close(true);
      } else {
        this.explain(result);
        this.goTo(this.current ? 'atual' : 'novo');
      }
    } catch (cause) {
      if (cause instanceof StaffAuthError && cause.code === 'credenciais') {
        // Senha errada: volta para ela, sem perder o caminho do "esqueci".
        this.password.set('');
        this.digits.set('');
        this.step.set('senha');
        this.error.set('Senha incorreta.');
        return;
      }
      this.digits.set('');
      this.error.set(cause instanceof Error ? cause.message : 'Não foi possível salvar o PIN.');
    } finally {
      this.busy.set(false);
    }
  }

  private async check(run: () => Promise<PinCheck>, onOk: () => void): Promise<void> {
    this.busy.set(true);
    try {
      const result = await run();
      if (result.ok) {
        onOk();
      } else {
        this.digits.set('');
        this.explain(result);
      }
    } catch (cause) {
      this.digits.set('');
      this.error.set(cause instanceof Error ? cause.message : 'Não foi possível conferir o PIN.');
    } finally {
      this.busy.set(false);
    }
  }

  private explain(result: PinCheck): void {
    if (result.lockedUntil) {
      this.lockedUntil.set(result.lockedUntil);
      this.step.set('travado');
      return;
    }
    const left = result.remaining ?? 0;
    this.error.set(`PIN incorreto. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.`);
  }
}
