import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  ClientAccount,
  ClientAuthError,
  ClientProfileChanges,
  NewClientAccount,
} from '../models/client-account';
import { ClientAuth } from '../repositories/repositories';
import { formatPhone } from '../phone';
import { newId } from './demo-store';

/**
 * Credenciais da conta fictícia do botão "Usar acesso demonstrativo".
 *
 * O botão entra por `signIn` com estes dados, como qualquer pessoa — assim a
 * demonstração exercita o caminho real, e não um atalho que só existe nela.
 *
 * É um cliente que o seed já atende (ver demo-seed), para "Meus horários"
 * ter histórico logo na primeira entrada.
 */
export const DEMO_CLIENT_CREDENTIALS = {
  email: 'bruno@exemplo.com',
  password: 'demo1234',
} as const;

const DEMO_ACCOUNT: Omit<StoredAccount, 'passwordHash'> = {
  id: 'cli-demo-bruno',
  name: 'Bruno Tavares',
  email: DEMO_CLIENT_CREDENTIALS.email,
  phone: '(11) 99100-2201',
  photoUrl: null,
};

/**
 * Contas ficam fora do DemoStore de propósito: o conjunto de dados de lá é
 * regerado a cada dia, e uma conta criada ontem não pode sumir hoje.
 */
const ACCOUNTS_KEY = 'atrio.demo.contas.v1';
const SESSION_KEY = 'atrio.demo.sessao.v1';

/** Latência simulada: sem ela, o estado "Entrando…" nunca aparece no teste. */
const LATENCY_MS = 450;

interface StoredAccount extends ClientAccount {
  readonly passwordHash: string;
}

/**
 * Autenticação do modo demonstração, inteira no armazenamento local.
 *
 * Não protege nada — quem abre o DevTools vê e troca tudo. Serve para a
 * interface ter os mesmos estados que terá com o Firebase Auth: sessão,
 * senha errada, e-mail já usado, sair.
 *
 * A senha, mesmo aqui, não é guardada como texto. Quem testa o protótipo pode
 * digitar a senha que usa em outros lugares, e ela não deve ficar legível no
 * aparelho.
 */
@Injectable()
export class DemoClientAuth extends ClientAuth {
  private readonly session$ = new BehaviorSubject<ClientAccount | null>(this.restore());

  watchSession(): Observable<ClientAccount | null> {
    return this.session$.asObservable();
  }

  async signIn(email: string, password: string): Promise<ClientAccount> {
    await delay();
    const accounts = await this.accounts();
    const hash = await hashPassword(email, password);

    const found = accounts.find(
      (account) => sameEmail(account.email, email) && account.passwordHash === hash,
    );
    if (!found) {
      throw new ClientAuthError('credenciais', 'E-mail ou senha incorretos.');
    }
    return this.open(found);
  }

  async signUp(input: NewClientAccount): Promise<ClientAccount> {
    await delay();
    const accounts = await this.accounts();

    if (accounts.some((account) => sameEmail(account.email, input.email))) {
      throw new ClientAuthError('email-em-uso', 'Já existe uma conta com este e-mail.');
    }

    const account: StoredAccount = {
      id: newId('cli'),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: formatPhone(input.phone),
      photoUrl: null,
      passwordHash: await hashPassword(input.email, input.password),
    };
    write(ACCOUNTS_KEY, [...accounts, account]);
    return this.open(account);
  }

  async signOut(): Promise<void> {
    remove(SESSION_KEY);
    this.session$.next(null);
  }

  /**
   * Na demonstração não há link de e-mail: vale para quem está com a sessão
   * aberta, o que basta para exercitar a tela.
   */
  async updatePassword(password: string): Promise<ClientAccount> {
    await delay();
    const current = this.session$.value;
    if (!current) {
      throw new ClientAuthError('link-invalido', 'Este link expirou ou já foi usado.');
    }
    // A conta fictícia mantém a senha fixa: o botão de acesso demonstrativo
    // entra com ela, e trocá-la quebraria o botão para sempre neste aparelho.
    if (current.id === DEMO_ACCOUNT.id) return current;

    const accounts = await this.accounts();
    const hash = await hashPassword(current.email, password);
    write(
      ACCOUNTS_KEY,
      accounts.map((account) => (account.id === current.id ? { ...account, passwordHash: hash } : account)),
    );
    return current;
  }

  async updateProfile(changes: ClientProfileChanges): Promise<ClientAccount> {
    await delay();
    const current = this.session$.value;
    if (!current) throw new ClientAuthError('indisponivel', 'Entre na sua conta para editar.');

    const updated = { ...current, name: changes.name.trim(), phone: formatPhone(changes.phone) };
    const accounts = await this.accounts();
    write(
      ACCOUNTS_KEY,
      accounts.map((account) => (account.id === current.id ? { ...account, ...updated } : account)),
    );
    this.session$.next(updated);
    return updated;
  }

  async changePassword(currentPassword: string, next: string): Promise<void> {
    await delay();
    const current = this.session$.value;
    if (!current) throw new ClientAuthError('indisponivel', 'Entre na sua conta para trocar a senha.');

    const accounts = await this.accounts();
    const stored = accounts.find((account) => account.id === current.id);
    if (stored?.passwordHash !== (await hashPassword(current.email, currentPassword))) {
      throw new ClientAuthError('credenciais', 'Senha atual incorreta.');
    }
    // A conta fictícia mantém a senha fixa — ver updatePassword.
    if (current.id === DEMO_ACCOUNT.id) return;

    const hash = await hashPassword(current.email, next);
    write(
      ACCOUNTS_KEY,
      accounts.map((account) => (account.id === current.id ? { ...account, passwordHash: hash } : account)),
    );
  }

  /**
   * Na demonstração: a conta sai do aparelho e a sessão termina. A conta
   * fictícia volta a existir no próximo acesso demonstrativo.
   */
  async deleteAccount(): Promise<void> {
    await delay();
    const current = this.session$.value;
    if (!current) return;
    const accounts = await this.accounts();
    write(ACCOUNTS_KEY, accounts.filter((account) => account.id !== current.id));
    await this.signOut();
  }

  async sendPasswordReset(): Promise<void> {
    // Nada é enviado no modo demonstração. A tela mostra a mesma mensagem que
    // mostrará com o Firebase — que também não diz se o e-mail existe.
    await delay();
  }

  async resendConfirmation(): Promise<void> {
    // A demonstração não pede confirmação de e-mail: não há o que reenviar.
    await delay();
  }

  // ─── interno ──────────────────────────────────────────────────────────

  private open(stored: StoredAccount): ClientAccount {
    const account = publicView(stored);
    write(SESSION_KEY, account.id);
    this.session$.next(account);
    return account;
  }

  /** Lista de contas, com a de demonstração sempre presente. */
  private async accounts(): Promise<StoredAccount[]> {
    const saved = read<StoredAccount[]>(ACCOUNTS_KEY) ?? [];
    if (saved.some((account) => account.id === DEMO_ACCOUNT.id)) return saved;

    const demo: StoredAccount = {
      ...DEMO_ACCOUNT,
      passwordHash: await hashPassword(
        DEMO_CLIENT_CREDENTIALS.email,
        DEMO_CLIENT_CREDENTIALS.password,
      ),
    };
    const all = [...saved, demo];
    write(ACCOUNTS_KEY, all);
    return all;
  }

  /** Síncrono de propósito: a sessão precisa existir já no primeiro quadro. */
  private restore(): ClientAccount | null {
    const id = read<string>(SESSION_KEY);
    if (!id) return null;

    const stored = (read<StoredAccount[]>(ACCOUNTS_KEY) ?? []).find((a) => a.id === id);
    return stored ? publicView(stored) : null;
  }
}

function publicView({ passwordHash: _, ...account }: StoredAccount): ClientAccount {
  return account;
}

function sameEmail(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Resumo da senha, salgado com o e-mail.
 *
 * `crypto.subtle` só existe em contexto seguro. Abrindo o app pelo IP da rede
 * local (para testar no celular), não há — e o login quebraria. Nesse caso
 * cai num resumo simples: continua não sendo texto legível, que é tudo o que
 * a demonstração precisa.
 */
async function hashPassword(email: string, password: string): Promise<string> {
  const input = `${email.trim().toLowerCase()}:${password}`;

  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv-${(hash >>> 0).toString(16)}`;
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Modo privado: a sessão vale enquanto a aba estiver aberta.
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nada a fazer.
  }
}
