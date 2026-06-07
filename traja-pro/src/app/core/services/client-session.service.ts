import { Injectable } from '@angular/core';
import { normalizePhone } from '../firebase/firestore.models';

const STORAGE_KEY = 'traja_client_phone';

@Injectable({ providedIn: 'root' })
export class ClientSessionService {
  setPhone(phone: string): void {
    const normalized = normalizePhone(phone);
    if (normalized.length >= 10) {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
  }

  getPhone(): string | null {
    return localStorage.getItem(STORAGE_KEY);
  }

  hasPhone(): boolean {
    return !!this.getPhone();
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
