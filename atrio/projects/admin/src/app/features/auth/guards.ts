import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { StaffAuth } from '@atrio/data';
import { map, take } from 'rxjs';

/**
 * O painel só abre com sessão da equipe. Sem ela, vai para "Entrar"
 * levando junto para onde a pessoa queria ir.
 *
 * Espera a sessão salva no aparelho ser lida (a primeira emissão de
 * watchSession) antes de decidir — senão o tablet que já estava logado
 * piscaria a tela de login a cada abertura.
 */
export const staffOnly: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(StaffAuth)
    .watchSession()
    .pipe(
      take(1),
      map((session) =>
        session ? true : router.createUrlTree(['/entrar'], { queryParams: { voltar: state.url } }),
      ),
    );
};

/** Quem já entrou não precisa ver a tela de login: vai direto ao painel. */
export const guestOnly: CanActivateFn = () => {
  const router = inject(Router);
  return inject(StaffAuth)
    .watchSession()
    .pipe(
      take(1),
      map((session) => (session ? router.createUrlTree(['/']) : true)),
    );
};
