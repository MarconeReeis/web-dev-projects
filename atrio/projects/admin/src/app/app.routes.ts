import { Routes } from '@angular/router';
import { PHONE_QUERY } from './layout/viewport';
import { Shell } from './layout/shell';
import { guestOnly, staffOnly } from './features/auth/guards';
import { pinRequired } from './shared/pin/pin-gate';

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
    // Destino do link de "Esqueci minha senha". Sem guarda: quem chega aqui
    // tem só a sessão temporária do link, que serve para trocar a senha.
    path: 'nova-senha',
    title: 'Nova senha · Átrio',
    loadComponent: () =>
      import('./features/auth/new-password-page').then((m) => m.NewPasswordPage),
  },
  {
    // Botões "Confirmar" e "Recusar" do e-mail de pedido. Sem login: o
    // barbeiro responde de qualquer aparelho; a prova é o token do pedido.
    path: 'responder',
    title: 'Responder pedido · Átrio',
    loadComponent: () => import('./features/respond/respond-page').then((m) => m.RespondPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [staffOnly],
    children: [
      // No celular o painel abre no "Hoje"; no tablet, na Dashboard.
      {
        path: '',
        pathMatch: 'full',
        redirectTo: () => (window.matchMedia(PHONE_QUERY).matches ? 'hoje' : 'dashboard'),
      },
      {
        // Painel de celular: o dia em lista, com os pedidos no topo.
        path: 'hoje',
        title: 'Hoje · Átrio',
        data: { mode: 'hoje' },
        loadComponent: () => import('./features/today/day-list-page').then((m) => m.DayListPage),
      },
      {
        path: 'dias',
        title: 'Agenda · Átrio',
        data: { mode: 'dias' },
        loadComponent: () => import('./features/today/day-list-page').then((m) => m.DayListPage),
      },
      {
        path: 'mais',
        title: 'Mais · Átrio',
        loadComponent: () => import('./features/more/more-page').then((m) => m.MorePage),
      },
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
        // Valores e caixa num tablet que fica logado o dia inteiro.
        canActivate: [pinRequired('abrir o Financeiro')],
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
