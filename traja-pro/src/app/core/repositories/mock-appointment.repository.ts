import { Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { Appointment } from '../../shared/models/business.model';
import {
  MOCK_HISTORY_APPOINTMENTS,
  MOCK_UPCOMING_APPOINTMENTS,
} from '../data/mock-appointments.data';
import { AppointmentRepository } from './appointment.repository';

@Injectable({ providedIn: 'root' })
export class MockAppointmentRepository extends AppointmentRepository {
  private upcoming = [...MOCK_UPCOMING_APPOINTMENTS];
  private history = [...MOCK_HISTORY_APPOINTMENTS];

  getUpcoming(): Observable<Appointment[]> {
    return of([...this.upcoming]).pipe(delay(200));
  }

  getHistory(): Observable<Appointment[]> {
    return of([...this.history]).pipe(delay(200));
  }

  cancelAppointment(id: string): Observable<void> {
    const index = this.upcoming.findIndex((a) => a.id === id);
    if (index >= 0) {
      const [cancelled] = this.upcoming.splice(index, 1);
      this.history.unshift({ ...cancelled, status: 'cancelled' });
    }
    return of(undefined).pipe(delay(300));
  }

  addUpcoming(appointment: Appointment): Observable<void> {
    this.upcoming.unshift(appointment);
    return of(undefined).pipe(delay(200));
  }
}
