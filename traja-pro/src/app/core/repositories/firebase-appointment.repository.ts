import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from '@angular/fire/firestore';
import { from, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { Appointment } from '../../shared/models/business.model';
import {
  FirestoreBookingDoc,
  isUpcomingBooking,
} from '../firebase/firestore.models';
import { mapBookingToAppointment } from '../firebase/firestore.mappers';
import { bookingsPath } from '../firebase/firestore.paths';
import { ClientSessionService } from '../services/client-session.service';
import { AppointmentRepository } from './appointment.repository';

@Injectable({ providedIn: 'root' })
export class FirebaseAppointmentRepository extends AppointmentRepository {
  private readonly firestore = inject(Firestore);
  private readonly clientSession = inject(ClientSessionService);

  getUpcoming(): Observable<Appointment[]> {
    return this.getBookingsByPhone().pipe(
      map((bookings) =>
        bookings
          .filter(
            (b) =>
              b.data.status === 'confirmed' &&
              isUpcomingBooking(b.data.date, b.data.time, b.data.durationMinutes)
          )
          .sort((a, b) => this.compareBookings(a.data, b.data))
          .map((b) => mapBookingToAppointment(b.id, b.data))
      )
    );
  }

  getHistory(): Observable<Appointment[]> {
    return this.getBookingsByPhone().pipe(
      map((bookings) =>
        bookings
          .filter(
            (b) =>
              b.data.status === 'cancelled' ||
              (b.data.status === 'confirmed' &&
                !isUpcomingBooking(b.data.date, b.data.time, b.data.durationMinutes))
          )
          .sort((a, b) => this.compareBookings(b.data, a.data))
          .map((b) => mapBookingToAppointment(b.id, b.data))
      )
    );
  }

  cancelAppointment(id: string): Observable<void> {
    const docRef = doc(this.firestore, bookingsPath(), id);
    return from(updateDoc(docRef, { status: 'cancelled' }));
  }

  addUpcoming(_appointment: Appointment): Observable<void> {
    // Com Firebase, o agendamento já é criado em createBooking()
    return of(undefined);
  }

  private getBookingsByPhone(): Observable<{ id: string; data: FirestoreBookingDoc }[]> {
    const phone = this.clientSession.getPhone();
    if (!phone) {
      return of([]);
    }

    const ref = collection(this.firestore, bookingsPath());
    const q = query(ref, where('customerPhone', '==', phone));

    return from(getDocs(q)).pipe(
      map((snapshot) =>
        snapshot.docs.map((item) => ({
          id: item.id,
          data: item.data() as FirestoreBookingDoc,
        }))
      )
    );
  }

  private compareBookings(a: FirestoreBookingDoc, b: FirestoreBookingDoc): number {
    const dateA = `${a.date}T${a.time}`;
    const dateB = `${b.date}T${b.time}`;
    return dateA.localeCompare(dateB);
  }
}
