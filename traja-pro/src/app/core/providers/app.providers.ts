import { APP_INITIALIZER, EnvironmentProviders, Provider } from '@angular/core';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getFirestore, provideFirestore } from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import { FirestoreSeedService } from '../firebase/firestore-seed.service';
import { AppointmentRepository } from '../repositories/appointment.repository';
import { BookingRepository } from '../repositories/booking.repository';
import { FirebaseAppointmentRepository } from '../repositories/firebase-appointment.repository';
import { FirebaseBookingRepository } from '../repositories/firebase-booking.repository';

export function provideFirebase(): EnvironmentProviders[] {
  if (!environment.useFirebase) {
    console.warn('[Traja Pro] Firebase não configurado — verifique environment.ts');
    return [];
  }

  return [
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideFirestore(() => getFirestore()),
  ];
}

export function provideDataRepositories(): Provider[] {
  return [
    { provide: BookingRepository, useClass: FirebaseBookingRepository },
    { provide: AppointmentRepository, useClass: FirebaseAppointmentRepository },
  ];
}

export function provideFirestoreSeed(): Provider {
  return {
    provide: APP_INITIALIZER,
    useFactory: (seed: FirestoreSeedService) => () => seed.runIfNeeded(),
    deps: [FirestoreSeedService],
    multi: true,
  };
}
