import { Routes } from '@angular/router';
import { Shell } from './layout/shell';
import { guestOnly, staffOnly } from './features/auth/guards';

/**
 * Rotas do painel.
 *
 * Caminhos em português porque aparecem na barra de endereço do tablet e o
 * dono da barbearia lê o que está escrito ali.
 *
 * Cada seção é carregada sob demanda: a Dashboard abre sem baixar o código da
 * Agenda, do Financeiro e das Configurações. Num tablet em 4G de barbearia,
 * isso é a diferença entre abrir rápido e parecer travado.
 */
export const routes: Routes = [
  {
    // Fora do shell: sem menu nem barra — ainda não se sabe de qual
    // barbearia é quem está entrando.
    path: 'entrar',
    title: 'Entrar · Átrio',
    canActivate: [guestOnly],
    loadComponent: () => import('./features/auth/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [staffOnly],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · Átrio',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'agenda',
        title: 'Agenda · Átrio',
        loadComponent: () => import('./features/agenda/agenda-page').then((m) => m.AgendaPage),
      },
      {
        path: 'profissionais',
        title: 'Profissionais · Átrio',
        loadComponent: () =>
          import('./features/professionals/professionals-page').then(
            (m) => m.ProfessionalsPage,
          ),
      },
      {
        path: 'servicos',
        title: 'Serviços e preços · Átrio',
        loadComponent: () =>
          import('./features/services/services-page').then((m) => m.ServicesPage),
      },
      {
        path: 'financeiro',
        title: 'Financeiro · Átrio',
        loadComponent: () =>
          import('./features/finance/finance-page').then((m) => m.FinancePage),
      },
      {
        path: 'configuracoes',
        title: 'Configurações · Átrio',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
