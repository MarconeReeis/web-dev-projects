import { Routes } from '@angular/router';
import { Shell } from './layout/shell';

/**
 * Rotas do app do cliente.
 *
 * O agendamento fica FORA do shell, como rota própria: durante o fluxo não há
 * para onde navegar senão adiante ou para trás, e a barra inferior roubaria
 * espaço do polegar justamente na tela com mais toques.
 *
 * A rota mais específica vem primeiro — o roteador casa de cima para baixo.
 *
 * Na v1 a barbearia é identificada por caminho (/b/:slug) e não por
 * subdomínio: o Firebase Hosting resolve sem wildcard de DNS. Quando cada
 * barbearia precisar do próprio ícone na tela inicial do celular, o slug
 * passa para subdomínio e só o resolvedor de tenant muda.
 */
export const routes: Routes = [
  {
    path: 'b/:slug/agendar',
    title: 'Agendar horário',
    loadComponent: () =>
      import('./features/booking/booking-page').then((m) => m.BookingPage),
  },
  {
    // Destino do link de "Esqueci minha senha". Fora do shell: é um passo
    // de conta, não uma seção do app.
    path: 'b/:slug/nova-senha',
    title: 'Nova senha',
    loadComponent: () =>
      import('./features/auth/new-password-page').then((m) => m.NewPasswordPage),
  },
  {
    // Detalhes e reagendamento também ficam fora do shell: têm o próprio
    // "voltar" e ações no pé da tela, que a barra inferior cobriria.
    path: 'b/:slug/meus-horarios/:id/reagendar',
    title: 'Reagendar',
    loadComponent: () =>
      import('./features/appointments/reschedule-page').then((m) => m.ReschedulePage),
  },
  {
    path: 'b/:slug/meus-horarios/:id',
    title: 'Agendamento',
    loadComponent: () =>
      import('./features/appointments/appointment-page').then((m) => m.AppointmentPage),
  },
  {
    path: 'b/:slug',
    component: Shell,
    children: [
      {
        path: '',
        loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
      },
      {
        // A lista de profissionais virou seção da vitrine. Fica o
        // redirecionamento para quem guardou o link ou o tem no histórico.
        path: 'profissionais',
        redirectTo: '',
      },
      {
        path: 'meus-horarios',
        title: 'Meus horários',
        loadComponent: () =>
          import('./features/appointments/appointments-page').then(
            (m) => m.AppointmentsPage,
          ),
      },
      {
        path: 'perfil',
        title: 'Perfil',
        loadComponent: () =>
          import('./features/profile/profile-page').then((m) => m.ProfilePage),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'b/navalha-e-co' },
  { path: '**', redirectTo: 'b/navalha-e-co' },
];
