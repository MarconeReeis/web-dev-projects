import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { StaffAuthError, StaffSession } from '../models/staff';
import { StaffAuth } from '../repositories/repositories';
import { DEMO_TENANT_ID } from './demo-seed';

/** Credenciais do "Usar acesso demonstrativo" do painel. */
export const DEMO_STAFF_CREDENTIALS = {
  email: 'admin@navalhaeco.com.br',
  password: 'demo1234',
} as const;

const SESSION: StaffSession = {
  userId: 'demo-equipe',
  email: DEMO_STAFF_CREDENTIALS.email,
  name: 'Marcone Reis',
  tenantId: DEMO_TENANT_ID,
  role: 'dono',
};

/** Guarda só "saiu"; o padrão é entrar direto. */
const SIGNED_OUT_KEY = 'atrio.demo.equipe.saiu';

const LATENCY_MS = 400;

/**
 * Login da equipe na demonstração.
 *
 * Começa logado: quem abre a demonstração para conhecer o produto vai direto
 * à agenda, sem tropeçar numa tela de senha. "Sair" leva à tela de entrar de
 * verdade, onde o botão de acesso demonstrativo devolve a sessão — assim a
 * própria tela de login também pode ser demonstrada.
 */
@Injectable()
export class DemoStaffAuth extends StaffAuth {
  private readonly session$ = new BehaviorSubject<StaffSession | null>(
    read() ? null : SESSION,
  );

  watchSession(): Observable<StaffSession | null> {
    return this.session$.asObservable();
  }

  async signIn(email: string, password: string): Promise<StaffSession> {
    await delay();
    const matches =
      email.trim().toLowerCase() === DEMO_STAFF_CREDENTIALS.email &&
      password === DEMO_STAFF_CREDENTIALS.password;
    if (!matches) throw new StaffAuthError('credenciais', 'E-mail ou senha incorretos.');

    write(false);
    this.session$.next(SESSION);
    return SESSION;
  }

  async signOut(): Promise<void> {
    write(true);
    this.session$.next(null);
  }

  async sendPasswordReset(): Promise<void> {
    await delay();
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function write(signedOut: boolean): void {
  try {
    if (signedOut) localStorage.setItem(SIGNED_OUT_KEY, '1');
    else localStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    // Modo privado: vale enquanto a aba estiver aberta.
  }
}

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
}
