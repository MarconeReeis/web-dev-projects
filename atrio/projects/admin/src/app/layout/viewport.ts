import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Abaixo disto, celular: barra inferior no lugar do menu lateral. */
export const PHONE_QUERY = '(max-width: 767px)';

/**
 * Celular ou não, como signal — e acompanhando a rotação do aparelho.
 *
 * O painel nasceu para o tablet do balcão, em paisagem. No celular (o
 * barbeiro do plano Solo, ou o dono longe da barbearia) a grade de várias
 * colunas não cabe: ele vira o painel de celular, com quatro abas.
 */
@Injectable({ providedIn: 'root' })
export class Viewport {
  private readonly query = window.matchMedia(PHONE_QUERY);
  readonly isPhone = signal(this.query.matches);

  constructor() {
    const update = (event: MediaQueryListEvent) => this.isPhone.set(event.matches);
    this.query.addEventListener('change', update);
    inject(DestroyRef).onDestroy(() => this.query.removeEventListener('change', update));
  }
}
