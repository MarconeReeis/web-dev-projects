import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Título da aba: "Perfil · Átrio Agenda", ou só "Átrio Agenda".
 *
 * Sem isto, uma rota sem título (o Início) herdava o da tela anterior — quem
 * voltava do Perfil via "Perfil" na aba do Início.
 */
@Injectable()
export class AtrioTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · Átrio Agenda` : 'Átrio Agenda');
  }
}
