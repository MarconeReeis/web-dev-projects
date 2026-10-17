import { AtrioIconName } from '@atrio/ui';

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: AtrioIconName;
}

/**
 * Menu do painel.
 *
 * A ordem segue a rotina do dia na barbearia, não a hierarquia do sistema:
 * primeiro o que se olha toda hora (Dashboard, Agenda), depois o que se
 * mexe de vez em quando (Profissionais, Serviços), por último o que se
 * consulta no fim do dia (Financeiro) e o que quase nunca muda (Configurações).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'layout-dashboard' },
  { label: 'Agenda', path: '/agenda', icon: 'calendar-days' },
  { label: 'Profissionais', path: '/profissionais', icon: 'users' },
  { label: 'Serviços e preços', path: '/servicos', icon: 'scissors' },
  { label: 'Financeiro', path: '/financeiro', icon: 'wallet' },
  { label: 'Configurações', path: '/configuracoes', icon: 'settings' },
];
