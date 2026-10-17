import { Routes } from '@angular/router';

/**
 * Rotas do app do cliente.
 *
 * Na v1 a barbearia é identificada por caminho (/b/:slug) e não por
 * subdomínio: o Firebase Hosting resolve sem wildcard de DNS. Quando cada
 * barbearia precisar do próprio ícone na tela inicial do celular, o slug
 * passa para subdomínio e só o resolvedor de tenant muda.
 */
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'b/navalha-e-co' },
  {
    path: 'b/:slug',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  { path: '**', redirectTo: '' },
];
