import { Directive, computed, input } from '@angular/core';

export type AtrButtonVariant =
  | 'default'
  | 'soft'
  | 'ink'
  | 'outline'
  | 'secondary'
  | 'success'
  | 'destructive'
  | 'ghost'
  | 'link';

export type AtrButtonSize = 'sm' | 'default' | 'lg' | 'icon';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold ' +
  'whitespace-nowrap transition-colors select-none ' +
  'disabled:pointer-events-none disabled:opacity-50 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  '[&_svg]:size-4 [&_svg]:shrink-0';

const VARIANT: Record<AtrButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
  soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-97',
  ink: 'bg-ink text-ink-foreground hover:bg-ink-elevated',
  outline:
    'bg-card text-foreground border border-input hover:border-primary hover:text-primary',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-border',
  success: 'bg-success text-success-foreground hover:brightness-110',
  destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
  ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline',
};

/** 44px é o alvo de toque mínimo; `sm` só para controles secundários densos. */
const SIZE: Record<AtrButtonSize, string> = {
  sm: 'h-10 px-4',
  default: 'h-11 px-5',
  lg: 'h-12 px-6 text-base',
  icon: 'h-11 w-11 p-0',
};

/**
 * Botão do Átrio como diretiva sobre o elemento nativo.
 *
 * Diretiva, e não componente-invólucro, para não perder `type`, `disabled`,
 * `form`, foco nativo e o comportamento de link do `<a>` — os detalhes que
 * um wrapper costuma quebrar sem avisar.
 *
 *   <button atrButton>Novo agendamento</button>
 *   <button atrButton="outline" size="sm">Ver agenda</button>
 *   <a atrButton="ghost" routerLink="/agenda">Agenda</a>
 */
@Directive({
  selector: 'button[atrButton], a[atrButton]',
  host: { '[class]': 'classes()' },
})
export class AtrButton {
  /**
   * `<button atrButton>` sem valor chega como string vazia — por isso o tipo
   * de escrita aceita '' e o transform normaliza para 'default'. Assim o uso
   * mais comum fica sem cerimônia e o tipo de leitura continua estrito.
   */
  readonly variant = input<AtrButtonVariant, AtrButtonVariant | ''>('default', {
    alias: 'atrButton',
    transform: (value) => value || 'default',
  });

  readonly size = input<AtrButtonSize>('default');

  protected readonly classes = computed(
    () => `${BASE} ${VARIANT[this.variant()]} ${SIZE[this.size()]}`,
  );
}
