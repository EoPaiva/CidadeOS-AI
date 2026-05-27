const API = '';
const IS_LOCALHOST = ['localhost', '127.0.0.1', '0.0.0.0'].includes(location.hostname);
const ONLINE_PREVIEW_MODE = !IS_LOCALHOST;
const DEMO_STORAGE_KEY = 'cidadeos_online_demo_db_v2_2';

const state = {
  route: location.hash.replace('#', '') || '/',
  token: localStorage.getItem('cidadeos_token') || '',
  user: JSON.parse(localStorage.getItem('cidadeos_user') || 'null'),
  bootstrap: null,
  transparency: null,
  panelTab: localStorage.getItem('cidadeos_panel_tab') || 'overview',
  panelData: null,
  whatsapp: null,
  activeWhatsappMessage: null,
  occurrences: [],
  modalOccurrence: null,
  triageSuggestions: {},
  triageSuggestionModes: {},
  duplicateInsights: {},
  lastProtocol: sessionStorage.getItem('cidadeos_last_protocol') || ''
};

const statusLabels = {
  RECEBIDO: 'Recebido',
  EM_ANALISE: 'Em análise',
  ENCAMINHADO: 'Encaminhado',
  EM_EXECUCAO: 'Em execução',
  AGUARDANDO_TERCEIRO: 'Aguardando terceiro',
  RESOLVIDO: 'Resolvido',
  CANCELADO: 'Cancelado',
  DUPLICADO: 'Duplicado',
  ARQUIVADO: 'Arquivado'
};

const priorityLabels = { BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', CRITICA: 'Crítica' };
const riskLabels = { BAIXO: 'Baixo', MEDIO: 'Medio', ALTO: 'Alto', CRITICO: 'Critico' };
const severityLabels = { INFO: 'Informativo', WARNING: 'Atenção', CRITICAL: 'Crítico' };

const nationalStats = [
  {
    value: '5.569', label: 'municípios brasileiros',
    text: 'A gestão local precisa de canais simples para registrar, organizar e acompanhar demandas públicas.',
    source: 'IBGE — Divisão Territorial Brasileira 2025', url: 'https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/46255-ibge-atualiza-dados-geograficos-de-estados-e-municipios-brasileiros-para-o-ano-de-2025'
  },
  {
    value: '5,9 mi', label: 'pessoas afetadas por desastres em 2025',
    text: 'Ocorrências de risco exigem registro, priorização e comunicação preventiva.',
    source: 'CNM — Desastres em 2025', url: 'https://cnm.org.br/comunicacao/noticias/desastres-em-2025-ja-afetam-milhoes-e-expoem-urgencia-de-apoio-aos-municipios-alerta-cnm'
  },
  {
    value: '40,31%', label: 'perdas de água tratada',
    text: 'Relatos de vazamento, baixa pressão e falta d’água ajudam a identificar pontos críticos.',
    source: 'Instituto Trata Brasil — Perdas de Água 2025/SINISA 2023', url: 'https://tratabrasil.org.br/perdas-de-agua-2025/'
  },
  {
    value: '160 mil+', label: 'casos prováveis de dengue no início de 2025',
    text: 'Focos, água parada e terrenos abandonados precisam ser organizados por bairro e setor.',
    source: 'Ministério da Saúde — Dados de dengue 2025', url: 'https://www.gov.br/saude/pt-br/assuntos/noticias/2025/janeiro/ministerio-da-saude-atualiza-dados-de-casos-de-dengue-no-brasil'
  },
  {
    value: '34,1 mi', label: 'pessoas idosas no Brasil em 2024',
    text: 'Canais de cuidado comunitário ajudam a encaminhar situações de vulnerabilidade.',
    source: 'IBGE — Síntese de Indicadores Sociais 2024', url: 'https://agenciadenoticias.ibge.gov.br/agencia-noticias/2012-agencia-de-noticias/noticias/45343-ibge-mostra-que-um-a-cada-quatro-idosos-trabalhava-em-2024'
  },
  {
    value: '66%', label: 'MPEs em baixa maturidade digital',
    text: 'A digitalização precisa ser prática, acessível e orientada ao serviço real.',
    source: 'FGV/Sebrae — Maturidade digital das MPEs', url: 'https://portal.fgv.br/noticias/estudo-revela-66-micro-e-pequenas-empresas-estao-niveis-iniciais-maturidade-digital'
  }
];

const serviceGuides = [
  { code: 'ZEL', title: 'Zeladoria Urbana', desc: 'Buracos, iluminação pública, limpeza, calçadas, praças e vias municipais.', examples: ['Buraco na via', 'Lixo acumulado', 'Iluminação pública'], area: 'Infraestrutura', level: 'Atendimento municipal' },
  { code: 'DC', title: 'Defesa Civil', desc: 'Alagamentos, quedas de árvore, áreas de risco e situações associadas a eventos climáticos.', examples: ['Alagamento', 'Queda de árvore', 'Área de risco'], area: 'Prevenção e risco', level: 'Prioridade crítica quando houver risco' },
  { code: 'SAN', title: 'Saúde Pública', desc: 'Focos de dengue, água parada, risco sanitário e apoio à vigilância.', examples: ['Foco de dengue', 'Terreno abandonado', 'Água parada'], area: 'Vigilância sanitária', level: 'Prevenção coletiva' },
  { code: 'H2O', title: 'Água e Saneamento', desc: 'Vazamentos, falta d’água, baixa pressão e esgoto irregular.', examples: ['Vazamento', 'Falta d’água', 'Baixa pressão'], area: 'Saneamento', level: 'Encaminhamento técnico' },
  { code: 'RUR', title: 'Zona Rural', desc: 'Estradas rurais, pontes, acessos bloqueados e riscos em áreas afastadas.', examples: ['Estrada rural', 'Ponte', 'Acesso bloqueado'], area: 'Infraestrutura rural', level: 'Apoio territorial' },
  { code: 'SOC', title: 'Assistência Social', desc: 'Situações de vulnerabilidade, idosos e pedidos de visita técnica.', examples: ['Idoso vulnerável', 'Pedido de visita', 'Situação de risco'], area: 'Proteção social', level: 'Acolhimento e triagem' }
];

const publicJourney = [
  ['01', 'Registrar', 'Informe o problema, local, categoria e anexo opcional.'],
  ['02', 'Protocolar', 'Receba número único para acompanhar a solicitação.'],
  ['03', 'Encaminhar', 'A demanda é direcionada ao setor responsável.'],
  ['04', 'Acompanhar', 'Consulte situação, histórico público e próximas etapas.']
];

const institutionalPrinciples = [
  ['Acessível', 'Texto claro, foco visível, contraste e navegação por teclado.'],
  ['Rastreável', 'Protocolo, histórico e auditoria para cada movimentação importante.'],
  ['Preventivo', 'Alertas e indicadores ajudam a agir antes que o problema escale.'],
  ['Transparente', 'Dados públicos sem expor informações pessoais do solicitante.']
];

const operationalPlaybooks = {
  'Defesa Civil': ['Confirmar local e risco imediato', 'Acionar equipe responsável', 'Orientar bloqueio/isolamento quando necessário', 'Registrar foto de execução e atualização pública'],
  'Saúde Pública': ['Validar endereço e ponto de referência', 'Programar vistoria de agente', 'Registrar resultado da visita', 'Orientar prevenção ao cidadão'],
  'Água e Saneamento': ['Verificar se há recorrência no bairro', 'Encaminhar para equipe técnica/concessionária', 'Registrar previsão de atendimento', 'Atualizar status após manutenção'],
  'Urbano': ['Confirmar prioridade e localização', 'Encaminhar para zeladoria/obras', 'Planejar execução por rota/bairro', 'Registrar antes/depois quando resolvido'],
  'Assistência Social': ['Validar se há risco ou vulnerabilidade', 'Encaminhar para equipe habilitada', 'Evitar exposição pública de dados pessoais', 'Registrar acompanhamento interno'],
  'Zona Rural': ['Confirmar acesso e referência territorial', 'Agrupar demandas próximas', 'Encaminhar para obras rurais', 'Atualizar previsão conforme deslocamento'],
  'default': ['Validar informações do protocolo', 'Encaminhar para setor responsável', 'Registrar comentário interno', 'Publicar atualização simples ao cidadão']
};

function isClosedStatus(status = '') {
  return ['RESOLVIDO', 'CANCELADO', 'DUPLICADO', 'ARQUIVADO'].includes(status);
}

function isOverdue(occ = {}) {
  return Boolean(occ.slaDueAt && new Date(occ.slaDueAt) < new Date() && !isClosedStatus(occ.status));
}

function hoursUntil(value) {
  if (!value) return null;
  const diff = new Date(value).getTime() - Date.now();
  return Math.round(diff / 36e5);
}

function playbookFor(occ = {}) {
  return operationalPlaybooks[occ.category?.name] || operationalPlaybooks.default;
}

function operationalRiskLabel(occ = {}) {
  if (isOverdue(occ)) return ['danger', 'SLA vencido'];
  if (occ.priority === 'CRITICA') return ['danger', 'Crítica'];
  if (!occ.assignedAgentId) return ['warning', 'Sem agente'];
  if (occ.status === 'AGUARDANDO_TERCEIRO') return ['warning', 'Aguardando terceiro'];
  if (occ.status === 'RESOLVIDO') return ['success', 'Concluída'];
  return ['info', 'Em acompanhamento'];
}


const app = document.querySelector('#app');

window.addEventListener('hashchange', () => {
  state.route = location.hash.replace('#', '') || '/';
  render().catch(showFatal);
});

document.addEventListener('click', (event) => {
  const closeModal = event.target.closest('[data-close-modal]');
  if (closeModal) {
    state.modalOccurrence = null;
    render().catch(showFatal);
  }
});

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fmtDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function fmtShortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

function badgeStatus(value) {
  const cls = value === 'RESOLVIDO' ? 'success' : value === 'CRITICA' ? 'danger' : ['CANCELADO','ARQUIVADO','DUPLICADO'].includes(value) ? 'neutral' : ['EM_EXECUCAO','ENCAMINHADO','EM_ANALISE'].includes(value) ? 'info' : 'warning';
  return `<span class="badge ${cls}">${escapeHtml(statusLabels[value] || value || '—')}</span>`;
}

function badgePriority(value) {
  const cls = value === 'CRITICA' ? 'danger' : value === 'ALTA' ? 'warning' : value === 'BAIXA' ? 'success' : 'info';
  return `<span class="badge ${cls}">${escapeHtml(priorityLabels[value] || value || '—')}</span>`;
}

function badgeRisk(value) {
  const cls = value === 'CRITICO' ? 'danger' : value === 'ALTO' ? 'warning' : value === 'BAIXO' ? 'success' : 'info';
  return `<span class="badge ${cls}">${escapeHtml(riskLabels[value] || value || 'Medio')}</span>`;
}

function toast(message) {
  const host = document.querySelector('#toast');
  const item = document.createElement('div');
  item.className = 'toast-item';
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.remove(), 4300);
}

function showFatal(error) {
  console.error(error);
  app.innerHTML = layout(`<section class="gov-section"><div class="gov-section__header"><h1>Erro ao carregar página</h1></div><div class="gov-section__body"><p>${escapeHtml(error.message || 'Falha inesperada.')}</p></div></section>`);
}


function demoNowIso() { return new Date().toISOString(); }
function demoUuid(prefix='id') { return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`; }
function demoInitialDb() {
  const createdAt = demoNowIso();
  const cityId = 'city_demo';
  const departments = [
    { id: 'dep_obras', cityId, name: 'Obras e Serviços Urbanos', description: 'Manutenção urbana e infraestrutura.', active: true },
    { id: 'dep_defesa', cityId, name: 'Defesa Civil', description: 'Riscos, alagamentos e emergências.', active: true },
    { id: 'dep_vigilancia', cityId, name: 'Vigilância Sanitária', description: 'Dengue e saúde pública.', active: true },
    { id: 'dep_saneamento', cityId, name: 'Saneamento', description: 'Água e esgoto.', active: true },
    { id: 'dep_social', cityId, name: 'Assistência Social', description: 'Apoio social e idosos.', active: true },
    { id: 'dep_rural', cityId, name: 'Obras Rurais', description: 'Estradas e zona rural.', active: true }
  ];
  const categories = [
    { id: 'cat_urbano', name: 'Urbano', module: 'PrevenCidade', defaultDepartmentId: 'dep_obras', active: true },
    { id: 'cat_defesa_civil', name: 'Defesa Civil', module: 'PrevenCidade', defaultDepartmentId: 'dep_defesa', active: true },
    { id: 'cat_saude_publica', name: 'Saúde Pública', module: 'DengueMap', defaultDepartmentId: 'dep_vigilancia', active: true },
    { id: 'cat_agua_saneamento', name: 'Água e Saneamento', module: 'ÁguaGuard', defaultDepartmentId: 'dep_saneamento', active: true },
    { id: 'cat_assistencia_social', name: 'Assistência Social', module: 'CuidaVila', defaultDepartmentId: 'dep_social', active: true },
    { id: 'cat_zona_rural', name: 'Zona Rural', module: 'AgroRadar Local', defaultDepartmentId: 'dep_rural', active: true },
    { id: 'cat_clima_alertas', name: 'Clima e Alertas', module: 'Alertas AI', defaultDepartmentId: 'dep_defesa', active: true }
  ];
  const subcategories = [
    ['cat_urbano','Buraco'],['cat_urbano','Iluminação pública'],['cat_urbano','Lixo acumulado'],
    ['cat_defesa_civil','Alagamento'],['cat_defesa_civil','Queda de árvore'],['cat_defesa_civil','Área de risco'],
    ['cat_saude_publica','Foco de dengue'],['cat_saude_publica','Água parada'],['cat_saude_publica','Terreno abandonado'],
    ['cat_agua_saneamento','Vazamento'],['cat_agua_saneamento','Falta d’água'],['cat_agua_saneamento','Baixa pressão'],
    ['cat_assistencia_social','Idoso vulnerável'],['cat_assistencia_social','Pedido de ajuda'],
    ['cat_zona_rural','Estrada rural'],['cat_zona_rural','Ponte'],['cat_clima_alertas','Chuva forte']
  ].map(([categoryId, name], idx) => ({ id: `sub_demo_${idx}`, categoryId, name, defaultPriority: categoryId.includes('defesa') || categoryId.includes('saude') ? 'ALTA' : 'MEDIA', active: true }));
  const users = [
    { id: 'user_super', cityId: null, name: 'Super Admin CidadeOS', email: 'super@cidadeos.local', role: 'SUPER_ADMIN', active: true },
    { id: 'user_admin', cityId, name: 'Admin Cidade Modelo', email: 'admin@cidadeos.local', role: 'CITY_ADMIN', active: true },
    { id: 'user_agent', cityId, name: 'Agente de Obras', email: 'agente@cidadeos.local', role: 'AGENT', departmentId: 'dep_obras', active: true },
    { id: 'user_health', cityId, name: 'Agente de Saúde', email: 'saude@cidadeos.local', role: 'HEALTH_AGENT', departmentId: 'dep_vigilancia', active: true }
  ];
  return {
    meta: { version: 'fase-2-2-deploy-preview', nextProtocolNumber: 1, createdAt, updatedAt: createdAt },
    cities: [{ id: cityId, name: 'Cidade Modelo', state: 'SP', country: 'Brasil', slug: 'cidade-modelo', active: true }],
    neighborhoods: [{ id: 'neigh_centro', cityId, name: 'Centro', active: true }, { id: 'neigh_jardim', cityId, name: 'Jardim América', active: true }, { id: 'neigh_rural', cityId, name: 'Zona Rural', active: true }],
    departments, users, categories, subcategories,
    citizens: [], occurrences: [], comments: [], attachments: [], statusHistory: [], auditLogs: [], monthlyReports: [],
    alerts: [
      { id: 'alert_preview', cityId, title: 'Ambiente demonstrativo online', message: 'Este preview permite testes públicos com dados salvos apenas neste navegador. A versão com banco compartilhado será ativada com Supabase/PostgreSQL.', severity: 'INFO', category: 'Sistema', active: true, createdAt },
      { id: 'alert_chuvas', cityId, title: 'Orientação preventiva para chuvas', message: 'Em risco imediato, registre a ocorrência e acione os canais emergenciais competentes.', severity: 'WARNING', category: 'Defesa Civil', active: true, createdAt }
    ],
    whatsappChannels: [{ id: 'wa_preview', cityId, channelName: 'WhatsApp Oficial da Cidade Modelo', officialPhone: '5511999990000', displayPhone: '+55 11 99999-0000', defaultDepartmentId: 'dep_obras', enabled: true, connectionStatus: 'MODO_DEMO_ONLINE', integrationMode: 'PREVIEW', webhookUrl: `/api/webhooks/whatsapp/${cityId}`, defaultWelcomeMessage: 'Olá. Este é o canal oficial demonstrativo.', protocolCreatedMessage: 'Sua solicitação foi registrada. Protocolo: {{protocol}}.', statusUpdatedMessage: 'Seu protocolo {{protocol}} foi atualizado para {{status}}.' }],
    whatsappWebhookEvents: [], whatsappMessages: [], whatsappConversations: [], whatsappOccurrenceLinks: []
  };
}
function demoReadDb() {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const db = demoInitialDb();
  demoWriteDb(db);
  return db;
}
function demoWriteDb(db) { db.meta.updatedAt = demoNowIso(); localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db)); return db; }
function demoTokenUser() { try { return JSON.parse(localStorage.getItem('cidadeos_demo_user') || 'null'); } catch { return null; } }
function demoPublicUser(user) { return user ? { id: user.id, cityId: user.cityId, name: user.name, email: user.email, role: user.role, departmentId: user.departmentId || null } : null; }
function demoNextProtocol(db) { const y = new Date().getFullYear(); return `CID-${y}-${String(db.meta.nextProtocolNumber++).padStart(6, '0')}`; }
function demoComputeSla(priority) { const d = new Date(); d.setHours(d.getHours() + (priority === 'CRITICA' ? 2 : priority === 'ALTA' ? 24 : priority === 'MEDIA' ? 72 : 168)); return d.toISOString(); }
function triageSlaHours(priority) { return priority === 'CRITICA' ? 2 : priority === 'ALTA' ? 24 : priority === 'MEDIA' ? 72 : 168; }
function normalizeRuleText(value = '') {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const localTriageRules = [
  { key: 'defesa_civil', priority: 'CRITICA', keywords: ['alagamento', 'alag', 'enchente', 'arvore', 'queda de arvore', 'deslizamento', 'area de risco', 'risco imediato', 'desabamento'], publicMessage: 'Solicitação de risco recebida para avaliação prioritária da equipe responsável.', departmentHints: ['defesa', 'risco'] },
  { key: 'saude_publica', priority: 'ALTA', keywords: ['dengue', 'mosquito', 'agua parada', 'foco', 'terreno abandonado', 'terreno'], publicMessage: 'Solicitação relacionada à saúde pública recebida para vistoria da equipe responsável.', departmentHints: ['vigilancia', 'saude', 'sanitaria'] },
  { key: 'agua_saneamento', priority: 'ALTA', keywords: ['vazamento', 'falta d agua', 'falta dagua', 'falta de agua', 'sem agua', 'esgoto', 'baixa pressao'], publicMessage: 'Solicitação de água ou saneamento recebida para encaminhamento técnico.', departmentHints: ['saneamento', 'agua', 'esgoto'] },
  { key: 'assistencia_social', priority: 'ALTA', keywords: ['idoso', 'idosa', 'vulneravel', 'assistencia', 'morador de rua', 'visita', 'ajuda'], publicMessage: 'Solicitação de assistência social recebida para acolhimento e triagem da equipe responsável.', departmentHints: ['social', 'assistencia'] },
  { key: 'zona_rural', priority: 'MEDIA', keywords: ['estrada rural', 'ponte', 'sitio', 'zona rural', 'acesso bloqueado', 'roca', 'rural'], publicMessage: 'Solicitação da zona rural recebida para avaliação do setor territorial responsável.', departmentHints: ['rural'] },
  { key: 'urbano', priority: 'MEDIA', keywords: ['buraco', 'lampada', 'poste', 'iluminacao', 'lixo', 'mato', 'praca', 'calcada'], publicMessage: 'Solicitação urbana recebida para análise e encaminhamento do setor responsável.', departmentHints: ['obras', 'servicos', 'urbano'] }
];
const categoryRuleHints = {
  defesa_civil: ['defesa_civil', 'defesa civil', 'defesa', 'clima'],
  saude_publica: ['saude_publica', 'saude publica', 'saude', 'dengue', 'vigilancia'],
  agua_saneamento: ['agua_saneamento', 'agua e saneamento', 'saneamento', 'agua'],
  assistencia_social: ['assistencia_social', 'assistencia social', 'social'],
  zona_rural: ['zona_rural', 'zona rural', 'rural'],
  urbano: ['urbano', 'zeladoria', 'obras']
};
function localRuleMatches(text, keywords) {
  return keywords.filter((keyword) => text.includes(normalizeRuleText(keyword)));
}
function pickRuleCategory(categories = [], key = 'urbano', cityId = '') {
  const hints = categoryRuleHints[key] || [key];
  return categories.find((item) => (!cityId || !item.cityId || item.cityId === cityId) && hints.some((hint) => normalizeRuleText(`${item.key || ''} ${item.id || ''} ${item.name || ''}`).includes(normalizeRuleText(hint)))) || categories.find((item) => !cityId || !item.cityId || item.cityId === cityId) || categories[0] || null;
}
function pickRuleDepartment(departments = [], category = null, rule = {}, cityId = '') {
  const fromCategory = departments.find((item) => item.id === category?.defaultDepartmentId);
  if (fromCategory) return fromCategory;
  const hints = rule.departmentHints || [];
  return departments.find((item) => (!cityId || !item.cityId || item.cityId === cityId) && hints.some((hint) => normalizeRuleText(`${item.name || ''} ${item.description || ''}`).includes(normalizeRuleText(hint)))) || departments.find((item) => !cityId || !item.cityId || item.cityId === cityId) || departments[0] || null;
}
function pickRuleSubcategory(subcategories = [], categoryId = '', matchedKeywords = []) {
  const list = subcategories.filter((item) => item.categoryId === categoryId);
  const normalizedKeywords = matchedKeywords.map(normalizeRuleText);
  return list.find((item) => normalizedKeywords.some((keyword) => normalizeRuleText(`${item.key || ''} ${item.name || ''}`).includes(keyword) || keyword.includes(normalizeRuleText(item.name || '')))) || list[0] || null;
}
function buildLocalTriageSuggestion({ text = '', categories = [], departments = [], subcategories = [], cityId = '', computeSla = demoComputeSla } = {}) {
  const normalized = normalizeRuleText(text);
  const priorityWeight = { BAIXA: 1, MEDIA: 2, ALTA: 3, CRITICA: 4 };
  let selected = null;
  for (const rule of localTriageRules) {
    const matched = localRuleMatches(normalized, rule.keywords);
    if (!matched.length) continue;
    if (!selected || matched.length > selected.matched.length || priorityWeight[rule.priority] > priorityWeight[selected.rule.priority]) selected = { rule, matched };
  }
  const fallbackRule = localTriageRules.find((item) => item.key === 'urbano');
  const rule = selected?.rule || fallbackRule;
  const matchedKeywords = [...new Set(selected?.matched || [])];
  let priority = rule.priority;
  if (rule.key === 'zona_rural' && /(bloquead|interdit|risco|queda|ponte.*cai)/.test(normalized)) priority = 'ALTA';
  if (rule.key === 'urbano' && /(risco|acidente|perigo|muito grande|poste caindo)/.test(normalized)) priority = 'ALTA';
  const category = pickRuleCategory(categories, rule.key, cityId);
  const department = pickRuleDepartment(departments, category, rule, cityId);
  const subcategory = pickRuleSubcategory(subcategories, category?.id, matchedKeywords);
  const confidence = matchedKeywords.length ? Math.min(0.95, 0.55 + (matchedKeywords.length * 0.1) + (priority === 'CRITICA' ? 0.08 : 0)) : 0.35;
  return {
    source: 'rules_local_v1',
    categoryId: category?.id || null,
    categoryName: category?.name || 'Triagem manual',
    categoryKey: rule.key,
    subcategoryId: subcategory?.id || null,
    subcategoryName: subcategory?.name || '',
    departmentId: department?.id || category?.defaultDepartmentId || null,
    departmentName: department?.name || '',
    priority,
    publicMessage: rule.publicMessage,
    slaDueAt: computeSla(priority),
    slaHours: triageSlaHours(priority),
    confidence,
    confidenceLabel: confidence >= 0.75 ? 'Alta' : confidence >= 0.5 ? 'Média' : 'Baixa',
    matchedKeywords,
    reason: matchedKeywords.length ? `Regra local por palavra-chave: ${matchedKeywords.join(', ')}.` : 'Sem palavra-chave forte; sugestão inicial conservadora.'
  };
}
function trimAssistiveText(value = '', max = 360) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 3).trim()}...` : text;
}

function redactPersonalData(value = '') {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email oculto]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento oculto]')
    .replace(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}/g, '[telefone oculto]');
}

function assistiveTokens(value = '') {
  const stopwords = new Set(['para','com','sem','uma','um','que','por','das','dos','nas','nos','aqui','ali','esta','este','isso','muito','pelo','pela','de','da','do','em','no','na']);
  return normalizeRuleText(value).split(' ').filter((token) => token.length > 2 && !stopwords.has(token));
}

function scoreTextSimilarity(left = '', right = '') {
  const leftTokens = new Set(assistiveTokens(left));
  const rightTokens = new Set(assistiveTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) if (rightTokens.has(token)) overlap += 1;
  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function findAssistiveNeighborhood(neighborhoods = [], { cityId = '', neighborhoodId = '', text = '' } = {}) {
  const scoped = neighborhoods.filter((item) => (!cityId || !item.cityId || item.cityId === cityId) && item.active !== false);
  const direct = scoped.find((item) => item.id === neighborhoodId);
  if (direct) return direct;
  const normalized = normalizeRuleText(text);
  return scoped.find((item) => normalizeRuleText(item.name).length > 2 && normalized.includes(normalizeRuleText(item.name))) || null;
}

function buildAssistiveSummary(text = '') {
  const safe = redactPersonalData(text);
  const firstSentence = safe.split(/(?<=[.!?])\s+/).find((part) => part.trim().length >= 24) || safe;
  return trimAssistiveText(firstSentence || 'Relato sem descricao suficiente para resumo automatico.', 320);
}

function buildRiskProfile(priority = 'MEDIA', text = '') {
  const normalized = normalizeRuleText(text);
  const factors = [];
  if (priority === 'CRITICA') factors.push('prioridade critica sugerida');
  if (priority === 'ALTA') factors.push('prioridade alta sugerida');
  if (/(risco imediato|desabamento|deslizamento|alagamento|enchente|fio exposto|poste caindo|ponte caiu|queda de arvore)/.test(normalized)) factors.push('termo de risco imediato no relato');
  if (/(idoso|idosa|crianca|vulneravel|morador de rua)/.test(normalized)) factors.push('pessoa vulneravel mencionada');
  if (/(esgoto|dengue|agua parada|foco|contaminacao)/.test(normalized)) factors.push('risco sanitario mencionado');
  let riskLevel = priority === 'CRITICA' ? 'CRITICO' : priority === 'ALTA' ? 'ALTO' : priority === 'MEDIA' ? 'MEDIO' : 'BAIXO';
  if (riskLevel === 'MEDIO' && factors.length >= 2) riskLevel = 'ALTO';
  if (riskLevel === 'BAIXO' && factors.length) riskLevel = 'MEDIO';
  return { riskLevel, riskFactors: factors.length ? factors : ['sem fator critico explicito no relato'] };
}

function findDuplicateCandidates(occurrences = [], { cityId = '', occurrenceId = '', text = '', categoryId = '', neighborhoodId = '', address = '', referencePoint = '', minScore = 0.42, limit = 3 } = {}) {
  const activeStatuses = new Set(['RECEBIDO','EM_ANALISE','ENCAMINHADO','EM_EXECUCAO','AGUARDANDO_TERCEIRO']);
  const normalizedAddress = normalizeRuleText([address, referencePoint].filter(Boolean).join(' '));
  return occurrences
    .filter((item) => item && item.id !== occurrenceId && item.protocol !== occurrenceId && (!cityId || item.cityId === cityId))
    .map((item) => {
      const candidateText = [item.title, item.description, item.address, item.referencePoint].filter(Boolean).join(' ');
      let score = scoreTextSimilarity(text, candidateText) * 0.5;
      if (categoryId && item.categoryId === categoryId) score += 0.18;
      if (neighborhoodId && item.neighborhoodId === neighborhoodId) score += 0.18;
      const candidateAddress = normalizeRuleText([item.address, item.referencePoint].filter(Boolean).join(' '));
      if (normalizedAddress && candidateAddress && (candidateAddress.includes(normalizedAddress) || normalizedAddress.includes(candidateAddress))) score += 0.24;
      if (activeStatuses.has(item.status)) score += 0.05;
      return {
        id: item.id,
        protocol: item.protocol,
        title: trimAssistiveText(item.title || item.description || 'Ocorrencia similar', 90),
        status: item.status,
        priority: item.priority,
        categoryId: item.categoryId,
        neighborhoodId: item.neighborhoodId,
        duplicateOfId: item.duplicateOfId || null,
        createdAt: item.createdAt,
        score: Number(Math.min(score, 0.99).toFixed(2)),
        reason: neighborhoodId && item.neighborhoodId === neighborhoodId ? 'Mesmo bairro e relato semelhante.' : 'Relato semelhante encontrado.'
      };
    })
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function duplicateOccurrenceReference(db, occurrence) {
  if (!occurrence) return null;
  const category = db.categories.find((item) => item.id === occurrence.categoryId) || null;
  const neighborhood = db.neighborhoods.find((item) => item.id === occurrence.neighborhoodId) || null;
  return {
    id: occurrence.id,
    protocol: occurrence.protocol,
    title: trimAssistiveText(occurrence.title || occurrence.description || 'Ocorrencia', 120),
    status: occurrence.status,
    priority: occurrence.priority,
    categoryId: occurrence.categoryId,
    categoryName: category?.name || '',
    neighborhoodId: occurrence.neighborhoodId,
    neighborhoodName: neighborhood?.name || '',
    duplicateOfId: occurrence.duplicateOfId || null,
    createdAt: occurrence.createdAt
  };
}

function duplicateCandidateContext(db, occurrence) {
  const text = [occurrence.title, occurrence.description, occurrence.address, occurrence.referencePoint].filter(Boolean).join(' ');
  const candidates = findDuplicateCandidates(db.occurrences, {
    cityId: occurrence.cityId,
    occurrenceId: occurrence.id,
    text,
    categoryId: occurrence.categoryId,
    neighborhoodId: occurrence.neighborhoodId,
    address: occurrence.address,
    referencePoint: occurrence.referencePoint,
    minScore: 0.32,
    limit: 6
  }).map((candidate) => {
    const full = db.occurrences.find((item) => item.id === candidate.id);
    const reference = duplicateOccurrenceReference(db, full);
    return { ...candidate, ...reference, score: candidate.score, reason: candidate.reason, linkedDuplicates: db.occurrences.filter((item) => item.duplicateOfId === candidate.id).length };
  });
  return {
    candidates,
    duplicateOf: duplicateOccurrenceReference(db, db.occurrences.find((item) => item.id === occurrence.duplicateOfId)),
    duplicateChildren: db.occurrences.filter((item) => item.duplicateOfId === occurrence.id).map((item) => duplicateOccurrenceReference(db, item))
  };
}

function buildAssistiveTriageFallback({ text = '', title = '', description = '', address = '', referencePoint = '', messageBody = '', cityId = '', occurrenceId = '', protocol = '', neighborhoodId = '', categories = [], departments = [], subcategories = [], neighborhoods = [], occurrences = [], computeSla = demoComputeSla } = {}) {
  const fullText = [text, title, description, address, referencePoint, messageBody].filter(Boolean).join(' ');
  const local = buildLocalTriageSuggestion({ text: fullText, categories, departments, subcategories, cityId, computeSla });
  const neighborhood = findAssistiveNeighborhood(neighborhoods, { cityId, neighborhoodId, text: fullText });
  const probableAddress = trimAssistiveText([address, referencePoint].filter(Boolean).join(' - '), 180);
  const missingFields = [];
  if (!neighborhood) missingFields.push('bairro');
  if (!probableAddress) missingFields.push('localizacao');
  const needsComplement = missingFields.length > 0;
  const complementRequest = missingFields.includes('bairro')
    ? 'Para continuar, informe o bairro e, se possivel, rua ou ponto de referencia da ocorrencia.'
    : 'Para continuar, informe rua, numero aproximado ou ponto de referencia da ocorrencia.';
  const risk = buildRiskProfile(local.priority, fullText);
  const duplicateCandidates = findDuplicateCandidates(occurrences, {
    cityId,
    occurrenceId: occurrenceId || protocol,
    text: fullText,
    categoryId: local.categoryId,
    neighborhoodId: neighborhood?.id || neighborhoodId || '',
    address,
    referencePoint
  });
  const duplicateRisk = duplicateCandidates[0]?.score >= 0.72 ? 'ALTO' : duplicateCandidates[0]?.score >= 0.52 ? 'MEDIO' : 'BAIXO';
  const summary = buildAssistiveSummary(fullText);
  const citizenResponse = needsComplement ? complementRequest : local.publicMessage;
  return {
    ...local,
    aiAvailable: false,
    aiAttempted: false,
    summary,
    publicSummary: summary,
    probableCategoryId: local.categoryId,
    probableCategoryName: local.categoryName,
    probableNeighborhoodId: neighborhood?.id || null,
    probableNeighborhoodName: neighborhood?.name || '',
    probableAddress,
    missingFields,
    needsComplement,
    complementRequest,
    riskLevel: risk.riskLevel,
    riskFactors: risk.riskFactors,
    duplicateCandidates,
    duplicateRisk,
    citizenResponse,
    publicMessage: citizenResponse || local.publicMessage,
    reason: `${local.reason} ${needsComplement ? 'Complemento necessario antes da conclusao da triagem.' : 'Dados minimos presentes para triagem assistida.'}`
  };
}

function triageSuggestionApplicationComment(suggestion = {}) {
  const parts = ['Sugestao assistida de triagem aplicada apos confirmacao.'];
  if (suggestion.summary) parts.push(`Resumo: ${trimAssistiveText(suggestion.summary, 180)}`);
  if (suggestion.riskLevel) parts.push(`Risco: ${suggestion.riskLevel}`);
  if ((suggestion.duplicateCandidates || []).length) parts.push(`Possivel duplicidade: ${suggestion.duplicateCandidates.map((item) => item.protocol).filter(Boolean).join(', ')}`);
  if (suggestion.needsComplement) parts.push('Complemento solicitado ao cidadao.');
  return parts.join(' ');
}

function demoSerializeOccurrence(db, occ) {
  return { ...occ,
    city: db.cities.find(x => x.id === occ.cityId) || null,
    neighborhood: db.neighborhoods.find(x => x.id === occ.neighborhoodId) || null,
    category: db.categories.find(x => x.id === occ.categoryId) || null,
    subcategory: db.subcategories.find(x => x.id === occ.subcategoryId) || null,
    department: db.departments.find(x => x.id === occ.departmentId) || null,
    assignedAgent: demoPublicUser(db.users.find(x => x.id === occ.assignedAgentId)),
    citizen: db.citizens.find(x => x.id === occ.citizenId) || null,
    comments: db.comments.filter(x => x.occurrenceId === occ.id),
    attachments: db.attachments.filter(x => x.occurrenceId === occ.id),
    history: db.statusHistory.filter(x => x.occurrenceId === occ.id)
  };
}
function demoPublicOccurrence(db, occ) {
  const s = demoSerializeOccurrence(db, occ);
  return { protocol: s.protocol, title: s.title, description: s.description, category: s.category?.name || '', subcategory: s.subcategory?.name || '', neighborhood: s.neighborhood?.name || '', department: s.department?.name || '', priority: s.priority, status: s.status, address: s.address, referencePoint: s.referencePoint, publicMessage: s.publicMessage, slaDueAt: s.slaDueAt, createdAt: s.createdAt, updatedAt: s.updatedAt, resolvedAt: s.resolvedAt, attachments: (s.attachments || []).filter(a => ['PUBLIC','PUBLICA'].includes(String(a.visibility || '').toUpperCase()) && !a.archivedAt && !a.deletedAt), publicHistory: s.history.filter(h => h.publicMessage).map(h => ({ status: h.newStatus, publicMessage: h.publicMessage, createdAt: h.createdAt })) };
}
function mediaExtensionFromMime(mime = '') {
  const value = String(mime || '').toLowerCase();
  if (value.includes('jpeg')) return 'jpg';
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('pdf')) return 'pdf';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('mpeg')) return 'mp3';
  if (value.includes('mp4')) return 'mp4';
  return 'bin';
}
function whatsappMessageMediaState(message = {}) {
  const payload = message.payloadJson || message.payload_json || {};
  const raw = payload.raw || payload || {};
  const storedMedia = payload.storedMedia || message.storedMedia || {};
  const media = raw.image || raw.document || raw.audio || raw.video || {};
  const mediaId = message.mediaId || payload.mediaId || storedMedia.mediaId || media.id || '';
  const storagePath = message.mediaStoragePath || message.media_storage_path || storedMedia.path || '';
  const contentType = message.mediaMimeType || storedMedia.contentType || payload.mediaMimeType || media.mime_type || '';
  return {
    hasMedia: Boolean(mediaId || storagePath || message.hasMedia),
    mediaId,
    storagePath,
    bucket: message.mediaStorageBucket || message.media_storage_bucket || storedMedia.bucket || 'occurrence-attachments',
    contentType,
    sizeBytes: storedMedia.size || message.mediaSizeBytes || 0,
    fileUrl: storedMedia.url || storedMedia.publicUrl || storagePath || '',
    fileName: storedMedia.fileName || `whatsapp-${message.id || mediaId || Date.now()}.${mediaExtensionFromMime(contentType)}`,
    pending: Boolean((mediaId || message.hasMedia) && !storagePath),
    error: message.mediaDownloadError || message.errorMessage || message.error_message || storedMedia.reason || ''
  };
}
function demoLinkWhatsAppMediaAttachment(db, message, occurrence, userId = null) {
  const media = whatsappMessageMediaState(message);
  if (!media.hasMedia) return { linked: false, skipped: true };
  if (!media.storagePath && !media.fileUrl) {
    db.auditLogs.push({ id: demoUuid('audit'), cityId: occurrence.cityId, userId, action: 'WHATSAPP_MEDIA_ATTACHMENT_PENDING', entityType: 'WhatsAppMessage', entityId: message.id, metadata: { occurrenceId: occurrence.id, mediaId: media.mediaId, reason: media.error || 'Mídia aguardando download.' }, createdAt: demoNowIso() });
    return { linked: false, pending: true, reason: media.error || 'Mídia aguardando download.' };
  }
  const duplicate = db.attachments.find(att => att.occurrenceId === occurrence.id && ((media.storagePath && att.storagePath === media.storagePath) || att.metadata?.whatsappMessageId === message.id));
  if (duplicate) return { linked: false, duplicate: true, attachment: duplicate };
  const attachment = {
    id: demoUuid('att'), occurrenceId: occurrence.id, uploadedBy: userId, fileUrl: media.fileUrl || media.storagePath,
    storageBucket: media.bucket, storagePath: media.storagePath || media.fileUrl, fileType: media.contentType || 'application/octet-stream',
    fileName: media.fileName, visibility: 'PUBLIC', source: 'whatsapp', sizeBytes: media.sizeBytes || 0,
    metadata: { source: 'whatsapp', whatsappMessageId: message.id, mediaId: media.mediaId, linkedAt: demoNowIso() },
    archivedAt: null, deletedAt: null, createdAt: demoNowIso()
  };
  db.attachments.push(attachment);
  db.auditLogs.push({ id: demoUuid('audit'), cityId: occurrence.cityId, userId, action: 'WHATSAPP_MEDIA_LINKED_ATTACHMENT', entityType: 'Attachment', entityId: attachment.id, metadata: { occurrenceId: occurrence.id, messageId: message.id }, createdAt: demoNowIso() });
  return { linked: true, attachment };
}
function demoMetrics(db, rows) {
  const open = rows.filter(x => !['RESOLVIDO','CANCELADO','DUPLICADO','ARQUIVADO'].includes(x.status));
  const countBy = (fn) => Object.entries(rows.reduce((acc, row) => { const k = fn(row) || 'Não informado'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).map(([label, value]) => ({ label, value }));
  return { total: rows.length, open: open.length, resolved: rows.filter(x => x.status === 'RESOLVIDO').length, overdue: rows.filter(x => x.slaDueAt && new Date(x.slaDueAt) < new Date() && !['RESOLVIDO','CANCELADO','DUPLICADO','ARQUIVADO'].includes(x.status)).length, critical: rows.filter(x => x.priority === 'CRITICA').length, byStatus: countBy(x => x.status), byPriority: countBy(x => x.priority), byDepartment: countBy(x => db.departments.find(d => d.id === x.departmentId)?.name), byNeighborhood: countBy(x => db.neighborhoods.find(n => n.id === x.neighborhoodId)?.name), byCategory: countBy(x => db.categories.find(c => c.id === x.categoryId)?.name) };
}
function demoSuggestFromMessage(db, message='') {
  const suggestion = buildAssistiveTriageFallback({ text: message, messageBody: message, categories: db.categories, departments: db.departments, subcategories: db.subcategories, neighborhoods: db.neighborhoods, occurrences: db.occurrences, cityId: db.cities[0]?.id });
  return { category: db.categories.find(c => c.id === suggestion.categoryId) || db.categories[0], priority: suggestion.priority, suggestion };
}
async function demoRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const db = demoReadDb();
  const url = new URL(path, location.origin);
  const pathname = url.pathname;
  const currentUser = demoTokenUser();
  const save = (payload) => { demoWriteDb(db); return payload; };
  if (pathname === '/api/public/bootstrap' && method === 'GET') {
    const city = db.cities[0];
    return { ok: true, city, cities: db.cities, neighborhoods: db.neighborhoods, departments: db.departments, categories: db.categories, subcategories: db.subcategories, alerts: db.alerts.filter(a => a.active), whatsappChannel: db.whatsappChannels[0], previewMode: true };
  }
  if (pathname === '/api/public/transparency' && method === 'GET') return { ok: true, metrics: demoMetrics(db, db.occurrences), activeAlerts: db.alerts.filter(a => a.active), previewMode: true };
  if (pathname === '/api/auth/login' && method === 'POST') {
    const user = db.users.find(u => u.email.toLowerCase() === String(body.email || '').toLowerCase());
    if (!user || String(body.password || '') !== 'CidadeOS@123') throw new Error('E-mail ou senha inválidos no modo demo online.');
    localStorage.setItem('cidadeos_demo_user', JSON.stringify(demoPublicUser(user)));
    return { ok: true, token: `demo-token-${user.id}`, user: demoPublicUser(user), previewMode: true };
  }
  if (pathname === '/api/auth/me' && method === 'GET') {
    if (!currentUser) throw new Error('Sessão demo expirada.');
    return { ok: true, user: currentUser, previewMode: true };
  }
  if (pathname === '/api/public/occurrences' && method === 'POST') {
    const category = db.categories.find(c => c.id === body.categoryId) || db.categories[0];
    const subcategory = db.subcategories.find(s => s.id === body.subcategoryId) || null;
    const departmentId = category.defaultDepartmentId || db.departments[0]?.id;
    const priority = body.priority || subcategory?.defaultPriority || 'MEDIA';
    const citizen = { id: demoUuid('citizen'), cityId: db.cities[0].id, name: body.citizenName || 'Morador', phone: body.citizenPhone || '', email: body.citizenEmail || '', createdAt: demoNowIso() };
    db.citizens.push(citizen);
    const occ = { id: demoUuid('occ'), cityId: db.cities[0].id, protocol: demoNextProtocol(db), title: body.title || 'Ocorrência registrada pelo morador', description: body.description || '', categoryId: category.id, subcategoryId: subcategory?.id || null, neighborhoodId: body.neighborhoodId || null, departmentId, assignedAgentId: null, citizenId: citizen.id, priority, status: 'RECEBIDO', address: body.address || '', referencePoint: body.referencePoint || '', latitude: null, longitude: null, publicVisibility: true, duplicateOfId: null, slaDueAt: demoComputeSla(priority), publicMessage: 'Ocorrência recebida no ambiente demonstrativo online.', resolvedAt: null, createdAt: demoNowIso(), updatedAt: demoNowIso() };
    db.occurrences.push(occ);
    db.statusHistory.push({ id: demoUuid('hist'), occurrenceId: occ.id, changedBy: null, oldStatus: null, newStatus: 'RECEBIDO', publicMessage: occ.publicMessage, createdAt: demoNowIso() });
    db.auditLogs.push({ id: demoUuid('audit'), cityId: occ.cityId, userId: null, action: 'PREVIEW_PUBLIC_OCCURRENCE_CREATED', entityType: 'Occurrence', entityId: occ.id, createdAt: demoNowIso() });
    return save({ ok: true, occurrence: demoPublicOccurrence(db, occ), previewMode: true });
  }
  const pubOcc = pathname.match(/^\/api\/public\/occurrences\/([^/]+)$/);
  if (pubOcc && method === 'GET') {
    const protocol = decodeURIComponent(pubOcc[1]).toUpperCase();
    const occ = db.occurrences.find(o => o.protocol.toUpperCase() === protocol);
    if (!occ) throw new Error('Protocolo não encontrado neste navegador/demo.');
    return { ok: true, occurrence: demoPublicOccurrence(db, occ), previewMode: true };
  }
  if (!currentUser && pathname.startsWith('/api/')) throw new Error('Entre no modo demo para acessar o painel.');
  if (pathname === '/api/dashboard/city') return { ok: true, metrics: demoMetrics(db, db.occurrences), recentOccurrences: db.occurrences.slice().reverse().slice(0, 8).map(o => demoSerializeOccurrence(db, o)), previewMode: true };
  if (pathname === '/api/occurrences' && method === 'GET') return { ok: true, occurrences: db.occurrences.slice().reverse().map(o => demoSerializeOccurrence(db, o)), previewMode: true };
  const occDetail = pathname.match(/^\/api\/occurrences\/([^/]+)$/);
  if (occDetail && method === 'GET') {
    const occ = db.occurrences.find(o => o.id === occDetail[1] || o.protocol === occDetail[1]);
    if (!occ) throw new Error('Ocorrência não encontrada.');
    return { ok: true, occurrence: demoSerializeOccurrence(db, occ), previewMode: true };
  }
  const occDuplicateCandidates = pathname.match(/^\/api\/occurrences\/([^/]+)\/duplicate-candidates$/);
  if (occDuplicateCandidates && method === 'GET') {
    const occ = db.occurrences.find(o => o.id === occDuplicateCandidates[1] || o.protocol === occDuplicateCandidates[1]);
    if (!occ) throw new Error('Ocorrencia nao encontrada.');
    return { ok: true, ...duplicateCandidateContext(db, occ), previewMode: true };
  }
  if (pathname === '/api/triage/suggest' && method === 'POST') {
    const text = [body.text, body.title, body.description, body.address, body.referencePoint, body.messageBody].filter(Boolean).join(' ');
    const suggestion = buildAssistiveTriageFallback({ ...body, text, categories: db.categories, departments: db.departments, subcategories: db.subcategories, neighborhoods: db.neighborhoods, occurrences: db.occurrences, cityId: body.cityId || currentUser?.cityId || db.cities[0]?.id });
    return { ok: true, suggestion, previewMode: true };
  }
  const occStatus = pathname.match(/^\/api\/occurrences\/([^/]+)\/status$/);
  if (occStatus && ['PATCH','POST'].includes(method)) {
    const occ = db.occurrences.find(o => o.id === occStatus[1] || o.protocol === occStatus[1]);
    if (!occ) throw new Error('Ocorrência não encontrada.');
    const oldStatus = occ.status; occ.status = body.status || occ.status; occ.publicMessage = body.publicMessage || occ.publicMessage; occ.updatedAt = demoNowIso(); if (occ.status === 'RESOLVIDO') occ.resolvedAt = demoNowIso();
    db.statusHistory.push({ id: demoUuid('hist'), occurrenceId: occ.id, changedBy: currentUser?.id, oldStatus, newStatus: occ.status, publicMessage: occ.publicMessage, createdAt: demoNowIso() });
    return save({ ok: true, occurrence: demoSerializeOccurrence(db, occ), previewMode: true });
  }
  const occPriority = pathname.match(/^\/api\/occurrences\/([^/]+)\/priority$/);
  if (occPriority && method === 'PATCH') { const occ = db.occurrences.find(o => o.id === occPriority[1]); if (occ) { occ.priority = body.priority || occ.priority; occ.updatedAt = demoNowIso(); } return save({ ok: true, occurrence: occ ? demoSerializeOccurrence(db, occ) : null, previewMode: true }); }
  const occTriageSuggestion = pathname.match(/^\/api\/occurrences\/([^/]+)\/triage-suggestion$/);
  if (occTriageSuggestion && method === 'PATCH') {
    const occ = db.occurrences.find(o => o.id === occTriageSuggestion[1] || o.protocol === occTriageSuggestion[1]);
    if (!occ) throw new Error('Ocorrência não encontrada.');
    const suggestion = body.suggestion || {};
    const pickSuggested = (key) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : suggestion[key];
    const category = db.categories.find(c => c.id === pickSuggested('categoryId')) || null;
    const subcategory = db.subcategories.find(s => s.id === pickSuggested('subcategoryId') && (!category || s.categoryId === category.id)) || null;
    const department = db.departments.find(d => d.id === pickSuggested('departmentId')) || null;
    const priority = ['BAIXA','MEDIA','ALTA','CRITICA'].includes(String(pickSuggested('priority') || '').toUpperCase()) ? String(pickSuggested('priority')).toUpperCase() : occ.priority;
    if (category) occ.categoryId = category.id;
    if (subcategory) occ.subcategoryId = subcategory.id;
    if (department) occ.departmentId = department.id;
    occ.priority = priority;
    occ.slaDueAt = demoComputeSla(priority);
    occ.publicMessage = pickSuggested('publicMessage') || pickSuggested('citizenResponse') || occ.publicMessage;
    occ.updatedAt = demoNowIso();
    db.statusHistory.push({ id: demoUuid('hist'), occurrenceId: occ.id, changedBy: currentUser?.id, oldStatus: occ.status, newStatus: occ.status, comment: triageSuggestionApplicationComment(suggestion), publicMessage: occ.publicMessage, createdAt: demoNowIso() });
    db.auditLogs.push({ id: demoUuid('audit'), cityId: occ.cityId, userId: currentUser?.id, action: 'ASSISTIVE_TRIAGE_SUGGESTION_APPLIED', entityType: 'Occurrence', entityId: occ.id, metadata: { categoryId: occ.categoryId, departmentId: occ.departmentId, priority, confidence: suggestion.confidence, source: suggestion.source, riskLevel: suggestion.riskLevel, duplicateRisk: suggestion.duplicateRisk, missingFields: suggestion.missingFields || [] }, createdAt: demoNowIso() });
    return save({ ok: true, occurrence: demoSerializeOccurrence(db, occ), previewMode: true });
  }
  const occAssign = pathname.match(/^\/api\/occurrences\/([^/]+)\/assign$/);
  if (occAssign && method === 'PATCH') { const occ = db.occurrences.find(o => o.id === occAssign[1]); if (occ) { occ.departmentId = body.departmentId || occ.departmentId; occ.assignedAgentId = body.assignedAgentId || occ.assignedAgentId; occ.updatedAt = demoNowIso(); } return save({ ok: true, occurrence: occ ? demoSerializeOccurrence(db, occ) : null, previewMode: true }); }
  const occDup = pathname.match(/^\/api\/occurrences\/([^/]+)\/mark-duplicate$/);
  if (occDup && method === 'PATCH') {
    const occ = db.occurrences.find(o => o.id === occDup[1] || o.protocol === occDup[1]);
    const target = String(body.duplicateOfId || body.candidateId || body.protocol || '').trim();
    const main = db.occurrences.find(o => o.id === target || o.protocol === target);
    if (!occ || !main) throw new Error('Ocorrencia original ou principal nao encontrada.');
    if (occ.id === main.id) throw new Error('Uma ocorrencia nao pode ser duplicada dela mesma.');
    if (occ.cityId !== main.cityId || main.duplicateOfId === occ.id) throw new Error('Vinculo de duplicidade recusado.');
    const oldStatus = occ.status;
    const archiveDuplicate = Boolean(body.archiveDuplicate);
    occ.status = archiveDuplicate ? 'ARQUIVADO' : 'DUPLICADO';
    occ.duplicateOfId = main.id;
    occ.publicMessage = `Esta ocorrencia foi vinculada ao protocolo principal ${main.protocol}.`;
    occ.updatedAt = demoNowIso();
    db.statusHistory.push({ id: demoUuid('hist'), occurrenceId: occ.id, changedBy: currentUser?.id, oldStatus, newStatus: occ.status, comment: `${archiveDuplicate ? 'Ocorrencia arquivada como duplicada' : 'Ocorrencia marcada como duplicada'} do protocolo ${main.protocol}.`, publicMessage: occ.publicMessage, createdAt: demoNowIso() });
    db.comments.push({ id: demoUuid('com'), occurrenceId: main.id, userId: currentUser?.id, comment: `Ocorrencia ${occ.protocol} agrupada como duplicada. ${trimAssistiveText(occ.title || occ.description || '', 140)}`, visibility: 'INTERNAL', createdAt: demoNowIso() });
    db.auditLogs.push({ id: demoUuid('audit'), cityId: occ.cityId, userId: currentUser?.id, action: archiveDuplicate ? 'OCCURRENCE_ARCHIVED_AS_DUPLICATE' : 'OCCURRENCE_MARKED_DUPLICATE', entityType: 'Occurrence', entityId: occ.id, metadata: { duplicateOfId: main.id, parentProtocol: main.protocol, archiveDuplicate, previousStatus: oldStatus }, createdAt: demoNowIso() });
    return save({ ok: true, occurrence: demoSerializeOccurrence(db, occ), previewMode: true });
  }
  const occComment = pathname.match(/^\/api\/occurrences\/([^/]+)\/comments$/);
  if (occComment && method === 'POST') { db.comments.push({ id: demoUuid('com'), occurrenceId: occComment[1], userId: currentUser?.id, comment: body.comment || '', visibility: body.visibility || 'INTERNAL', createdAt: demoNowIso() }); return save({ ok: true, previewMode: true }); }
  const cityNested = pathname.match(/^\/api\/cities\/([^/]+)\/(departments|neighborhoods|users)$/);
  if (cityNested && method === 'GET') { const key = cityNested[2]; return { ok: true, [key]: db[key].filter(x => !x.cityId || x.cityId === cityNested[1]).map(x => key === 'users' ? demoPublicUser(x) : x), previewMode: true }; }
  if (cityNested && method === 'POST') { const key = cityNested[2]; const entry = { id: demoUuid(key.slice(0,-1)), cityId: cityNested[1], name: body.name || body.email || 'Novo cadastro', description: body.description || '', active: true, createdAt: demoNowIso(), updatedAt: demoNowIso() }; db[key].push(entry); return save({ ok: true, [key.slice(0,-1)]: entry, previewMode: true }); }
  if (pathname === '/api/reports/monthly') return { ok: true, metrics: demoMetrics(db, db.occurrences), occurrences: db.occurrences.map(o => demoSerializeOccurrence(db, o)), previewMode: true };
  if (pathname === '/api/reports/monthly/generate' && method === 'POST') { db.monthlyReports.push({ id: demoUuid('rep'), cityId: db.cities[0].id, month: new Date().getMonth()+1, year: new Date().getFullYear(), createdAt: demoNowIso() }); return save({ ok: true, report: db.monthlyReports.at(-1), previewMode: true }); }
  if (pathname === '/api/audit-logs') return { ok: true, auditLogs: db.auditLogs.slice().reverse(), previewMode: true };
  if (pathname === '/api/whatsapp/config' && method === 'GET') return { ok: true, channel: db.whatsappChannels[0], events: db.whatsappWebhookEvents, messages: db.whatsappMessages.map(m => ({ ...m, occurrence: db.occurrences.find(o => o.id === m.occurrenceId) ? demoSerializeOccurrence(db, db.occurrences.find(o => o.id === m.occurrenceId)) : null })), triage: { waitingInfo: db.whatsappMessages.filter(m => m.status === 'AGUARDANDO_INFORMACOES').length }, completeness: { filled: 6, total: 6, percent: 100 }, previewMode: true };
  if (pathname === '/api/whatsapp/config' && method === 'PUT') { db.whatsappChannels[0] = { ...db.whatsappChannels[0], ...body, cityId: db.cities[0].id, updatedAt: demoNowIso(), connectionStatus: 'MODO_DEMO_ONLINE' }; return save({ ok: true, channel: db.whatsappChannels[0], previewMode: true }); }
  if (pathname === '/api/whatsapp/test') return { ok: true, message: 'Configuração validada no modo demonstrativo online.', previewMode: true };
  if (pathname === '/api/whatsapp/simulate-message' && method === 'POST') {
    const sug = demoSuggestFromMessage(db, body.messageBody);
    const payloadJson = { suggestedCategoryId: sug.category.id, suggestedPriority: sug.priority, localTriageSuggestion: sug.suggestion, simulated: true };
    if (body.mediaId || body.mediaStoragePath) {
      payloadJson.mediaId = body.mediaId || demoUuid('wamedia');
      payloadJson.mediaMimeType = body.mediaMimeType || 'image/jpeg';
      payloadJson.storedMedia = body.mediaStoragePath ? { uploaded: true, bucket: 'occurrence-attachments', path: body.mediaStoragePath, contentType: payloadJson.mediaMimeType, size: Number(body.mediaSizeBytes || 0) } : { uploaded: false, reason: 'Mídia simulada aguardando download.' };
    }
    const media = whatsappMessageMediaState({ payloadJson });
    const msg = { id: demoUuid('wam'), cityId: db.cities[0].id, channelId: db.whatsappChannels[0].id, citizenPhone: body.citizenPhone || '5511999990000', direction: 'INBOUND', messageType: media.hasMedia ? 'image' : 'text', messageBody: body.messageBody || '', suggestedCategoryId: sug.category.id, suggestedDepartmentId: sug.suggestion.departmentId, suggestedPriority: sug.priority, status: 'RECEBIDA_PENDENTE_TRIAGEM', preparedReply: 'Recebemos sua mensagem. Para registrar corretamente, informe bairro, rua ou ponto de referência.', payloadJson, mediaId: media.mediaId, mediaMimeType: media.contentType, mediaStoragePath: media.storagePath, hasMedia: media.hasMedia, createdAt: demoNowIso() };
    db.whatsappMessages.push(msg);
    return save({ ok: true, message: msg, previewMode: true });
  }
  const waCreate = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/create-occurrence$/);
  if (waCreate && method === 'POST') {
    const msg = db.whatsappMessages.find(m => m.id === waCreate[1]);
    if (!msg) throw new Error('Mensagem não encontrada.');
    if (msg.occurrenceId) {
      const existing = db.occurrences.find(o => o.id === msg.occurrenceId);
      if (existing) {
        const mediaAttachment = demoLinkWhatsAppMediaAttachment(db, msg, existing, currentUser?.id || null);
        return save({ ok: true, occurrence: demoSerializeOccurrence(db, existing), message: msg, mediaAttachment, alreadyConverted: true, previewMode: true });
      }
    }
    const suggestion = msg.payloadJson?.localTriageSuggestion || buildAssistiveTriageFallback({ text: msg.messageBody, messageBody: msg.messageBody, categories: db.categories, departments: db.departments, subcategories: db.subcategories, neighborhoods: db.neighborhoods, occurrences: db.occurrences, cityId: msg.cityId });
    const cat = db.categories.find(c => c.id === (msg.suggestedCategoryId || suggestion.categoryId)) || db.categories[0];
    const occ = { id: demoUuid('occ'), cityId: db.cities[0].id, protocol: demoNextProtocol(db), title: 'Ocorrência recebida pelo WhatsApp', description: msg.messageBody, categoryId: cat.id, subcategoryId: suggestion.subcategoryId || null, neighborhoodId: null, departmentId: suggestion.departmentId || cat.defaultDepartmentId, assignedAgentId: null, citizenId: null, priority: msg.suggestedPriority || suggestion.priority || 'MEDIA', status: 'RECEBIDO', address: '', referencePoint: 'Relato recebido pelo WhatsApp', publicVisibility: true, duplicateOfId: null, slaDueAt: demoComputeSla(msg.suggestedPriority || suggestion.priority || 'MEDIA'), publicMessage: suggestion.publicMessage || 'Ocorrência registrada a partir do canal oficial de WhatsApp.', resolvedAt: null, createdAt: demoNowIso(), updatedAt: demoNowIso() };
    db.occurrences.push(occ);
    msg.status = 'CONVERTIDA_EM_OCORRENCIA';
    msg.occurrenceId = occ.id;
    msg.preparedReply = `Sua solicitação foi registrada com sucesso. Protocolo: ${occ.protocol}.`;
    db.statusHistory.push({ id: demoUuid('hist'), occurrenceId: occ.id, newStatus: 'RECEBIDO', publicMessage: occ.publicMessage, createdAt: demoNowIso() });
    const mediaAttachment = demoLinkWhatsAppMediaAttachment(db, msg, occ, currentUser?.id || null);
    return save({ ok: true, occurrence: demoSerializeOccurrence(db, occ), message: msg, mediaAttachment, previewMode: true });
  }
  const waStatus = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/status$/);
  if (waStatus && method === 'POST') { const msg = db.whatsappMessages.find(m => m.id === waStatus[1]); if (msg) { msg.status = body.status || msg.status; msg.preparedReply = msg.status === 'AGUARDANDO_INFORMACOES' ? 'Para registrar sua solicitação, informe o bairro, rua ou ponto de referência.' : msg.preparedReply; } return save({ ok: true, message: msg, preparedReply: msg?.preparedReply, previewMode: true }); }
  const waLink = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/link-occurrence$/);
  if (waLink && method === 'POST') {
    const msg = db.whatsappMessages.find(m => m.id === waLink[1]);
    const occ = db.occurrences.find(o => o.protocol === body.protocol);
    if (!msg || !occ) throw new Error('Mensagem ou protocolo não encontrado.');
    msg.status = 'VINCULADA_A_PROTOCOLO';
    msg.occurrenceId = occ.id;
    const mediaAttachment = demoLinkWhatsAppMediaAttachment(db, msg, occ, currentUser?.id || null);
    return save({ ok: true, message: msg, occurrence: demoSerializeOccurrence(db, occ), mediaAttachment, previewMode: true });
  }
  const waSendPrepared = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/send-prepared$/);
  if (waSendPrepared && method === 'POST') {
    const msg = db.whatsappMessages.find(m => m.id === waSendPrepared[1]);
    if (!msg) throw new Error('Mensagem não encontrada.');
    const outbound = { id: demoUuid('wam'), cityId: msg.cityId, channelId: msg.channelId, occurrenceId: msg.occurrenceId || null, citizenPhone: msg.citizenPhone, direction: 'FAILED', messageType: 'text', messageBody: body.messageBody || msg.preparedReply || '', status: 'ERRO', processingStatus: 'ERRO', errorMessage: 'Envio real indisponível no modo demonstrativo.', createdAt: demoNowIso() };
    db.whatsappMessages.push(outbound);
    return save({ ok: true, sent: false, fallback: true, error: outbound.errorMessage, outboundMessage: outbound, previewMode: true });
  }
  throw new Error('Rota não disponível no modo demonstrativo online. Use localhost para a API completa.');
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const forceDemo = localStorage.getItem('cidadeos_force_demo_mode') === '1';
  if (forceDemo) return demoRequest(path, options);
  try {
    const response = await fetch(`${API}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }));
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro na solicitação.');
    if (data.sharedSupabase) localStorage.setItem('cidadeos_shared_supabase_active', '1');
    return data;
  } catch (error) {
    if (ONLINE_PREVIEW_MODE) {
      console.warn('[CidadeOS] API Supabase indisponível; usando demo local do navegador.', error);
      localStorage.removeItem('cidadeos_shared_supabase_active');
      return demoRequest(path, options);
    }
    throw error;
  }
}

async function loadBootstrap(force = false) {
  if (state.bootstrap && !force) return state.bootstrap;
  state.bootstrap = await request('/api/public/bootstrap');
  return state.bootstrap;
}

async function loadTransparency(force = false) {
  if (state.transparency && !force) return state.transparency;
  const boot = await loadBootstrap();
  state.transparency = await request(`/api/public/transparency?cityId=${encodeURIComponent(boot.city.id)}`);
  return state.transparency;
}

async function ensureSession() {
  if (!state.token) return null;
  try {
    const data = await request('/api/auth/me');
    state.user = data.user;
    localStorage.setItem('cidadeos_user', JSON.stringify(data.user));
    return data.user;
  } catch {
    logout(false);
    return null;
  }
}

function navigate(route) { location.hash = route; }

function logout(show = true) {
  state.token = '';
  state.user = null;
  state.panelData = null;
  state.occurrences = [];
  localStorage.removeItem('cidadeos_token');
  localStorage.removeItem('cidadeos_user');
  if (show) toast('Sessão encerrada.');
  navigate('/');
}


function renderCidadeOsLogo(options = {}) {
  const mode = options.mode || 'seal';
  const label = options.label || 'CidadeOS AI';
  const subtitle = options.subtitle || 'Plataforma de Atendimento e Inteligência Urbana';
  const showText = mode !== 'mark';
  return `
    <span class="cidadeos-logo cidadeos-logo--${mode}" aria-label="${escapeHtml(label)}">
      <span class="cidadeos-logo__symbol" aria-hidden="true">
        <svg class="cidadeos-symbol" viewBox="0 0 128 88" role="img" focusable="false">
          <defs>
            <linearGradient id="cidadeosBlue" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#061b33"/>
              <stop offset="1" stop-color="#0a3f70"/>
            </linearGradient>
            <linearGradient id="cidadeosTeal" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#19a7a8"/>
              <stop offset="1" stop-color="#4cb3d4"/>
            </linearGradient>
            <filter id="cidadeosSoftGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.3" result="blur"/>
              <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.08 0 0 0 0 0.58 0 0 0 0 0.70 0 0 0 .42 0" result="glow"/>
              <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect x="2" y="2" width="124" height="84" rx="8" fill="url(#cidadeosBlue)" class="symbol-bg"/>
          <g class="city-silhouette" opacity=".22" fill="#4cb3d4">
            <rect x="6" y="68" width="9" height="16"/><rect x="16" y="62" width="10" height="22"/><rect x="29" y="70" width="8" height="14"/><rect x="43" y="60" width="13" height="24"/><rect x="60" y="66" width="9" height="18"/><rect x="72" y="55" width="16" height="29"/><rect x="93" y="64" width="10" height="20"/><rect x="107" y="58" width="13" height="26"/>
          </g>
          <g class="logo-scan" opacity=".55">
            <path d="M17 23 H47 M55 16 H82 M46 9 V40 M82 16 H88" fill="none" stroke="url(#cidadeosTeal)" stroke-width="2" stroke-linecap="round"/>
            <rect x="86" y="13" width="6" height="6" fill="#19a7a8"/><rect x="44" y="6" width="5" height="5" fill="#4cb3d4"/>
          </g>
          <g class="os-mark" filter="url(#cidadeosSoftGlow)">
            <path class="o-ring" d="M42 21a23 23 0 1 0 0 46a23 23 0 1 0 0-46Zm0 14a9 9 0 1 1 0 18a9 9 0 1 1 0-18Z" fill="#ffffff"/>
            <path d="M17 44 H67" stroke="#061b33" stroke-width="4" opacity=".88"/>
            <path d="M42 21 V67" stroke="#061b33" stroke-width="4" opacity=".88"/>
            <circle class="protocol-core" cx="42" cy="44" r="9" fill="url(#cidadeosTeal)"/>
            <path class="s-mark" d="M73 25H110c4 0 7 3 7 7v2H87c-5 0-9 4-9 9s4 9 9 9h18c3 0 5 2 5 5s-2 5-5 5H71v-9h28c2 0 3-1 3-2s-1-2-3-2H84c-9 0-16-7-16-16s7-8 5-8Z" fill="#ffffff"/>
          </g>
          <g class="data-pixels" fill="#4cb3d4">
            <rect x="111" y="22" width="4" height="4"/><rect x="116" y="30" width="3" height="3"/><rect x="112" y="58" width="4" height="4"/>
          </g>
          <circle class="protocol-pulse" cx="42" cy="44" r="13" fill="none" stroke="#4cb3d4" stroke-width="2"/>
        </svg>
      </span>
      ${showText ? `<span class="cidadeos-logo__text"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(subtitle)}</small></span>` : ''}
    </span>
  `;
}

function layout(content) {
  const boot = state.bootstrap || { city: { name: 'Cidade Modelo' } };
  const city = boot.city || { name: 'Cidade Modelo', state: 'SP' };
  const isPanel = state.route.startsWith('/painel');
  return `
    <header class="site-masthead">
      <div class="service-ribbon">
        <div class="service-ribbon__inner">
          <span>Ambiente demonstrativo institucional</span>
          <span class="service-ribbon__status"><span class="status-dot" aria-hidden="true"></span> Serviço online · Atendimento digital</span>
        </div>
      </div>
      <div class="official-header">
        <div class="official-header__inner">
          <a class="official-brand" href="#/" aria-label="Página inicial">
            ${renderCidadeOsLogo({ mode: 'header', label: `Prefeitura Municipal de ${escapeHtml(city.name)}`, subtitle: 'CidadeOS AI · Plataforma de Atendimento e Inteligência Urbana' })}
          </a>
          <button class="mobile-menu-hint" type="button" aria-label="Navegação principal">Menu</button>
          <nav class="official-nav" aria-label="Navegação principal">
            ${navLink('/nova-ocorrencia', 'Abrir ocorrência')}
            ${navLink('/consultar', 'Consultar protocolo')}
            ${navLink('/alertas', 'Alertas oficiais')}
            ${navLink('/transparencia', 'Transparência')}
            ${navLink('/orientacoes', 'Orientações')}
            ${navLink('/whatsapp-tutorial', 'WhatsApp Business')}
            ${state.user ? `<a class="${isPanel ? 'active' : 'primary'}" href="#/painel">Painel interno</a><button class="danger" type="button" id="btnLogout">Sair</button>` : `<a class="primary" href="#/login">Acesso restrito</a>`}
          </nav>
        </div>
      </div>
    </header>
    <main id="conteudo-principal" class="gov-container" tabindex="-1">
      ${content}
    </main>
    <footer class="civic-footer">
      <div class="civic-footer__inner">
        <div class="footer-brand">${renderCidadeOsLogo({ mode: 'footer', label: 'CidadeOS AI', subtitle: 'Portal demonstrativo institucional · Não substitui canais emergenciais.' })}</div>
        <nav aria-label="Links do rodapé"><a href="#/nova-ocorrencia">Abrir ocorrência</a><a href="#/consultar">Consultar protocolo</a><a href="#/transparencia">Transparência</a></nav>
      </div>
    </footer>
    ${state.modalOccurrence ? renderOccurrenceModal(state.modalOccurrence) : ''}
  `;
}

function navLink(route, label) {
  return `<a class="${state.route === route ? 'active' : ''}" href="#${route}">${label}</a>`;
}

function previewModeBanner() { return ONLINE_PREVIEW_MODE ? '<div class="preview-mode-banner"><strong>Ambiente online de testes</strong><span>Quando a Vercel estiver com SUPABASE configurado, os dados ficam compartilhados. Se a API falhar, o site usa fallback local no navegador.</span></div>' : ''; }

async function render() {
  await loadBootstrap();
  await ensureSession();
  const route = state.route.split('?')[0];
  let content = '';
  if (route === '/' || route === '') content = await pageHome();
  else if (route === '/nova-ocorrencia') content = await pageOccurrenceForm();
  else if (route === '/consultar') content = await pageProtocolSearch();
  else if (route === '/alertas') content = await pageAlerts();
  else if (route === '/transparencia') content = await pageTransparency();
  else if (route === '/orientacoes') content = await pageGuidance();
  else if (route === '/whatsapp-tutorial') content = await pageWhatsAppPublicGuide();
  else if (route === '/login') content = await pageLogin();
  else if (route === '/painel') content = await pagePanel();
  else content = pageNotFound();
  app.innerHTML = previewModeBanner() + layout(content);
  bindCommonEvents();
  bindPageEvents(route);
}

function bindCommonEvents() {
  const logoutBtn = document.querySelector('#btnLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => logout());
}

function bindPageEvents(route) {
  if (route === '/nova-ocorrencia') bindOccurrenceForm();
  if (route === '/consultar') bindProtocolSearch();
  if (route === '/login') bindLogin();
  if (route === '/painel') bindPanel();
  bindServiceSearch();
  bindModalActions();
}

async function pageHome() {
  const boot = await loadBootstrap();
  const transparency = await loadTransparency(true).catch(() => null);
  const m = transparency?.metrics || { total: 0, open: 0, resolved: 0, critical: 0, overdue: 0 };
  return `
    <section class="hero-govtech" aria-labelledby="homeTitle">
      <div class="hero-govtech__content">
        <span class="eyebrow"><span class="eyebrow__marker"></span> Serviço público digital · govtech demonstrativa</span>
        <h1 id="homeTitle">Atendimento ao cidadão com protocolo, transparência e inteligência urbana.</h1>
        <p>Registre ocorrências municipais, acompanhe a situação pelo protocolo e consulte alertas oficiais. A plataforma organiza demandas de zeladoria, saúde pública, saneamento, defesa civil, zona rural e proteção social em um fluxo rastreável.</p>
        <div class="hero-actions">
          <a class="gov-button primary" href="#/nova-ocorrencia">Registrar solicitação</a>
          <a class="gov-button" href="#/consultar">Consultar protocolo</a>
          <a class="gov-button ghost" href="#/transparencia">Ver transparência</a>
          ${boot.whatsappChannel?.officialPhone ? `<a class="gov-button whatsapp" target="_blank" rel="noreferrer" href="https://wa.me/${boot.whatsappChannel.officialPhone}?text=${encodeURIComponent('Olá, quero registrar uma ocorrência pelo CidadeOS AI.')}">WhatsApp oficial</a>` : ''}
        </div>
        <div class="trust-strip" aria-label="Princípios do serviço">
          ${institutionalPrinciples.map(([title, desc]) => `<span><strong>${escapeHtml(title)}</strong>${escapeHtml(desc)}</span>`).join('')}
        </div>
      </div>
      <aside class="city-ops-card" aria-label="Visualização de cidade inteligente">
        ${smartCityVisual()}
        <div class="city-ops-card__stats">
          <div><strong>${m.open || 0}</strong><span>em andamento</span></div>
          <div><strong>${m.resolved || 0}</strong><span>resolvidas</span></div>
          <div><strong>${m.overdue || 0}</strong><span>atrasadas</span></div>
        </div>
      </aside>
    </section>

    <section class="service-search-panel" aria-labelledby="serviceSearchTitle">
      <div>
        <h2 id="serviceSearchTitle">Encontre a área de atendimento</h2>
        <p>Use a busca para localizar rapidamente o tipo de solicitação antes de abrir a ocorrência.</p>
      </div>
      <label class="service-search"><span>Buscar serviço</span><input id="serviceSearch" placeholder="Ex.: dengue, buraco, vazamento, árvore, idoso" /></label>
    </section>

    <section class="service-directory" aria-label="Áreas de atendimento">
      ${serviceGuides.map(item => serviceCard(item)).join('')}
    </section>

    <section class="civic-grid-2">
      <article class="gov-section no-margin">
        <div class="gov-section__header"><div><h2>Como o protocolo funciona</h2><p>Fluxo simples para o cidadão e verificável para a gestão pública.</p></div></div>
        <div class="gov-section__body stepper-official">
          ${publicJourney.map(([num, title, desc]) => `<div class="stepper-item"><span>${num}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(desc)}</p></div></div>`).join('')}
        </div>
      </article>
      <article class="gov-section no-margin">
        <div class="gov-section__header"><div><h2>Situação do serviço</h2><p>Resumo público da cidade ativa no ambiente demonstrativo.</p></div></div>
        <div class="gov-section__body">
          <dl class="service-status-list">
            <div><dt>Município</dt><dd>${escapeHtml(boot.city.name)}${boot.city.state ? ` / ${escapeHtml(boot.city.state)}` : ''}</dd></div>
            <div><dt>Ocorrências abertas</dt><dd>${m.open || 0}</dd></div>
            <div><dt>Alertas oficiais</dt><dd>${(transparency?.activeAlerts || boot.alerts || []).length}</dd></div>
            <div><dt>Tempo médio de resolução</dt><dd>${m.averageResolutionDays || 0} dia(s)</dd></div>
          </dl>
        </div>
      </article>
    </section>

    <section class="gov-section">
      <div class="gov-section__header"><div><h2>Contexto nacional e importância do serviço</h2><p>Dados públicos reforçam a necessidade de canais digitais sérios, preventivos e rastreáveis.</p></div></div>
      <div class="gov-section__body evidence-grid">
        ${nationalStats.map(stat => `<article class="evidence-card"><strong>${escapeHtml(stat.value)}</strong><span>${escapeHtml(stat.label)}</span><p>${escapeHtml(stat.text)}</p><small>Fonte: <a href="${escapeHtml(stat.url)}" target="_blank" rel="noreferrer">${escapeHtml(stat.source)}</a></small></article>`).join('')}
      </div>
    </section>

    <section class="civic-grid-2">
      <article class="gov-section no-margin">
        <div class="gov-section__header"><div><h2>Alertas oficiais</h2><p>Comunicados preventivos e avisos de utilidade pública.</p></div><a class="gov-button small" href="#/alertas">Ver todos</a></div>
        <div class="gov-section__body">${renderAlertsList(boot.alerts || [])}</div>
      </article>
      <article class="gov-section no-margin">
        <div class="gov-section__header"><div><h2>Transparência em tempo real</h2><p>Indicadores sem exposição de dados pessoais.</p></div><a class="gov-button small" href="#/transparencia">Abrir painel</a></div>
        <div class="gov-section__body compact-metrics">
          <div><strong>${m.total || 0}</strong><span>Total registrado</span></div>
          <div><strong>${m.critical || 0}</strong><span>Críticas</span></div>
          <div><strong>${m.resolved || 0}</strong><span>Concluídas</span></div>
          <div><strong>${m.overdue || 0}</strong><span>Atrasadas</span></div>
        </div>
      </article>
    </section>
  `;
}

function serviceCard(item) {
  return `<article class="service-card" data-service-card data-search="${escapeHtml([item.title, item.desc, item.area, item.examples.join(' ')].join(' ').toLowerCase())}">
    <div class="service-card__code">${escapeHtml(item.code)}</div>
    <div class="service-card__body">
      <span>${escapeHtml(item.area)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.desc)}</p>
      <ul>${item.examples.map(ex => `<li>${escapeHtml(ex)}</li>`).join('')}</ul>
    </div>
    <small>${escapeHtml(item.level)}</small>
  </article>`;
}

function smartCityVisual() {
  return `
    <div class="smart-visual" aria-hidden="true">
      <svg viewBox="0 0 520 330" role="img">
        <defs>
          <linearGradient id="cityGrad" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#dbeafe"/><stop offset="1" stop-color="#f8fafc"/></linearGradient>
        </defs>
        <rect x="0" y="0" width="520" height="330" rx="0" fill="url(#cityGrad)"/>
        <path class="map-line" d="M42 236 C122 188 144 271 222 214 S348 173 474 210" fill="none" stroke="#1d6fa3" stroke-width="3"/>
        <path class="map-line delayed" d="M68 102 C138 132 175 79 250 108 S372 160 462 92" fill="none" stroke="#0a4b78" stroke-width="2"/>
        <g class="district district-a"><rect x="70" y="170" width="54" height="78"/><rect x="134" y="140" width="74" height="108"/><rect x="218" y="184" width="48" height="64"/></g>
        <g class="district district-b"><rect x="312" y="126" width="52" height="122"/><rect x="374" y="156" width="70" height="92"/></g>
        <g class="pulse-node"><circle cx="122" cy="190" r="9"/><circle cx="122" cy="190" r="18"/></g>
        <g class="pulse-node second"><circle cx="366" cy="148" r="9"/><circle cx="366" cy="148" r="18"/></g>
        <g class="pulse-node third"><circle cx="438" cy="206" r="9"/><circle cx="438" cy="206" r="18"/></g>
        <rect x="48" y="46" width="178" height="56" fill="#ffffff" stroke="#b7c6d8"/>
        <text x="66" y="70" fill="#0b355d" font-size="15" font-weight="700">Central de Monitoramento</text>
        <text x="66" y="90" fill="#40566f" font-size="12">protocolos · setores · alertas</text>
        <rect x="286" y="48" width="174" height="48" fill="#ffffff" stroke="#b7c6d8"/>
        <text x="304" y="76" fill="#0b355d" font-size="13" font-weight="700">dados públicos organizados</text>
      </svg>
    </div>`;
}

async function pageOccurrenceForm() {
  const boot = await loadBootstrap();
  return `
    <section class="gov-section form-official">
      <div class="gov-section__header"><div><span class="section-kicker">Atendimento ao cidadão</span><h1>Abrir ocorrência</h1><p>Use este formulário para registrar solicitação de atendimento municipal. Quanto mais claro o relato, melhor o encaminhamento ao setor responsável.</p></div></div>
      <div class="gov-section__body">
        <div class="notice-strip"><span><strong>Privacidade:</strong> dados pessoais são usados apenas para contato e acompanhamento da ocorrência. O painel público não exibe nome, telefone ou e-mail do solicitante.</span></div>
        <form id="occurrenceForm" class="form-grid">
          <input type="hidden" name="cityId" value="${escapeHtml(boot.city.id)}" />
          <div class="gov-field full"><label for="title">Assunto da ocorrência</label><input id="title" name="title" required minlength="3" placeholder="Ex.: Buraco na via principal" /></div>
          <div class="gov-field full"><label for="description">Descrição</label><textarea id="description" name="description" required minlength="10" placeholder="Descreva o problema, risco observado e informações úteis para localizar a situação."></textarea><span class="form-help">Evite informar documentos pessoais no campo de descrição.</span></div>
          <div class="gov-field"><label for="categoryId">Categoria</label><select id="categoryId" name="categoryId" required><option value="">Selecione</option>${boot.categories.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="gov-field"><label for="subcategoryId">Tipo de problema</label><select id="subcategoryId" name="subcategoryId"><option value="">Selecione uma categoria primeiro</option></select></div>
          <div class="gov-field"><label for="neighborhoodId">Bairro ou região</label><select id="neighborhoodId" name="neighborhoodId"><option value="">Não informado</option>${boot.neighborhoods.map(n => `<option value="${escapeHtml(n.id)}">${escapeHtml(n.name)}</option>`).join('')}</select></div>
          <div class="gov-field"><label for="priority">Urgência percebida</label><select id="priority" name="priority"><option value="MEDIA">Média</option><option value="BAIXA">Baixa</option><option value="ALTA">Alta</option><option value="CRITICA">Crítica</option></select></div>
          <div class="gov-field"><label for="address">Endereço</label><input id="address" name="address" placeholder="Rua, número ou local aproximado" /></div>
          <div class="gov-field"><label for="referencePoint">Ponto de referência</label><input id="referencePoint" name="referencePoint" placeholder="Ex.: próximo à escola municipal" /></div>
          <div class="gov-field"><label for="citizenName">Nome do solicitante</label><input id="citizenName" name="citizenName" placeholder="Opcional" /></div>
          <div class="gov-field"><label for="citizenPhone">Telefone</label><input id="citizenPhone" name="citizenPhone" placeholder="Opcional" /></div>
          <div class="gov-field"><label for="citizenEmail">E-mail</label><input id="citizenEmail" name="citizenEmail" type="email" placeholder="Opcional" /></div>
          <div class="gov-field"><label for="attachment">Foto da ocorrência</label><input id="attachment" name="attachment" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" /><span class="form-help">Anexo opcional: jpg, png, webp ou pdf até 5 MB. O agente verá no painel.</span></div>
          <div class="full checkbox-line"><input id="privacy" type="checkbox" required /><label for="privacy">Confirmo que as informações enviadas são verdadeiras e autorizo o uso dos dados para atendimento da ocorrência.</label></div>
          <div class="full"><button class="gov-button primary" type="submit">Registrar ocorrência e gerar protocolo</button></div>
        </form>
      </div>
    </section>
  `;
}

async function pageProtocolSearch() {
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Consultar protocolo</h1><p>Informe o número recebido ao registrar a ocorrência para acompanhar a situação atual.</p></div></div>
      <div class="gov-section__body">
        <form id="protocolForm" class="form-grid">
          <div class="gov-field"><label for="protocol">Número do protocolo</label><input id="protocol" name="protocol" value="${escapeHtml(state.lastProtocol)}" placeholder="CID-2026-000001" required /></div>
          <div class="gov-field" style="align-self:end"><button class="gov-button primary" type="submit">Consultar</button></div>
        </form>
        <div id="protocolResult" style="margin-top:16px"></div>
      </div>
    </section>
  `;
}

async function pageAlerts() {
  const boot = await loadBootstrap(true);
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Alertas oficiais</h1><p>Comunicados preventivos e avisos de interesse público publicados no portal.</p></div></div>
      <div class="gov-section__body">${renderAlertsList(boot.alerts || [])}</div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Orientação ao cidadão</h2></div>
      <div class="gov-section__body"><p>Este canal organiza registros e acompanhamento. Em situação de risco imediato à vida, procure os serviços emergenciais competentes.</p></div>
    </section>
  `;
}

async function pageTransparency() {
  const data = await loadTransparency(true);
  const m = data.metrics;
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Transparência pública</h1><p>Indicadores gerais sem exposição de dados pessoais dos solicitantes.</p></div></div>
      <div class="gov-section__body grid-4">
        <div class="stat-official"><strong>${m.total}</strong><span>Total registrado</span></div>
        <div class="stat-official warning"><strong>${m.open}</strong><span>Em andamento</span></div>
        <div class="stat-official success"><strong>${m.resolved}</strong><span>Resolvidas</span></div>
        <div class="stat-official danger"><strong>${m.overdue}</strong><span>Atrasadas</span></div>
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Distribuição das ocorrências</h2></div>
      <div class="gov-section__body grid-2">
        ${miniTable('Por situação', m.byStatus, statusLabels)}
        ${miniTable('Por prioridade', m.byPriority, priorityLabels)}
        ${miniTable('Por bairro', m.byNeighborhood)}
        ${miniTable('Por categoria', m.byCategory)}
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Alertas ativos</h2></div>
      <div class="gov-section__body">${renderAlertsList(data.activeAlerts || [])}</div>
    </section>
  `;
}

async function pageGuidance() {
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Orientações ao cidadão</h1><p>Informações de utilidade pública para registrar solicitações com clareza e acompanhar o atendimento.</p></div></div>
      <div class="gov-section__body guidance-layout">
        <article><h2>Antes de registrar</h2><ul class="check-list"><li>Informe o local com rua, bairro e ponto de referência.</li><li>Descreva o risco observado de forma objetiva.</li><li>Envie foto quando isso ajudar a identificar a ocorrência.</li><li>Não inclua documentos pessoais no campo de descrição.</li></ul></article>
        <article><h2>Quando acionar emergência</h2><p>Este portal organiza solicitações e acompanhamento. Em risco imediato à vida, acione também os canais emergenciais competentes do município.</p><div class="notice-strip warning"><span><strong>Atenção:</strong> queda de árvore com vítimas, alagamento severo, incêndio ou risco estrutural devem ser tratados como urgência.</span></div></article>
        <article><h2>Depois do envio</h2><ul class="check-list"><li>Guarde o número de protocolo.</li><li>Consulte a situação pelo portal.</li><li>Acompanhe mensagens públicas e próximas etapas.</li><li>Evite abrir duplicidade quando já houver protocolo para o mesmo local.</li></ul></article>
      </div>
    </section>
    <section class="gov-section"><div class="gov-section__header"><h2>Áreas atendidas</h2></div><div class="gov-section__body service-directory compact">${serviceGuides.map(item => serviceCard(item)).join('')}</div></section>
  `;
}

async function pageLogin() {
  if (state.user) navigate('/painel');
  return `
    <section class="gov-section" style="max-width:680px;margin-inline:auto">
      <div class="gov-section__header login-brand-header"><div>${renderCidadeOsLogo({ mode: 'login', label: 'CidadeOS AI', subtitle: 'Acesso restrito institucional' })}<h1>Acesso restrito</h1><p>Área destinada a agentes, gestores e administradores autorizados.</p></div></div>
      <div class="gov-section__body">
        <form id="loginForm" class="form-grid">
          <div class="gov-field full"><label for="email">E-mail</label><input id="email" name="email" type="email" required value="admin@cidadeos.local" /></div>
          <div class="gov-field full"><label for="password">Senha</label><input id="password" name="password" type="password" required value="CidadeOS@123" /></div>
          <div class="full"><button class="gov-button primary" type="submit">Entrar no painel</button></div>
        </form>
        <div class="notice-strip" style="margin-top:16px"><span><strong>Contas demo:</strong> admin@cidadeos.local, agente@cidadeos.local, saude@cidadeos.local ou super@cidadeos.local. Senha: CidadeOS@123.</span></div>
      </div>
    </section>
  `;
}

async function pagePanel() {
  const user = await ensureSession();
  if (!user) return pageLogin();
  await loadPanelData(true);
  return `
    <div class="notice-strip panel-identity-strip"><span class="panel-identity-mini">${renderCidadeOsLogo({ mode: 'mark', label: 'CidadeOS AI' })}<span><strong>Painel interno:</strong> área operacional para triagem, acompanhamento e gestão das ocorrências registradas.</span></span><span>${escapeHtml(user.name)} · ${escapeHtml(user.role)}</span></div>
    <div class="panel-layout">
      <aside class="panel-sidebar">
        <div class="panel-sidebar__title">Menu administrativo</div>
        <nav class="panel-tabs" aria-label="Seções do painel">
          ${panelTab('overview', 'Visão geral')}
          ${panelTab('triage', 'SLA e triagem')}
          ${panelTab('occurrences', 'Ocorrências')}
          ${panelTab('structure', 'Bairros e setores')}
          ${panelTab('whatsapp-triage', 'Triagem WhatsApp')}
          ${panelTab('whatsapp', 'WhatsApp Business')}
          ${panelTab('reports', 'Relatórios')}
          ${panelTab('audit', 'Auditoria')}
        </nav>
      </aside>
      <section>${renderPanelTab()}</section>
    </div>
  `;
}

function panelTab(id, label) {
  return `<button type="button" data-panel-tab="${id}" class="${state.panelTab === id ? 'active' : ''}">${label}</button>`;
}

function renderPanelTab() {
  if (state.panelTab === 'triage') return panelTriage();
  if (state.panelTab === 'occurrences') return panelOccurrences();
  if (state.panelTab === 'structure') return panelStructure();
  if (state.panelTab === 'whatsapp-triage') return panelWhatsAppTriage();
  if (state.panelTab === 'whatsapp') return panelWhatsApp();
  if (state.panelTab === 'reports') return panelReports();
  if (state.panelTab === 'audit') return panelAudit();
  return panelOverview();
}

async function loadPanelData(force = false) {
  if (state.panelData && !force) return state.panelData;
  const boot = await loadBootstrap();
  const [dashboard, occurrences, report, whatsapp] = await Promise.all([
    request('/api/dashboard/city'),
    request('/api/occurrences'),
    request('/api/reports/monthly').catch(() => null),
    request('/api/whatsapp/config').catch(() => ({ channel: null, events: [], messages: [], completeness: { filled: 0, total: 6, percent: 0 } }))
  ]);
  let audit = null;
  try { audit = await request('/api/audit-logs'); } catch { audit = { auditLogs: [] }; }
  let departments = [];
  let neighborhoods = [];
  let users = [];
  const cityId = state.user?.cityId || boot.city?.id;
  if (cityId) {
    const [deps, neighs, cityUsers] = await Promise.all([
      request(`/api/cities/${cityId}/departments`).catch(() => ({ departments: [] })),
      request(`/api/cities/${cityId}/neighborhoods`).catch(() => ({ neighborhoods: [] })),
      request(`/api/cities/${cityId}/users`).catch(() => ({ users: [] }))
    ]);
    departments = deps.departments || [];
    neighborhoods = neighs.neighborhoods || [];
    users = cityUsers.users || [];
  }
  state.occurrences = occurrences.occurrences || [];
  state.panelData = { dashboard, occurrences, report, audit, departments, neighborhoods, users, whatsapp };
  state.whatsapp = whatsapp;
  return state.panelData;
}

function panelOverview() {
  const m = state.panelData.dashboard.metrics;
  const recent = state.panelData.dashboard.recentOccurrences || [];
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Visão geral operacional</h1><p>Resumo interno para identificar urgências, atrasos, setores acionados e ocorrências recentes.</p></div><button class="gov-button small" data-refresh-panel>Atualizar</button></div>
      <div class="gov-section__body grid-4">
        <div class="stat-official"><strong>${m.total}</strong><span>Total registrado</span></div>
        <div class="stat-official warning"><strong>${m.open}</strong><span>Em andamento</span></div>
        <div class="stat-official success"><strong>${m.resolved}</strong><span>Resolvidas</span></div>
        <div class="stat-official danger"><strong>${m.overdue}</strong><span>Atrasadas</span></div>
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Indicadores de triagem</h2></div>
      <div class="gov-section__body grid-2">
        ${miniTable('Por situação', m.byStatus, statusLabels)}
        ${miniTable('Por prioridade', m.byPriority, priorityLabels)}
        ${miniTable('Por departamento', m.byDepartment)}
        ${miniTable('Por bairro', m.byNeighborhood)}
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Ocorrências recentes</h2><button class="gov-button small" type="button" data-panel-tab="occurrences">Ver lista completa</button></div>
      <div class="gov-section__body">${occurrenceTable(recent)}</div>
    </section>
  `;
}


function panelTriage() {
  const rows = state.occurrences || [];
  const overdue = rows.filter(isOverdue);
  const critical = rows.filter(occ => occ.priority === 'CRITICA' && !isClosedStatus(occ.status));
  const noAgent = rows.filter(occ => !occ.assignedAgentId && !isClosedStatus(occ.status));
  const waiting = rows.filter(occ => occ.status === 'AGUARDANDO_TERCEIRO');
  const attention = [...new Map([...overdue, ...critical, ...noAgent, ...waiting].map(item => [item.id, item])).values()]
    .sort((a, b) => (isOverdue(b) - isOverdue(a)) || (new Date(a.slaDueAt || a.createdAt) - new Date(b.slaDueAt || b.createdAt)));
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>SLA e triagem operacional</h1><p>Fila prática para a equipe identificar atrasos, ocorrências críticas, demandas sem agente e próximos passos.</p></div><button class="gov-button small" data-refresh-panel>Atualizar</button></div>
      <div class="gov-section__body grid-4">
        <div class="stat-official danger"><strong>${overdue.length}</strong><span>SLA vencido</span></div>
        <div class="stat-official danger"><strong>${critical.length}</strong><span>Críticas abertas</span></div>
        <div class="stat-official warning"><strong>${noAgent.length}</strong><span>Sem agente</span></div>
        <div class="stat-official warning"><strong>${waiting.length}</strong><span>Aguardando terceiro</span></div>
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><div><h2>Fila de atenção</h2><p>Use as ações rápidas para mover a ocorrência sem abrir telas desnecessárias. Os detalhes continuam disponíveis para auditoria completa.</p></div></div>
      <div class="gov-section__body">${triageTable(attention)}</div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Checklist de rotina da central</h2></div>
      <div class="gov-section__body grid-2">
        <div class="notice-box"><strong>1. Priorizar</strong><br>Verifique críticas, atrasadas e sem agente antes das demandas comuns.</div>
        <div class="notice-box"><strong>2. Encaminhar</strong><br>Confirme setor e responsável, evitando ocorrência parada em “Recebido”.</div>
        <div class="notice-box"><strong>3. Comunicar</strong><br>Publique mensagem simples quando houver mudança relevante para o cidadão.</div>
        <div class="notice-box"><strong>4. Registrar</strong><br>Use comentários internos e anexos para manter histórico operacional rastreável.</div>
      </div>
    </section>
  `;
}

function panelWhatsAppTriage() {
  const wa = state.panelData.whatsapp || { messages: [], triage: {} };
  const rows = wa.messages || [];
  const pending = rows.filter(row => ['RECEBIDA_PENDENTE_TRIAGEM','AGUARDANDO_INFORMACOES','ERRO_PROCESSAMENTO'].includes(row.status));
  const converted = rows.filter(row => ['CONVERTIDA_EM_OCORRENCIA','VINCULADA_A_PROTOCOLO'].includes(row.status));
  const archived = rows.filter(row => row.status === 'ARQUIVADA');
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Triagem WhatsApp</h1><p>Mensagens reais recebidas pelo canal oficial entram nesta fila. Texto, mídia e status da Meta ficam registrados para triagem, protocolo e evidência operacional.</p></div><button class="gov-button small" data-refresh-panel>Atualizar</button></div>
      <div class="gov-section__body grid-4">
        <div class="stat-official warning"><strong>${pending.length}</strong><span>Pendentes de triagem</span></div>
        <div class="stat-official"><strong>${wa.triage?.waitingInfo || 0}</strong><span>Aguardando informações</span></div>
        <div class="stat-official success"><strong>${converted.length}</strong><span>Viraram protocolo</span></div>
        <div class="stat-official"><strong>${archived.length}</strong><span>Arquivadas</span></div>
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><div><h2>Simular mensagem recebida</h2><p>Use em localhost ou preview para testar o fluxo. Em produção, mensagens reais chegam pelo webhook da Meta; mídias ficam registradas e preparadas para evidência.</p></div></div>
      <div class="gov-section__body">
        <form class="form-grid" data-simulate-whatsapp>
          <div class="gov-field"><label>Telefone do cidadão</label><input name="citizenPhone" value="5511999990000" /></div>
          <div class="gov-field full"><label>Mensagem recebida</label><textarea name="messageBody">Tem um buraco grande na Rua São José, perto da escola.</textarea></div>
          <div class="full"><button class="gov-button primary" type="submit">Gerar mensagem de teste</button></div>
        </form>
      </div>
    </section>
    <section class="gov-section">
      <div class="gov-section__header"><h2>Fila de mensagens</h2></div>
      <div class="gov-section__body">${whatsappTriageTable(rows)}</div>
    </section>
  `;
}

function whatsappMediaStatusHtml(row = {}) {
  const media = whatsappMessageMediaState(row);
  if (!media.hasMedia) return '';
  if (media.storagePath) return `<br><small><span class="badge success">Mídia salva</span> Evidência será vinculada ao criar ou vincular protocolo.</small>`;
  if (media.error) return `<br><small><span class="badge danger">Mídia pendente</span> ${escapeHtml(media.error)}</small>`;
  return `<br><small><span class="badge warning">Mídia pendente</span> Aguardando download para evidência.</small>`;
}

function whatsappTriageSuggestion(row = {}) {
  const payload = row.payloadJson || row.payload_json || {};
  const suggestion = payload.localTriageSuggestion || payload.triageSuggestion || {};
  const category = suggestion.categoryName || (state.bootstrap?.categories || []).find(c => c.id === (row.suggestedCategoryId || payload.suggestedCategoryId))?.name || '';
  const priority = suggestion.priority || row.suggestedPriority || payload.suggestedPriority || '';
  const confidence = suggestion.confidenceLabel || (suggestion.confidence ? `${Math.round(suggestion.confidence * 100)}%` : '');
  const pieces = [category, priorityLabels[priority] || priority, confidence ? `confiança ${confidence}` : ''].filter(Boolean);
  return pieces.length ? pieces.join(' · ') : 'triagem manual';
}

function whatsappTriageTable(rows = []) {
  if (!rows.length) return empty('Nenhuma mensagem recebida pelo WhatsApp ainda. Use a simulação local ou configure o webhook da Meta.');
  return `<div class="data-table-wrap"><table class="gov-table"><thead><tr><th>Status</th><th>Cidadão</th><th>Mensagem</th><th>Protocolo</th><th>Ações</th></tr></thead><tbody>${rows.map(row => {
    const linked = row.occurrence ? `${row.occurrence.protocol} · ${statusLabels[row.occurrence.status] || row.occurrence.status}` : 'Sem protocolo';
    const canTriage = !row.occurrenceId && !row.occurrence && !['CONVERTIDA_EM_OCORRENCIA','VINCULADA_A_PROTOCOLO'].includes(row.status);
    const triageActions = canTriage ? `<button class="gov-button small primary" data-wa-create-occurrence="${escapeHtml(row.id)}">Criar ocorrência</button><button class="gov-button small" data-wa-more-info="${escapeHtml(row.id)}">Solicitar dados</button><button class="gov-button small" data-wa-link-message="${escapeHtml(row.id)}">Vincular</button>` : '';
    return `<tr><td>${badgeWhatsappStatus(row.status)}</td><td>${escapeHtml(row.citizenPhone || 'Não informado')}<br><small>${fmtDate(row.createdAt)}</small></td><td>${escapeHtml(row.messageBody || '')}${whatsappMediaStatusHtml(row)}<br><small>Sugestão: ${escapeHtml(whatsappTriageSuggestion(row))}</small></td><td>${escapeHtml(linked)}</td><td><div class="quick-actions">${triageActions}<button class="gov-button small ghost" data-wa-archive="${escapeHtml(row.id)}">Arquivar</button></div>${row.preparedReply ? `<details class="prepared-reply"><summary>Resposta preparada</summary><p>${escapeHtml(row.preparedReply)}</p><button class="gov-button small" data-copy-text="${escapeHtml(row.preparedReply)}">Copiar resposta</button><button class="gov-button small primary" data-wa-send-prepared="${escapeHtml(row.id)}">Enviar WhatsApp real</button></details>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function badgeWhatsappStatus(status = '') {
  const map = {
    RECEBIDA_PENDENTE_TRIAGEM: ['warning', 'Pendente'],
    AGUARDANDO_INFORMACOES: ['warning', 'Aguardando dados'],
    CONVERTIDA_EM_OCORRENCIA: ['success', 'Convertida'],
    VINCULADA_A_PROTOCOLO: ['success', 'Vinculada'],
    ARQUIVADA: ['', 'Arquivada'],
    ERRO_PROCESSAMENTO: 'danger'
  };
  const value = map[status] || ['', status || 'Mensagem'];
  const cls = Array.isArray(value) ? value[0] : value;
  const label = Array.isArray(value) ? value[1] : status;
  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function triageTable(rows = []) {
  if (!rows.length) return empty('Nenhuma ocorrência exige atenção especial neste momento.');
  return `<div class="data-table-wrap"><table class="gov-table"><thead><tr><th>Risco</th><th>Protocolo</th><th>Local/assunto</th><th>Setor</th><th>SLA</th><th>Ações rápidas</th></tr></thead><tbody>${rows.map(occ => {
    const [cls, label] = operationalRiskLabel(occ);
    const h = hoursUntil(occ.slaDueAt);
    const sla = h === null ? '—' : h < 0 ? `${Math.abs(h)}h vencido` : `${h}h restantes`;
    return `<tr><td><span class="badge ${cls}">${escapeHtml(label)}</span></td><td><strong>${escapeHtml(occ.protocol)}</strong><br>${badgePriority(occ.priority)}</td><td>${escapeHtml(occ.title)}<br><small>${escapeHtml([occ.address, occ.neighborhood?.name].filter(Boolean).join(' · ') || 'Sem local informado')}</small></td><td>${escapeHtml(occ.department?.name || 'Não atribuído')}<br><small>${escapeHtml(occ.assignedAgent?.name || 'Sem agente')}</small></td><td>${escapeHtml(sla)}<br><small>${fmtDate(occ.slaDueAt)}</small></td><td><div class="quick-actions"><button class="gov-button small" data-quick-status="${escapeHtml(occ.id)}" data-status="EM_ANALISE">Analisar</button><button class="gov-button small" data-quick-status="${escapeHtml(occ.id)}" data-status="EM_EXECUCAO">Executar</button><button class="gov-button small" data-quick-status="${escapeHtml(occ.id)}" data-status="RESOLVIDO">Resolver</button><button class="gov-button small ghost" data-detail-occurrence="${escapeHtml(occ.id || occ.protocol)}">Detalhes</button></div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function panelOccurrences() {
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Ocorrências</h1><p>Lista operacional com filtros e ações de acompanhamento.</p></div><button class="gov-button small" data-refresh-panel>Atualizar</button></div>
      <div class="gov-section__body">
        <form class="filters" id="occurrenceFilters">
          <div class="gov-field"><label>Busca</label><input name="q" placeholder="Protocolo, assunto, endereço ou referência" /></div>
          <div class="gov-field"><label>Status</label><select name="status"><option value="">Todos</option>${Object.entries(statusLabels).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="gov-field"><label>Prioridade</label><select name="priority"><option value="">Todas</option>${Object.entries(priorityLabels).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="gov-field"><label>Categoria</label><select name="categoryId"><option value="">Todas</option>${(state.bootstrap.categories || []).map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="gov-field"><label>Evidências</label><select name="evidence"><option value="">Todas</option><option value="with">Com anexo</option><option value="without">Sem anexo</option></select></div>
          <div class="gov-field"><label>Origem</label><select name="origin"><option value="">Todas</option><option value="portal">Portal</option><option value="whatsapp">WhatsApp</option><option value="painel">Painel</option></select></div>
          <button class="gov-button" type="submit">Filtrar</button>
        </form>
        <div id="occurrenceList">${occurrenceTable(state.occurrences)}</div>
      </div>
    </section>
  `;
}

function panelStructure() {
  const cityId = state.user?.cityId || state.bootstrap.city.id;
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Bairros e setores</h1><p>Estrutura mínima usada para organizar encaminhamento das ocorrências.</p></div></div>
      <div class="gov-section__body grid-2">
        <div>${miniList('Bairros cadastrados', state.panelData.neighborhoods, 'name')}
          <form class="form-grid" data-create-neighborhood style="margin-top:12px"><input type="hidden" name="cityId" value="${escapeHtml(cityId)}" /><div class="gov-field"><label>Novo bairro/região</label><input name="name" required /></div><div style="align-self:end"><button class="gov-button" type="submit">Adicionar</button></div></form>
        </div>
        <div>${miniList('Setores responsáveis', state.panelData.departments, 'name')}
          <form class="form-grid" data-create-department style="margin-top:12px"><input type="hidden" name="cityId" value="${escapeHtml(cityId)}" /><div class="gov-field"><label>Novo setor</label><input name="name" required /></div><div class="gov-field"><label>Descrição</label><input name="description" /></div><div class="full"><button class="gov-button" type="submit">Adicionar setor</button></div></form>
        </div>
      </div>
    </section>
  `;
}


function panelWhatsApp() {
  const cityId = state.user?.cityId || state.bootstrap.city.id;
  const departments = state.panelData.departments || [];
  const wa = state.panelData.whatsapp || { channel: null, events: [], messages: [], completeness: { filled: 0, total: 6, percent: 0 } };
  const ch = wa.channel || {};
  const canEdit = ['SUPER_ADMIN','CITY_ADMIN'].includes(state.user?.role);
  const webhookUrl = `${location.origin}/api/webhooks/whatsapp/${encodeURIComponent(cityId)}`;
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>WhatsApp Business oficial</h1><p>Canal real da cidade contratante. O cliente configura as credenciais da Meta no próprio painel; o CidadeOS usa a Cloud API para webhook, triagem, envio de texto, templates e mídia recebida.</p></div><button class="gov-button small" data-refresh-panel>Atualizar</button></div>
      <div class="gov-section__body">
        <div class="whatsapp-status-grid">
          <div class="stat-official ${ch.enabled ? 'success' : 'warning'}"><strong>${ch.enabled ? 'Ativo' : 'Inativo'}</strong><span>Status do canal</span></div>
          <div class="stat-official"><strong>${wa.completeness?.percent || 0}%</strong><span>Configuração preenchida</span></div>
          <div class="stat-official"><strong>${escapeHtml(ch.connectionStatus || 'PENDENTE_CONFIGURACAO')}</strong><span>Status Cloud API</span></div>
          <div class="stat-official"><strong>${fmtDate(ch.lastVerifiedAt)}</strong><span>Último teste</span></div>
        </div>
        <div class="notice-box"><strong>Importante:</strong> Access Token, App Secret e Verify Token não são exibidos depois de salvos. Use os campos novamente apenas quando precisar substituir as credenciais.</div>
      </div>
    </section>

    <section class="gov-section">
      <div class="gov-section__header"><div><h2>Configuração da cidade</h2><p>Preencha com os dados oficiais do WhatsApp Business/Meta da prefeitura, secretaria ou organização contratante.</p></div></div>
      <div class="gov-section__body">
        <form class="form-grid whatsapp-form" data-whatsapp-config>
          <input type="hidden" name="cityId" value="${escapeHtml(cityId)}" />
          <div class="gov-field"><label>Nome do canal</label><input name="channelName" value="${escapeHtml(ch.channelName || 'WhatsApp oficial')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Número oficial com DDI/DDD</label><input name="officialPhone" placeholder="5511999999999" value="${escapeHtml(ch.officialPhone || '')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Telefone para exibição</label><input name="displayPhone" placeholder="+55 11 99999-9999" value="${escapeHtml(ch.displayPhone || '')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Setor padrão</label><select name="defaultDepartmentId" ${canEdit ? '' : 'disabled'}><option value="">Selecione</option>${departments.map(dep => `<option value="${escapeHtml(dep.id)}" ${ch.defaultDepartmentId === dep.id ? 'selected' : ''}>${escapeHtml(dep.name)}</option>`).join('')}</select></div>
          <div class="gov-field"><label>Horário de atendimento</label><input name="businessHours" value="${escapeHtml(ch.businessHoursJson?.weekdays || '08:00 às 17:00')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Aviso emergencial</label><input name="emergencyNotice" value="${escapeHtml(ch.businessHoursJson?.emergencyNotice || 'Em risco imediato, acione os canais emergenciais competentes.')}" ${canEdit ? '' : 'disabled'} /></div>

          <div class="gov-field"><label>WABA ID <small>${escapeHtml(ch.wabaIdMasked || 'não salvo')}</small></label><input name="wabaId" placeholder="Cole o WhatsApp Business Account ID" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Phone Number ID <small>${escapeHtml(ch.phoneNumberIdMasked || 'não salvo')}</small></label><input name="phoneNumberId" placeholder="Cole o Phone Number ID" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>App ID <small>${escapeHtml(ch.appIdMasked || 'não salvo')}</small></label><input name="appId" placeholder="Cole o App ID" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>App Secret <small>${escapeHtml(ch.appSecretMasked || 'não salvo')}</small></label><input name="appSecret" type="password" placeholder="Cole para salvar/substituir" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Access Token <small>${escapeHtml(ch.accessTokenMasked || 'não salvo')}</small></label><input name="accessToken" type="password" placeholder="Token permanente/sistema da Meta" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Verify Token <small>${escapeHtml(ch.webhookVerifyTokenMasked || 'gerado ao salvar')}</small></label><input name="webhookVerifyToken" placeholder="Pode deixar vazio para gerar" ${canEdit ? '' : 'disabled'} /></div>

          <div class="gov-field"><label>Template protocolo criado</label><input name="templateProtocolCreated" value="${escapeHtml(ch.templatesJson?.protocolCreated || 'protocolo_criado')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Template status atualizado</label><input name="templateStatusUpdated" value="${escapeHtml(ch.templatesJson?.statusUpdated || 'status_atualizado')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Template alerta por bairro</label><input name="templateNeighborhoodAlert" value="${escapeHtml(ch.templatesJson?.neighborhoodAlert || 'alerta_bairro')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Webhook URL para colar na Meta</label><input readonly value="${escapeHtml(webhookUrl)}" /></div>

          <div class="gov-field full"><label>Mensagem de boas-vindas</label><textarea name="defaultWelcomeMessage" ${canEdit ? '' : 'disabled'}>${escapeHtml(ch.defaultWelcomeMessage || '')}</textarea></div>
          <div class="gov-field"><label>Mensagem de protocolo gerado</label><input name="protocolCreatedMessage" value="${escapeHtml(ch.protocolCreatedMessage || 'Sua solicitação foi registrada com sucesso. Protocolo: {{protocol}}.')}" ${canEdit ? '' : 'disabled'} /></div>
          <div class="gov-field"><label>Mensagem de status atualizado</label><input name="statusUpdatedMessage" value="${escapeHtml(ch.statusUpdatedMessage || 'Seu protocolo {{protocol}} foi atualizado para {{status}}.')}" ${canEdit ? '' : 'disabled'} /></div>
          <label class="check-field full"><input type="checkbox" name="enabled" value="1" ${ch.enabled ? 'checked' : ''} ${canEdit ? '' : 'disabled'} /> Ativar canal para exibição pública e testes internos</label>
          <div class="full form-actions">${canEdit ? '<button class="gov-button primary" type="submit">Salvar configuração</button><button class="gov-button" type="button" data-whatsapp-test>Testar Cloud API</button>' : '<span class="muted-text">Seu perfil pode consultar, mas não alterar credenciais.</span>'}<a class="gov-button ghost" href="#/whatsapp-tutorial">Abrir tutorial mastigado</a></div>
        </form>
      </div>
    </section>

    <section class="civic-grid-2">
      <article class="gov-section no-margin"><div class="gov-section__header"><h2>Eventos recebidos</h2></div><div class="gov-section__body">${whatsappEventsTable(wa.events || [])}</div></article>
      <article class="gov-section no-margin"><div class="gov-section__header"><h2>Mensagens operacionais</h2></div><div class="gov-section__body">${whatsappMessagesTable(wa.messages || [])}</div></article>
    </section>
  `;
}

function whatsappEventsTable(rows = []) {
  if (!rows.length) return empty('Nenhum evento de webhook registrado ainda.');
  return `<div class="data-table-wrap"><table class="gov-table compact"><thead><tr><th>Data</th><th>Evento</th><th>Processado</th></tr></thead><tbody>${rows.map(row => `<tr><td>${fmtDate(row.createdAt)}</td><td>${escapeHtml(row.eventType)}</td><td>${row.processed ? 'Sim' : 'Pendente'}</td></tr>`).join('')}</tbody></table></div>`;
}
function whatsappMessagesTable(rows = []) {
  if (!rows.length) return empty('Nenhuma mensagem vinculada ao canal ainda.');
  return `<div class="data-table-wrap"><table class="gov-table compact"><thead><tr><th>Data</th><th>Status</th><th>Direção</th><th>Conteúdo</th></tr></thead><tbody>${rows.map(row => `<tr><td>${fmtDate(row.createdAt)}</td><td>${badgeWhatsappStatus(row.status)}</td><td>${escapeHtml(row.direction || '')}</td><td>${escapeHtml(row.messageBody || row.message_body || '')}${row.occurrence ? `<br><small>Protocolo: ${escapeHtml(row.occurrence.protocol)}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}

async function pageWhatsAppPublicGuide() {
  const boot = await loadBootstrap();
  const webhookUrl = `${location.origin}/api/webhooks/whatsapp/${escapeHtml(boot.city.id)}`;
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><span class="section-kicker">Tutorial do cliente</span><h1>Como configurar o WhatsApp Business oficial</h1><p>Passo a passo para a cidade contratante conectar o próprio número oficial ao CidadeOS AI. O sistema não usa número fixo da plataforma.</p></div></div>
      <div class="gov-section__body tutorial-steps">
        ${tutorialStep('1', 'Acesse o Meta Business Suite', 'Entre na conta empresarial da prefeitura, secretaria ou organização. Confirme que você tem permissão de administrador.', 'https://business.facebook.com/')}
        ${tutorialStep('2', 'Abra o WhatsApp Manager', 'No menu da Meta, acesse Contas > Contas do WhatsApp. Copie o WABA ID da conta que será usada no atendimento.', 'https://business.facebook.com/wa/manage/')}
        ${tutorialStep('3', 'Acesse Meta for Developers', 'Entre em My Apps, abra o aplicativo conectado ao WhatsApp e vá em WhatsApp > Configuração/Quickstart.', 'https://developers.facebook.com/apps/')}
        ${tutorialStep('4', 'Copie o Phone Number ID', 'Na tela de WhatsApp do app, copie o Phone Number ID do número oficial. Esse ID identifica o telefone que enviará e receberá mensagens.', 'https://developers.facebook.com/docs/whatsapp/cloud-api/')}
        ${tutorialStep('5', 'Gere ou cole o Access Token', 'Use token permanente/sistema com permissões adequadas. Nunca envie esse token por WhatsApp, print ou e-mail sem proteção.', 'https://developers.facebook.com/docs/whatsapp/business-management-api/get-started')}
        ${tutorialStep('6', 'Configure o Webhook', `Cole a URL ${webhookUrl} no painel da Meta e use o Verify Token gerado/salvo no painel do CidadeOS AI.`, 'https://developers.facebook.com/docs/graph-api/webhooks/')}
        ${tutorialStep('7', 'Configure templates', 'Crie e aprove templates como protocolo_criado, status_atualizado e alerta_bairro antes de usar mensagens ativas fora da janela de atendimento.', 'https://developers.facebook.com/docs/whatsapp/message-templates/')}
        ${tutorialStep('8', 'Volte ao CidadeOS e teste', 'No painel interno, abra WhatsApp Business, salve os dados, execute o teste local e só então ative o canal para a cidade.')}
      </div>
    </section>
    <section class="gov-section"><div class="gov-section__header"><h2>Onde cada informação entra no CidadeOS AI</h2></div><div class="gov-section__body"><div class="data-table-wrap"><table class="gov-table"><thead><tr><th>Campo</th><th>Onde encontrar</th><th>Observação</th></tr></thead><tbody>
      <tr><td>WABA ID</td><td>WhatsApp Manager / Conta do WhatsApp</td><td>Identifica a conta oficial de WhatsApp Business.</td></tr>
      <tr><td>Phone Number ID</td><td>Meta for Developers > App > WhatsApp</td><td>Identifica o número usado para mensagens.</td></tr>
      <tr><td>App ID e App Secret</td><td>Meta for Developers > Configurações do app</td><td>Credenciais técnicas do aplicativo.</td></tr>
      <tr><td>Access Token</td><td>Usuário do sistema/token permanente na Meta</td><td>Fica salvo mascarado; nunca aparece no frontend.</td></tr>
      <tr><td>Webhook URL</td><td>Gerado pelo CidadeOS AI</td><td>Cole na Meta para receber mensagens e status.</td></tr>
      <tr><td>Verify Token</td><td>Gerado ou preenchido no CidadeOS AI</td><td>Usado pela Meta para validar o webhook.</td></tr>
    </tbody></table></div></div></section>
  `;
}
function tutorialStep(num, title, text, url='') { return `<article class="tutorial-step"><strong>${num}</strong><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Abrir referência oficial</a>` : ''}</div></article>`; }

function panelReports() {
  const r = state.panelData.report;
  const m = r?.metrics || { total: 0, open: 0, resolved: 0, overdue: 0, critical: 0, byCategory: [], byNeighborhood: [] };
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Relatório mensal</h1><p>Resumo do mês atual para acompanhamento administrativo. Exportação PDF fica preparada para fase futura.</p></div><button class="gov-button small" data-generate-report>Gerar registro do mês</button></div>
      <div class="gov-section__body grid-4">
        <div class="stat-official"><strong>${m.total}</strong><span>Total no mês</span></div>
        <div class="stat-official warning"><strong>${m.open}</strong><span>Em andamento</span></div>
        <div class="stat-official success"><strong>${m.resolved}</strong><span>Resolvidas</span></div>
        <div class="stat-official danger"><strong>${m.overdue}</strong><span>Atrasadas</span></div>
      </div>
    </section>
    <section class="gov-section"><div class="gov-section__header"><h2>Resumo por categoria e bairro</h2></div><div class="gov-section__body grid-2">${miniTable('Categorias', m.byCategory)}${miniTable('Bairros', m.byNeighborhood)}</div></section>
    <section class="gov-section"><div class="gov-section__header"><h2>Ocorrências do mês</h2></div><div class="gov-section__body">${occurrenceTable(r?.occurrences || [])}</div></section>
  `;
}

function panelAudit() {
  const logs = state.panelData.audit?.auditLogs || [];
  return `
    <section class="gov-section">
      <div class="gov-section__header"><div><h1>Auditoria</h1><p>Registro das ações relevantes realizadas no sistema.</p></div></div>
      <div class="gov-section__body">
        ${logs.length ? `<div class="data-table-wrap"><table class="gov-table"><thead><tr><th>Data</th><th>Ação</th><th>Entidade</th><th>Identificação</th></tr></thead><tbody>${logs.map(log => `<tr><td>${fmtDate(log.createdAt)}</td><td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.entityType || '')}</td><td>${escapeHtml(log.entityId || '')}</td></tr>`).join('')}</tbody></table></div>` : empty('Nenhum registro de auditoria disponível para este perfil.')}
      </div>
    </section>
  `;
}

function miniTable(title, rows = [], labels = null) {
  const body = rows?.length ? rows.map(row => `<tr><td>${escapeHtml(labels?.[row.label] || row.label || 'Não informado')}</td><td><strong>${row.value}</strong></td></tr>`).join('') : `<tr><td colspan="2">Sem dados suficientes no momento.</td></tr>`;
  return `<div><h3 style="margin:0 0 8px;color:#10213a">${escapeHtml(title)}</h3><div class="data-table-wrap"><table class="gov-table compact"><thead><tr><th>Descrição</th><th>Total</th></tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function miniList(title, rows = [], key = 'name') {
  return `<h3 style="margin:0 0 8px;color:#10213a">${escapeHtml(title)}</h3><div class="data-table-wrap"><table class="gov-table compact"><thead><tr><th>Nome</th><th>Situação</th></tr></thead><tbody>${rows.length ? rows.map(item => `<tr><td>${escapeHtml(item[key])}</td><td>${item.active === false ? 'Inativo' : 'Ativo'}</td></tr>`).join('') : `<tr><td colspan="2">Nenhum cadastro encontrado.</td></tr>`}</tbody></table></div>`;
}

function occurrenceTable(rows = []) {
  if (!rows.length) return empty('Nenhuma ocorrência encontrada para os filtros atuais.');
  return `<div class="data-table-wrap"><table class="gov-table"><thead><tr><th>Risco</th><th>Protocolo</th><th>Assunto</th><th>Categoria</th><th>Situação</th><th>Prioridade</th><th>Setor</th><th>Data</th><th>Ação</th></tr></thead><tbody>${rows.map(occ => {
    const [riskClass, riskLabel] = operationalRiskLabel(occ);
    return `<tr><td><span class="badge ${riskClass}">${escapeHtml(riskLabel)}</span></td><td><strong>${escapeHtml(occ.protocol)}</strong></td><td>${escapeHtml(occ.title)}<br><small>${escapeHtml(occ.neighborhood?.name || 'Sem bairro informado')}</small></td><td>${escapeHtml(occ.category?.name || '—')}</td><td>${badgeStatus(occ.status)}</td><td>${badgePriority(occ.priority)}</td><td>${escapeHtml(occ.department?.name || 'Não atribuído')}<br><small>${escapeHtml(occ.assignedAgent?.name || 'Sem agente')}</small></td><td>${fmtDate(occ.createdAt)}</td><td><div class="quick-actions"><button class="gov-button small" data-detail-occurrence="${escapeHtml(occ.id || occ.protocol)}">Detalhes</button>${!isClosedStatus(occ.status) ? `<button class="gov-button small ghost" data-quick-status="${escapeHtml(occ.id)}" data-status="EM_ANALISE">Analisar</button>` : ''}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function renderAlertsList(alerts = []) {
  if (!alerts.length) return empty('Nenhum alerta oficial ativo no momento.');
  return `<div class="data-table-wrap"><table class="gov-table"><thead><tr><th>Tipo</th><th>Comunicado</th><th>Categoria</th><th>Publicação</th></tr></thead><tbody>${alerts.map(alert => `<tr><td><span class="badge ${alert.severity === 'WARNING' ? 'warning' : alert.severity === 'CRITICAL' ? 'danger' : 'info'}">${escapeHtml(severityLabels[alert.severity] || alert.severity || 'Info')}</span></td><td><strong>${escapeHtml(alert.title)}</strong><br>${escapeHtml(alert.message)}</td><td>${escapeHtml(alert.category || 'Sistema')}</td><td>${fmtDate(alert.startsAt || alert.createdAt)}</td></tr>`).join('')}</tbody></table></div>`;
}

function empty(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function pageNotFound() {
  return `<section class="gov-section"><div class="gov-section__header"><h1>Página não encontrada</h1></div><div class="gov-section__body"><p>O endereço solicitado não foi localizado.</p><a class="gov-button" href="#/">Voltar para a página inicial</a></div></section>`;
}

function bindServiceSearch() {
  const input = document.querySelector('#serviceSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const value = input.value.trim().toLowerCase();
    document.querySelectorAll('[data-service-card]').forEach(card => {
      const haystack = card.dataset.search || '';
      card.hidden = Boolean(value) && !haystack.includes(value);
    });
  });
}

function bindOccurrenceForm() {
  const form = document.querySelector('#occurrenceForm');
  if (!form) return;
  const categorySelect = form.querySelector('[name="categoryId"]');
  const subSelect = form.querySelector('[name="subcategoryId"]');
  const updateSub = () => {
    const categoryId = categorySelect.value;
    const subs = (state.bootstrap.subcategories || []).filter(s => s.categoryId === categoryId);
    subSelect.innerHTML = `<option value="">Selecione</option>${subs.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('')}`;
  };
  categorySelect.addEventListener('change', updateSub);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = 'Registrando...';
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const file = form.attachment.files?.[0];
      if (file) {
        data.attachmentDataUrl = await readFileDataUrl(file);
        data.attachmentFileName = file.name || 'foto-ocorrencia';
      }
      delete data.attachment;
      const result = await request('/api/public/occurrences', { method: 'POST', body: JSON.stringify(data) });
      state.lastProtocol = result.occurrence.protocol;
      sessionStorage.setItem('cidadeos_last_protocol', state.lastProtocol);
      toast(`Ocorrência registrada. Protocolo ${state.lastProtocol}.`);
      navigate('/consultar');
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Registrar ocorrência e gerar protocolo';
    }
  });
}

async function readFileDataUrl(file) {
  const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
  if (!allowed.includes(file.type)) throw new Error('Tipo de arquivo não permitido. Use jpg, png, webp ou pdf.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande. Use arquivo de até 5 MB.');
  const processed = file.type.startsWith('image/') ? await compressImageFile(file) : file;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(processed);
  });
}
async function compressImageFile(file) {
  if (!file.type.startsWith('image/') || file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}

function bindProtocolSearch() {
  const form = document.querySelector('#protocolForm');
  const result = document.querySelector('#protocolResult');
  if (!form || !result) return;
  const consult = async (protocol) => {
    result.innerHTML = empty('Consultando protocolo...');
    try {
      const data = await request(`/api/public/occurrences/${encodeURIComponent(protocol.trim())}`);
      state.lastProtocol = data.occurrence.protocol;
      sessionStorage.setItem('cidadeos_last_protocol', state.lastProtocol);
      result.innerHTML = renderProtocolResult(data.occurrence);
    } catch (error) {
      result.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    }
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); consult(form.protocol.value); });
  if (state.lastProtocol) consult(state.lastProtocol);
}

function renderProtocolResult(occ) {
  return `
    <div class="protocol-card">
      <div class="protocol-card__top">
        <div><span class="section-kicker">Comprovante digital de acompanhamento</span><h2>Protocolo ${escapeHtml(occ.protocol)}</h2></div>
        <button class="gov-button small no-print" type="button" onclick="window.print()">Imprimir</button>
      </div>
      <div class="protocol-status-grid">
        <div><span>Situação atual</span>${badgeStatus(occ.status)}</div>
        <div><span>Prioridade</span>${badgePriority(occ.priority)}</div>
        <div><span>Setor responsável</span><strong>${escapeHtml(occ.department || 'Aguardando triagem')}</strong></div>
        <div><span>Previsão inicial</span><strong>${fmtDate(occ.slaDueAt)}</strong></div>
      </div>
      <div class="protocol-detail-grid">
        <section><h3>Dados da solicitação</h3><p><strong>Assunto:</strong> ${escapeHtml(occ.title)}</p><p><strong>Categoria:</strong> ${escapeHtml([occ.category, occ.subcategory].filter(Boolean).join(' · ') || 'Não informada')}</p><p><strong>Local:</strong> ${escapeHtml([occ.address, occ.referencePoint, occ.neighborhood].filter(Boolean).join(' · ') || 'Não informado')}</p><p><strong>Data de abertura:</strong> ${fmtDate(occ.createdAt)}</p></section>
        <section><h3>Próximas etapas</h3>${renderNextSteps(occ)}<p class="muted-text">Última mensagem pública: ${escapeHtml(occ.publicMessage || 'Sem atualização pública no momento.')}</p></section>
      </div>
      <section><h3>Descrição informada</h3><p>${escapeHtml(occ.description)}</p></section>
      ${(occ.attachments || []).length ? `<section><h3>Anexos públicos</h3>${renderAttachmentGallery(occ.attachments || [])}</section>` : ''}
      <section><h3>Histórico público</h3>${renderProtocolTimeline(occ.publicHistory || [])}</section>
      <div class="hero-actions no-print"><a class="gov-button" href="#/nova-ocorrencia">Abrir nova ocorrência</a><a class="gov-button" href="#/alertas">Ver alertas oficiais</a></div>
    </div>
  `;
}

function renderNextSteps(occ) {
  const status = occ.status || 'RECEBIDO';
  const steps = [
    ['RECEBIDO', 'Recebimento do protocolo'],
    ['EM_ANALISE', 'Triagem e validação das informações'],
    ['ENCAMINHADO', 'Encaminhamento ao setor responsável'],
    ['EM_EXECUCAO', 'Atendimento ou vistoria em andamento'],
    ['RESOLVIDO', 'Conclusão e registro da solução']
  ];
  const currentIndex = Math.max(0, steps.findIndex(([key]) => key === status));
  return `<ol class="mini-progress">${steps.map(([key, label], index) => `<li class="${index <= currentIndex ? 'done' : ''}"><span>${index + 1}</span>${escapeHtml(label)}</li>`).join('')}</ol>`;
}

function renderProtocolTimeline(items) {
  if (!items.length) return empty('Ainda não há histórico público além do registro inicial.');
  return `<ul class="timeline">${items.map(item => `<li><strong>${escapeHtml(statusLabels[item.status] || item.status)}</strong><br>${escapeHtml(item.publicMessage || 'Atualização registrada.')}<br><small>${fmtDate(item.createdAt)}</small></li>`).join('')}</ul>`;
}

function bindLogin() {
  const form = document.querySelector('#loginForm');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const data = await request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem('cidadeos_token', data.token);
      localStorage.setItem('cidadeos_user', JSON.stringify(data.user));
      toast('Acesso realizado com sucesso.');
      navigate('/painel');
    } catch (error) {
      toast(error.message);
    }
  });
}

function bindPanel() {
  document.querySelectorAll('[data-panel-tab]').forEach(btn => btn.addEventListener('click', async () => {
    state.panelTab = btn.dataset.panelTab;
    localStorage.setItem('cidadeos_panel_tab', state.panelTab);
    await render();
  }));
  document.querySelectorAll('[data-refresh-panel]').forEach(btn => btn.addEventListener('click', async () => {
    state.panelData = null;
    toast('Painel atualizado.');
    await render();
  }));
  document.querySelectorAll('[data-detail-occurrence]').forEach(btn => btn.addEventListener('click', async () => openOccurrenceDetail(btn.dataset.detailOccurrence)));
  document.querySelectorAll('[data-quick-status]').forEach(btn => btn.addEventListener('click', async () => {
    await request(`/api/occurrences/${encodeURIComponent(btn.dataset.quickStatus)}/status`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status, publicMessage: `Ocorrência atualizada para ${statusLabels[btn.dataset.status] || btn.dataset.status}.`, comment: 'Ação rápida pela fila operacional.' }) });
    state.panelData = null;
    toast('Status atualizado pela ação rápida.');
    await render();
  }));
  document.querySelectorAll('[data-print-page]').forEach(btn => btn.addEventListener('click', () => window.print()));
  const filters = document.querySelector('#occurrenceFilters');
  if (filters) filters.addEventListener('submit', async (event) => {
    event.preventDefault();
    const params = new URLSearchParams(Object.fromEntries(new FormData(filters).entries()));
    [...params.entries()].forEach(([key, value]) => { if (!value) params.delete(key); });
    const data = await request(`/api/occurrences?${params.toString()}`);
    state.occurrences = data.occurrences || [];
    document.querySelector('#occurrenceList').innerHTML = occurrenceTable(state.occurrences);
    document.querySelectorAll('[data-detail-occurrence]').forEach(btn => btn.addEventListener('click', async () => openOccurrenceDetail(btn.dataset.detailOccurrence)));
    document.querySelectorAll('[data-quick-status]').forEach(btn => btn.addEventListener('click', async () => {
      await request(`/api/occurrences/${encodeURIComponent(btn.dataset.quickStatus)}/status`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status, publicMessage: `Ocorrência atualizada para ${statusLabels[btn.dataset.status] || btn.dataset.status}.`, comment: 'Ação rápida pela lista operacional.' }) });
      state.panelData = null;
      toast('Status atualizado.');
      await render();
    }));
  });
  const neighForm = document.querySelector('[data-create-neighborhood]');
  if (neighForm) neighForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(neighForm).entries());
    await request(`/api/cities/${data.cityId}/neighborhoods`, { method: 'POST', body: JSON.stringify(data) });
    state.panelData = null; state.bootstrap = null;
    toast('Bairro/região cadastrado.');
    await render();
  });
  const depForm = document.querySelector('[data-create-department]');
  if (depForm) depForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(depForm).entries());
    await request(`/api/cities/${data.cityId}/departments`, { method: 'POST', body: JSON.stringify(data) });
    state.panelData = null; state.bootstrap = null;
    toast('Setor cadastrado.');
    await render();
  });

  const waForm = document.querySelector('[data-whatsapp-config]');
  if (waForm) waForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(waForm).entries());
    payload.enabled = Boolean(payload.enabled);
    await request('/api/whatsapp/config', { method: 'PUT', body: JSON.stringify(payload) });
    state.panelData = null; state.bootstrap = null;
    toast('Configuração do WhatsApp Business salva com segurança.');
    await render();
  });
  const waTest = document.querySelector('[data-whatsapp-test]');
  if (waTest) waTest.addEventListener('click', async () => {
    const to = prompt('Opcional: informe um telefone com DDI/DDD para testar envio real. Deixe vazio para validar apenas a configuração.');
    const payload = to ? { to, messageBody: 'Teste oficial do CidadeOS AI via WhatsApp Cloud API.' } : {};
    const result = await request('/api/whatsapp/test', { method: 'POST', body: JSON.stringify(payload) });
    state.panelData = null;
    toast(result.message || 'Validação do WhatsApp registrada.');
    await render();
  });

  const simWa = document.querySelector('[data-simulate-whatsapp]');
  if (simWa) simWa.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(simWa).entries());
    await request('/api/whatsapp/simulate-message', { method: 'POST', body: JSON.stringify(payload) });
    state.panelData = null;
    toast('Mensagem de WhatsApp simulada e enviada para triagem.');
    await render();
  });
  document.querySelectorAll('[data-wa-create-occurrence]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.waCreateOccurrence;
    await request(`/api/whatsapp/messages/${encodeURIComponent(id)}/create-occurrence`, { method: 'POST', body: JSON.stringify({}) });
    state.panelData = null;
    toast('Mensagem convertida em ocorrência com protocolo.');
    await render();
  }));
  document.querySelectorAll('[data-wa-more-info]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.waMoreInfo;
    const result = await request(`/api/whatsapp/messages/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status: 'AGUARDANDO_INFORMACOES' }) });
    state.panelData = null;
    toast('Resposta preparada para solicitar mais informações.');
    await render();
  }));
  document.querySelectorAll('[data-wa-archive]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.waArchive;
    await request(`/api/whatsapp/messages/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status: 'ARQUIVADA' }) });
    state.panelData = null;
    toast('Mensagem arquivada.');
    await render();
  }));
  document.querySelectorAll('[data-wa-link-message]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.waLinkMessage;
    const protocol = prompt('Informe o protocolo existente para vincular, exemplo CID-2026-000001:');
    if (!protocol) return;
    await request(`/api/whatsapp/messages/${encodeURIComponent(id)}/link-occurrence`, { method: 'POST', body: JSON.stringify({ protocol }) });
    state.panelData = null;
    toast('Mensagem vinculada ao protocolo informado.');
    await render();
  }));
  document.querySelectorAll('[data-wa-send-prepared]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.waSendPrepared;
    const result = await request(`/api/whatsapp/messages/${encodeURIComponent(id)}/send-prepared`, { method: 'POST', body: JSON.stringify({}) });
    state.panelData = null;
    toast(result.sent ? 'Resposta enviada pela WhatsApp Cloud API.' : (result.error || 'Envio real indisponível; copie a resposta manualmente.'));
    await render();
  }));
  document.querySelectorAll('[data-copy-text]').forEach(button => button.addEventListener('click', async () => {
    const text = button.dataset.copyText || '';
    try { await navigator.clipboard.writeText(text); toast('Resposta copiada.'); } catch { toast(text); }
  }));

  const generate = document.querySelector('[data-generate-report]');
  if (generate) generate.addEventListener('click', async () => {
    await request('/api/reports/monthly/generate', { method: 'POST', body: JSON.stringify({}) });
    state.panelData = null;
    toast('Relatório mensal registrado.');
    await render();
  });
}

async function openOccurrenceDetail(id) {
  try {
    const data = await request(`/api/occurrences/${encodeURIComponent(id)}`);
    state.modalOccurrence = data.occurrence;
    await loadDuplicateInsights(data.occurrence);
    await render();
  } catch (error) {
    toast(error.message || 'Não foi possível abrir os detalhes.');
  }
}

function cacheDuplicateInsights(occ, insights) {
  if (!occ || !insights) return;
  state.duplicateInsights[occ.id] = insights;
  if (occ.protocol) state.duplicateInsights[occ.protocol] = insights;
}

function duplicateInsightsFor(occ) {
  return state.duplicateInsights[occ?.id] || state.duplicateInsights[occ?.protocol] || null;
}

async function loadDuplicateInsights(occ) {
  if (!occ?.id) return null;
  try {
    const insights = await request(`/api/occurrences/${encodeURIComponent(occ.id)}/duplicate-candidates`);
    cacheDuplicateInsights(occ, insights);
    return insights;
  } catch (error) {
    const fallback = { candidates: [], duplicateChildren: [], duplicateOf: null, error: error.message || 'Falha ao buscar duplicidades.' };
    cacheDuplicateInsights(occ, fallback);
    return fallback;
  }
}

async function refreshModalOccurrence(id, options = {}) {
  const refreshed = await request(`/api/occurrences/${encodeURIComponent(id)}`);
  state.modalOccurrence = refreshed.occurrence;
  if (options.duplicates) await loadDuplicateInsights(refreshed.occurrence);
  return refreshed.occurrence;
}

function renderTriageSuggestionPanel(occ) {
  const key = occ.id || occ.protocol;
  const suggestion = state.triageSuggestions[key];
  const mode = state.triageSuggestionModes[key] || 'view';
  const categories = state.bootstrap?.categories || [];
  const departments = state.panelData?.departments || state.bootstrap?.departments || [];
  const neighborhoods = state.bootstrap?.neighborhoods || [];
  if (!suggestion) {
    return `<div class="quick-actions"><button class="gov-button small primary" type="button" data-generate-triage-suggestion="${escapeHtml(key)}">Gerar sugestão</button></div>`;
  }
  const categoryName = suggestion.categoryName || categories.find(c => c.id === suggestion.categoryId)?.name || 'Triagem manual';
  const departmentName = suggestion.departmentName || departments.find(d => d.id === suggestion.departmentId)?.name || 'Não definido';
  const neighborhoodName = suggestion.probableNeighborhoodName || neighborhoods.find(n => n.id === suggestion.probableNeighborhoodId)?.name || 'Nao informado';
  const sourceLabel = suggestion.source === 'openai_assistive_v1' ? 'IA assistida' : suggestion.aiAvailable && suggestion.aiAttempted ? 'Fallback local' : 'Regras locais';
  const confidence = suggestion.confidence ? `${Math.round(Number(suggestion.confidence) * 100)}%` : suggestion.confidenceLabel || 'Baixa';
  const keywords = (suggestion.matchedKeywords || []).length ? suggestion.matchedKeywords.join(', ') : 'sem palavra-chave forte';
  const riskFactors = (suggestion.riskFactors || []).length ? suggestion.riskFactors.join(', ') : 'sem fator critico explicito';
  const missingFields = (suggestion.missingFields || []).length ? suggestion.missingFields.join(', ') : 'nenhum';
  const citizenResponse = suggestion.citizenResponse || suggestion.publicMessage || '';
  const duplicates = suggestion.duplicateCandidates || [];
  const duplicateHtml = duplicates.length
    ? `<ul class="triage-duplicates">${duplicates.map(item => `<li><strong>${escapeHtml(item.protocol || item.id)}</strong><span>${escapeHtml(item.title || 'Ocorrencia similar')}</span><small>${escapeHtml(`${Math.round(Number(item.score || 0) * 100)}% · ${item.reason || ''}`)}</small></li>`).join('')}</ul>`
    : `<p class="muted-text">Sem duplicidade forte encontrada.</p>`;
  const summary = `
    <div class="triage-ai-panel">
      <div class="triage-ai-panel__head">
        <span class="badge info">${escapeHtml(sourceLabel)}</span>
        <span class="muted-text">${escapeHtml(suggestion.aiError ? 'IA opcional indisponivel; fallback local ativo.' : `${suggestion.confidenceLabel || ''} ${confidence}`.trim())}</span>
      </div>
      <div class="protocol-status-grid admin">
        <div><span>Categoria provavel</span><strong>${escapeHtml(categoryName)}</strong></div>
        <div><span>Prioridade provavel</span>${badgePriority(suggestion.priority)}</div>
        <div><span>Setor provavel</span><strong>${escapeHtml(departmentName)}</strong></div>
        <div><span>SLA sugerido</span><strong>${escapeHtml(`${suggestion.slaHours || triageSlaHours(suggestion.priority)}h · ${fmtDate(suggestion.slaDueAt)}`)}</strong></div>
        <div><span>Risco</span>${badgeRisk(suggestion.riskLevel || 'MEDIO')}</div>
        <div><span>Bairro provavel</span><strong>${escapeHtml(neighborhoodName)}</strong></div>
        <div><span>Endereco provavel</span><strong>${escapeHtml(suggestion.probableAddress || 'Nao informado')}</strong></div>
        <div><span>Campos ausentes</span><strong>${escapeHtml(missingFields)}</strong></div>
      </div>
      <div class="triage-ai-grid">
        <div><h4>Resumo automatico</h4><p>${escapeHtml(suggestion.summary || suggestion.publicSummary || 'Resumo nao gerado.')}</p></div>
        <div><h4>Fatores de risco</h4><p>${escapeHtml(riskFactors)}</p></div>
        <div><h4>Possivel duplicidade</h4>${duplicateHtml}</div>
        <div><h4>Resposta sugerida ao cidadao</h4><p>${escapeHtml(citizenResponse || 'Sem resposta sugerida.')}</p></div>
      </div>
      <p class="muted-text">Base local: ${escapeHtml(keywords)}. ${escapeHtml(suggestion.reason || '')}</p>
    </div>
  `;
  if (mode === 'edit') {
    return `${summary}
      <form class="form-grid" data-apply-triage-edits="${escapeHtml(key)}">
        <div class="gov-field"><label>Categoria</label><select name="categoryId"><option value="">Manter atual</option>${categories.map(cat => `<option value="${escapeHtml(cat.id)}" ${suggestion.categoryId === cat.id ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`).join('')}</select></div>
        <div class="gov-field"><label>Setor</label><select name="departmentId"><option value="">Manter atual</option>${departments.map(dep => `<option value="${escapeHtml(dep.id)}" ${suggestion.departmentId === dep.id ? 'selected' : ''}>${escapeHtml(dep.name)}</option>`).join('')}</select></div>
        <div class="gov-field"><label>Prioridade</label><select name="priority">${Object.entries(priorityLabels).map(([k,v]) => `<option value="${k}" ${suggestion.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="gov-field full"><label>Mensagem pública</label><textarea name="publicMessage">${escapeHtml(citizenResponse || '')}</textarea></div>
        <div class="full quick-actions"><button class="gov-button small primary" type="submit">Aplicar ajustes</button><button class="gov-button small ghost" type="button" data-ignore-triage-suggestion="${escapeHtml(key)}">Ignorar</button></div>
      </form>`;
  }
  return `${summary}<div class="quick-actions"><button class="gov-button small primary" type="button" data-apply-triage-suggestion="${escapeHtml(key)}">Aplicar sugestão</button><button class="gov-button small" type="button" data-edit-triage-suggestion="${escapeHtml(key)}">Editar manualmente</button><button class="gov-button small ghost" type="button" data-ignore-triage-suggestion="${escapeHtml(key)}">Ignorar</button></div>`;
}

function renderDuplicateReference(item, options = {}) {
  if (!item) return '';
  const meta = [item.categoryName, item.neighborhoodName, fmtDate(item.createdAt)].filter(Boolean).join(' · ');
  const score = Number(item.score || 0);
  return `<article class="duplicate-card ${options.compact ? 'compact' : ''}">
    <div class="duplicate-card__main">
      <strong>${escapeHtml(item.protocol || item.id)}</strong>
      <span>${escapeHtml(item.title || 'Ocorrencia relacionada')}</span>
      <small>${escapeHtml(meta || 'Sem contexto adicional')}</small>
    </div>
    <div class="duplicate-card__meta">
      ${item.status ? badgeStatus(item.status) : ''}
      ${item.priority ? badgePriority(item.priority) : ''}
      ${score ? `<span class="duplicate-score">${Math.round(score * 100)}%</span>` : ''}
      ${item.linkedDuplicates ? `<small>${item.linkedDuplicates} agrupada(s)</small>` : ''}
    </div>
    ${options.actions ? `<div class="duplicate-card__actions">
      <button class="gov-button small" type="button" data-duplicate-candidate-action="link" data-occurrence-id="${escapeHtml(options.occurrenceId)}" data-candidate-id="${escapeHtml(item.id)}">Vincular</button>
      <button class="gov-button small danger" type="button" data-duplicate-candidate-action="archive" data-occurrence-id="${escapeHtml(options.occurrenceId)}" data-candidate-id="${escapeHtml(item.id)}">Vincular e arquivar</button>
    </div>` : ''}
    ${item.reason ? `<p>${escapeHtml(item.reason)}</p>` : ''}
  </article>`;
}

function renderDuplicatePanel(occ) {
  const insights = duplicateInsightsFor(occ);
  const candidates = insights?.candidates || [];
  const children = insights?.duplicateChildren || [];
  const linkedParent = insights?.duplicateOf || null;
  const candidateHtml = candidates.length
    ? `<div class="duplicate-list">${candidates.map(item => renderDuplicateReference(item, { actions: true, occurrenceId: occ.id })).join('')}</div>`
    : empty(insights?.error || 'Nenhuma ocorrencia semelhante forte encontrada agora.');
  const childrenHtml = children.length
    ? `<div class="duplicate-list compact">${children.map(item => renderDuplicateReference(item, { compact: true })).join('')}</div>`
    : `<p class="muted-text">Nenhuma outra ocorrencia agrupada neste protocolo.</p>`;
  return `
    <div class="duplicate-panel">
      ${linkedParent ? `<div class="notice-box"><strong>Duplicada de ${escapeHtml(linkedParent.protocol)}</strong><br><span>${escapeHtml(linkedParent.title || '')}</span></div>` : ''}
      <div class="duplicate-panel__section">
        <div class="duplicate-panel__head"><h4>Ocorrencias semelhantes</h4><button class="gov-button small ghost" type="button" data-refresh-duplicates="${escapeHtml(occ.id)}">Atualizar</button></div>
        ${candidateHtml}
      </div>
      <div class="duplicate-panel__section">
        <h4>Agrupadas neste protocolo</h4>
        ${childrenHtml}
      </div>
      <form class="form-grid duplicate-manual-form" data-duplicate-occurrence="${escapeHtml(occ.id)}">
        <div class="gov-field"><label>Protocolo ou ID principal</label><input name="duplicateOfId" placeholder="CID-2026-000001" /></div>
        <div class="gov-field"><label>Acao</label><select name="duplicateMode"><option value="link">Vincular como duplicada</option><option value="archive">Vincular e arquivar duplicada</option></select></div>
        <div class="full quick-actions"><button class="gov-button primary" type="submit">Confirmar vinculo</button></div>
      </form>
      <p class="muted-text">Nenhuma mesclagem e feita automaticamente; a decisao fica registrada no historico e na auditoria.</p>
    </div>
  `;
}

function renderOccurrenceModal(occ) {
  const departments = state.panelData?.departments || [];
  const users = (state.panelData?.users || []).filter(u => u.role !== 'CITIZEN');
  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal modal-drawer">
        <div class="modal__header"><div><span class="section-kicker">Detalhamento operacional</span><h2 id="modalTitle">${escapeHtml(occ.protocol)}</h2></div><button class="gov-button small" data-close-modal type="button">Fechar</button></div>
        <div class="modal__body">
          <div class="protocol-status-grid admin">
            <div><span>Status</span>${badgeStatus(occ.status)}</div>
            <div><span>Prioridade</span>${badgePriority(occ.priority)}</div>
            <div><span>Setor</span><strong>${escapeHtml(occ.department?.name || 'Não atribuído')}</strong></div>
            <div><span>Prazo estimado</span><strong>${fmtDate(occ.slaDueAt)}</strong></div>
          </div>
          <div class="protocol-detail-grid">
            <section><h3>Identificação</h3><p><strong>Tipo:</strong> ${escapeHtml(occ.subcategory?.name || 'Não informado')}</p><p><strong>Categoria:</strong> ${escapeHtml(occ.category?.name || 'Não informada')}</p><p><strong>Data de abertura:</strong> ${fmtDate(occ.createdAt)}</p><p><strong>Última atualização:</strong> ${fmtDate(occ.updatedAt)}</p></section>
            <section><h3>Localização</h3><p>${escapeHtml([occ.address, occ.referencePoint, occ.neighborhood?.name].filter(Boolean).join(' · ') || 'Não informado')}</p><p><strong>Solicitante:</strong> ${escapeHtml(occ.citizen?.name || 'Não informado')} ${occ.citizen?.phone ? `· ${escapeHtml(occ.citizen.phone)}` : ''}</p></section>
          </div>
          <section class="detail-block"><h3>Descrição da ocorrência</h3><p>${escapeHtml(occ.description)}</p></section>
          <section class="detail-block"><h3>Sugestão do sistema</h3>${renderTriageSuggestionPanel(occ)}</section>
          <section class="detail-block evidence-block"><div class="evidence-heading"><div><h3>Anexos e evidências</h3><p class="muted-text">Fotos, PDFs e documentos ligados à ocorrência. Cada item tem visibilidade e histórico operacional.</p></div><span class="evidence-count">${(occ.attachments || []).length} item(ns)</span></div>${renderAttachmentGallery(occ.attachments || [], { operational: true })}
            <form class="attachment-upload" data-upload-attachment="${escapeHtml(occ.id)}">
              <div class="gov-field"><label>Adicionar anexo</label><input type="file" name="attachment" accept="image/png,image/jpeg,image/webp,application/pdf" /><span class="form-help">Preview e compressão automática para imagens quando possível.</span></div>
              <div class="gov-field"><label>Visibilidade</label><select name="visibility"><option value="publica">Pública no protocolo</option><option value="interna">Interna no painel</option><option value="restrita">Restrita / admin</option></select></div>
              <div class="attachment-preview" data-attachment-preview>Prévia indisponível até selecionar arquivo.</div>
              <div style="align-self:end"><button class="gov-button small" type="submit">Enviar anexo</button></div>
            </form>
            <p class="muted-text">Arquivos permitidos: jpg, jpeg, png, webp ou pdf até 5 MB. Anexos internos e restritos não aparecem na consulta pública.</p>
          </section>
          <section class="detail-block"><h3>Próximas etapas sugeridas</h3>${renderNextSteps(occ)}<p class="muted-text">Mensagem pública atual: ${escapeHtml(occ.publicMessage || 'Sem atualização pública no momento.')}</p></section>
          <section class="detail-block"><h3>Checklist operacional por área</h3><ul class="check-list">${playbookFor(occ).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>

          <section class="gov-section tight"><div class="gov-section__header"><h3>Atualizar atendimento</h3></div><div class="gov-section__body">
            <form class="form-grid" data-update-occurrence="${escapeHtml(occ.id)}">
              <div class="gov-field"><label>Status</label><select name="status">${Object.entries(statusLabels).map(([k,v]) => `<option value="${k}" ${occ.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
              <div class="gov-field"><label>Prioridade</label><select name="priority">${Object.entries(priorityLabels).map(([k,v]) => `<option value="${k}" ${occ.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
              <div class="gov-field"><label>Departamento</label><select name="departmentId"><option value="">Manter atual</option>${departments.map(dep => `<option value="${escapeHtml(dep.id)}" ${occ.departmentId === dep.id ? 'selected' : ''}>${escapeHtml(dep.name)}</option>`).join('')}</select></div>
              <div class="gov-field"><label>Agente</label><select name="assignedAgentId"><option value="">Sem agente</option>${users.map(user => `<option value="${escapeHtml(user.id)}" ${occ.assignedAgentId === user.id ? 'selected' : ''}>${escapeHtml(user.name)} · ${escapeHtml(user.role)}</option>`).join('')}</select></div>
              <div class="gov-field full"><label>Mensagem pública</label><input name="publicMessage" value="${escapeHtml(occ.publicMessage || '')}" /></div>
              <div class="gov-field full"><label>Comentário interno</label><textarea name="comment" placeholder="Observação interna sobre o andamento"></textarea></div>
              <div class="full"><button class="gov-button primary" type="submit">Salvar atualização</button></div>
            </form>
          </div></section>

          <section class="gov-section tight"><div class="gov-section__header"><h3>Duplicidade e agrupamento</h3></div><div class="gov-section__body">${renderDuplicatePanel(occ)}</div></section>
          <section class="gov-section tight"><div class="gov-section__header"><h3>Histórico de movimentações</h3></div><div class="gov-section__body">${(occ.history || []).length ? `<ul class="timeline">${occ.history.map(item => `<li><strong>${escapeHtml(statusLabels[item.newStatus] || item.newStatus)}</strong><br>${escapeHtml(item.comment || item.publicMessage || 'Atualização registrada.')}<br><small>${fmtDate(item.createdAt)}</small></li>`).join('')}</ul>` : empty('Sem histórico adicional.')}</div></section>
        </div>
      </div>
    </div>
  `;
}


function renderAttachmentGallery(attachments = [], options = {}) {
  const visible = (attachments || []).filter(att => !att.archivedAt && !att.deletedAt);
  if (!visible.length) return empty('Nenhum anexo enviado para esta ocorrência.');
  const operational = Boolean(options.operational && state.user);
  return `<div class="attachment-gallery evidence-gallery">${visible.map(att => {
    const isImage = String(att.fileType || '').startsWith('image/');
    const label = visibilityLabel(att.visibility);
    const fileUrl = att.fileUrl || '#';
    return `<article class="attachment-card evidence-card" data-attachment-id="${escapeHtml(att.id || '')}">
      <a class="attachment-card__preview" href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">${isImage ? `<img src="${escapeHtml(fileUrl)}" alt="${escapeHtml(att.fileName || 'Anexo da ocorrência')}" loading="lazy" />` : `<span>${String(att.fileType || '').includes('pdf') ? 'PDF' : 'ARQ'}</span>`}</a>
      <div class="evidence-card__body">
        <strong title="${escapeHtml(att.fileName || 'anexo')}">${escapeHtml(att.fileName || 'anexo')}</strong>
        <small>${escapeHtml(label)} · ${formatBytes(att.sizeBytes || 0)} · ${fmtDate(att.createdAt)}</small>
        <small>Origem: ${escapeHtml(att.source || att.origin || 'registro')}</small>
      </div>
      <div class="evidence-card__actions">
        <a class="gov-button small ghost" href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">Abrir</a>
        <button class="gov-button small" type="button" data-copy-text="${escapeHtml(fileUrl)}">Copiar link</button>
        ${operational ? `<button class="gov-button small ghost" type="button" data-attachment-visibility="${escapeHtml(att.id)}" data-visibility="publica">Público</button><button class="gov-button small ghost" type="button" data-attachment-visibility="${escapeHtml(att.id)}" data-visibility="interna">Interno</button><button class="gov-button small ghost" type="button" data-attachment-visibility="${escapeHtml(att.id)}" data-visibility="restrita">Restrito</button><button class="gov-button small danger" type="button" data-attachment-archive="${escapeHtml(att.id)}">Arquivar</button><button class="gov-button small danger" type="button" data-attachment-remove="${escapeHtml(att.id)}">Remover vínculo</button>` : ''}
      </div>
    </article>`;
  }).join('')}</div>`;
}
function visibilityLabel(value = '') {
  const normalized = String(value || '').toUpperCase();
  if (['PUBLICA','PUBLIC'].includes(normalized)) return 'Público';
  if (['RESTRITA','RESTRICTED'].includes(normalized)) return 'Restrito';
  return 'Interno';
}
function formatBytes(bytes = 0) {
  const n = Number(bytes || 0);
  if (!n) return 'tamanho não informado';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function bindModalActions() {
  const form = document.querySelector('[data-update-occurrence]');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = form.dataset.updateOccurrence;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      await request(`/api/occurrences/${id}/priority`, { method: 'PATCH', body: JSON.stringify({ priority: data.priority }) });
      if (data.departmentId || data.assignedAgentId) await request(`/api/occurrences/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ departmentId: data.departmentId, assignedAgentId: data.assignedAgentId, publicMessage: data.publicMessage }) });
      await request(`/api/occurrences/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: data.status, publicMessage: data.publicMessage, comment: data.comment }) });
      if (data.comment?.trim()) await request(`/api/occurrences/${id}/comments`, { method: 'POST', body: JSON.stringify({ comment: data.comment, visibility: 'INTERNAL' }) });
      toast('Ocorrência atualizada.');
      state.panelData = null;
      const refreshed = await request(`/api/occurrences/${id}`);
      state.modalOccurrence = refreshed.occurrence;
      await render();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll('[data-generate-triage-suggestion]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.generateTriageSuggestion;
    const occ = state.modalOccurrence;
    try {
      const result = await request('/api/triage/suggest', { method: 'POST', body: JSON.stringify({ cityId: occ.cityId, occurrenceId: occ.id, protocol: occ.protocol, neighborhoodId: occ.neighborhoodId, title: occ.title, description: occ.description, address: occ.address, referencePoint: occ.referencePoint }) });
      state.triageSuggestions[id] = result.suggestion;
      state.triageSuggestionModes[id] = 'view';
      toast(result.suggestion?.source === 'openai_assistive_v1' ? 'Sugestao assistida gerada.' : 'Sugestao por fallback local gerada.');
      await render();
    } catch (error) {
      toast(error.message || 'Não foi possível gerar a sugestão.');
    }
  }));

  document.querySelectorAll('[data-apply-triage-suggestion]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.applyTriageSuggestion;
    const suggestion = state.triageSuggestions[id];
    if (!suggestion) return toast('Gere uma sugestão antes de aplicar.');
    try {
      await request(`/api/occurrences/${encodeURIComponent(id)}/triage-suggestion`, { method: 'PATCH', body: JSON.stringify({ suggestion }) });
      delete state.triageSuggestions[id];
      delete state.triageSuggestionModes[id];
      state.panelData = null;
      await refreshModalOccurrence(id, { duplicates: true });
      toast('Sugestão aplicada à ocorrência.');
      await render();
    } catch (error) {
      toast(error.message || 'Não foi possível aplicar a sugestão.');
    }
  }));

  document.querySelectorAll('[data-edit-triage-suggestion]').forEach(button => button.addEventListener('click', async () => {
    state.triageSuggestionModes[button.dataset.editTriageSuggestion] = 'edit';
    await render();
  }));

  document.querySelectorAll('[data-ignore-triage-suggestion]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.ignoreTriageSuggestion;
    delete state.triageSuggestions[id];
    delete state.triageSuggestionModes[id];
    toast('Sugestão ignorada.');
    await render();
  }));

  document.querySelectorAll('[data-apply-triage-edits]').forEach(editForm => editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = editForm.dataset.applyTriageEdits;
    const suggestion = state.triageSuggestions[id] || {};
    const data = Object.fromEntries(new FormData(editForm).entries());
    try {
      await request(`/api/occurrences/${encodeURIComponent(id)}/triage-suggestion`, { method: 'PATCH', body: JSON.stringify({ ...data, suggestion }) });
      delete state.triageSuggestions[id];
      delete state.triageSuggestionModes[id];
      state.panelData = null;
      const refreshed = await request(`/api/occurrences/${encodeURIComponent(id)}`);
      state.modalOccurrence = refreshed.occurrence;
      toast('Ajustes de triagem aplicados.');
      await render();
    } catch (error) {
      toast(error.message || 'Não foi possível aplicar os ajustes.');
    }
  }));

  const duplicateForm = document.querySelector('[data-duplicate-occurrence]');
  if (duplicateForm) duplicateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = duplicateForm.dataset.duplicateOccurrence;
    const data = Object.fromEntries(new FormData(duplicateForm).entries());
    const duplicateOfId = String(data.duplicateOfId || '').trim();
    if (!duplicateOfId) return toast('Informe o protocolo ou id principal.');
    const archiveDuplicate = data.duplicateMode === 'archive';
    if (!confirm(archiveDuplicate ? 'Vincular e arquivar esta duplicada?' : 'Vincular esta ocorrencia como duplicada?')) return;
    try {
      await request(`/api/occurrences/${encodeURIComponent(id)}/mark-duplicate`, { method: 'PATCH', body: JSON.stringify({ duplicateOfId, archiveDuplicate }) });
      toast(archiveDuplicate ? 'Ocorrencia vinculada e arquivada.' : 'Ocorrencia vinculada como duplicada.');
      state.panelData = null;
      await refreshModalOccurrence(id, { duplicates: true });
      await render();
    } catch (error) {
      toast(error.message);
    }
  });

  document.querySelectorAll('[data-duplicate-candidate-action]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.occurrenceId;
    const duplicateOfId = button.dataset.candidateId;
    const archiveDuplicate = button.dataset.duplicateCandidateAction === 'archive';
    if (!id || !duplicateOfId) return;
    if (!confirm(archiveDuplicate ? 'Vincular e arquivar esta duplicada?' : 'Vincular esta ocorrencia como duplicada?')) return;
    try {
      await request(`/api/occurrences/${encodeURIComponent(id)}/mark-duplicate`, { method: 'PATCH', body: JSON.stringify({ duplicateOfId, archiveDuplicate }) });
      toast(archiveDuplicate ? 'Ocorrencia vinculada e arquivada.' : 'Ocorrencia vinculada como duplicada.');
      state.panelData = null;
      await refreshModalOccurrence(id, { duplicates: true });
      await render();
    } catch (error) {
      toast(error.message || 'Nao foi possivel registrar duplicidade.');
    }
  }));

  document.querySelectorAll('[data-refresh-duplicates]').forEach(button => button.addEventListener('click', async () => {
    try {
      if (state.modalOccurrence) await loadDuplicateInsights(state.modalOccurrence);
      toast('Lista de duplicidades atualizada.');
      await render();
    } catch (error) {
      toast(error.message || 'Nao foi possivel atualizar duplicidades.');
    }
  }));


  const uploadForm = document.querySelector('[data-upload-attachment]');
  if (uploadForm) {
    const preview = uploadForm.querySelector('[data-attachment-preview]');
    uploadForm.attachment.addEventListener('change', () => {
      const file = uploadForm.attachment.files?.[0];
      if (!file || !preview) return;
      preview.innerHTML = file.type.startsWith('image/') ? `<img src="${URL.createObjectURL(file)}" alt="Prévia do anexo" />` : `<strong>${escapeHtml(file.name)}</strong><small>${formatBytes(file.size)}</small>`;
    });
    uploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = uploadForm.dataset.uploadAttachment;
      const file = uploadForm.attachment.files?.[0];
      if (!file) return toast('Selecione um arquivo para anexar.');
      const button = uploadForm.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Enviando...';
      try {
        const attachmentDataUrl = await readFileDataUrl(file);
        await request(`/api/occurrences/${encodeURIComponent(id)}/attachments`, { method: 'POST', body: JSON.stringify({ attachmentDataUrl, fileName: file.name, visibility: uploadForm.visibility.value }) });
        toast('Anexo enviado para a ocorrência.');
        state.panelData = null;
        const refreshed = await request(`/api/occurrences/${encodeURIComponent(id)}`);
        state.modalOccurrence = refreshed.occurrence;
        await render();
      } catch (error) {
        toast(error.message || 'Não foi possível enviar o anexo.');
      } finally {
        button.disabled = false;
        button.textContent = 'Enviar anexo';
      }
    });
  }

  document.querySelectorAll('[data-attachment-visibility]').forEach(btn => btn.addEventListener('click', async () => {
    try {
      await request(`/api/attachments/${encodeURIComponent(btn.dataset.attachmentVisibility)}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: btn.dataset.visibility }) });
      toast('Visibilidade do anexo atualizada.');
      state.panelData = null;
      const refreshed = await request(`/api/occurrences/${encodeURIComponent(state.modalOccurrence.id)}`);
      state.modalOccurrence = refreshed.occurrence;
      await render();
    } catch (error) { toast(error.message); }
  }));
  document.querySelectorAll('[data-attachment-archive]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Arquivar este anexo? Ele deixará de aparecer como evidência ativa.')) return;
    try {
      await request(`/api/attachments/${encodeURIComponent(btn.dataset.attachmentArchive)}/archive`, { method: 'POST', body: JSON.stringify({ reason: 'Arquivado pelo painel operacional.' }) });
      toast('Anexo arquivado.');
      state.panelData = null;
      const refreshed = await request(`/api/occurrences/${encodeURIComponent(state.modalOccurrence.id)}`);
      state.modalOccurrence = refreshed.occurrence;
      await render();
    } catch (error) { toast(error.message); }
  }));
  document.querySelectorAll('[data-attachment-remove]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('Remover o vínculo deste anexo da ocorrência? O arquivo no Storage não será apagado automaticamente.')) return;
    try {
      await request(`/api/attachments/${encodeURIComponent(btn.dataset.attachmentRemove)}`, { method: 'DELETE' });
      toast('Vínculo do anexo removido.');
      state.panelData = null;
      const refreshed = await request(`/api/occurrences/${encodeURIComponent(state.modalOccurrence.id)}`);
      state.modalOccurrence = refreshed.occurrence;
      await render();
    } catch (error) { toast(error.message); }
  }));
}

render().catch(showFatal);
