import { DOCUMENT, Injectable, inject, signal } from '@angular/core';

/**
 * Evento não padronizado do Chromium. Não está no lib.dom do TypeScript
 * porque nenhum outro motor o implementa.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** Já rodando como aplicativo instalado. */
  | 'instalado'
  /** O navegador se ofereceu para instalar; dá para chamar prompt(). */
  | 'disponivel'
  /** Sem oferta do navegador: resta instruir (Safari, ou critérios não atendidos). */
  | 'manual';

/**
 * Instalação do painel como aplicativo.
 *
 * O Chromium dispara `beforeinstallprompt` quando o app é instalável e deixa
 * guardar o evento para disparar a instalação na hora que a interface quiser.
 * Guardamos justamente para oferecer um botão em vez de só explicar o caminho
 * do menu — quem está configurando o tablet da barbearia não deveria precisar
 * seguir instruções para isso.
 *
 * Safari não implementa o evento, e aí as instruções continuam sendo a única
 * saída. Por isso o estado tem três valores e não um booleano.
 *
 * O evento chega cedo, às vezes antes da tela de Configurações existir — daí
 * o serviço ser de raiz e escutar desde o início.
 */
@Injectable({ providedIn: 'root' })
export class InstallPrompt {
  private readonly document = inject(DOCUMENT);
  private deferred: BeforeInstallPromptEvent | null = null;

  readonly state = signal<InstallState>('manual');

  constructor() {
    if (this.isStandalone()) {
      this.state.set('instalado');
      return;
    }

    const view = this.document.defaultView;
    if (!view) return;

    view.addEventListener('beforeinstallprompt', (event) => {
      // Sem o preventDefault o Chrome mostra a própria barra de instalação,
      // e o evento guardado deixa de poder ser disparado depois.
      event.preventDefault();
      this.deferred = event as BeforeInstallPromptEvent;
      this.state.set('disponivel');
    });

    view.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.state.set('instalado');
    });
  }

  /** Dispara a instalação. Devolve true se o usuário aceitou. */
  async install(): Promise<boolean> {
    const event = this.deferred;
    if (!event) return false;

    await event.prompt();
    const { outcome } = await event.userChoice;

    // O evento só vale uma vez; o Chrome dispara outro se recusarem agora e
    // os critérios continuarem válidos.
    this.deferred = null;
    if (outcome === 'accepted') this.state.set('instalado');
    else this.state.set('manual');

    return outcome === 'accepted';
  }

  private isStandalone(): boolean {
    const view = this.document.defaultView;
    if (!view) return false;

    return (
      view.matchMedia('(display-mode: standalone)').matches ||
      // iOS não suporta display-mode e usa esta propriedade própria.
      (view.navigator as { standalone?: boolean }).standalone === true
    );
  }
}
