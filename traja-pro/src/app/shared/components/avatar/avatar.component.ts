import { Component, input } from '@angular/core';

@Component({
  selector: 'app-avatar',
  template: `
    <div
      class="avatar"
      [class.avatar--sm]="size() === 'sm'"
      [class.avatar--md]="size() === 'md'"
      [class.avatar--lg]="size() === 'lg'"
    >
      {{ initials() }}
    </div>
  `,
  styles: `
    .avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-full);
      background: var(--color-primary);
      color: var(--color-primary-contrast);
      font-weight: var(--font-weight-semibold);
      flex-shrink: 0;
    }

    .avatar--sm {
      width: 36px;
      height: 36px;
      font-size: var(--font-size-xs);
    }

    .avatar--md {
      width: 44px;
      height: 44px;
      font-size: var(--font-size-sm);
    }

    .avatar--lg {
      width: 52px;
      height: 52px;
      font-size: var(--font-size-base);
    }
  `,
})
export class AvatarComponent {
  readonly initials = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}
