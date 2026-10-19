import { Injectable } from '@angular/core';
import { PinCheck, PinStatus, StaffAuthError } from '../models/staff';
import { CounterPin } from '../repositories/repositories';
import { DEMO_STAFF_CREDENTIALS } from './demo-staff-auth';

const KEY = 'atrio.demo.pin.v1';
const MAX_FAILED = 5;
const LOCK_MS = 5 * 60_000;

interface Stored {
  pin: string;
  failed: number;
  lockedUntil: string | null;
}

/**
 * PIN do balcão na demonstração, guardado no próprio aparelho.
 *
 * Aqui o PIN fica legível no armazenamento local — é demonstração, num
 * aparelho com dados fictícios. A versão real guarda só o resumo, numa
 * tabela que ninguém lê, e confere no servidor.
 */
@Injectable()
export class DemoCounterPin extends CounterPin {
  async status(): Promise<PinStatus> {
    const stored = read();
    return { configured: !!stored, lockedUntil: activeLock(stored) };
  }

  async verify(pin: string): Promise<PinCheck> {
    const stored = read();
    if (!stored) throw new StaffAuthError('indisponivel', 'Esta conta ainda não tem PIN.');

    const lock = activeLock(stored);
    if (lock) return { ok: false, remaining: 0, lockedUntil: lock };

    if (pin === stored.pin) {
      write({ ...stored, failed: 0, lockedUntil: null });
      return { ok: true, remaining: null, lockedUntil: null };
    }

    const failed = stored.failed + 1;
    if (failed >= MAX_FAILED) {
      const lockedUntil = new Date(Date.now() + LOCK_MS).toISOString();
      write({ ...stored, failed: 0, lockedUntil });
      return { ok: false, remaining: 0, lockedUntil };
    }
    write({ ...stored, failed });
    return { ok: false, remaining: MAX_FAILED - failed, lockedUntil: null };
  }

  async change(next: string, current: string | null): Promise<PinCheck> {
    assertFormat(next);
    if (read()) {
      const check = await this.verify(current ?? '');
      if (!check.ok) return check;
    }
    write({ pin: next, failed: 0, lockedUntil: null });
    return { ok: true, remaining: null, lockedUntil: null };
  }

  async reset(password: string, next: string): Promise<void> {
    assertFormat(next);
    if (password !== DEMO_STAFF_CREDENTIALS.password) {
      throw new StaffAuthError('credenciais', 'Senha incorreta.');
    }
    write({ pin: next, failed: 0, lockedUntil: null });
  }
}

function assertFormat(pin: string): void {
  if (!/^[0-9]{4}$/.test(pin)) throw new StaffAuthError('indisponivel', 'O PIN tem 4 números.');
}

function activeLock(stored: Stored | null): string | null {
  return stored?.lockedUntil && new Date(stored.lockedUntil) > new Date() ? stored.lockedUntil : null;
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

function write(value: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Modo privado: o PIN vale enquanto a aba estiver aberta.
  }
}
