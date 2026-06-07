import { Injectable } from '@angular/core';
import { delay, map, Observable, of } from 'rxjs';
import {
  BookingConfirmation,
  BookingDraft,
  Professional,
  Service,
  TimeSlot,
} from '../../shared/models/booking.model';
import {
  MOCK_PROFESSIONALS,
  MOCK_SERVICES,
  MOCK_UNAVAILABLE_SLOTS,
} from '../data/mock-booking.data';
import { BookingRepository } from './booking.repository';

const ALL_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30',
];

@Injectable({ providedIn: 'root' })
export class MockBookingRepository extends BookingRepository {
  getProfessionals(): Observable<Professional[]> {
    return of(MOCK_PROFESSIONALS).pipe(delay(200));
  }

  getServicesByProfessional(professionalId: string): Observable<Service[]> {
    const services = MOCK_SERVICES.filter((s) => s.professionalId === professionalId);
    return of(services).pipe(delay(150));
  }

  getAvailableDates(from: Date, days: number): Observable<string[]> {
    const dates: string[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      dates.push(formatDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return of(dates).pipe(delay(100));
  }

  getAvailableTimeSlots(
    _professionalId: string,
    _serviceId: string,
    date: string
  ): Observable<TimeSlot[]> {
    const unavailable = MOCK_UNAVAILABLE_SLOTS[date] ?? [];
    const slots: TimeSlot[] = ALL_SLOTS.map((time) => ({
      time,
      available: !unavailable.includes(time),
    }));

    return of(slots).pipe(delay(200));
  }

  createBooking(draft: BookingDraft): Observable<BookingConfirmation> {
    if (!draft.professional || !draft.service || !draft.date || !draft.time) {
      throw new Error('Dados incompletos para criar agendamento');
    }

    const confirmation: BookingConfirmation = {
      id: `#${Math.floor(100000 + Math.random() * 900000)}`,
      professional: draft.professional,
      service: draft.service,
      date: draft.date,
      time: draft.time,
      dateLabel: formatDateLabel(draft.date),
      total: draft.service.price,
    };

    return of(confirmation).pipe(delay(600));
  }
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
