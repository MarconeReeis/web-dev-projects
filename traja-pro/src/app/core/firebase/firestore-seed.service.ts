import { inject, Injectable } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
} from '@angular/fire/firestore';
import { environment } from '../../../environments/environment';
import {
  MOCK_PROFESSIONALS,
  MOCK_SERVICES,
} from '../data/mock-booking.data';
import {
  FirestoreProfessionalDoc,
  FirestoreServiceDoc,
} from './firestore.models';
import { professionalsPath, servicesPath } from './firestore.paths';

@Injectable({ providedIn: 'root' })
export class FirestoreSeedService {
  private readonly firestore = inject(Firestore);
  private seeded = false;

  async runIfNeeded(): Promise<void> {
    if (!environment.useFirebase || !environment.firebaseSeedOnEmpty || this.seeded) {
      return;
    }

    const professionalsRef = collection(this.firestore, professionalsPath());
    const snapshot = await getDocs(professionalsRef);

    if (!snapshot.empty) {
      this.seeded = true;
      return;
    }

    await this.seedProfessionals();
    await this.seedServices();
    this.seeded = true;
    console.info('[Traja Pro] Firestore seed concluído para', environment.businessId);
  }

  private async seedProfessionals(): Promise<void> {
    for (const professional of MOCK_PROFESSIONALS) {
      const data: FirestoreProfessionalDoc = {
        name: professional.name,
        initials: professional.initials,
        specialty: professional.specialty,
        experienceYears: professional.experienceYears,
        avgDurationMinutes: professional.avgDurationMinutes,
        rating: professional.rating,
        active: true,
      };

      await setDoc(
        doc(this.firestore, professionalsPath(), professional.id),
        data
      );
    }
  }

  private async seedServices(): Promise<void> {
    for (const service of MOCK_SERVICES) {
      const data: FirestoreServiceDoc = {
        professionalId: service.professionalId,
        name: service.name,
        description: service.description,
        price: service.price,
        durationMinutes: service.durationMinutes,
        active: true,
      };

      await setDoc(doc(this.firestore, servicesPath(), service.id), data);
    }
  }
}
