import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'atrio.booking.cliente';

interface StoredIdentity {
  readonly name: string;
  readonly phone: string;
}

/**
 * Quem é o cliente neste aparelho.
 *
 * **Não é autenticação.** É a lembrança do nome e do telefone digitados no
 * último agendamento, guardada no próprio aparelho, para a pessoa não ter de
 * redigitar e para "Meus horários" ter o que consultar.
 *
 * A consequência está assumida: quem souber o telefone de outra pessoa e
 * digitá-lo vê os agendamentos dela. Para uma barbearia, onde a informação
 * exposta é "fulano corta o cabelo quinta às 15h", o risco é baixo e o ganho
 * de não exigir cadastro é alto — exigir conta para marcar um corte derruba
 * a conversão, que é justamente o que o app precisa entregar.
 *
 * Isso muda quando a autenticação entrar: a consulta passa a ser pela conta,
 * e o telefone volta a ser só um dado de contato. Até lá, nada sensível
 * (pagamento, valores de outras pessoas) pode aparecer nesta tela.
 */
@Injectable({ providedIn: 'root' })
export class ClientIdentity {
  private readonly stored = signal<StoredIdentity | null>(this.load());

  readonly name = computed(() => this.stored()?.name ?? '');
  readonly phone = computed(() => this.stored()?.phone ?? '');
  readonly known = computed(() => this.stored() !== null);

  remember(name: string, phone: string): void {
    const identity = { name: name.trim(), phone: phone.trim() };
    this.stored.set(identity);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
    } catch {
      // Modo privado: vale só para esta sessão.
    }
  }

  forget(): void {
    this.stored.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nada a fazer: o estado em memória já foi limpo.
    }
  }

  private load(): StoredIdentity | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<StoredIdentity>;
      if (!parsed.phone) return null;

      return { name: parsed.name ?? '', phone: parsed.phone };
    } catch {
      return null;
    }
  }
}
