import { inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { Appointment } from '../../shared/models/business.model';

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private readonly repository = inject(AppointmentRepository);

  private readonly _upcoming = signal<Appointment[]>([]);
  private readonly _history = signal<Appointment[]>([]);
  private readonly _loading = signal(false);

  readonly upcoming = this._upcoming.asReadonly();
  readonly history = this._history.asReadonly();
  readonly loading = this._loading.asReadonly();

  loadAll(): void {
    this._loading.set(true);

    this.repository.getUpcoming().pipe(
      finalize(() => this._loading.set(false))
    ).subscribe((list) => this._upcoming.set(list));

    this.repository.getHistory().subscribe((list) => this._history.set(list));
  }

  loadUpcomingPreview(): void {
    this.repository.getUpcoming().subscribe((list) => this._upcoming.set(list));
  }

  cancel(id: string): void {
    this.repository.cancelAppointment(id).subscribe(() => this.loadAll());
  }
}
