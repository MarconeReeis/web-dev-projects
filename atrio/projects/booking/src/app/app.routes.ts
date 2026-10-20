import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';
import { Shell } from './layout/shell';

/**
 * Links antigos (/b/<barbearia>/…) — divulgados, salvos ou dentro de um
 * e-mail ainda não aberto — vão para o endereço novo, com o resto do
 * caminho e os parâmetros.
 */
const legacyPath: CanMatchFn = (_route, segments) => {
  const router = inject(Router);
  const queryParams = router.currentNavigation()?.extractedUrl.queryParams ?? {};
  return router.createUrlTree(['/', ...segments.slice(1).map((s) => s.path)], { queryParams });
};

/**
 * Rotas do app do cliente.
 *
 * O agendamento fica FORA do shell, como rota própria: durante o fluxo não há
 * para onde navegar senão adiante ou para trás, e a barra inferior roubaria
 * espaço do polegar justamente na tela com mais toques.
 *
 * A rota mais específica vem primeiro — o roteador casa de cima para baixo.
 *
 * A barbearia é o primeiro trecho do caminho: atrioagenda.com.br/<barbearia>.
 * Um produto só, o Átrio Agenda, com uma página por barbearia — e o link de
 * cada uma leva só a ela. Os endereços que o Átrio usa para si (/planos,
 * /entrar…) são reservados no banco (20261020000100_reserved_slugs.sql) e
 * nenhuma barbearia os recebe.
 */
export const routes: Routes = [
  { path: 'b', canMatch: [legacyPath], children: [] },
  {
    path: ':slug/agendar',
    title: 'Agendar horário',
    loadComponent: () =>
      import('./features/booking/booking-page').then((m) => m.BookingPage),
  },
  {
    // Destino do link de "Esqueci minha senha". Fora do shell: é um passo
    // de conta, não uma seção do app.
    path: ':slug/nova-senha',
    title: 'Nova senha',
    loadComponent: () =>
      import('./features/auth/new-password-page').then((m) => m.NewPasswordPage),
  },
  {
    // Detalhes e reagendamento também ficam fora do shell: têm o próprio
    // "voltar" e ações no pé da tela, que a barra inferior cobriria.
    path: ':slug/meus-horarios/:id/reagendar',
    title: 'Reagendar',
    loadComponent: () =>
      import('./features/appointments/reschedule-page').then((m) => m.ReschedulePage),
  },
  {
    path: ':slug/meus-horarios/:id',
    title: 'Agendamento',
    loadComponent: () =>
      import('./features/appointments/appointment-page').then((m) => m.AppointmentPage),
  },
  {
    // Política e termos: páginas de leitura, com o próprio "voltar".
    path: ':slug/privacidade',
    title: 'Política de privacidade',
    data: { document: 'privacidade' },
    loadComponent: () => import('./features/profile/legal-page').then((m) => m.LegalPage),
  },
  {
    path: ':slug/termos',
    title: 'Termos de uso',
    data: { document: 'termos' },
    loadComponent: () => import('./features/profile/legal-page').then((m) => m.LegalPage),
  },
  {
    path: ':slug',
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
  { path: '', pathMatch: 'full', redirectTo: 'navalha-e-co' },
  { path: '**', redirectTo: 'navalha-e-co' },
];
