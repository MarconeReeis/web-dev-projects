import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type AtrBadgeTone =
  | 'neutral'
  | 'primary'
  | 'success'
  | 'warning'
  | 'destructive';

const TONE: Record<AtrBadgeTone, string> = {
  neutral: 'bg-secondary text-secondary-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  destructive: 'bg-destructive-soft text-destructive-soft-foreground',
};

const DOT: Record<AtrBadgeTone, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
};

/**
 * Etiqueta de estado.
 *
 * A cor nunca carrega a informação sozinha: o texto do badge é obrigatório.
 * O ponto é reforço visual, não substituto — daltônicos e telas de tablet sob
 * luz forte dependem disso.
 */
@Component({
  selector: 'atr-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
    '[class]': 'toneClass()',
  },
  template: `
    @if (dot()) {
      <span
        class="size-1.5 rounded-full"
        [class]="dotClass()"
        [class.animate-pulse]="pulse()"
      ></span>
    }
    <ng-content />
  `,
})
export class AtrBadge {
  readonly tone = input<AtrBadgeTone>('neutral');
  readonly dot = input(false);
  /** Para "em atendimento": sinaliza algo acontecendo agora. */
  readonly pulse = input(false);

  protected readonly toneClass = computed(() => TONE[this.tone()]);
  protected readonly dotClass = computed(() => DOT[this.tone()]);
}
