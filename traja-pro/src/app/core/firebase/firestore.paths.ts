import { environment } from '../../../environments/environment';

export const COLLECTIONS = {
  businesses: 'businesses',
  professionals: 'professionals',
  services: 'services',
  bookings: 'bookings',
} as const;

export function businessPath(...segments: string[]): string {
  return [COLLECTIONS.businesses, environment.businessId, ...segments].join('/');
}

export function professionalsPath(): string {
  return businessPath(COLLECTIONS.professionals);
}

export function servicesPath(): string {
  return businessPath(COLLECTIONS.services);
}

export function bookingsPath(): string {
  return businessPath(COLLECTIONS.bookings);
}
