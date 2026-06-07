import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'agendar',
    loadComponent: () =>
      import('./features/booking/booking.page').then((m) => m.BookingPage),
  },
  {
    path: 'agendamentos',
    loadComponent: () =>
      import('./features/appointments/appointments.page').then((m) => m.AppointmentsPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
