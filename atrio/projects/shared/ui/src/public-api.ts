/**
 * @atrio/ui — design system do Átrio.
 *
 * Componentes de apresentação puros: nada aqui conhece agendamento, barbearia
 * ou Firebase. Se um componente precisar de regra de negócio, ele pertence ao
 * app, não a esta lib.
 *
 * Os estilos ficam em `src/styles/` e são importados pelo styles.css de cada
 * app — não passam por este barrel.
 */

export * from './lib/icon/icon';
export * from './lib/icon/icon-set';
export * from './lib/button/button';
export * from './lib/badge/badge';
export * from './lib/avatar/avatar';
export * from './lib/card/card';
export * from './lib/page-heading/page-heading';
export * from './lib/empty-state/empty-state';
export * from './lib/form/input';
export * from './lib/form/field';
export * from './lib/form/switch';
export * from './lib/overlay/overlay';
export * from './lib/overlay/surface-shell';
export * from './lib/overlay/confirm-dialog';
export * from './lib/util/identity';
