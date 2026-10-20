import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { avatarColors, initialsOf } from '../util/identity';

export type AtrAvatarSize = 'sm' | 'default' | 'lg' | 'xl';

const SIZE: Record<AtrAvatarSize, string> = {
  sm: 'size-8 text-[0.6875rem]',
  default: 'size-10 text-xs',
  lg: 'size-12 text-sm',
  xl: 'size-24 text-2xl',
};

/** Avatar circular com iniciais; usa a foto quando houver. */
@Component({
  selector: 'atr-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (photoUrl()) {
      <img
        [src]="photoUrl()"
        [alt]="name()"
        class="rounded-full object-cover"
        [class]="sizeClass()"
      />
    } @else {
      <span
        class="inline-flex items-center justify-center rounded-full font-bold select-none"
        [class]="sizeClass()"
        [style.background-color]="colors().background"
        [style.color]="colors().foreground"
        [attr.aria-label]="name()"
        role="img"
      >
        {{ initials() }}
      </span>
    }
  `,
})
export class AtrAvatar {
  readonly name = input.required<string>();
  readonly photoUrl = input<string | null>(null);
  readonly size = input<AtrAvatarSize>('default');

  protected readonly sizeClass = computed(() => SIZE[this.size()]);
  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly colors = computed(() => avatarColors(this.name()));
}
