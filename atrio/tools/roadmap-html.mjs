/**
 * Gera a versão visual do roadmap.
 *
 *   npm run roadmap
 *
 * Lê docs/ROADMAP.md (a fonte) e escreve docs/roadmap.html: progresso geral e
 * por fase, o que está em andamento, o que vem a seguir, a ordem sugerida e
 * o que fica para depois do lançamento. Um arquivo só, sem dependências —
 * abre com dois cliques.
 *
 * O que o gerador entende do Markdown:
 *   - `## Antes de tudo` e `## Fase N — Nome`: fases, com itens
 *     `- [x]` feito, `- [~]` em andamento, `- [ ]` a fazer, no formato
 *     `**Título** — P. detalhes` (P, M ou G: tamanho);
 *   - `## Depois do lançamento`: itens `- **Título** — detalhes`;
 *   - `## Ordem sugerida`: lista numerada; `~~riscado~~` é feito.
 *
 * Mudou o roadmap, rode de novo.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'docs', 'ROADMAP.md');
const target = join(root, 'docs', 'roadmap.html');

// ─── leitura ─────────────────────────────────────────────────────────────

const STATUS = { x: 'feito', '~': 'andamento', ' ': 'afazer' };

function parse(markdown) {
  const lines = markdown.split(/\r?\n/);
  const roadmap = { title: '', status: '', phases: [], later: [], order: [] };

  let section = null; // { kind: 'phase' | 'later' | 'order' | 'other', ref }
  let current = null; // item recebendo linhas de continuação
  let intro = null; // parágrafo de abertura de uma fase

  const flush = () => {
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('# ')) {
      roadmap.title = line.slice(2).trim();
      continue;
    }

    // "Onde estamos": o parágrafo inteiro, até a linha em branco.
    if (line.startsWith('**Onde estamos')) {
      const paragraph = [];
      while (i < lines.length && lines[i].trim()) paragraph.push(lines[i++].trim());
      roadmap.status = paragraph.join(' ');
      continue;
    }

    const heading = line.match(/^## (.+)$/);
    if (heading) {
      flush();
      const name = heading[1].trim();
      const phase = name.match(/^Fase (\d+) — (.+)$/);
      if (phase || name.startsWith('Antes de tudo')) {
        const ref = {
          number: phase ? Number(phase[1]) : 0,
          name: phase ? phase[2] : name.replace(/\s*\(.*\)$/, ''),
          intro: '',
          items: [],
        };
        roadmap.phases.push(ref);
        section = { kind: 'phase', ref };
        intro = [];
      } else if (name.startsWith('Depois do lançamento')) {
        section = { kind: 'later' };
        intro = null;
      } else if (name.startsWith('Ordem sugerida')) {
        section = { kind: 'order' };
        intro = null;
      } else {
        section = { kind: 'other' };
        intro = null;
      }
      continue;
    }
    if (!section || section.kind === 'other') continue;

    const check = line.match(/^- \[([ x~])\] (.*)$/);
    if (section.kind === 'phase' && check) {
      if (intro?.length) section.ref.intro = intro.join(' ');
      intro = null;
      current = { status: STATUS[check[1]], raw: [check[2].trim()] };
      section.ref.items.push(current);
      continue;
    }

    const bullet = line.match(/^- (\*\*.*)$/);
    if (section.kind === 'later' && bullet) {
      current = { raw: [bullet[1].trim()] };
      roadmap.later.push(current);
      continue;
    }

    const step = line.match(/^\d+\. (.*)$/);
    if (section.kind === 'order' && step) {
      current = { raw: [step[1].trim()] };
      roadmap.order.push(current);
      continue;
    }

    if (current && /^\s{2,}\S/.test(line)) {
      current.raw.push(line.trim());
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    // Texto solto entre o título da fase e o primeiro item: a apresentação.
    if (intro && section.kind === 'phase') intro.push(line.trim());
  }

  for (const phase of roadmap.phases) phase.items = phase.items.map(phaseItem);
  roadmap.later = roadmap.later.map(laterItem);
  roadmap.order = roadmap.order.map(orderStep);
  return roadmap;
}

/** "**Título** — P. detalhes" → título, tamanho, data de feito e detalhes. */
function phaseItem({ status, raw }) {
  const text = raw.join(' ');
  const match = text.match(/^\*\*(.+?)\*\*\s*(?:—\s*)?(.*)$/);
  const title = match ? match[1] : text;
  let rest = match ? match[2] : '';

  const size = rest.match(/^([PMG])\b/)?.[1] ?? null;
  if (size) rest = rest.replace(/^[PMG]\b/, '').replace(/^\s*\.\s*/, '');
  // "M + revisão jurídica." — o complemento do tamanho vira nota.
  let note = null;
  const plus = rest.match(/^\s*\+\s*([^.]+)\.\s*/);
  if (plus) {
    note = plus[1].trim();
    rest = rest.slice(plus[0].length);
  }

  const done = rest.match(/^(?:feito|decidido) em (\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;
  return { status, title, size, note, done, details: rest.trim() };
}

function laterItem({ raw }) {
  const text = raw.join(' ');
  const match = text.match(/^\*\*(.+?)\*\*\s*(?:—\s*)?(.*)$/);
  return { title: match ? match[1] : text, details: match ? match[2].trim() : '' };
}

/** Riscado inteiro: feito. Riscado em parte: em andamento. */
function orderStep({ raw }) {
  const text = raw.join(' ');
  const plain = text.replace(/\s*—\s*feito\.?$/, '');
  const status = /^~~[^~]+~~$/.test(plain) ? 'feito' : text.includes('~~') ? 'andamento' : 'afazer';
  return { status, text: status === 'feito' ? plain.replace(/~~/g, '') : text };
}

// ─── escrita ─────────────────────────────────────────────────────────────

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** O pouco de Markdown que aparece nos itens: `código`, **negrito**, ~~riscado~~. */
const inline = (text) =>
  escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');

const LABEL = { feito: 'Feito', andamento: 'Em andamento', afazer: 'A fazer' };
const SIZE = { P: 'Pequeno', M: 'Médio', G: 'Grande' };

/** Feito vale 1; em andamento, meio. */
function progress(items) {
  const count = (status) => items.filter((item) => item.status === status).length;
  const feito = count('feito');
  const andamento = count('andamento');
  const total = items.length;
  const percent = total ? Math.round(((feito + andamento / 2) / total) * 100) : 0;
  return { feito, andamento, afazer: total - feito - andamento, total, percent };
}

const icon = {
  feito: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  andamento: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/></svg>',
  afazer: '',
};

function itemHtml(item) {
  const chips = [
    item.size ? `<span class="chip" title="${SIZE[item.size]}">${item.size}</span>` : '',
    item.note ? `<span class="chip chip-note">+ ${escape(item.note)}</span>` : '',
    item.done && item.status === 'feito' ? `<span class="chip chip-date">${item.done}</span>` : '',
  ].join('');
  return `
        <li class="item" data-status="${item.status}">
          <details${item.status === 'andamento' ? ' open' : ''}>
            <summary>
              <span class="dot dot-${item.status}" role="img" aria-label="${LABEL[item.status]}">${icon[item.status]}</span>
              <span class="item-title">${inline(item.title)}</span>
              <span class="chips">${chips}</span>
            </summary>
            ${item.details ? `<p class="item-details">${inline(item.details)}</p>` : ''}
          </details>
        </li>`;
}

function phaseHtml(phase) {
  const p = progress(phase.items);
  const label = phase.number ? `Fase ${phase.number}` : 'Início';
  return `
    <section class="card phase" id="fase-${phase.number}">
      <header class="phase-head">
        <div>
          <p class="eyebrow">${label}</p>
          <h2>${inline(phase.name)}</h2>
          ${phase.intro ? `<p class="muted">${inline(phase.intro)}</p>` : ''}
        </div>
        <div class="phase-score">
          <strong>${p.percent}%</strong>
          <span class="muted">${p.feito} de ${p.total} feitos</span>
        </div>
      </header>
      <div class="bar" role="progressbar" aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso da ${label}">
        <span class="bar-done" style="width:${(p.feito / p.total) * 100}%"></span>
        <span class="bar-doing" style="width:${(p.andamento / p.total) * 100}%"></span>
      </div>
      <ul class="items">${phase.items.map(itemHtml).join('')}
      </ul>
    </section>`;
}

function render(roadmap) {
  const all = roadmap.phases.flatMap((phase) => phase.items);
  const total = progress(all);
  const doing = roadmap.phases.flatMap((phase) =>
    phase.items.filter((item) => item.status === 'andamento').map((item) => ({ item, phase })),
  );
  const next = roadmap.phases
    .flatMap((phase) => phase.items.filter((item) => item.status === 'afazer').map((item) => ({ item, phase })))
    .slice(0, 4);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const generated = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date());

  const focusItem = ({ item, phase }) => `
          <li>
            <a href="#fase-${phase.number}">
              <span class="dot dot-${item.status}" aria-hidden="true">${icon[item.status]}</span>
              <span>
                <strong>${inline(item.title)}</strong>
                <span class="muted small">${phase.number ? `Fase ${phase.number}` : 'Início'} · ${inline(phase.name)}${item.size ? ` · ${SIZE[item.size]}` : ''}</span>
              </span>
            </a>
          </li>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roadmap do Átrio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #F5F5F9; --surface: #FFFFFF; --ink: #20212B; --muted: #5C5F6E; --border: #E4E4EC;
    --brand: #6C4DF6; --brand-soft: #EEEAFE; --brand-deep: #4A2BD4;
    --done: #15803D; --done-soft: #DCFCE7; --doing: #B45309; --doing-soft: #FEF0D7; --todo: #C9CAD6;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #15161D; --surface: #20212B; --ink: #F1F1F6; --muted: #9094A6; --border: #2F3140;
      --brand: #8B73FF; --brand-soft: #2B2550; --brand-deep: #C7BBFF;
      --done: #4ADE80; --done-soft: #143222; --doing: #FBBF24; --doing-soft: #3A2A0E; --todo: #4A4C5C;
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --bg: #15161D; --surface: #20212B; --ink: #F1F1F6; --muted: #9094A6; --border: #2F3140;
    --brand: #8B73FF; --brand-soft: #2B2550; --brand-deep: #C7BBFF;
    --done: #4ADE80; --done-soft: #143222; --doing: #FBBF24; --doing-soft: #3A2A0E; --todo: #4A4C5C;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.55 Manrope, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .page { max-width: 1080px; margin: 0 auto; padding: 32px 16px 64px; }
  h1, h2, h3 { font-family: Sora, Manrope, system-ui, sans-serif; letter-spacing: -0.01em; margin: 0; }
  h1 { font-size: clamp(26px, 4vw, 34px); }
  h2 { font-size: 20px; }
  h3 { font-size: 16px; }
  p { margin: 0; }
  .muted { color: var(--muted); }
  .small { font-size: 13px; }
  .eyebrow { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); }
  code { font: 13px ui-monospace, Consolas, monospace; background: var(--brand-soft); color: var(--brand-deep); padding: 1px 5px; border-radius: 6px; }
  a { color: inherit; text-decoration: none; }

  .top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-weight: 800; }
  .logo { width: 32px; height: 32px; border-radius: 10px; background: var(--brand); color: #fff; display: grid; place-items: center; font-family: Sora, sans-serif; }

  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 24px; padding: 24px; }
  .hero { display: grid; grid-template-columns: auto 1fr; gap: 28px; align-items: center; }
  .ring { position: relative; width: 132px; height: 132px; }
  .ring svg { transform: rotate(-90deg); }
  .ring-label { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
  .ring-label strong { font: 700 30px Sora, sans-serif; }
  .stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .stat { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; }
  .stat-feito { background: var(--done-soft); color: var(--done); }
  .stat-andamento { background: var(--doing-soft); color: var(--doing); }
  .stat-afazer { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .focus h2 { font-size: 16px; margin-bottom: 12px; }
  .focus ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .focus a { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border-radius: 14px; }
  .focus a:hover { background: var(--bg); }
  .focus strong { display: block; }

  .overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 16px; }
  .overview a { display: block; padding: 14px 16px; }
  .overview a:hover { border-color: var(--brand); }
  .overview .mini { height: 6px; border-radius: 99px; background: var(--border); overflow: hidden; margin-top: 10px; display: flex; }

  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin: 32px 0 12px; }
  .filters button {
    font: inherit; font-size: 13px; font-weight: 700; padding: 7px 14px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--surface); color: var(--ink); cursor: pointer;
  }
  .filters button[aria-pressed="true"] { background: var(--brand); border-color: var(--brand); color: #fff; }

  .phase { margin-top: 16px; }
  .phase-head { display: flex; justify-content: space-between; gap: 16px; }
  .phase-head .muted { margin-top: 4px; font-size: 14px; }
  .phase-score { text-align: right; flex-shrink: 0; }
  .phase-score strong { display: block; font: 700 24px Sora, sans-serif; }
  .phase-score span { font-size: 13px; }
  .bar { display: flex; height: 8px; border-radius: 99px; background: var(--border); overflow: hidden; margin: 16px 0 8px; }
  .bar-done, .mini .bar-done { background: var(--done); }
  .bar-doing, .mini .bar-doing { background: var(--doing); }

  .items { list-style: none; margin: 0; padding: 0; }
  .item { border-top: 1px solid var(--border); }
  .item:first-child { border-top: 0; }
  summary { display: flex; align-items: center; gap: 12px; padding: 12px 4px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  .item-title { flex: 1; font-weight: 600; }
  .item[data-status="feito"] .item-title { color: var(--muted); }
  .item-details { padding: 0 4px 14px 36px; color: var(--muted); font-size: 14px; }
  .chips { display: flex; gap: 6px; flex-shrink: 0; }
  .chip { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--brand-soft); color: var(--brand-deep); }
  .chip-note { background: var(--doing-soft); color: var(--doing); }
  .chip-date { background: var(--bg); color: var(--muted); border: 1px solid var(--border); font-weight: 600; }

  .dot { flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; }
  .dot svg { width: 14px; height: 14px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .dot-feito { background: var(--done); }
  .dot-andamento { background: var(--doing-soft); border: 2px solid var(--doing); }
  .dot-andamento svg { fill: var(--doing); stroke: none; }
  .dot-afazer { border: 2px solid var(--todo); }

  .hidden { display: none; }

  .section-title { margin: 40px 0 4px; }
  .timeline { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 0; }
  .timeline li { display: flex; gap: 14px; position: relative; padding-bottom: 18px; }
  .timeline li::before { content: ""; position: absolute; left: 10px; top: 24px; bottom: 0; width: 2px; background: var(--border); }
  .timeline li:last-child::before { display: none; }
  .timeline li[data-status="feito"] span:last-child { color: var(--muted); }

  .later { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; margin-top: 16px; }
  .later .card { padding: 18px; border-radius: 20px; }
  .later p { margin-top: 6px; font-size: 13px; color: var(--muted); }

  footer { margin-top: 40px; font-size: 13px; color: var(--muted); text-align: center; }

  @media (max-width: 720px) {
    .page { padding-top: 20px; }
    .card { padding: 18px; border-radius: 20px; }
    .hero { grid-template-columns: 1fr; justify-items: center; text-align: center; }
    .stats { justify-content: center; }
    .grid-2 { grid-template-columns: 1fr; }
    .phase-head { flex-direction: column; }
    .phase-score { text-align: left; }
    .chips .chip-date { display: none; }
    .item-details { padding-left: 4px; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <div>
      <div class="brand"><span class="logo">Á</span> Átrio</div>
      <h1>${inline(roadmap.title)}</h1>
    </div>
    <p class="muted small">Gerado em ${generated} a partir de <code>docs/ROADMAP.md</code></p>
  </div>

  <section class="card hero">
    <div class="ring">
      <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r="${radius}" fill="none" stroke="var(--border)" stroke-width="14"/>
        <circle cx="66" cy="66" r="${radius}" fill="none" stroke="var(--brand)" stroke-width="14" stroke-linecap="round"
          stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${(circumference * (1 - total.percent / 100)).toFixed(1)}"/>
      </svg>
      <div class="ring-label"><strong>${total.percent}%</strong><span class="muted small">concluído</span></div>
    </div>
    <div>
      <p class="eyebrow">Onde estamos</p>
      <p style="margin-top:6px">${inline(roadmap.status.replace(/^\*\*Onde estamos \(([^)]+)\)\.\*\*\s*/, ''))}</p>
      <div class="stats">
        <span class="stat stat-feito">${total.feito} feitos</span>
        <span class="stat stat-andamento">${total.andamento} em andamento</span>
        <span class="stat stat-afazer">${total.afazer} a fazer</span>
      </div>
    </div>
  </section>

  <div class="overview">${roadmap.phases
    .map((phase) => {
      const p = progress(phase.items);
      return `
    <a class="card" href="#fase-${phase.number}">
      <p class="eyebrow">${phase.number ? `Fase ${phase.number}` : 'Início'}</p>
      <h3>${inline(phase.name)}</h3>
      <p class="muted small">${p.percent}% · ${p.feito}/${p.total}</p>
      <div class="mini"><span class="bar-done" style="width:${(p.feito / p.total) * 100}%"></span><span class="bar-doing" style="width:${(p.andamento / p.total) * 100}%"></span></div>
    </a>`;
    })
    .join('')}
  </div>

  <div class="grid-2">
    <section class="card focus">
      <h2>Em andamento</h2>
      ${doing.length ? `<ul>${doing.map(focusItem).join('')}\n        </ul>` : '<p class="muted">Nada em andamento.</p>'}
    </section>
    <section class="card focus">
      <h2>A seguir</h2>
      ${next.length ? `<ul>${next.map(focusItem).join('')}\n        </ul>` : '<p class="muted">Tudo feito. Hora de lançar.</p>'}
    </section>
  </div>

  <div class="filters" role="group" aria-label="Filtrar itens">
    <button type="button" data-filter="todos" aria-pressed="true">Todos</button>
    <button type="button" data-filter="andamento" aria-pressed="false">Em andamento</button>
    <button type="button" data-filter="afazer" aria-pressed="false">A fazer</button>
    <button type="button" data-filter="feito" aria-pressed="false">Feitos</button>
  </div>
${roadmap.phases.map(phaseHtml).join('\n')}

  <h2 class="section-title">Ordem sugerida</h2>
  <ol class="timeline">${roadmap.order
    .map(
      (step) => `
    <li data-status="${step.status}">
      <span class="dot dot-${step.status}" role="img" aria-label="${LABEL[step.status]}">${icon[step.status]}</span>
      <span>${inline(step.text)}</span>
    </li>`,
    )
    .join('')}
  </ol>

  <h2 class="section-title">Depois do lançamento</h2>
  <p class="muted">Pedidos previsíveis, já considerados no modelo.</p>
  <div class="later">${roadmap.later
    .map(
      (item) => `
    <article class="card">
      <h3>${inline(item.title)}</h3>
      ${item.details ? `<p>${inline(item.details)}</p>` : ''}
    </article>`,
    )
    .join('')}
  </div>

  <footer>Para atualizar: edite <code>docs/ROADMAP.md</code> e rode <code>npm run roadmap</code>.</footer>
</div>
<script>
  // Filtro: esconde os itens de outro estado e as fases que ficam vazias.
  const buttons = document.querySelectorAll('[data-filter]');
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      const filter = button.dataset.filter;
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      document.querySelectorAll('.item').forEach((item) => {
        item.classList.toggle('hidden', filter !== 'todos' && item.dataset.status !== filter);
      });
      document.querySelectorAll('.phase').forEach((phase) => {
        phase.classList.toggle('hidden', !phase.querySelector('.item:not(.hidden)'));
      });
    }),
  );
</script>
</body>
</html>
`;
}

const roadmap = parse(readFileSync(source, 'utf8'));
writeFileSync(target, render(roadmap));

const total = progress(roadmap.phases.flatMap((phase) => phase.items));
console.log(`\n✔ docs/roadmap.html — ${total.percent}% até o lançamento`);
for (const phase of roadmap.phases) {
  const p = progress(phase.items);
  const label = phase.number ? `Fase ${phase.number}` : 'Início';
  console.log(`  ${label.padEnd(7)} ${String(p.percent).padStart(3)}%  ${p.feito}/${p.total}  ${phase.name}`);
}
console.log();
