/**
 * Troca o plano de uma barbearia.
 *
 *   npm run barbearia:plano -- --endereco barbearia-do-ze --plano solo
 *   npm run barbearia:plano -- --endereco barbearia-do-ze            (só mostra o plano)
 *
 * Planos: solo (1 profissional ativo, só o dono, caixa sem despesas) e
 * barbearia (sem limites). Quem decide se a troca cabe é o banco
 * (public.set_tenant_plan): rebaixar para Solo com dois profissionais
 * ativos, ou com atendentes, é recusado com o motivo — nada é apagado.
 *
 * Até a cobrança existir, é assim que o plano muda. Precisa da chave
 * service_role em .env.local (ver .env.example), como barbearia:nova.
 */
import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';

const PLANS = ['solo', 'barbearia'];

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const { values: args } = parseArgs({
  options: {
    endereco: { type: 'string' },
    plano: { type: 'string' },
  },
});

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  fail('Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY. Copie .env.example para .env.local e preencha.');
}

const slug = args.endereco?.trim().toLowerCase();
if (!slug) {
  fail('Falta --endereco.\n\n  Exemplo:\n  npm run barbearia:plano -- --endereco barbearia-do-ze --plano solo');
}

const plan = args.plano?.trim().toLowerCase();
if (plan && !PLANS.includes(plan)) {
  fail(`Plano "${args.plano}" não existe. Use: ${PLANS.join(' ou ')}.`);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: tenant, error: findError } = await admin
  .from('tenants')
  .select('id, name, tenant_accounts(plan, subscription)')
  .eq('slug', slug)
  .maybeSingle();
if (findError) fail(findError.message);
if (!tenant) fail(`Nenhuma barbearia com o endereço "${slug}".`);

const account = Array.isArray(tenant.tenant_accounts) ? tenant.tenant_accounts[0] : tenant.tenant_accounts;
const current = account?.plan ?? '—';

if (!plan) {
  console.log(`\n${tenant.name} (${slug}): plano ${current}, assinatura ${account?.subscription ?? '—'}.\n`);
  process.exit(0);
}

if (plan === current) {
  console.log(`\n${tenant.name} já está no plano ${plan}.\n`);
  process.exit(0);
}

const { error } = await admin.rpc('set_tenant_plan', { p_tenant_id: tenant.id, p_plan: plan });
if (error) fail(error.message);

console.log(`\n✔ ${tenant.name}: plano ${current} → ${plan}.\n`);
