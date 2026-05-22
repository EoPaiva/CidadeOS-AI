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
    priority: occ.priority, status: occ.status, address: occ.address, referencePoint: occ.referencePoint, publicMessage: occ.publicMessage,
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
function inferCategory(categories, text = '') {
  const s = String(text).toLowerCase();
  const findKey = (key) => categories.find(c => c.key === key) || categories[0];
  if (/(dengue|mosquito|água parada|agua parada|terreno)/.test(s)) return [findKey('saude_publica'), 'ALTA'];
  if (/(alag|enchente|árvore|arvore|desliz|risco|queda)/.test(s)) return [findKey('defesa_civil'), 'CRITICA'];
  if (/(vazamento|falta d|sem água|sem agua|esgoto|pressão|pressao)/.test(s)) return [findKey('agua_saneamento'), 'ALTA'];
  if (/(idoso|idosa|vulner|assistência|assistencia|visita)/.test(s)) return [findKey('assistencia_social'), 'ALTA'];
  if (/(rural|ponte|estrada|sítio|sitio|roça)/.test(s)) return [findKey('zona_rural'), 'MEDIA'];
  return [findKey('urbano'), /(perigo|acidente|grande|risco)/.test(s) ? 'ALTA' : 'MEDIA'];
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
      if (!user) return fail(res, 401, 'Sessão inválida.');
      return ok(res, { user });
    }
    if (pathname === '/api/public/occurrences' && req.method === 'POST') {
      const catRows = await supa(`occurrence_categories?id=eq.${encodeURIComponent(body.categoryId || '')}&select=*`);
      const category = catRows[0] || (await supa('occurrence_categories?active=eq.true&select=*&limit=1'))[0];
      const sub = body.subcategoryId ? (await supa(`occurrence_subcategories?id=eq.${encodeURIComponent(body.subcategoryId)}&select=*`))[0] : null;
      const priority = dbPriority(body.priority || priorityFromDb[sub?.default_priority] || 'MEDIA');
      const insert = [{ city_id: cityId, title: body.title || 'Ocorrência registrada pelo morador', description: body.description || '', category_id: category?.id || null, subcategory_id: sub?.id || null, neighborhood_id: body.neighborhoodId || null, department_id: category?.default_department_id || null, citizen_name: body.citizenName || 'Morador', citizen_phone: body.citizenPhone || '', citizen_email: body.citizenEmail || '', priority, status: 'recebido', origin: 'portal', address: body.address || '', reference_point: body.referencePoint || '', public_visibility: true, sla_due_at: computeSla(priorityFromDb[priority] || 'MEDIA'), public_message: 'Ocorrência recebida pelo Portal de Atendimento ao Cidadão.' }];
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
      await audit(occ.city_id, null, 'PUBLIC_OCCURRENCE_CREATED', 'Occurrence', occ.id, { origin: 'portal' });
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
      const rows = await supa(`occurrences?id=eq.${occPriority[1]}`, { method: 'PATCH', body: JSON.stringify({ priority: dbPriority(body.priority) }) });
      const [occ] = rows.length ? await serializeRows(rows, rows[0].city_id) : [null];
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
      const main = await supa(`occurrences?protocol=eq.${encodeURIComponent(body.protocol || '')}&select=*&limit=1`);
      if (!main[0]) return fail(res, 404, 'Protocolo principal não encontrado.');
      const rows = await supa(`occurrences?id=eq.${occDup[1]}`, { method: 'PATCH', body: JSON.stringify({ status: 'duplicado', duplicate_of_id: main[0].id, public_message: `Ocorrência duplicada do protocolo ${main[0].protocol}.` }) });
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
      const cats = (await supa('occurrence_categories?active=eq.true&select=*')).map(categoryFromDb);
      const [cat, pri] = inferCategory(cats, body.messageBody);
      const channel = (await supa(`whatsapp_channels?city_id=eq.${user.cityId || cityId}&select=*&limit=1`))[0];
      const rows = await supa('whatsapp_messages', { method: 'POST', body: JSON.stringify([{ city_id: user.cityId || cityId, channel_id: channel?.id || null, citizen_phone: body.citizenPhone || '5511999990000', direction: 'received', processing_status: 'pendente_triagem', message_type: 'text', message_body: body.messageBody || '', prepared_response: 'Recebemos sua mensagem. Para registrar corretamente, informe bairro, rua ou ponto de referência.', payload_json: { suggestedCategoryId: cat?.id, suggestedPriority: pri, simulated: true } }]) });
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
      const cats = (await supa('occurrence_categories?active=eq.true&select=*')).map(categoryFromDb);
      const [cat, pri] = inferCategory(cats, msg.message_body);
      const categoryRow = await supa(`occurrence_categories?id=eq.${cat.id}&select=*`).then(r => r[0]);
      const occRows = await supa('occurrences', { method: 'POST', body: JSON.stringify([{ city_id: msg.city_id, title: 'Ocorrência recebida pelo WhatsApp', description: msg.message_body || '', category_id: cat.id, department_id: categoryRow?.default_department_id || null, priority: dbPriority(pri), status: 'recebido', origin: 'whatsapp', source_channel: 'whatsapp', citizen_phone: msg.citizen_phone, reference_point: 'Relato recebido pelo WhatsApp', public_visibility: true, sla_due_at: computeSla(pri), public_message: 'Ocorrência registrada a partir do canal oficial de WhatsApp.' }]) });
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
