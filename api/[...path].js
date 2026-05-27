import crypto from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'cidadeos-preview-secret';
const DEFAULT_CITY_SLUG = process.env.CIDADEOS_DEFAULT_CITY_SLUG || 'cidade-modelo';
const ATTACHMENT_BUCKET = process.env.CIDADEOS_ATTACHMENT_BUCKET || 'occurrence-attachments';
const MAX_ATTACHMENT_BYTES = Number(process.env.CIDADEOS_MAX_ATTACHMENT_BYTES || 5 * 1024 * 1024);
const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v20.0';
const WHATSAPP_MEDIA_BUCKET = process.env.WHATSAPP_MEDIA_BUCKET || 'occurrence-attachments';
const WHATSAPP_VALIDATE_SIGNATURE = String(process.env.WHATSAPP_VALIDATE_SIGNATURE || 'false').toLowerCase() === 'true';
const ASSISTIVE_AI_MODEL = process.env.CIDADEOS_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ASSISTIVE_AI_TIMEOUT_MS = Number(process.env.CIDADEOS_AI_TIMEOUT_MS || 8000);

const statusToDb = {
  RECEBIDO: 'recebido', EM_ANALISE: 'em_analise', ENCAMINHADO: 'encaminhado', EM_EXECUCAO: 'em_execucao', AGUARDANDO_TERCEIRO: 'aguardando_terceiro', AGUARDANDO_CIDADAO: 'aguardando_cidadao', RESOLVIDO: 'resolvido', CANCELADO: 'cancelado', DUPLICADO: 'duplicado', ARQUIVADO: 'arquivado'
};
const statusFromDb = Object.fromEntries(Object.entries(statusToDb).map(([k,v]) => [v,k]));
const priorityToDb = { BAIXA: 'baixa', MEDIA: 'media', ALTA: 'alta', CRITICA: 'critica' };
const priorityFromDb = Object.fromEntries(Object.entries(priorityToDb).map(([k,v]) => [v,k]));
const directionToDb = { INBOUND: 'received', OUTBOUND: 'sent', PREPARED: 'prepared', FAILED: 'failed' };
const directionFromDb = { received: 'INBOUND', sent: 'OUTBOUND', prepared: 'PREPARED', failed: 'FAILED' };
const processingToDb = {
  RECEBIDA_PENDENTE_TRIAGEM: 'pendente_triagem',
  NOVO: 'novo',
  AGUARDANDO_INFORMACOES: 'aguardando_informacoes',
  CONVERTIDA_EM_OCORRENCIA: 'convertido_ocorrencia',
  VINCULADA_A_PROTOCOLO: 'vinculado_protocolo',
  ARQUIVADA: 'arquivado',
  ERRO: 'erro'
};
const processingFromDb = Object.fromEntries(Object.entries(processingToDb).map(([k,v]) => [v,k]));

function ok(res, payload = {}) { return send(res, 200, { ok: true, sharedSupabase: true, ...payload }); }
function fail(res, status, message) { return send(res, status, { ok: false, error: message }); }
function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return { body: {}, rawBodyText: '' };
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return { body: {}, rawBodyText: '' };
  const rawBodyText = Buffer.concat(chunks).toString('utf8');
  try { return { body: JSON.parse(rawBodyText), rawBodyText }; } catch { return { body: {}, rawBodyText }; }
}
function requireConfig(res) {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    fail(res, 503, 'Supabase não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.');
    return false;
  }
  return true;
}
async function supa(path, options = {}) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `Supabase HTTP ${response.status}`);
  return data;
}

function toOptionalCoordinate(value, type = 'lat') {
  const raw = String(value ?? '').replace(',', '.').trim();
  if (!raw) return null;
  const number = Number(raw);
  const limit = type === 'lng' ? 180 : 90;
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

function normalizeLocationPayload(input = {}) {
  const latitude = toOptionalCoordinate(input.latitude, 'lat');
  const longitude = toOptionalCoordinate(input.longitude, 'lng');
  const hasPair = latitude !== null && longitude !== null;
  const wantsPrecise = input.locationPrecision === 'EXATA_CONSENTIDA';
  const consent = input.locationConsent === true || ['true', 'on', '1', 'yes'].includes(String(input.locationConsent || '').toLowerCase());
  if (!hasPair) return { latitude: null, longitude: null, locationPrecision: 'APROXIMADA' };
  const precise = wantsPrecise && consent;
  return {
    latitude: Number(latitude.toFixed(precise ? 6 : 3)),
    longitude: Number(longitude.toFixed(precise ? 6 : 3)),
    locationPrecision: precise ? 'EXATA_CONSENTIDA' : 'APROXIMADA'
  };
}

function safePublicAddress(value = '') {
  return String(value || '').replace(/\b\d+[a-zA-Z]?\b/g, '').replace(/\s*,\s*/g, ', ').replace(/,\s*$/g, '').replace(/\s+/g, ' ').trim();
}

function safeFileName(name = 'anexo') {
  return String(name || 'anexo').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'anexo';
}
function parseDataUrl(dataUrl = '') {
  const match = String(dataUrl).match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!match) throw Object.assign(new Error('Arquivo inválido. Envie jpg, png, webp ou pdf.'), { status: 400 });
  const mime = match[1].toLowerCase();
  const allowed = new Map([['image/jpeg','jpg'], ['image/jpg','jpg'], ['image/png','png'], ['image/webp','webp'], ['application/pdf','pdf']]);
  if (!allowed.has(mime)) throw Object.assign(new Error('Tipo de arquivo não permitido. Use jpg, png, webp ou pdf.'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw Object.assign(new Error(`Arquivo muito grande. Limite atual: ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`), { status: 400 });
  return { mime, ext: allowed.get(mime), buffer, sizeBytes: buffer.length };
}
async function storageUploadToBucket(bucket, path, buffer, mime) {
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${path}`;
  const response = await fetch(url, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': mime, 'x-upsert': 'false', 'Cache-Control': '3600' }, body: buffer });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.message || `Falha no upload do anexo: HTTP ${response.status}`);
  return data;
}
async function storageUpload(path, buffer, mime) {
  return storageUploadToBucket(ATTACHMENT_BUCKET, path, buffer, mime);
}
async function signedAttachmentUrl(storagePath, bucket = ATTACHMENT_BUCKET) {
  if (!storagePath) return '';
  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/sign/${bucket}/${storagePath}`;
    const response = await fetch(url, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 60 * 60 * 24 }) });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) return `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${bucket}/${storagePath}`;
    return data?.signedURL ? `${SUPABASE_URL.replace(/\/$/, '')}${data.signedURL}` : '';
  } catch { return ''; }
}
async function attachmentFromDb(a) {
  const storagePath = a.storage_path || '';
  const storageBucket = a.storage_bucket || ATTACHMENT_BUCKET;
  return {
    id: a.id,
    occurrenceId: a.occurrence_id,
    cityId: a.city_id,
    uploadedBy: a.uploaded_by,
    fileUrl: await signedAttachmentUrl(storagePath, storageBucket) || a.file_url || '',
    storageBucket,
    storagePath,
    fileType: a.file_type || '',
    fileName: a.file_name || 'anexo',
    sizeBytes: a.file_size_bytes || 0,
    visibility: String(a.visibility || 'publica').toUpperCase(),
    archivedAt: a.archived_at || null,
    archivedBy: a.archived_by || null,
    archivedReason: a.archived_reason || '',
    deletedAt: a.deleted_at || null,
    source: a.source || a.metadata?.source || 'registro',
    createdAt: a.created_at
  };
}
async function createOccurrenceAttachment({ occurrence, userId = null, dataUrl, fileName = 'anexo', visibility = 'publica' }) {
  if (!dataUrl) return null;
  const parsed = parseDataUrl(dataUrl);
  const baseName = safeFileName(fileName || `anexo.${parsed.ext}`);
  const finalName = baseName.includes('.') ? baseName : `${baseName}.${parsed.ext}`;
  const storagePath = `${occurrence.city_id}/${occurrence.id}/${Date.now()}-${crypto.randomUUID()}-${finalName}`;
  await storageUpload(storagePath, parsed.buffer, parsed.mime);
  const rows = await supa('occurrence_attachments', { method: 'POST', body: JSON.stringify([{
    occurrence_id: occurrence.id,
    city_id: occurrence.city_id,
    uploaded_by: userId,
    file_url: storagePath,
    storage_bucket: ATTACHMENT_BUCKET,
    storage_path: storagePath,
    file_type: parsed.mime,
    file_name: finalName,
    file_size_bytes: parsed.sizeBytes,
    visibility: String(visibility || 'publica').toLowerCase()
  }]) });
  return rows[0] ? await attachmentFromDb(rows[0]) : null;
}
function signToken(user) {
  const payload = Buffer.from(JSON.stringify({ sub: user.id, email: user.email, role: user.role, iat: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyToken(req) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : '';
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
}
async function currentUser(req) {
  const token = verifyToken(req);
  if (!token?.sub) return null;
  const rows = await supa(`app_users?id=eq.${encodeURIComponent(token.sub)}&active=eq.true&select=*`, { headers: { Range: '0-0' } });
  return rows?.[0] ? userFromDb(rows[0]) : null;
}
function userFromDb(u) {
  if (!u) return null;
  return { id: u.id, cityId: u.city_id, name: u.name, email: u.email, phone: u.phone || '', role: String(u.role || '').toUpperCase(), departmentId: u.department_id || null, active: u.active };
}
function cityFromDb(c) { return c && { id: c.id, name: c.name, state: c.state, country: c.country, slug: c.slug, officialPhone: c.official_phone, officialEmail: c.official_email, officialWebsite: c.official_website, logoUrl: c.logo_url, primaryColor: c.primary_color, secondaryColor: c.secondary_color, active: c.active, demo: c.demo, createdAt: c.created_at, updatedAt: c.updated_at }; }
function departmentFromDb(d) { return d && { id: d.id, cityId: d.city_id, name: d.name, description: d.description || '', contactEmail: d.contact_email || '', contactPhone: d.contact_phone || '', active: d.active, createdAt: d.created_at, updatedAt: d.updated_at }; }
function neighborhoodFromDb(n) { return n && { id: n.id, cityId: n.city_id, name: n.name, zone: n.zone || '', active: n.active, createdAt: n.created_at, updatedAt: n.updated_at }; }
function categoryFromDb(c) { return c && { id: c.id, key: c.key, name: c.name, module: c.module, description: c.description || '', icon: c.icon || '', color: c.color || '', defaultDepartmentId: c.default_department_id || null, active: c.active, sortOrder: c.sort_order }; }
function subcategoryFromDb(s) { return s && { id: s.id, categoryId: s.category_id, key: s.key, name: s.name, description: s.description || '', defaultPriority: priorityFromDb[s.default_priority] || 'MEDIA', defaultSlaHours: s.default_sla_hours, active: s.active, sortOrder: s.sort_order }; }
function alertFromDb(a) { return a && { id: a.id, cityId: a.city_id, neighborhoodId: a.neighborhood_id, title: a.title, message: a.message, severity: priorityFromDb[a.severity] || 'MEDIA', category: a.category || '', active: a.active, startsAt: a.starts_at, endsAt: a.ends_at, createdAt: a.created_at, updatedAt: a.updated_at }; }
function histFromDb(h) { return h && { id: h.id, occurrenceId: h.occurrence_id, cityId: h.city_id, changedBy: h.changed_by, oldStatus: statusFromDb[h.old_status] || h.old_status, newStatus: statusFromDb[h.new_status] || h.new_status, comment: h.comment || '', publicMessage: h.public_message || '', visibility: String(h.visibility || '').toUpperCase(), createdAt: h.created_at }; }
function occurrenceBaseFromDb(o) {
  return o && { id: o.id, cityId: o.city_id, protocol: o.protocol, title: o.title, description: o.description, categoryId: o.category_id, subcategoryId: o.subcategory_id, neighborhoodId: o.neighborhood_id, departmentId: o.department_id, assignedAgentId: o.assigned_agent_id, citizenId: o.citizen_user_id, citizenName: o.citizen_name, citizenPhone: o.citizen_phone, citizenEmail: o.citizen_email, priority: priorityFromDb[o.priority] || 'MEDIA', status: statusFromDb[o.status] || 'RECEBIDO', origin: o.origin, sourceChannel: o.source_channel, address: o.address || '', referencePoint: o.reference_point || '', latitude: o.latitude, longitude: o.longitude, publicVisibility: o.public_visibility, duplicateOfId: o.duplicate_of_id, slaDueAt: o.sla_due_at, resolvedAt: o.resolved_at, publicMessage: o.public_message || '', internalNotes: o.internal_notes || '', metadata: o.metadata || {}, createdAt: o.created_at, updatedAt: o.updated_at }; 
}
function occurrenceFromDb(o, lookups = {}) {
  const base = occurrenceBaseFromDb(o);
  if (!base) return null;
  const find = (arr, id) => (arr || []).find(x => x.id === id) || null;
  return {
    ...base,
    city: find(lookups.cities, base.cityId),
    neighborhood: find(lookups.neighborhoods, base.neighborhoodId),
    category: find(lookups.categories, base.categoryId),
    subcategory: find(lookups.subcategories, base.subcategoryId),
    department: find(lookups.departments, base.departmentId),
    assignedAgent: find(lookups.users, base.assignedAgentId),
    citizen: base.citizenName ? { name: base.citizenName, phone: base.citizenPhone || '', email: base.citizenEmail || '' } : null,
    history: (lookups.history || []).filter(h => h.occurrenceId === base.id),
    comments: (lookups.comments || []).filter(c => c.occurrenceId === base.id),
    attachments: (lookups.attachments || []).filter(a => a.occurrenceId === base.id)
  };
}
function publicOccurrence(occ) {
  return {
    protocol: occ.protocol, title: occ.title, description: occ.description,
    category: occ.category?.name || '', subcategory: occ.subcategory?.name || '', neighborhood: occ.neighborhood?.name || '', department: occ.department?.name || '',
    priority: occ.priority, status: occ.status, address: safePublicAddress(occ.address), referencePoint: occ.referencePoint, publicMessage: occ.publicMessage,
    slaDueAt: occ.slaDueAt, createdAt: occ.createdAt, updatedAt: occ.updatedAt, resolvedAt: occ.resolvedAt,
    attachments: (occ.attachments || []).filter(a => a.visibility === 'PUBLICA' || a.visibility === 'PUBLIC').map(a => ({ id: a.id, fileName: a.fileName, fileType: a.fileType, fileUrl: a.fileUrl, sizeBytes: a.sizeBytes, source: a.source || 'registro', createdAt: a.createdAt })),
    publicHistory: (occ.history || []).filter(h => h.publicMessage).map(h => ({ status: h.newStatus, publicMessage: h.publicMessage, createdAt: h.createdAt }))
  };
}
async function bootstrapData() {
  let cities = (await supa(`cities?slug=eq.${encodeURIComponent(DEFAULT_CITY_SLUG)}&select=*`)).map(cityFromDb);
  if (!cities.length) cities = (await supa('cities?active=eq.true&select=*&limit=1')).map(cityFromDb);
  const city = cities[0];
  if (!city) throw new Error('Nenhuma cidade ativa encontrada no Supabase. Rode o SQL de seed.');
  const [neighborhoods, departments, categories, subcategories, alerts, channels] = await Promise.all([
    supa(`neighborhoods?city_id=eq.${city.id}&active=eq.true&select=*&order=name.asc`).then(r => r.map(neighborhoodFromDb)),
    supa(`departments?city_id=eq.${city.id}&active=eq.true&select=*&order=name.asc`).then(r => r.map(departmentFromDb)),
    supa('occurrence_categories?active=eq.true&select=*&order=sort_order.asc').then(r => r.map(categoryFromDb)),
    supa('occurrence_subcategories?active=eq.true&select=*&order=sort_order.asc').then(r => r.map(subcategoryFromDb)),
    supa(`alerts?city_id=eq.${city.id}&active=eq.true&select=*&order=created_at.desc`).then(r => r.map(alertFromDb)),
    supa(`whatsapp_channels?city_id=eq.${city.id}&select=*&limit=1`).then(r => r.map(channelFromDb))
  ]);
  return { city, cities, neighborhoods, departments, categories, subcategories, alerts, whatsappChannel: channels[0] || null };
}
function computeSla(priority) {
  const d = new Date();
  d.setHours(d.getHours() + (priority === 'CRITICA' ? 2 : priority === 'ALTA' ? 24 : priority === 'MEDIA' ? 72 : 168));
  return d.toISOString();
}
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
function buildLocalTriageSuggestion({ text = '', categories = [], departments = [], subcategories = [], cityId = '' } = {}) {
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

function buildAssistiveTriageFallback(input = {}) {
  const cityId = input.cityId || '';
  const text = [input.text, input.title, input.description, input.address, input.referencePoint, input.messageBody].filter(Boolean).join(' ');
  const local = input.localSuggestion || buildLocalTriageSuggestion({ text, categories: input.categories, departments: input.departments, subcategories: input.subcategories, cityId });
  const neighborhood = findAssistiveNeighborhood(input.neighborhoods, { cityId, neighborhoodId: input.neighborhoodId, text });
  const probableAddress = trimAssistiveText([input.address, input.referencePoint].filter(Boolean).join(' - '), 180);
  const missingFields = [];
  if (!neighborhood) missingFields.push('bairro');
  if (!probableAddress) missingFields.push('localizacao');
  const needsComplement = missingFields.length > 0;
  const complementRequest = missingFields.includes('bairro')
    ? 'Para continuar, informe o bairro e, se possivel, rua ou ponto de referencia da ocorrencia.'
    : 'Para continuar, informe rua, numero aproximado ou ponto de referencia da ocorrencia.';
  const risk = buildRiskProfile(local.priority, text);
  const duplicateCandidates = findDuplicateCandidates(input.occurrences, {
    cityId,
    occurrenceId: input.occurrenceId || input.id || input.protocol || '',
    text,
    categoryId: local.categoryId,
    neighborhoodId: neighborhood?.id || input.neighborhoodId || '',
    address: input.address,
    referencePoint: input.referencePoint
  });
  const duplicateRisk = duplicateCandidates[0]?.score >= 0.72 ? 'ALTO' : duplicateCandidates[0]?.score >= 0.52 ? 'MEDIO' : 'BAIXO';
  const summary = buildAssistiveSummary(text);
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

function getAssistiveAiKey() {
  return String(process.env.CIDADEOS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
}

function parseAssistiveAiJson(content = '') {
  try { return JSON.parse(content); } catch {}
  const match = String(content || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

async function callAssistiveAi(payload) {
  const key = getAssistiveAiKey();
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSISTIVE_AI_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ASSISTIVE_AI_MODEL,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Voce apoia triagem municipal. Responda apenas JSON. A IA e assistiva, nao decide. Nao invente bairro, endereco ou dado ausente. Se faltar bairro/localizacao, marque complemento. Nao inclua dados pessoais no resumo publico.'
          },
          { role: 'user', content: JSON.stringify(payload) }
        ]
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
    return parseAssistiveAiJson(data?.choices?.[0]?.message?.content || '');
  } finally {
    clearTimeout(timer);
  }
}

function findAssistiveChoice(items = [], value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = normalizeRuleText(raw);
  return items.find((item) => item.id === raw || normalizeRuleText(item.name || item.key || '').includes(normalized) || normalized.includes(normalizeRuleText(item.name || item.key || ''))) || null;
}

function normalizeAssistivePriority(value = '') {
  const normalized = normalizeRuleText(value);
  if (normalized === 'critica' || normalized === 'critico') return 'CRITICA';
  if (normalized === 'alta' || normalized === 'alto') return 'ALTA';
  if (normalized === 'media' || normalized === 'medio') return 'MEDIA';
  if (normalized === 'baixa' || normalized === 'baixo') return 'BAIXA';
  return '';
}

function normalizeAssistiveRisk(value = '') {
  const normalized = normalizeRuleText(value);
  if (normalized === 'critico' || normalized === 'critica') return 'CRITICO';
  if (normalized === 'alto' || normalized === 'alta') return 'ALTO';
  if (normalized === 'medio' || normalized === 'media') return 'MEDIO';
  if (normalized === 'baixo' || normalized === 'baixa') return 'BAIXO';
  return '';
}

function normalizeMissingFields(fields = []) {
  return [...new Set((Array.isArray(fields) ? fields : [fields]).map((field) => {
    const normalized = normalizeRuleText(field);
    if (normalized.includes('bairro')) return 'bairro';
    if (normalized.includes('local') || normalized.includes('endereco') || normalized.includes('rua') || normalized.includes('referencia')) return 'localizacao';
    return '';
  }).filter(Boolean))];
}

function mergeAssistiveAiSuggestion(aiSuggestion, fallback, input = {}) {
  if (!aiSuggestion || typeof aiSuggestion !== 'object') return fallback;
  const category = findAssistiveChoice(input.categories, aiSuggestion.categoryId || aiSuggestion.categoryName || aiSuggestion.categoria) || input.categories.find((item) => item.id === fallback.categoryId) || null;
  const department = findAssistiveChoice(input.departments, aiSuggestion.departmentId || aiSuggestion.departmentName || aiSuggestion.setor) || input.departments.find((item) => item.id === fallback.departmentId) || null;
  const subcategory = findAssistiveChoice((input.subcategories || []).filter((item) => !category || item.categoryId === category.id), aiSuggestion.subcategoryId || aiSuggestion.subcategoryName || aiSuggestion.subcategoria) || input.subcategories.find((item) => item.id === fallback.subcategoryId) || null;
  const priority = normalizeAssistivePriority(aiSuggestion.priority || aiSuggestion.prioridade) || fallback.priority;
  const riskLevel = normalizeAssistiveRisk(aiSuggestion.riskLevel || aiSuggestion.risco) || fallback.riskLevel;
  const missingFields = [...new Set([...fallback.missingFields, ...normalizeMissingFields(aiSuggestion.missingFields || aiSuggestion.camposAusentes)])];
  const needsComplement = fallback.needsComplement || missingFields.length > 0 || Boolean(aiSuggestion.needsComplement);
  const safeSummary = trimAssistiveText(redactPersonalData(aiSuggestion.summary || aiSuggestion.resumo || fallback.summary), 360);
  const safePublicSummary = trimAssistiveText(redactPersonalData(aiSuggestion.publicSummary || aiSuggestion.resumoPublico || safeSummary), 360);
  const safeCitizenResponse = trimAssistiveText(redactPersonalData(aiSuggestion.citizenResponse || aiSuggestion.respostaCidadao || ''), 420);
  const confidence = Number(aiSuggestion.confidence || aiSuggestion.confianca || fallback.confidence);
  return {
    ...fallback,
    source: 'openai_assistive_v1',
    aiAvailable: true,
    aiAttempted: true,
    aiModel: ASSISTIVE_AI_MODEL,
    categoryId: category?.id || fallback.categoryId,
    categoryName: category?.name || fallback.categoryName,
    subcategoryId: subcategory?.id || fallback.subcategoryId,
    subcategoryName: subcategory?.name || fallback.subcategoryName,
    departmentId: department?.id || fallback.departmentId,
    departmentName: department?.name || fallback.departmentName,
    priority,
    probableCategoryId: category?.id || fallback.categoryId,
    probableCategoryName: category?.name || fallback.categoryName,
    summary: safeSummary || fallback.summary,
    publicSummary: safePublicSummary || fallback.publicSummary,
    probableAddress: fallback.probableAddress,
    missingFields,
    needsComplement,
    riskLevel,
    riskFactors: Array.isArray(aiSuggestion.riskFactors) && aiSuggestion.riskFactors.length ? aiSuggestion.riskFactors.map((item) => trimAssistiveText(item, 120)) : fallback.riskFactors,
    citizenResponse: needsComplement ? fallback.complementRequest : (safeCitizenResponse || fallback.citizenResponse),
    publicMessage: needsComplement ? fallback.complementRequest : (safeCitizenResponse || fallback.publicMessage),
    confidence: Number.isFinite(confidence) ? Math.max(0.35, Math.min(0.98, confidence)) : fallback.confidence,
    confidenceLabel: Number.isFinite(confidence) && confidence >= 0.75 ? 'Alta' : Number.isFinite(confidence) && confidence >= 0.5 ? 'Media' : fallback.confidenceLabel,
    reason: trimAssistiveText(`${aiSuggestion.reason || aiSuggestion.justificativa || fallback.reason} Resultado validado contra cadastros locais; aplicacao depende de confirmacao humana.`, 420)
  };
}

async function buildAssistiveTriageSuggestion(input = {}) {
  const fallback = buildAssistiveTriageFallback(input);
  if (!getAssistiveAiKey()) return fallback;
  const payload = {
    relato: {
      titulo: redactPersonalData(input.title || ''),
      descricao: redactPersonalData(input.description || input.text || input.messageBody || ''),
      enderecoInformado: redactPersonalData([input.address, input.referencePoint].filter(Boolean).join(' - ')),
      bairroJaSelecionado: fallback.probableNeighborhoodName || ''
    },
    regraLocal: {
      categoria: fallback.categoryName,
      prioridade: fallback.priority,
      setor: fallback.departmentName,
      camposAusentes: fallback.missingFields,
      risco: fallback.riskLevel
    },
    opcoesValidas: {
      categorias: (input.categories || []).filter((item) => item.active !== false).map((item) => ({ id: item.id, nome: item.name })),
      subcategorias: (input.subcategories || []).filter((item) => item.active !== false).map((item) => ({ id: item.id, categoriaId: item.categoryId, nome: item.name })),
      setores: (input.departments || []).filter((item) => (!input.cityId || item.cityId === input.cityId) && item.active !== false).map((item) => ({ id: item.id, nome: item.name })),
      bairros: (input.neighborhoods || []).filter((item) => (!input.cityId || item.cityId === input.cityId) && item.active !== false).map((item) => ({ id: item.id, nome: item.name }))
    },
    candidatosDuplicidade: fallback.duplicateCandidates
  };
  try {
    const aiSuggestion = await callAssistiveAi(payload);
    return mergeAssistiveAiSuggestion(aiSuggestion, fallback, input);
  } catch (error) {
    return {
      ...fallback,
      aiAvailable: true,
      aiAttempted: true,
      aiError: trimAssistiveText(error.message || 'Falha na IA opcional.', 180),
      reason: `${fallback.reason} IA opcional indisponivel; fallback local usado.`
    };
  }
}

function triageSuggestionApplicationComment(suggestion = {}) {
  const parts = ['Sugestao assistida de triagem aplicada apos confirmacao.'];
  if (suggestion.summary) parts.push(`Resumo: ${trimAssistiveText(suggestion.summary, 180)}`);
  if (suggestion.riskLevel) parts.push(`Risco: ${suggestion.riskLevel}`);
  if ((suggestion.duplicateCandidates || []).length) parts.push(`Possivel duplicidade: ${suggestion.duplicateCandidates.map((item) => item.protocol).filter(Boolean).join(', ')}`);
  if (suggestion.needsComplement) parts.push('Complemento solicitado ao cidadao.');
  return parts.join(' ');
}

async function occurrenceLookups(cityId, occurrenceIds = []) {
  const [neighborhoods, departments, categories, subcategories, users, history, comments, attachmentRows, cities] = await Promise.all([
    supa(`neighborhoods?city_id=eq.${cityId}&select=*`).then(r => r.map(neighborhoodFromDb)),
    supa(`departments?city_id=eq.${cityId}&select=*`).then(r => r.map(departmentFromDb)),
    supa('occurrence_categories?select=*').then(r => r.map(categoryFromDb)),
    supa('occurrence_subcategories?select=*').then(r => r.map(subcategoryFromDb)),
    supa(`app_users?or=(city_id.eq.${cityId},city_id.is.null)&select=*`).then(r => r.map(userFromDb)),
    occurrenceIds.length ? supa(`occurrence_status_history?occurrence_id=in.(${occurrenceIds.join(',')})&select=*&order=created_at.asc`).then(r => r.map(histFromDb)) : Promise.resolve([]),
    occurrenceIds.length ? supa(`occurrence_comments?occurrence_id=in.(${occurrenceIds.join(',')})&select=*&order=created_at.asc`).then(r => r.map(c => ({ id: c.id, occurrenceId: c.occurrence_id, userId: c.user_id, comment: c.comment, visibility: String(c.visibility || '').toUpperCase(), createdAt: c.created_at }))) : Promise.resolve([]),
    occurrenceIds.length ? supa(`occurrence_attachments?occurrence_id=in.(${occurrenceIds.join(',')})&select=*&order=created_at.asc`) : Promise.resolve([]),
    supa(`cities?id=eq.${cityId}&select=*`).then(r => r.map(cityFromDb))
  ]);
  const attachments = await Promise.all((attachmentRows || []).map(attachmentFromDb));
  return { neighborhoods, departments, categories, subcategories, users, history, comments, attachments, cities };
}
async function serializeRows(rows, cityId) {
  const ids = rows.map(r => r.id);
  const lookups = await occurrenceLookups(cityId || rows[0]?.city_id, ids);
  return rows.map(r => occurrenceFromDb(r, lookups));
}
async function duplicateContextFromSupabase(occurrenceRow) {
  const cityId = occurrenceRow.city_id;
  const [occurrenceRows, categories, neighborhoods] = await Promise.all([
    supa(`occurrences?city_id=eq.${encodeURIComponent(cityId)}&select=*&order=created_at.desc&limit=120`).then(r => r.map(occurrenceBaseFromDb)),
    supa('occurrence_categories?select=*').then(r => r.map(categoryFromDb)),
    supa(`neighborhoods?city_id=eq.${encodeURIComponent(cityId)}&select=*`).then(r => r.map(neighborhoodFromDb))
  ]);
  const occurrence = occurrenceRows.find((item) => item.id === occurrenceRow.id) || occurrenceBaseFromDb(occurrenceRow);
  return duplicateCandidateContext({ occurrences: occurrenceRows, categories, neighborhoods }, occurrence);
}
function dbStatus(value) { return statusToDb[String(value || '').toUpperCase()] || value || 'recebido'; }
function dbPriority(value) { return priorityToDb[String(value || '').toUpperCase()] || value || 'media'; }
function channelFromDb(ch) {
  if (!ch) return null;
  const mask = v => v ? `${String(v).slice(0,4)}********${String(v).slice(-4)}` : '';
  return { id: ch.id, cityId: ch.city_id, channelName: ch.channel_name, officialPhone: ch.official_phone || '', defaultDepartmentId: ch.default_department_id, businessPortfolioId: ch.business_portfolio_id || '', wabaIdMasked: mask(ch.waba_id), phoneNumberIdMasked: mask(ch.phone_number_id), appIdMasked: mask(ch.app_id), accessTokenMasked: mask(ch.access_token_encrypted), appSecretMasked: mask(ch.app_secret_encrypted), webhookVerifyTokenMasked: mask(ch.verify_token_encrypted), templatesJson: ch.templates_json || {}, businessHoursJson: ch.business_hours_json || {}, defaultWelcomeMessage: ch.default_welcome_message || '', protocolCreatedMessage: ch.protocol_created_message || '', statusUpdatedMessage: ch.status_updated_message || '', enabled: ch.enabled, connectionStatus: ch.connection_status, lastVerifiedAt: ch.last_verified_at, lastError: ch.last_error, webhookUrl: ch.webhook_url || `/api/webhooks/whatsapp/${ch.city_id}`, updatedAt: ch.updated_at };
}
function messageFromDb(m, occurrence = null) {
  const payload = m.payload_json || {};
  const storedMedia = payload.storedMedia || {};
  const mediaStorageBucket = m.media_storage_bucket || storedMedia.bucket || '';
  const mediaStoragePath = m.media_storage_path || storedMedia.path || '';
  const mediaMimeType = storedMedia.contentType || payload.mediaMimeType || payload.raw?.image?.mime_type || payload.raw?.document?.mime_type || payload.raw?.audio?.mime_type || payload.raw?.video?.mime_type || '';
  const mediaId = payload.mediaId || payload.raw?.image?.id || payload.raw?.document?.id || payload.raw?.audio?.id || payload.raw?.video?.id || '';
  return { id: m.id, cityId: m.city_id, channelId: m.channel_id, conversationId: m.conversation_id, occurrenceId: m.occurrence_id, citizenPhone: m.citizen_phone, direction: directionFromDb[m.direction] || m.direction, status: processingFromDb[m.processing_status] || m.processing_status, processingStatus: processingFromDb[m.processing_status] || m.processing_status, messageType: m.message_type || 'text', messageBody: m.message_body || '', preparedReply: m.prepared_response || '', metaMessageId: m.meta_message_id || '', payloadJson: payload, errorMessage: m.error_message || '', mediaId, mediaMimeType, mediaStorageBucket, mediaStoragePath, mediaDownloadedAt: m.media_downloaded_at || null, hasMedia: Boolean(mediaId || mediaStoragePath), mediaDownloadPending: Boolean(mediaId && !mediaStoragePath), mediaDownloadError: mediaId && !mediaStoragePath ? (m.error_message || storedMedia.reason || '') : '', createdAt: m.created_at, processedAt: m.processed_at, occurrence };
}
function inferCategory(categories, text = '', departments = [], subcategories = [], cityId = '') {
  const suggestion = buildLocalTriageSuggestion({ text, categories, departments, subcategories, cityId });
  return [categories.find(c => c.id === suggestion.categoryId) || categories[0], suggestion.priority, suggestion];
}
function metrics(rows) {
  const openStatuses = new Set(['recebido','em_analise','encaminhado','em_execucao','aguardando_terceiro','aguardando_cidadao']);
  return { totalOccurrences: rows.length, openOccurrences: rows.filter(o => openStatuses.has(o.status)).length, resolvedOccurrences: rows.filter(o => o.status === 'resolvido').length, criticalOccurrences: rows.filter(o => o.priority === 'critica').length, overdueOccurrences: rows.filter(o => o.sla_due_at && new Date(o.sla_due_at) < new Date() && !['resolvido','cancelado','arquivado','duplicado'].includes(o.status)).length };
}
async function audit(cityId, userId, action, entityType, entityId, metadata = {}) {
  try { await supa('audit_logs', { method: 'POST', body: JSON.stringify([{ city_id: cityId, user_id: userId || null, action, entity_type: entityType, entity_id: entityId || null, metadata }]) }); } catch {}
}

function normalizeWhatsAppPhone(value = '') {
  return String(value || '').replace(/\D+/g, '');
}
function whatsappRawConfig(ch) {
  return {
    id: ch?.id || null,
    cityId: ch?.city_id || null,
    enabled: Boolean(ch?.enabled),
    officialPhone: ch?.official_phone || '',
    phoneNumberId: ch?.phone_number_id || '',
    wabaId: ch?.waba_id || '',
    accessToken: ch?.access_token_encrypted || '',
    verifyToken: ch?.verify_token_encrypted || '',
    defaultWelcomeMessage: ch?.default_welcome_message || '',
    protocolCreatedMessage: ch?.protocol_created_message || 'Sua solicitação foi registrada com sucesso. Protocolo: {{protocol}}.',
    statusUpdatedMessage: ch?.status_updated_message || 'Seu protocolo {{protocol}} foi atualizado para: {{status}}.',
    templatesJson: ch?.templates_json || {}
  };
}
function whatsappReadiness(ch) {
  const raw = whatsappRawConfig(ch);
  const missing = [];
  if (!raw.enabled) missing.push('canal ativo');
  if (!raw.phoneNumberId) missing.push('Phone Number ID');
  if (!raw.accessToken) missing.push('Access Token');
  if (!raw.verifyToken) missing.push('Verify Token');
  return { ready: missing.length === 0, missing, raw };
}
async function sendWhatsAppText(rawChannel, to, text) {
  const channel = whatsappRawConfig(rawChannel);
  const phone = normalizeWhatsAppPhone(to);
  if (!channel.phoneNumberId || !channel.accessToken) {
    return { sent: false, fallback: true, error: 'Credenciais incompletas para envio real pela WhatsApp Cloud API.' };
  }
  if (!phone) {
    return { sent: false, fallback: true, error: 'Telefone do cidadão não informado.' };
  }
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${channel.phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${channel.accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: {
        preview_url: false,
        body: String(text || '').slice(0, 3900)
      }
    })
  });
  const resultText = await response.text();
  let result = {};
  try { result = resultText ? JSON.parse(resultText) : {}; } catch { result = { raw: resultText }; }
  if (!response.ok) {
    return { sent: false, fallback: false, error: result?.error?.message || `Meta HTTP ${response.status}`, meta: result };
  }
  return { sent: true, fallback: false, meta: result, metaMessageId: result?.messages?.[0]?.id || '' };
}

function verifyWhatsAppSignature(req, rawBodyText = '') {
  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET || '';
  const signature = req.headers['x-hub-signature-256'];
  if (!WHATSAPP_VALIDATE_SIGNATURE) return { ok: true, skipped: true };
  if (!appSecret) return { ok: false, error: 'META_APP_SECRET ausente para validar assinatura.' };
  if (!signature || !String(signature).startsWith('sha256=')) return { ok: false, error: 'Assinatura X-Hub-Signature-256 ausente.' };
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBodyText || '').digest('hex');
  const left = Buffer.from(String(signature));
  const right = Buffer.from(expected);
  if (left.length !== right.length) return { ok: false, error: 'Assinatura inválida.' };
  return { ok: crypto.timingSafeEqual(left, right), error: 'Assinatura inválida.' };
}
async function fetchWhatsAppMediaInfo(mediaId, accessToken) {
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await response.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(json?.error?.message || `Falha ao buscar mídia Meta HTTP ${response.status}`);
  return json;
}
async function downloadWhatsAppMedia(mediaUrl, accessToken) {
  const response = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`Falha ao baixar mídia Meta HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    size: Number(response.headers.get('content-length') || arrayBuffer.byteLength || 0)
  };
}
function extensionFromMime(mime = '') {
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
async function uploadWhatsAppMediaToStorage({ cityId, messageId, mediaId, channel, mimeType }) {
  if (!mediaId || !channel?.access_token_encrypted) return { uploaded: false, reason: 'Mídia ou Access Token ausente.' };
  const info = await fetchWhatsAppMediaInfo(mediaId, channel.access_token_encrypted);
  if (!info.url) return { uploaded: false, reason: 'URL da mídia não retornada pela Meta.', info };
  const downloaded = await downloadWhatsAppMedia(info.url, channel.access_token_encrypted);
  const contentType = info.mime_type || downloaded.contentType || mimeType || 'application/octet-stream';
  const ext = extensionFromMime(contentType);
  const safeMessageId = String(messageId || mediaId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = `${cityId}/whatsapp/${new Date().toISOString().slice(0, 10)}/${safeMessageId}.${ext}`;
  await storageUploadToBucket(WHATSAPP_MEDIA_BUCKET, filePath, downloaded.buffer, contentType);
  return { uploaded: true, bucket: WHATSAPP_MEDIA_BUCKET, path: filePath, contentType, size: downloaded.size, meta: info };
}

function whatsappMediaFromMessageRow(message = {}) {
  const payload = message.payload_json || {};
  const raw = payload.raw || {};
  const storedMedia = payload.storedMedia || {};
  const media = raw.image || raw.document || raw.audio || raw.video || {};
  const mediaId = payload.mediaId || storedMedia.mediaId || media.id || '';
  const contentType = storedMedia.contentType || payload.mediaMimeType || media.mime_type || '';
  const storagePath = message.media_storage_path || storedMedia.path || '';
  const bucket = message.media_storage_bucket || storedMedia.bucket || WHATSAPP_MEDIA_BUCKET;
  return {
    hasMedia: Boolean(mediaId || storagePath),
    mediaId,
    bucket,
    storagePath,
    contentType,
    size: storedMedia.size || 0,
    sha256: payload.mediaSha256 || media.sha256 || '',
    metaMessageId: message.meta_message_id || '',
    pendingReason: storedMedia.reason || message.error_message || 'Midia recebida pelo WhatsApp, mas ainda nao baixada para o Storage.'
  };
}

function whatsappAttachmentName(message = {}, media = {}) {
  const ext = extensionFromMime(media.contentType || message.message_type || '');
  const safeMessageId = String(message.id || media.mediaId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '');
  return `whatsapp-${safeMessageId}.${ext}`;
}

function isMissingAttachmentMetadataColumn(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('occurrence_attachments') && (text.includes('source') || text.includes('metadata') || text.includes('schema cache') || text.includes('column'));
}

async function insertWhatsAppAttachment(record) {
  try {
    const rows = await supa('occurrence_attachments', { method: 'POST', body: JSON.stringify([record]) });
    return rows[0];
  } catch (error) {
    if (!isMissingAttachmentMetadataColumn(error)) throw error;
    const fallback = { ...record };
    delete fallback.source;
    delete fallback.metadata;
    const rows = await supa('occurrence_attachments', { method: 'POST', body: JSON.stringify([fallback]) });
    return rows[0];
  }
}

async function linkWhatsAppMediaAsAttachment({ message, occurrence, userId = null, visibility = 'publica' }) {
  const media = whatsappMediaFromMessageRow(message);
  if (!media.hasMedia) return { linked: false, skipped: true };
  if (!media.storagePath) {
    await audit(occurrence.city_id, userId, 'WHATSAPP_MEDIA_ATTACHMENT_PENDING', 'WhatsAppMessage', message.id, {
      occurrenceId: occurrence.id,
      mediaId: media.mediaId,
      reason: media.pendingReason
    });
    return { linked: false, pending: true, reason: media.pendingReason };
  }
  const existing = await supa(`occurrence_attachments?occurrence_id=eq.${encodeURIComponent(occurrence.id)}&storage_path=eq.${encodeURIComponent(media.storagePath)}&select=*&limit=1`);
  if (existing[0]) {
    await audit(occurrence.city_id, userId, 'WHATSAPP_MEDIA_ATTACHMENT_ALREADY_LINKED', 'OccurrenceAttachment', existing[0].id, {
      occurrenceId: occurrence.id,
      messageId: message.id,
      storagePath: media.storagePath
    });
    return { linked: false, duplicate: true, attachment: await attachmentFromDb(existing[0]) };
  }
  const row = await insertWhatsAppAttachment({
    occurrence_id: occurrence.id,
    city_id: occurrence.city_id,
    uploaded_by: userId,
    file_url: media.storagePath,
    storage_bucket: media.bucket,
    storage_path: media.storagePath,
    file_type: media.contentType || 'application/octet-stream',
    file_name: whatsappAttachmentName(message, media),
    file_size_bytes: media.size || null,
    visibility: String(visibility || 'publica').toLowerCase(),
    source: 'whatsapp',
    metadata: {
      source: 'whatsapp',
      whatsappMessageId: message.id,
      metaMessageId: media.metaMessageId,
      mediaId: media.mediaId,
      mediaSha256: media.sha256,
      linkedAt: new Date().toISOString()
    }
  });
  await audit(occurrence.city_id, userId, 'WHATSAPP_MEDIA_LINKED_ATTACHMENT', 'OccurrenceAttachment', row?.id || null, {
    occurrenceId: occurrence.id,
    messageId: message.id,
    storagePath: media.storagePath
  });
  return { linked: true, attachment: row ? await attachmentFromDb(row) : null };
}
async function sendWhatsAppTemplate(rawChannel, to, templateName, languageCode = 'pt_BR', components = []) {
  const channel = whatsappRawConfig(rawChannel);
  const phone = normalizeWhatsAppPhone(to);
  if (!channel.phoneNumberId || !channel.accessToken) return { sent: false, fallback: true, error: 'Credenciais incompletas para envio de template.' };
  if (!templateName) return { sent: false, fallback: true, error: 'Nome do template não informado.' };
  const response = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${channel.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${channel.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'template',
      template: { name: templateName, language: { code: languageCode }, components }
    })
  });
  const resultText = await response.text();
  let result = {};
  try { result = resultText ? JSON.parse(resultText) : {}; } catch { result = { raw: resultText }; }
  if (!response.ok) return { sent: false, fallback: false, error: result?.error?.message || `Meta HTTP ${response.status}`, meta: result };
  return { sent: true, fallback: false, meta: result, metaMessageId: result?.messages?.[0]?.id || '' };
}

function extractWhatsAppWebhookMessages(payload = {}) {
  const out = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const metadata = value.metadata || {};
      for (const msg of value.messages || []) {
        const type = msg.type || 'unknown';
        const text = msg.text?.body || msg.image?.caption || msg.document?.caption || msg.button?.text || msg.interactive?.button_reply?.title || '';
        const media = msg.image || msg.document || msg.audio || msg.video || null;
        out.push({
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          from: msg.from || '',
          type,
          body: text || (media ? `[${type}] mídia recebida pelo WhatsApp` : `[${type}] mensagem recebida pelo WhatsApp`),
          metaMessageId: msg.id || '',
          timestamp: msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString(),
          mediaId: media?.id || '',
          mediaMimeType: media?.mime_type || '',
          mediaSha256: media?.sha256 || '',
          raw: msg
        });
      }
      for (const st of value.statuses || []) {
        out.push({
          isStatus: true,
          phoneNumberId: metadata.phone_number_id || '',
          from: st.recipient_id || '',
          type: 'status',
          body: `Status de entrega: ${st.status || 'desconhecido'}`,
          metaMessageId: st.id || '',
          timestamp: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString(),
          raw: st
        });
      }
    }
  }
  return out;
}
async function upsertWhatsAppConversation({ cityId, channelId, phone, occurrenceId = null }) {
  const existing = await supa(`whatsapp_conversations?city_id=eq.${cityId}&citizen_phone=eq.${encodeURIComponent(phone)}&select=*&limit=1`);
  if (existing[0]) {
    const updated = await supa(`whatsapp_conversations?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_message_at: new Date().toISOString(), occurrence_id: occurrenceId || existing[0].occurrence_id || null })
    });
    return updated[0] || existing[0];
  }
  const rows = await supa('whatsapp_conversations', {
    method: 'POST',
    body: JSON.stringify([{ city_id: cityId, channel_id: channelId || null, citizen_phone: phone, status: 'aberta', last_message_at: new Date().toISOString(), occurrence_id: occurrenceId }])
  });
  return rows[0];
}


export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return ok(res, {});
  if (!requireConfig(res)) return;
  const raw = req.url.split('?')[0].replace(/^\/api\/?/, '');
  const pathname = `/api/${raw}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/api';
  const { body, rawBodyText } = await readBody(req);
  try {
    const boot = await bootstrapData();
    const cityId = body.cityId || new URL(req.url, 'https://x.local').searchParams.get('cityId') || boot.city.id;
    if (pathname === '/api/public/bootstrap' && req.method === 'GET') return ok(res, boot);
    if (pathname === '/api/public/transparency' && req.method === 'GET') {
      const rows = await supa(`occurrences?city_id=eq.${cityId}&select=*`);
      const activeAlerts = await supa(`alerts?city_id=eq.${cityId}&active=eq.true&select=*`).then(r => r.map(alertFromDb));
      return ok(res, { metrics: metrics(rows), activeAlerts });
    }
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const email = String(body.email || '').toLowerCase();
      const rows = await supa(`app_users?email=eq.${encodeURIComponent(email)}&active=eq.true&select=*&limit=1`);
      const user = userFromDb(rows[0]);
      if (!user || String(body.password || '') !== 'CidadeOS@123') return fail(res, 401, 'E-mail ou senha inválidos.');
      await audit(user.cityId, user.id, 'LOGIN_DEMO', 'User', user.id);
      return ok(res, { token: signToken(user), user });
    }
    if (pathname === '/api/auth/me' && req.method === 'GET') {
  
    const whatsappWebhook = pathname.match(/^\/api\/webhooks\/whatsapp\/([^/]+)$/);
    if (whatsappWebhook && req.method === 'GET') {
      const hookCityId = decodeURIComponent(whatsappWebhook[1]);
      const params = new URL(req.url, 'https://x.local').searchParams;
      const mode = params.get('hub.mode');
      const token = params.get('hub.verify_token');
      const challenge = params.get('hub.challenge') || '';
      const channel = (await supa(`whatsapp_channels?city_id=eq.${hookCityId}&select=*&limit=1`))[0];
      const expectedToken = channel?.verify_token_encrypted || '';
      if (mode === 'subscribe' && expectedToken && token === expectedToken) {
        await supa(`whatsapp_channels?id=eq.${channel.id}`, { method: 'PATCH', body: JSON.stringify({ connection_status: 'WEBHOOK_VERIFICADO', last_verified_at: new Date().toISOString(), last_error: null }) });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(challenge);
        return;
      }
      return fail(res, 403, 'Verify Token inválido para este canal.');
    }
    if (whatsappWebhook && req.method === 'POST') {
      const signatureCheck = verifyWhatsAppSignature(req, rawBodyText);
      if (!signatureCheck.ok) {
        await supa('whatsapp_webhook_events', {
          method: 'POST',
          body: JSON.stringify([{ event_type: 'WHATSAPP_SIGNATURE_INVALID', payload_json: { error: signatureCheck.error }, processed: false, error_message: signatureCheck.error }])
        }).catch(() => {});
        return fail(res, 403, signatureCheck.error || 'Assinatura inválida.');
      }
      const hookCityId = decodeURIComponent(whatsappWebhook[1]);
      const channel = (await supa(`whatsapp_channels?city_id=eq.${hookCityId}&select=*&limit=1`))[0];
      const eventRows = await supa('whatsapp_webhook_events', {
        method: 'POST',
        body: JSON.stringify([{ city_id: hookCityId, channel_id: channel?.id || null, event_type: 'whatsapp_webhook', payload_json: body, processed: false }])
      });
      const parsed = extractWhatsAppWebhookMessages(body);
      const [categories, departments, subcategories, neighborhoods, occurrenceRows] = await Promise.all([
        supa('occurrence_categories?active=eq.true&select=*&order=sort_order.asc').then(r => r.map(categoryFromDb)),
        supa(`departments?city_id=eq.${hookCityId}&active=eq.true&select=*&order=name.asc`).then(r => r.map(departmentFromDb)),
        supa('occurrence_subcategories?active=eq.true&select=*&order=sort_order.asc').then(r => r.map(subcategoryFromDb)),
        supa(`neighborhoods?city_id=eq.${hookCityId}&active=eq.true&select=*&order=name.asc`).then(r => r.map(neighborhoodFromDb)),
        supa(`occurrences?city_id=eq.${hookCityId}&select=*&order=created_at.desc&limit=60`).then(r => r.map(occurrenceBaseFromDb))
      ]);
      const inserted = [];
      for (const item of parsed) {
        try {
          if (item.isStatus) {
            await supa('whatsapp_webhook_events', {
              method: 'POST',
              body: JSON.stringify([{ city_id: hookCityId, channel_id: channel?.id || null, event_type: 'whatsapp_status', payload_json: item.raw, processed: true }])
            });
            continue;
          }
          const conversation = await upsertWhatsAppConversation({ cityId: hookCityId, channelId: channel?.id || null, phone: item.from });
          const suggestion = buildAssistiveTriageFallback({ text: item.body, messageBody: item.body, categories, departments, subcategories, neighborhoods, occurrences: occurrenceRows, cityId: hookCityId });
          const rows = await supa('whatsapp_messages', {
            method: 'POST',
            body: JSON.stringify([{
              city_id: hookCityId,
              channel_id: channel?.id || null,
              conversation_id: conversation?.id || null,
              citizen_phone: item.from,
              direction: 'received',
              processing_status: 'pendente_triagem',
              message_type: item.type,
              message_body: item.body,
              meta_message_id: item.metaMessageId,
              prepared_response: 'Recebemos sua mensagem no canal oficial. Para registrar corretamente, informe bairro, rua ou ponto de referência.',
              payload_json: {
                source: 'meta_cloud_api',
                mediaId: item.mediaId,
                mediaMimeType: item.mediaMimeType,
                mediaSha256: item.mediaSha256,
                phoneNumberId: item.phoneNumberId,
                suggestedCategoryId: suggestion.categoryId,
                suggestedPriority: suggestion.priority,
                localTriageSuggestion: suggestion,
                raw: item.raw
              }
            }])
          });
          const savedMessage = rows[0];
          if (item.mediaId && channel?.access_token_encrypted) {
            try {
              const storedMedia = await uploadWhatsAppMediaToStorage({
                cityId: hookCityId,
                messageId: savedMessage?.id,
                mediaId: item.mediaId,
                channel,
                mimeType: item.mediaMimeType
              });
              const mediaPatch = {
                media_storage_bucket: storedMedia.bucket || WHATSAPP_MEDIA_BUCKET,
                media_storage_path: storedMedia.path || null,
                media_downloaded_at: storedMedia.uploaded ? new Date().toISOString() : null,
                payload_json: { ...(savedMessage.payload_json || {}), storedMedia }
              };
              await supa(`whatsapp_messages?id=eq.${savedMessage.id}`, {
                method: 'PATCH',
                body: JSON.stringify(mediaPatch)
              }).catch(() => {});
              Object.assign(savedMessage, mediaPatch);
              await audit(hookCityId, null, 'WHATSAPP_MEDIA_STORED', 'WhatsAppMessage', savedMessage.id, storedMedia);
            } catch (mediaError) {
              const mediaErrorPatch = { error_message: `Mídia recebida, mas não baixada: ${mediaError.message}` };
              await supa(`whatsapp_messages?id=eq.${savedMessage.id}`, {
                method: 'PATCH',
                body: JSON.stringify(mediaErrorPatch)
              }).catch(() => {});
              Object.assign(savedMessage, mediaErrorPatch);
              await audit(hookCityId, null, 'WHATSAPP_MEDIA_STORE_FAILED', 'WhatsAppMessage', savedMessage.id, { error: mediaError.message, mediaId: item.mediaId });
            }
          }
          inserted.push(messageFromDb(savedMessage));
        } catch (err) {
          await supa('whatsapp_webhook_events', {
            method: 'POST',
            body: JSON.stringify([{ city_id: hookCityId, channel_id: channel?.id || null, event_type: 'whatsapp_message_error', payload_json: { item, error: err.message }, processed: false, error_message: err.message }])
          });
        }
      }
      await supa(`whatsapp_webhook_events?id=eq.${eventRows[0]?.id}`, { method: 'PATCH', body: JSON.stringify({ processed: true, processed_at: new Date().toISOString() }) }).catch(() => {});
      if (channel?.id) {
        await supa(`whatsapp_channels?id=eq.${channel.id}`, { method: 'PATCH', body: JSON.stringify({ connection_status: 'WEBHOOK_RECEBENDO_EVENTOS', last_verified_at: new Date().toISOString(), last_error: null }) }).catch(() => {});
      }
      return ok(res, { received: true, insertedMessages: inserted.length, messages: inserted });
    }

    const user = await currentUser(req);
      if (!user) return fail(res, 401, 'Sessão inválida.');
      return ok(res, { user });
    }
    if (pathname === '/api/public/occurrences' && req.method === 'POST') {
      const catRows = await supa(`occurrence_categories?id=eq.${encodeURIComponent(body.categoryId || '')}&select=*`);
      const category = catRows[0] || (await supa('occurrence_categories?active=eq.true&select=*&limit=1'))[0];
      const sub = body.subcategoryId ? (await supa(`occurrence_subcategories?id=eq.${encodeURIComponent(body.subcategoryId)}&select=*`))[0] : null;
      const priority = dbPriority(body.priority || priorityFromDb[sub?.default_priority] || 'MEDIA');
      const location = normalizeLocationPayload(body);
      const insert = [{ city_id: cityId, title: body.title || 'Ocorrência registrada pelo morador', description: body.description || '', category_id: category?.id || null, subcategory_id: sub?.id || null, neighborhood_id: body.neighborhoodId || null, department_id: category?.default_department_id || null, citizen_name: body.citizenName || 'Morador', citizen_phone: body.citizenPhone || '', citizen_email: body.citizenEmail || '', priority, status: 'recebido', origin: 'portal', address: body.address || '', reference_point: body.referencePoint || '', latitude: location.latitude, longitude: location.longitude, public_visibility: true, sla_due_at: computeSla(priorityFromDb[priority] || 'MEDIA'), public_message: 'Ocorrência recebida pelo Portal de Atendimento ao Cidadão.' }];
      const rows = await supa('occurrences', { method: 'POST', body: JSON.stringify(insert) });
      const occ = rows[0];
      await supa('occurrence_status_history', { method: 'POST', body: JSON.stringify([{ occurrence_id: occ.id, city_id: occ.city_id, old_status: null, new_status: 'recebido', public_message: occ.public_message, visibility: 'publica' }]) });
      if (body.attachmentDataUrl) {
        try {
          await createOccurrenceAttachment({ occurrence: occ, userId: null, dataUrl: body.attachmentDataUrl, fileName: body.attachmentFileName || 'foto-ocorrencia', visibility: 'publica' });
          await audit(occ.city_id, null, 'PUBLIC_OCCURRENCE_ATTACHMENT_CREATED', 'Occurrence', occ.id, { origin: 'portal' });
        } catch (attachmentError) {
          await audit(occ.city_id, null, 'PUBLIC_OCCURRENCE_ATTACHMENT_FAILED', 'Occurrence', occ.id, { error: attachmentError.message });
          throw attachmentError;
        }
      }
      await audit(occ.city_id, null, 'PUBLIC_OCCURRENCE_CREATED', 'Occurrence', occ.id, { origin: 'portal', locationPrecision: location.locationPrecision });
      const [serialized] = await serializeRows([occ], occ.city_id);
      return ok(res, { occurrence: publicOccurrence(serialized) });
    }
    const pubOcc = pathname.match(/^\/api\/public\/occurrences\/([^/]+)$/);
    if (pubOcc && req.method === 'GET') {
      const protocol = decodeURIComponent(pubOcc[1]).toUpperCase();
      const rows = await supa(`occurrences?protocol=eq.${encodeURIComponent(protocol)}&select=*&limit=1`);
      if (!rows[0]) return fail(res, 404, 'Protocolo não encontrado.');
      const [serialized] = await serializeRows(rows, rows[0].city_id);
      return ok(res, { occurrence: publicOccurrence(serialized) });
    }


    const whatsappWebhook = pathname.match(/^\/api\/webhooks\/whatsapp\/([^/]+)$/);
    if (whatsappWebhook && req.method === 'GET') {
      const hookCityId = decodeURIComponent(whatsappWebhook[1]);
      const params = new URL(req.url, 'https://x.local').searchParams;
      const mode = params.get('hub.mode');
      const token = params.get('hub.verify_token');
      const challenge = params.get('hub.challenge') || '';
      const channel = (await supa(`whatsapp_channels?city_id=eq.${hookCityId}&select=*&limit=1`))[0];
      const expectedToken = channel?.verify_token_encrypted || '';
      if (mode === 'subscribe' && expectedToken && token === expectedToken) {
        await supa(`whatsapp_channels?id=eq.${channel.id}`, { method: 'PATCH', body: JSON.stringify({ connection_status: 'WEBHOOK_VERIFICADO', last_verified_at: new Date().toISOString(), last_error: null }) });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(challenge);
        return;
      }
      return fail(res, 403, 'Verify Token inválido para este canal.');
    }
    if (whatsappWebhook && req.method === 'POST') {
      const signatureCheck = verifyWhatsAppSignature(req, rawBodyText);
      if (!signatureCheck.ok) {
        await supa('whatsapp_webhook_events', {
          method: 'POST',
          body: JSON.stringify([{ event_type: 'WHATSAPP_SIGNATURE_INVALID', payload_json: { error: signatureCheck.error }, processed: false, error_message: signatureCheck.error }])
        }).catch(() => {});
        return fail(res, 403, signatureCheck.error || 'Assinatura inválida.');
      }
      const hookCityId = decodeURIComponent(whatsappWebhook[1]);
      const channel = (await supa(`whatsapp_channels?city_id=eq.${hookCityId}&select=*&limit=1`))[0];
      const eventRows = await supa('whatsapp_webhook_events', {
        method: 'POST',
        body: JSON.stringify([{ city_id: hookCityId, channel_id: channel?.id || null, event_type: 'whatsapp_webhook', payload_json: body, processed: false }])
      });
      const parsed = extractWhatsAppWebhookMessages(body);
      const inserted = [];
      for (const item of parsed) {
        try {
          if (item.isStatus) {
            await supa('whatsapp_webhook_events', {
              method: 'POST',
              body: JSON.stringify([{ city_id: hookCityId, channel_id: channel?.id || null, event_type: 'whatsapp_status', payload_json: item.raw, processed: true }])
            });
            continue;
          }
          const conversation = await upsertWhatsAppConversation({ cityId: hookCityId, channelId: channel?.id || null, phone: item.from });
          const rows = await supa('whatsapp_messages', {
            method: 'POST',
            body: JSON.stringify([{
              city_id: hookCityId,
              channel_id: channel?.id || null,
              conversation_id: conversation?.id || null,
              citizen_phone: item.from,
              direction: 'received',
              processing_status: 'pendente_triagem',
              message_type: item.type,
              message_body: item.body,
              meta_message_id: item.metaMessageId,
              prepared_response: 'Recebemos sua mensagem no canal oficial. Para registrar corretamente, informe bairro, rua ou ponto de referência.',
              payload_json: {
                source: 'meta_cloud_api',
                mediaId: item.mediaId,
                mediaMimeType: item.mediaMimeType,
                mediaSha256: item.mediaSha256,
                phoneNumberId: item.phoneNumberId,
                raw: item.raw
              }
            }])
          });
          const savedMessage = rows[0];
          if (item.mediaId && channel?.access_token_encrypted) {
            try {
              const storedMedia = await uploadWhatsAppMediaToStorage({
                cityId: hookCityId,
                messageId: savedMessage?.id,
                mediaId: item.mediaId,
                channel,
                mimeType: item.mediaMimeType
              });
              const mediaPatch = {
                media_storage_bucket: storedMedia.bucket || WHATSAPP_MEDIA_BUCKET,
                media_storage_path: storedMedia.path || null,
                media_downloaded_at: storedMedia.uploaded ? new Date().toISOString() : null,
                payload_json: { ...(savedMessage.payload_json || {}), storedMedia }
              };
              await supa(`whatsapp_messages?id=eq.${savedMessage.id}`, {
                method: 'PATCH',
                body: JSON.stringify(mediaPatch)
              }).catch(() => {});
              Object.assign(savedMessage, mediaPatch);
              await audit(hookCityId, null, 'WHATSAPP_MEDIA_STORED', 'WhatsAppMessage', savedMessage.id, storedMedia);
            } catch (mediaError) {
              const mediaErrorPatch = { error_message: `Mídia recebida, mas não baixada: ${mediaError.message}` };
              await supa(`whatsapp_messages?id=eq.${savedMessage.id}`, {
                method: 'PATCH',
                body: JSON.stringify(mediaErrorPatch)
              }).catch(() => {});
              Object.assign(savedMessage, mediaErrorPatch);
              await audit(hookCityId, null, 'WHATSAPP_MEDIA_STORE_FAILED', 'WhatsAppMessage', savedMessage.id, { error: mediaError.message, mediaId: item.mediaId });
            }
          }
          inserted.push(messageFromDb(savedMessage));
        } catch (err) {
          await supa('whatsapp_webhook_events', {
            method: 'POST',
            body: JSON.stringify([{ city_id: hookCityId, channel_id: channel?.id || null, event_type: 'whatsapp_message_error', payload_json: { item, error: err.message }, processed: false, error_message: err.message }])
          });
        }
      }
      await supa(`whatsapp_webhook_events?id=eq.${eventRows[0]?.id}`, { method: 'PATCH', body: JSON.stringify({ processed: true, processed_at: new Date().toISOString() }) }).catch(() => {});
      if (channel?.id) {
        await supa(`whatsapp_channels?id=eq.${channel.id}`, { method: 'PATCH', body: JSON.stringify({ connection_status: 'WEBHOOK_RECEBENDO_EVENTOS', last_verified_at: new Date().toISOString(), last_error: null }) }).catch(() => {});
      }
      return ok(res, { received: true, insertedMessages: inserted.length, messages: inserted });
    }

    const user = await currentUser(req);
    if (!user) return fail(res, 401, 'Entre para acessar o painel.');

    if (pathname === '/api/triage/suggest' && req.method === 'POST') {
      const targetCityId = user.cityId || cityId;
      const [categories, departments, subcategories, neighborhoods, occurrenceRows] = await Promise.all([
        supa('occurrence_categories?active=eq.true&select=*&order=sort_order.asc').then(r => r.map(categoryFromDb)),
        supa(`departments?city_id=eq.${targetCityId}&active=eq.true&select=*&order=name.asc`).then(r => r.map(departmentFromDb)),
        supa('occurrence_subcategories?active=eq.true&select=*&order=sort_order.asc').then(r => r.map(subcategoryFromDb)),
        supa(`neighborhoods?city_id=eq.${targetCityId}&active=eq.true&select=*&order=name.asc`).then(r => r.map(neighborhoodFromDb)),
        supa(`occurrences?city_id=eq.${targetCityId}&select=*&order=created_at.desc&limit=60`).then(r => r.map(occurrenceBaseFromDb))
      ]);
      const text = [body.text, body.title, body.description, body.address, body.referencePoint, body.messageBody].filter(Boolean).join(' ');
      const suggestion = await buildAssistiveTriageSuggestion({ ...body, text, categories, departments, subcategories, neighborhoods, occurrences: occurrenceRows, cityId: targetCityId });
      return ok(res, { suggestion });
    }

    if (pathname === '/api/dashboard/city' && req.method === 'GET') {
      const rows = await supa(`occurrences?city_id=eq.${user.cityId || cityId}&select=*&order=created_at.desc`);
      const recentRows = rows.slice(0, 8);
      const recentOccurrences = recentRows.length ? await serializeRows(recentRows, user.cityId || cityId) : [];
      return ok(res, { metrics: metrics(rows), recentOccurrences });
    }
    if (pathname === '/api/occurrences' && req.method === 'GET') {
      const rows = await supa(`occurrences?city_id=eq.${user.cityId || cityId}&select=*&order=created_at.desc`);
      let occurrences = rows.length ? await serializeRows(rows, user.cityId || cityId) : [];
      const params = new URL(req.url, 'http://localhost').searchParams;
      const q = String(params.get('q') || '').trim().toLowerCase();
      const status = params.get('status');
      const priority = params.get('priority');
      const categoryId = params.get('categoryId');
      const evidence = params.get('evidence');
      const origin = String(params.get('origin') || '').trim().toLowerCase();
      if (status) occurrences = occurrences.filter(o => o.status === status);
      if (priority) occurrences = occurrences.filter(o => o.priority === priority);
      if (categoryId) occurrences = occurrences.filter(o => o.categoryId === categoryId);
      if (origin) occurrences = occurrences.filter(o => String(o.origin || o.sourceChannel || '').toLowerCase().includes(origin));
      if (evidence === 'with') occurrences = occurrences.filter(o => (o.attachments || []).some(a => !a.archivedAt && !a.deletedAt));
      if (evidence === 'without') occurrences = occurrences.filter(o => !(o.attachments || []).some(a => !a.archivedAt && !a.deletedAt));
      if (q) occurrences = occurrences.filter(o => `${o.protocol} ${o.title} ${o.description} ${o.address} ${o.referencePoint}`.toLowerCase().includes(q));
      return ok(res, { occurrences });
    }
    const occDetail = pathname.match(/^\/api\/occurrences\/([^/]+)$/);
    if (occDetail && req.method === 'GET') {
      const id = decodeURIComponent(occDetail[1]);
      const rows = await supa(`occurrences?or=(id.eq.${id},protocol.eq.${id})&select=*&limit=1`);
      if (!rows[0]) return fail(res, 404, 'Ocorrência não encontrada.');
      const [occ] = await serializeRows(rows, rows[0].city_id);
      return ok(res, { occurrence: occ });
    }
    const occDuplicateCandidates = pathname.match(/^\/api\/occurrences\/([^/]+)\/duplicate-candidates$/);
    if (occDuplicateCandidates && req.method === 'GET') {
      const id = encodeURIComponent(decodeURIComponent(occDuplicateCandidates[1]));
      const rows = await supa(`occurrences?or=(id.eq.${id},protocol.eq.${id})&select=*&limit=1`);
      const occurrence = rows[0];
      if (!occurrence) return fail(res, 404, 'Ocorrencia nao encontrada.');
      if (user.cityId && user.cityId !== occurrence.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      return ok(res, await duplicateContextFromSupabase(occurrence));
    }
    const occStatus = pathname.match(/^\/api\/occurrences\/([^/]+)\/status$/);
    if (occStatus && ['PATCH','POST'].includes(req.method)) {
      const id = occStatus[1];
      const oldRows = await supa(`occurrences?id=eq.${id}&select=*&limit=1`);
      const old = oldRows[0];
      if (!old) return fail(res, 404, 'Ocorrência não encontrada.');
      const updates = { status: dbStatus(body.status), public_message: body.publicMessage || old.public_message || null, resolved_at: dbStatus(body.status) === 'resolvido' ? new Date().toISOString() : old.resolved_at };
      const rows = await supa(`occurrences?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await supa('occurrence_status_history', { method: 'POST', body: JSON.stringify([{ occurrence_id: id, city_id: old.city_id, changed_by: user.id, old_status: old.status, new_status: updates.status, public_message: updates.public_message, visibility: 'publica' }]) });
      await audit(old.city_id, user.id, 'OCCURRENCE_STATUS_UPDATED', 'Occurrence', id, updates);
      const [occ] = await serializeRows(rows, old.city_id);
      return ok(res, { occurrence: occ });
    }
    const occPriority = pathname.match(/^\/api\/occurrences\/([^/]+)\/priority$/);
    if (occPriority && req.method === 'PATCH') {
      const priority = String(body.priority || '').toUpperCase();
      const rows = await supa(`occurrences?id=eq.${occPriority[1]}`, { method: 'PATCH', body: JSON.stringify({ priority: dbPriority(priority), sla_due_at: computeSla(priority) }) });
      const [occ] = rows.length ? await serializeRows(rows, rows[0].city_id) : [null];
      return ok(res, { occurrence: occ });
    }
    const occTriageSuggestion = pathname.match(/^\/api\/occurrences\/([^/]+)\/triage-suggestion$/);
    if (occTriageSuggestion && req.method === 'PATCH') {
      const id = decodeURIComponent(occTriageSuggestion[1]);
      const encodedId = encodeURIComponent(id);
      const oldRows = await supa(`occurrences?or=(id.eq.${encodedId},protocol.eq.${encodedId})&select=*&limit=1`);
      const old = oldRows[0];
      if (!old) return fail(res, 404, 'Ocorrência não encontrada.');
      if (user.cityId && user.cityId !== old.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      const suggestion = body.suggestion || {};
      const pickSuggested = (key) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : suggestion[key];
      const updates = { updated_at: new Date().toISOString() };
      const categoryId = pickSuggested('categoryId');
      const subcategoryId = pickSuggested('subcategoryId');
      const departmentId = pickSuggested('departmentId');
      const priority = String(pickSuggested('priority') || '').toUpperCase();
      const publicMessage = String(pickSuggested('publicMessage') || pickSuggested('citizenResponse') || '').trim();
      if (categoryId) {
        const category = (await supa(`occurrence_categories?id=eq.${encodeURIComponent(categoryId)}&active=eq.true&select=*&limit=1`))[0];
        if (category) updates.category_id = category.id;
      }
      if (subcategoryId) {
        const subcategory = (await supa(`occurrence_subcategories?id=eq.${encodeURIComponent(subcategoryId)}&active=eq.true&select=*&limit=1`))[0];
        if (subcategory) updates.subcategory_id = subcategory.id;
      }
      if (departmentId) {
        const department = (await supa(`departments?id=eq.${encodeURIComponent(departmentId)}&city_id=eq.${old.city_id}&active=eq.true&select=*&limit=1`))[0];
        if (department) updates.department_id = department.id;
      }
      if (['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(priority)) {
        updates.priority = dbPriority(priority);
        updates.sla_due_at = computeSla(priority);
      }
      if (publicMessage) updates.public_message = publicMessage;
      const rows = await supa(`occurrences?id=eq.${old.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await supa('occurrence_status_history', { method: 'POST', body: JSON.stringify([{ occurrence_id: old.id, city_id: old.city_id, changed_by: user.id, old_status: old.status, new_status: old.status, comment: triageSuggestionApplicationComment(suggestion), public_message: updates.public_message || old.public_message || null, visibility: 'publica' }]) });
      await audit(old.city_id, user.id, 'ASSISTIVE_TRIAGE_SUGGESTION_APPLIED', 'Occurrence', old.id, { before: { categoryId: old.category_id, subcategoryId: old.subcategory_id, departmentId: old.department_id, priority: old.priority }, updates, confidence: suggestion.confidence, source: suggestion.source, riskLevel: suggestion.riskLevel, duplicateRisk: suggestion.duplicateRisk, missingFields: suggestion.missingFields || [] });
      const [occ] = rows.length ? await serializeRows(rows, old.city_id) : [null];
      return ok(res, { occurrence: occ });
    }
    const occAssign = pathname.match(/^\/api\/occurrences\/([^/]+)\/assign$/);
    if (occAssign && req.method === 'PATCH') {
      const rows = await supa(`occurrences?id=eq.${occAssign[1]}`, { method: 'PATCH', body: JSON.stringify({ department_id: body.departmentId || null, assigned_agent_id: body.assignedAgentId || null }) });
      const [occ] = rows.length ? await serializeRows(rows, rows[0].city_id) : [null];
      return ok(res, { occurrence: occ });
    }
    const occDup = pathname.match(/^\/api\/occurrences\/([^/]+)\/mark-duplicate$/);
    if (occDup && req.method === 'PATCH') {
      if (!['SUPER_ADMIN','CITY_ADMIN','DEPARTMENT_MANAGER'].includes(user.role)) return fail(res, 403, 'Acesso restrito para esta acao.');
      const id = encodeURIComponent(decodeURIComponent(occDup[1]));
      const target = String(body.duplicateOfId || body.candidateId || body.protocol || '').trim();
      if (!target) return fail(res, 400, 'Informe o protocolo ou id da ocorrencia principal.');
      const [oldRows, parentRows] = await Promise.all([
        supa(`occurrences?or=(id.eq.${id},protocol.eq.${id})&select=*&limit=1`),
        supa(`occurrences?or=(id.eq.${encodeURIComponent(target)},protocol.eq.${encodeURIComponent(target)})&select=*&limit=1`)
      ]);
      const old = oldRows[0];
      const parent = parentRows[0];
      if (!old || !parent) return fail(res, 404, 'Ocorrencia original ou principal nao encontrada.');
      if (user.cityId && user.cityId !== old.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      if (old.city_id !== parent.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      if (old.id === parent.id) return fail(res, 400, 'Uma ocorrencia nao pode ser duplicada dela mesma.');
      if (parent.duplicate_of_id === old.id) return fail(res, 400, 'Vinculo recusado para evitar ciclo de duplicidade.');
      const archiveDuplicate = Boolean(body.archiveDuplicate);
      const now = new Date().toISOString();
      const updates = {
        status: archiveDuplicate ? 'arquivado' : 'duplicado',
        duplicate_of_id: parent.id,
        public_message: `Esta ocorrencia foi vinculada ao protocolo principal ${parent.protocol}.`,
        updated_at: now
      };
      const rows = await supa(`occurrences?id=eq.${old.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      await supa('occurrence_status_history', { method: 'POST', body: JSON.stringify([{
        occurrence_id: old.id,
        city_id: old.city_id,
        changed_by: user.id,
        old_status: old.status,
        new_status: updates.status,
        comment: `${archiveDuplicate ? 'Ocorrencia arquivada como duplicada' : 'Ocorrencia marcada como duplicada'} do protocolo ${parent.protocol}.`,
        public_message: updates.public_message,
        visibility: 'publica'
      }]) });
      await supa('occurrence_comments', { method: 'POST', body: JSON.stringify([{
        occurrence_id: parent.id,
        city_id: parent.city_id,
        user_id: user.id,
        comment: `Ocorrencia ${old.protocol} agrupada como duplicada. ${trimAssistiveText(old.title || old.description || '', 140)}`,
        visibility: 'interna'
      }]) });
      await audit(old.city_id, user.id, archiveDuplicate ? 'OCCURRENCE_ARCHIVED_AS_DUPLICATE' : 'OCCURRENCE_MARKED_DUPLICATE', 'Occurrence', old.id, { duplicateOfId: parent.id, parentProtocol: parent.protocol, archiveDuplicate, previousStatus: old.status });
      const [occ] = rows.length ? await serializeRows(rows, rows[0].city_id) : [null];
      return ok(res, { occurrence: occ });
    }
    const occComment = pathname.match(/^\/api\/occurrences\/([^/]+)\/comments$/);
    if (occComment && req.method === 'POST') {
      const occRows = await supa(`occurrences?id=eq.${occComment[1]}&select=city_id&limit=1`);
      await supa('occurrence_comments', { method: 'POST', body: JSON.stringify([{ occurrence_id: occComment[1], city_id: occRows[0]?.city_id || user.cityId, user_id: user.id, comment: body.comment || '', visibility: String(body.visibility || 'interna').toLowerCase() }]) });
      return ok(res, {});
    }
    const occAttachment = pathname.match(/^\/api\/occurrences\/([^/]+)\/attachments$/);
    if (occAttachment && req.method === 'POST') {
      const id = decodeURIComponent(occAttachment[1]);
      const occRows = await supa(`occurrences?or=(id.eq.${id},protocol.eq.${id})&select=*&limit=1`);
      const occ = occRows[0];
      if (!occ) return fail(res, 404, 'Ocorrência não encontrada.');
      if (user.cityId && user.cityId !== occ.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      const attachment = await createOccurrenceAttachment({ occurrence: occ, userId: user.id, dataUrl: body.attachmentDataUrl, fileName: body.fileName || 'anexo-operacional', visibility: body.visibility || 'publica' });
      await audit(occ.city_id, user.id, 'OCCURRENCE_ATTACHMENT_CREATED', 'Occurrence', occ.id, { attachmentId: attachment?.id, visibility: attachment?.visibility });
      return ok(res, { attachment });
    }
    const attachmentVisibility = pathname.match(/^\/api\/attachments\/([^/]+)\/visibility$/);
    if (attachmentVisibility && req.method === 'PATCH') {
      const id = decodeURIComponent(attachmentVisibility[1]);
      const current = (await supa(`occurrence_attachments?id=eq.${id}&select=*&limit=1`))[0];
      if (!current) return fail(res, 404, 'Anexo não encontrado.');
      if (user.cityId && user.cityId !== current.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      const allowed = ['publica','interna','restrita'];
      const visibility = allowed.includes(String(body.visibility || '').toLowerCase()) ? String(body.visibility).toLowerCase() : 'interna';
      const rows = await supa(`occurrence_attachments?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ visibility }) });
      await audit(current.city_id, user.id, 'ATTACHMENT_VISIBILITY_UPDATED', 'Attachment', id, { visibility, occurrenceId: current.occurrence_id });
      return ok(res, { attachment: rows[0] ? await attachmentFromDb(rows[0]) : null });
    }
    const attachmentArchive = pathname.match(/^\/api\/attachments\/([^/]+)\/archive$/);
    if (attachmentArchive && req.method === 'POST') {
      const id = decodeURIComponent(attachmentArchive[1]);
      const current = (await supa(`occurrence_attachments?id=eq.${id}&select=*&limit=1`))[0];
      if (!current) return fail(res, 404, 'Anexo não encontrado.');
      if (user.cityId && user.cityId !== current.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      let rows = [];
      try {
        rows = await supa(`occurrence_attachments?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ archived_at: new Date().toISOString(), archived_by: user.id, archived_reason: body.reason || 'Arquivado pelo painel.', visibility: 'restrita' }) });
      } catch {
        rows = await supa(`occurrence_attachments?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ visibility: 'restrita' }) });
      }
      await audit(current.city_id, user.id, 'ATTACHMENT_ARCHIVED', 'Attachment', id, { occurrenceId: current.occurrence_id, reason: body.reason || '' });
      return ok(res, { attachment: rows[0] ? await attachmentFromDb(rows[0]) : null });
    }
    const attachmentRemove = pathname.match(/^\/api\/attachments\/([^/]+)$/);
    if (attachmentRemove && req.method === 'DELETE') {
      const id = decodeURIComponent(attachmentRemove[1]);
      const current = (await supa(`occurrence_attachments?id=eq.${id}&select=*&limit=1`))[0];
      if (!current) return fail(res, 404, 'Anexo não encontrado.');
      if (user.cityId && user.cityId !== current.city_id) return fail(res, 403, 'Acesso restrito para esta cidade.');
      await supa(`occurrence_attachments?id=eq.${id}`, { method: 'DELETE' });
      await audit(current.city_id, user.id, 'ATTACHMENT_LINK_REMOVED', 'Attachment', id, { occurrenceId: current.occurrence_id, storagePath: current.storage_path });
      return ok(res, { removed: true });
    }
    const cityNested = pathname.match(/^\/api\/cities\/([^/]+)\/(departments|neighborhoods|users)$/);
    if (cityNested && req.method === 'GET') {
      const key = cityNested[2];
      if (key === 'departments') return ok(res, { departments: await supa(`departments?city_id=eq.${cityNested[1]}&select=*&order=name.asc`).then(r => r.map(departmentFromDb)) });
      if (key === 'neighborhoods') return ok(res, { neighborhoods: await supa(`neighborhoods?city_id=eq.${cityNested[1]}&select=*&order=name.asc`).then(r => r.map(neighborhoodFromDb)) });
      if (key === 'users') return ok(res, { users: await supa(`app_users?city_id=eq.${cityNested[1]}&select=*&order=name.asc`).then(r => r.map(userFromDb)) });
    }
    if (cityNested && req.method === 'POST') {
      const key = cityNested[2];
      if (key === 'departments') return ok(res, { department: departmentFromDb((await supa('departments', { method: 'POST', body: JSON.stringify([{ city_id: cityNested[1], name: body.name, description: body.description || '' }]) }))[0]) });
      if (key === 'neighborhoods') return ok(res, { neighborhood: neighborhoodFromDb((await supa('neighborhoods', { method: 'POST', body: JSON.stringify([{ city_id: cityNested[1], name: body.name, zone: body.zone || '' }]) }))[0]) });
    }
    if (pathname === '/api/reports/monthly' && req.method === 'GET') {
      const rows = await supa(`occurrences?city_id=eq.${user.cityId || cityId}&select=*`);
      return ok(res, { metrics: metrics(rows), occurrences: rows.length ? await serializeRows(rows, user.cityId || cityId) : [] });
    }
    if (pathname === '/api/reports/monthly/generate' && req.method === 'POST') {
      const now = new Date();
      const report = await supa('monthly_reports', { method: 'POST', body: JSON.stringify([{ city_id: user.cityId || cityId, month: now.getMonth()+1, year: now.getFullYear(), summary: 'Relatório gerado no preview compartilhado.', metrics_json: {} }]) });
      return ok(res, { report: report[0] });
    }
    if (pathname === '/api/audit-logs' && req.method === 'GET') return ok(res, { auditLogs: await supa(`audit_logs?city_id=eq.${user.cityId || cityId}&select=*&order=created_at.desc&limit=100`) });
    if (pathname === '/api/whatsapp/config' && req.method === 'GET') {
      const channels = await supa(`whatsapp_channels?city_id=eq.${user.cityId || cityId}&select=*&limit=1`);
      const channel = channelFromDb(channels[0]);
      const msgRows = await supa(`whatsapp_messages?city_id=eq.${user.cityId || cityId}&select=*&order=created_at.desc&limit=80`);
      const occIds = msgRows.map(m => m.occurrence_id).filter(Boolean);
      const occRows = occIds.length ? await supa(`occurrences?id=in.(${occIds.join(',')})&select=*`) : [];
      const occs = occRows.length ? await serializeRows(occRows, user.cityId || cityId) : [];
      const messages = msgRows.map(m => messageFromDb(m, occs.find(o => o.id === m.occurrence_id) || null));
      const events = await supa(`whatsapp_webhook_events?city_id=eq.${user.cityId || cityId}&select=*&order=created_at.desc&limit=40`);
      const filled = ['officialPhone','wabaIdMasked','phoneNumberIdMasked','appIdMasked','accessTokenMasked','webhookVerifyTokenMasked'].filter(k => channel?.[k]).length;
      return ok(res, { channel, events, messages, triage: { waitingInfo: messages.filter(m => m.status === 'AGUARDANDO_INFORMACOES').length }, completeness: { filled, total: 6, percent: Math.round((filled/6)*100) } });
    }
    if (pathname === '/api/whatsapp/config' && req.method === 'PUT') {
      const payload = { city_id: user.cityId || cityId, channel_name: body.channelName || body.channel_name || 'WhatsApp Oficial', official_phone: body.officialPhone || '', default_department_id: body.defaultDepartmentId || null, business_portfolio_id: body.businessPortfolioId || '', waba_id: body.wabaId || '', phone_number_id: body.phoneNumberId || '', app_id: body.appId || '', app_secret_encrypted: body.appSecret || '', access_token_encrypted: body.accessToken || '', verify_token_encrypted: body.webhookVerifyToken || body.verifyToken || '', webhook_url: body.webhookUrl || `/api/webhooks/whatsapp/${user.cityId || cityId}`, templates_json: body.templatesJson || {}, business_hours_json: body.businessHoursJson || {}, default_welcome_message: body.defaultWelcomeMessage || '', protocol_created_message: body.protocolCreatedMessage || '', status_updated_message: body.statusUpdatedMessage || '', enabled: Boolean(body.enabled), connection_status: 'CONFIGURADO_PREVIEW', created_by: user.id };
      const existing = await supa(`whatsapp_channels?city_id=eq.${payload.city_id}&select=id&limit=1`);
      const rows = existing[0] ? await supa(`whatsapp_channels?id=eq.${existing[0].id}`, { method: 'PATCH', body: JSON.stringify(payload) }) : await supa('whatsapp_channels', { method: 'POST', body: JSON.stringify([payload]) });
      return ok(res, { channel: channelFromDb(rows[0]) });
    }
    if (pathname === '/api/whatsapp/test' && req.method === 'POST') {
      const channel = (await supa(`whatsapp_channels?city_id=eq.${user.cityId || cityId}&select=*&limit=1`))[0];
      const readiness = whatsappReadiness(channel);
      if (!readiness.ready && !body.to) {
        await audit(user.cityId || cityId, user.id, 'WHATSAPP_CONFIG_TESTED_PARTIAL', 'WhatsAppChannel', channel?.id || null, { missing: readiness.missing });
        return ok(res, { ready: false, missing: readiness.missing, message: `Configuração parcial. Faltando: ${readiness.missing.join(', ')}.` });
      }
      if (body.to) {
        const text = body.messageBody || 'Teste de envio do CidadeOS AI pelo WhatsApp Business oficial.';
        const result = await sendWhatsAppText(channel, body.to, text);
        await supa('whatsapp_messages', { method: 'POST', body: JSON.stringify([{
          city_id: user.cityId || cityId,
          channel_id: channel?.id || null,
          citizen_phone: normalizeWhatsAppPhone(body.to),
          direction: result.sent ? 'sent' : 'failed',
          processing_status: result.sent ? 'novo' : 'erro',
          message_type: 'text',
          message_body: text,
          meta_message_id: result.metaMessageId || '',
          payload_json: result.meta || {},
          error_message: result.error || null,
          processed_at: new Date().toISOString()
        }]) }).catch(() => {});
        await supa(`whatsapp_channels?id=eq.${channel.id}`, { method: 'PATCH', body: JSON.stringify({ connection_status: result.sent ? 'ENVIO_REAL_OK' : 'ERRO_ENVIO_REAL', last_verified_at: new Date().toISOString(), last_error: result.error || null }) }).catch(() => {});
        await audit(user.cityId || cityId, user.id, result.sent ? 'WHATSAPP_REAL_TEST_SENT' : 'WHATSAPP_REAL_TEST_FAILED', 'WhatsAppChannel', channel?.id || null, { to: normalizeWhatsAppPhone(body.to), result });
        return ok(res, { ...result, message: result.sent ? 'Mensagem de teste enviada pela WhatsApp Cloud API.' : (result.error || 'Envio real indisponível.') });
      }
      await audit(user.cityId || cityId, user.id, 'WHATSAPP_CONFIG_TESTED', 'WhatsAppChannel', channel?.id || null, { ready: readiness.ready, missing: readiness.missing });
      return ok(res, { ready: readiness.ready, missing: readiness.missing, message: readiness.ready ? 'Configuração pronta para envio real pela WhatsApp Cloud API.' : `Configuração parcial. Faltando: ${readiness.missing.join(', ')}.` });
    }
    if (pathname === '/api/whatsapp/send' && req.method === 'POST') {
      const channel = (await supa(`whatsapp_channels?city_id=eq.${user.cityId || cityId}&select=*&limit=1`))[0];
      const text = body.messageBody || body.text || '';
      const to = body.to || body.citizenPhone || '';
      const result = await sendWhatsAppText(channel, to, text);
      const rows = await supa('whatsapp_messages', { method: 'POST', body: JSON.stringify([{
        city_id: user.cityId || cityId,
        channel_id: channel?.id || null,
        occurrence_id: body.occurrenceId || null,
        citizen_phone: normalizeWhatsAppPhone(to),
        direction: result.sent ? 'sent' : 'failed',
        processing_status: result.sent ? 'novo' : 'erro',
        message_type: 'text',
        message_body: text,
        meta_message_id: result.metaMessageId || '',
        payload_json: result.meta || {},
        error_message: result.error || null,
        processed_at: new Date().toISOString()
      }]) });
      await audit(user.cityId || cityId, user.id, result.sent ? 'WHATSAPP_REAL_MESSAGE_SENT' : 'WHATSAPP_REAL_MESSAGE_FAILED', 'WhatsAppMessage', rows[0]?.id || null, { to: normalizeWhatsAppPhone(to), occurrenceId: body.occurrenceId || null, result });
      return ok(res, { ...result, message: messageFromDb(rows[0]) });
    }
    if (pathname === '/api/whatsapp/send-template' && req.method === 'POST') {
      const channel = (await supa(`whatsapp_channels?city_id=eq.${user.cityId || cityId}&select=*&limit=1`))[0];
      const to = body.to || body.citizenPhone || '';
      const templateName = body.templateName || body.name || '';
      const languageCode = body.languageCode || 'pt_BR';
      const components = Array.isArray(body.components) ? body.components : [];
      const result = await sendWhatsAppTemplate(channel, to, templateName, languageCode, components);
      const rows = await supa('whatsapp_messages', { method: 'POST', body: JSON.stringify([{
        city_id: user.cityId || cityId,
        channel_id: channel?.id || null,
        occurrence_id: body.occurrenceId || null,
        citizen_phone: normalizeWhatsAppPhone(to),
        direction: result.sent ? 'sent' : 'failed',
        processing_status: result.sent ? 'novo' : 'erro',
        message_type: 'template',
        message_body: templateName ? `Template WhatsApp: ${templateName}` : 'Template WhatsApp',
        meta_message_id: result.metaMessageId || '',
        payload_json: { templateName, languageCode, components, meta: result.meta || {} },
        error_message: result.error || null,
        processed_at: new Date().toISOString()
      }]) });
      await audit(user.cityId || cityId, user.id, result.sent ? 'WHATSAPP_TEMPLATE_SENT' : 'WHATSAPP_TEMPLATE_FAILED', 'WhatsAppMessage', rows[0]?.id || null, { to: normalizeWhatsAppPhone(to), occurrenceId: body.occurrenceId || null, templateName, result });
      return ok(res, { ...result, message: messageFromDb(rows[0]) });
    }
    const waSendPrepared = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/send-prepared$/);
    if (waSendPrepared && req.method === 'POST') {
      const msg = (await supa(`whatsapp_messages?id=eq.${waSendPrepared[1]}&select=*&limit=1`))[0];
      if (!msg) return fail(res, 404, 'Mensagem não encontrada.');
      const channel = (await supa(`whatsapp_channels?city_id=eq.${msg.city_id}&select=*&limit=1`))[0];
      const text = body.messageBody || msg.prepared_response || 'Recebemos sua mensagem no canal oficial.';
      const result = await sendWhatsAppText(channel, msg.citizen_phone, text);
      const rows = await supa('whatsapp_messages', { method: 'POST', body: JSON.stringify([{
        city_id: msg.city_id,
        channel_id: msg.channel_id || channel?.id || null,
        conversation_id: msg.conversation_id || null,
        occurrence_id: msg.occurrence_id || null,
        citizen_phone: msg.citizen_phone,
        direction: result.sent ? 'sent' : 'failed',
        processing_status: result.sent ? 'novo' : 'erro',
        message_type: 'text',
        message_body: text,
        meta_message_id: result.metaMessageId || '',
        payload_json: result.meta || {},
        error_message: result.error || null,
        processed_at: new Date().toISOString()
      }]) });
      await audit(msg.city_id, user.id, result.sent ? 'WHATSAPP_PREPARED_REPLY_SENT' : 'WHATSAPP_PREPARED_REPLY_FAILED', 'WhatsAppMessage', msg.id, { outboundId: rows[0]?.id, result });
      return ok(res, { ...result, outboundMessage: messageFromDb(rows[0]) });
    }
    if (pathname === '/api/whatsapp/simulate-message' && req.method === 'POST') {
      const targetCityId = user.cityId || cityId;
      const [cats, deps, subs, neighborhoods, occurrenceRows] = await Promise.all([
        supa('occurrence_categories?active=eq.true&select=*').then(r => r.map(categoryFromDb)),
        supa(`departments?city_id=eq.${targetCityId}&active=eq.true&select=*`).then(r => r.map(departmentFromDb)),
        supa('occurrence_subcategories?active=eq.true&select=*').then(r => r.map(subcategoryFromDb)),
        supa(`neighborhoods?city_id=eq.${targetCityId}&active=eq.true&select=*`).then(r => r.map(neighborhoodFromDb)),
        supa(`occurrences?city_id=eq.${targetCityId}&select=*&order=created_at.desc&limit=60`).then(r => r.map(occurrenceBaseFromDb))
      ]);
      const suggestion = buildAssistiveTriageFallback({ text: body.messageBody, messageBody: body.messageBody, categories: cats, departments: deps, subcategories: subs, neighborhoods, occurrences: occurrenceRows, cityId: targetCityId });
      const cat = cats.find(c => c.id === suggestion.categoryId) || cats[0];
      const pri = suggestion.priority;
      const channel = (await supa(`whatsapp_channels?city_id=eq.${targetCityId}&select=*&limit=1`))[0];
      const rows = await supa('whatsapp_messages', { method: 'POST', body: JSON.stringify([{ city_id: targetCityId, channel_id: channel?.id || null, citizen_phone: body.citizenPhone || '5511999990000', direction: 'received', processing_status: 'pendente_triagem', message_type: 'text', message_body: body.messageBody || '', prepared_response: 'Recebemos sua mensagem. Para registrar corretamente, informe bairro, rua ou ponto de referência.', payload_json: { suggestedCategoryId: cat?.id, suggestedPriority: pri, localTriageSuggestion: suggestion, simulated: true } }]) });
      return ok(res, { message: messageFromDb(rows[0]) });
    }
    const waCreate = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/create-occurrence$/);
    if (waCreate && req.method === 'POST') {
      const msg = (await supa(`whatsapp_messages?id=eq.${waCreate[1]}&select=*&limit=1`))[0];
      if (!msg) return fail(res, 404, 'Mensagem não encontrada.');
      if (msg.occurrence_id) {
        const existingOcc = (await supa(`occurrences?id=eq.${encodeURIComponent(msg.occurrence_id)}&select=*&limit=1`))[0];
        if (existingOcc) {
          const mediaAttachment = await linkWhatsAppMediaAsAttachment({ message: msg, occurrence: existingOcc, userId: user.id, visibility: 'publica' });
          const [serialized] = await serializeRows([existingOcc], existingOcc.city_id);
          return ok(res, { occurrence: serialized, message: messageFromDb(msg, serialized), mediaAttachment, alreadyConverted: true });
        }
      }
      const [cats, deps, subs, neighborhoods, occurrenceRows] = await Promise.all([
        supa('occurrence_categories?active=eq.true&select=*').then(r => r.map(categoryFromDb)),
        supa(`departments?city_id=eq.${msg.city_id}&active=eq.true&select=*`).then(r => r.map(departmentFromDb)),
        supa('occurrence_subcategories?active=eq.true&select=*').then(r => r.map(subcategoryFromDb)),
        supa(`neighborhoods?city_id=eq.${msg.city_id}&active=eq.true&select=*`).then(r => r.map(neighborhoodFromDb)),
        supa(`occurrences?city_id=eq.${msg.city_id}&select=*&order=created_at.desc&limit=60`).then(r => r.map(occurrenceBaseFromDb))
      ]);
      const suggestion = msg.payload_json?.localTriageSuggestion || buildAssistiveTriageFallback({ text: msg.message_body, messageBody: msg.message_body, categories: cats, departments: deps, subcategories: subs, neighborhoods, occurrences: occurrenceRows, cityId: msg.city_id });
      const cat = cats.find(c => c.id === suggestion.categoryId) || cats[0];
      const pri = suggestion.priority;
      const categoryRow = await supa(`occurrence_categories?id=eq.${cat.id}&select=*`).then(r => r[0]);
      const occRows = await supa('occurrences', { method: 'POST', body: JSON.stringify([{ city_id: msg.city_id, title: 'Ocorrência recebida pelo WhatsApp', description: msg.message_body || '', category_id: cat.id, subcategory_id: suggestion.subcategoryId || null, department_id: suggestion.departmentId || categoryRow?.default_department_id || null, priority: dbPriority(pri), status: 'recebido', origin: 'whatsapp', source_channel: 'whatsapp', citizen_phone: msg.citizen_phone, reference_point: 'Relato recebido pelo WhatsApp', public_visibility: true, sla_due_at: computeSla(pri), public_message: suggestion.publicMessage || 'Ocorrência registrada a partir do canal oficial de WhatsApp.' }]) });
      const occ = occRows[0];
      const messagePatch = { processing_status: 'convertido_ocorrencia', occurrence_id: occ.id, prepared_response: `Sua solicitação foi registrada com sucesso. Protocolo: ${occ.protocol}.`, processed_at: new Date().toISOString() };
      const updatedRows = await supa(`whatsapp_messages?id=eq.${msg.id}`, { method: 'PATCH', body: JSON.stringify(messagePatch) });
      const updatedMsg = updatedRows[0] || { ...msg, ...messagePatch };
      await supa('whatsapp_occurrence_links', { method: 'POST', body: JSON.stringify([{ city_id: msg.city_id, whatsapp_message_id: msg.id, occurrence_id: occ.id, created_by: user.id }]) });
      await supa('occurrence_status_history', { method: 'POST', body: JSON.stringify([{ occurrence_id: occ.id, city_id: occ.city_id, new_status: 'recebido', public_message: occ.public_message, visibility: 'publica' }]) });
      const mediaAttachment = await linkWhatsAppMediaAsAttachment({ message: updatedMsg, occurrence: occ, userId: user.id, visibility: 'publica' });
      if (body.sendProtocol === true) {
        const channel = (await supa(`whatsapp_channels?city_id=eq.${msg.city_id}&select=*&limit=1`))[0];
        const text = `Sua solicitação foi registrada com sucesso. Protocolo: ${occ.protocol}.`;
        const result = await sendWhatsAppText(channel, msg.citizen_phone, text);
        await audit(msg.city_id, user.id, result.sent ? 'WHATSAPP_PROTOCOL_SENT' : 'WHATSAPP_PROTOCOL_SEND_FAILED', 'Occurrence', occ.id, { messageId: msg.id, result });
      }
      const [serialized] = await serializeRows([occ], occ.city_id);
      return ok(res, { occurrence: serialized, message: messageFromDb(updatedMsg, serialized), mediaAttachment });
    }
    const waLink = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/link-occurrence$/);
    if (waLink && req.method === 'POST') {
      const occ = (await supa(`occurrences?protocol=eq.${encodeURIComponent(body.protocol || '')}&select=*&limit=1`))[0];
      if (!occ) return fail(res, 404, 'Protocolo não encontrado.');
      const msg = (await supa(`whatsapp_messages?id=eq.${waLink[1]}&select=*&limit=1`))[0];
      if (!msg) return fail(res, 404, 'Mensagem não encontrada.');
      if (msg.city_id !== occ.city_id) return fail(res, 403, 'Mensagem e protocolo pertencem a cidades diferentes.');
      const messagePatch = { processing_status: 'vinculado_protocolo', occurrence_id: occ.id, processed_at: new Date().toISOString() };
      const msgRows = await supa(`whatsapp_messages?id=eq.${waLink[1]}`, { method: 'PATCH', body: JSON.stringify(messagePatch) });
      const updatedMsg = msgRows[0] || { ...msg, ...messagePatch };
      await supa('whatsapp_occurrence_links', { method: 'POST', body: JSON.stringify([{ city_id: occ.city_id, whatsapp_message_id: waLink[1], occurrence_id: occ.id, link_type: 'linked_to_existing', created_by: user.id }]) });
      const mediaAttachment = await linkWhatsAppMediaAsAttachment({ message: updatedMsg, occurrence: occ, userId: user.id, visibility: 'publica' });
      const [serialized] = await serializeRows([occ], occ.city_id);
      return ok(res, { occurrence: serialized, message: messageFromDb(updatedMsg, serialized), mediaAttachment });
    }
    return fail(res, 404, 'Rota não encontrada no modo Supabase compartilhado.');
  } catch (error) {
    console.error('[CidadeOS Supabase API]', error);
    return fail(res, 500, error.message || 'Erro interno.');
  }
}
