/**
 * Gera o conjunto de ícones do Átrio a partir do pacote `lucide-static`.
 *
 * Os ícones entram no bundle como marcação estática: nenhuma dependência de
 * runtime, nenhum conflito de peer dependency a cada major do Angular.
 *
 * Para adicionar um ícone: inclua o nome em ICONS e rode `npm run icons`.
 * Lucide é ISC — a licença é copiada para o cabeçalho do arquivo gerado.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ICONS = [
  // navegação
  'layout-dashboard', 'calendar-days', 'users', 'scissors', 'wallet', 'settings',
  'panel-left-close', 'panel-left-open', 'menu', 'log-out',
  // indicadores e finanças
  'calendar-check', 'circle-check-big', 'credit-card', 'clock', 'banknote',
  'receipt', 'trending-up', 'trending-down', 'wallet-minimal',
  // ações
  'plus', 'arrow-up-right', 'chevron-down', 'chevron-left', 'chevron-right',
  'x', 'check', 'search', 'pencil', 'trash-2', 'ellipsis-vertical', 'play',
  // status
  'circle-alert', 'ban', 'user-x', 'calendar-x', 'calendar-off', 'circle-pause',
  // entidades
  'user', 'user-round', 'phone', 'map-pin', 'image', 'store', 'bell',
  'lock', 'smartphone', 'download', 'info', 'mail-check',
];

const ICONS_DIR = resolve('node_modules/lucide-static/icons');
const OUT = resolve('projects/shared/ui/src/lib/icon/icon-set.ts');

const missing = [];
const entries = [];

for (const name of [...new Set(ICONS)].sort()) {
  const file = resolve(ICONS_DIR, `${name}.svg`);
  if (!existsSync(file)) {
    missing.push(name);
    continue;
  }
  const svg = readFileSync(file, 'utf8');
  const inner = svg
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('');
  entries.push(`  '${name}': '${inner.replace(/'/g, "\'")}',`);
}

if (missing.length) {
  console.error(`\nÍcones não encontrados no lucide-static: ${missing.join(', ')}`);
  console.error('Confira o nome em https://lucide.dev/icons\n');
  process.exit(1);
}

const out = `/**
 * ARQUIVO GERADO — não edite à mão.
 * Origem: lucide-static (ISC). Regenere com \`npm run icons\`.
 * A lista de ícones fica em tools/generate-icons.mjs.
 */

export const ATRIO_ICONS = {
${entries.join('\n')}
} as const;

export type AtrioIconName = keyof typeof ATRIO_ICONS;
`;

writeFileSync(OUT, out, 'utf8');
console.log(`${entries.length} ícones gerados em ${OUT}`);
