import { Component, input } from '@angular/core';
import { AppointmentStatus, APPOINTMENT_STATUS_LABEL } from '../../models';

@Component({
  selector: 'app-status-badge',
  template: `
    <span
      class="badge"
      [class.badge--confirmed]="status() === 'confirmed'"
      [class.badge--pending]="status() === 'pending'"
      [class.badge--cancelled]="status() === 'cancelled'"
    >
      {{ label }}
    </span>
  `,
  styles: `
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: var(--font-weight-medium);
      white-space: nowrap;
    }

    .badge--confirmed {
      background: rgba(0, 200, 127, 0.15);
      color: var(--color-primary);
    }

    .badge--pending {
      background: rgba(251, 191, 36, 0.15);
      color: #fbbf24;
    }

    .badge--cancelled {
      background: rgba(239, 68, 68, 0.15);
      color: var(--color-danger);
    }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<AppointmentStatus>();

  get label(): string {
    return APPOINTMENT_STATUS_LABEL[this.status()];
  }
}
