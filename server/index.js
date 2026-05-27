import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createToken, tokenFromRequest, verifyPassword, verifyToken, hashPassword, ROLES } from './auth.js';
import {
  readDb,
  writeDb,
  transaction,
  findUserByEmail,
  findUserById,
  addAudit,
  nextProtocol,
  findDefaultDepartment,
  userCanAccessCity
} from './db.js';
import {
  ensureRuntimeDirs,
  normalizeText,
  nowIso,
  parseJsonBody,
  publicUser,
  PUBLIC_DIR,
  ATTACHMENTS_DIR,
  safeFileJoin,
  sendError,
  sendJson,
  saveDataUrlImage,
  getContentType,
  uuid,
  toSlug,
  monthKey,
  daysBetween
} from './utils.js';

ensureRuntimeDirs();
readDb();

const PORT = Number(process.env.PORT || 3333);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_JSON_SIZE_MB = Number(process.env.MAX_JSON_SIZE_MB || 8);
const MAX_JSON_BYTES = MAX_JSON_SIZE_MB * 1024 * 1024;
const ASSISTIVE_AI_MODEL = process.env.CIDADEOS_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ASSISTIVE_AI_TIMEOUT_MS = Number(process.env.CIDADEOS_AI_TIMEOUT_MS || 8000);

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
}

function notFound(res) {
  sendError(res, 404, 'Rota não encontrada.');
}

function requireAuth(req, res) {
  const token = tokenFromRequest(req);
  const payload = verifyToken(token);
  if (!payload) {
    sendError(res, 401, 'Sessão inválida ou expirada. Faça login novamente.');
    return null;
  }
  const user = findUserById(payload.sub);
  if (!user) {
    sendError(res, 401, 'Usuário não encontrado ou inativo.');
    return null;
  }
  return user;
}

function requireRole(res, user, allowedRoles) {
  if (!allowedRoles.includes(user.role)) {
    sendError(res, 403, 'Acesso restrito. Este módulo não está disponível para o seu perfil.');
    return false;
  }
  return true;
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

function scopeOccurrencesForUser(db, user) {
  let occurrences = db.occurrences;
  if (user.role !== 'SUPER_ADMIN') {
    occurrences = occurrences.filter((occurrence) => occurrence.cityId === user.cityId);
  }
  if ([ROLES.AGENT, ROLES.HEALTH_AGENT].includes(user.role)) {
    occurrences = occurrences.filter((occurrence) => occurrence.assignedAgentId === user.id || occurrence.departmentId === user.departmentId);
  }
  if (user.role === ROLES.DEPARTMENT_MANAGER) {
    occurrences = occurrences.filter((occurrence) => occurrence.departmentId === user.departmentId);
  }
  return occurrences;
}

function serializeOccurrence(db, occurrence) {
  const city = db.cities.find((item) => item.id === occurrence.cityId) || null;
  const neighborhood = db.neighborhoods.find((item) => item.id === occurrence.neighborhoodId) || null;
  const category = db.categories.find((item) => item.id === occurrence.categoryId) || null;
  const subcategory = db.subcategories.find((item) => item.id === occurrence.subcategoryId) || null;
  const department = db.departments.find((item) => item.id === occurrence.departmentId) || null;
  const agent = db.users.find((item) => item.id === occurrence.assignedAgentId) || null;
  const citizen = db.citizens.find((item) => item.id === occurrence.citizenId) || null;
  const comments = db.comments.filter((item) => item.occurrenceId === occurrence.id);
  const attachments = db.attachments.filter((item) => item.occurrenceId === occurrence.id);
  const history = db.statusHistory.filter((item) => item.occurrenceId === occurrence.id);
  return {
    ...occurrence,
    city,
    neighborhood,
    category,
    subcategory,
    department,
    assignedAgent: publicUser(agent),
    citizen: citizen ? { id: citizen.id, name: citizen.name || 'Morador', phone: citizen.phone || '', email: citizen.email || '' } : null,
    comments,
    attachments,
    history
  };
}

function publicOccurrence(db, occurrence) {
  const serialized = serializeOccurrence(db, occurrence);
  return {
    protocol: serialized.protocol,
    title: serialized.title,
    description: serialized.description,
    category: serialized.category?.name || '',
    subcategory: serialized.subcategory?.name || '',
    neighborhood: serialized.neighborhood?.name || '',
    department: serialized.department?.name || '',
    priority: serialized.priority,
    status: serialized.status,
    address: safePublicAddress(serialized.address),
    referencePoint: serialized.referencePoint,
    publicMessage: serialized.publicMessage,
    slaDueAt: serialized.slaDueAt,
    createdAt: serialized.createdAt,
    updatedAt: serialized.updatedAt,
    resolvedAt: serialized.resolvedAt,
    attachments: serialized.attachments.filter((item) => ['PUBLIC','PUBLICA'].includes(String(item.visibility || '').toUpperCase()) && !item.archivedAt && !item.deletedAt).map((item) => ({ id: item.id, fileName: item.fileName, fileType: item.fileType, fileUrl: item.fileUrl, sizeBytes: item.sizeBytes, source: item.source || 'registro', createdAt: item.createdAt })),
    publicHistory: serialized.history
      .filter((item) => item.publicMessage)
      .map((item) => ({ status: item.newStatus, publicMessage: item.publicMessage, createdAt: item.createdAt }))
  };
}

function statusLabel(status) {
  const labels = {
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
  return labels[status] || status;
}

function computeSlaDue(priority) {
  const date = new Date();
  const hours = priority === 'CRITICA' ? 2 : priority === 'ALTA' ? 24 : priority === 'MEDIA' ? 72 : 168;
  date.setHours(date.getHours() + hours);
  return date.toISOString();
}

function triageSlaHours(priority) {
  return priority === 'CRITICA' ? 2 : priority === 'ALTA' ? 24 : priority === 'MEDIA' ? 72 : 168;
}

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

function pickRuleDepartment(db, category = null, rule = {}, cityId = '') {
  const fromCategory = findDefaultDepartment(db, category?.id);
  if (fromCategory) return fromCategory;
  const hints = rule.departmentHints || [];
  return db.departments.find((item) => (!cityId || !item.cityId || item.cityId === cityId) && hints.some((hint) => normalizeRuleText(`${item.name || ''} ${item.description || ''}`).includes(normalizeRuleText(hint)))) || db.departments.find((item) => !cityId || !item.cityId || item.cityId === cityId) || db.departments[0] || null;
}

function pickRuleSubcategory(subcategories = [], categoryId = '', matchedKeywords = []) {
  const list = subcategories.filter((item) => item.categoryId === categoryId);
  const normalizedKeywords = matchedKeywords.map(normalizeRuleText);
  return list.find((item) => normalizedKeywords.some((keyword) => normalizeRuleText(`${item.key || ''} ${item.name || ''}`).includes(keyword) || keyword.includes(normalizeRuleText(item.name || '')))) || list[0] || null;
}

function buildLocalTriageSuggestion(db, { text = '', cityId = '' } = {}) {
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
  const category = pickRuleCategory(db.categories, rule.key, cityId);
  const department = pickRuleDepartment(db, category, rule, cityId);
  const subcategory = pickRuleSubcategory(db.subcategories, category?.id, matchedKeywords);
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
    slaDueAt: computeSlaDue(priority),
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

function buildAssistiveTriageFallback(db, input = {}) {
  const cityId = input.cityId || db.cities[0]?.id || '';
  const text = [input.text, input.title, input.description, input.address, input.referencePoint, input.messageBody].filter(Boolean).join(' ');
  const local = input.localSuggestion || buildLocalTriageSuggestion(db, { text, cityId });
  const neighborhood = findAssistiveNeighborhood(db.neighborhoods, { cityId, neighborhoodId: input.neighborhoodId, text });
  const probableAddress = trimAssistiveText([input.address, input.referencePoint].filter(Boolean).join(' - '), 180);
  const missingFields = [];
  if (!neighborhood) missingFields.push('bairro');
  if (!probableAddress) missingFields.push('localizacao');
  const needsComplement = missingFields.length > 0;
  const complementRequest = missingFields.includes('bairro')
    ? 'Para continuar, informe o bairro e, se possivel, rua ou ponto de referencia da ocorrencia.'
    : 'Para continuar, informe rua, numero aproximado ou ponto de referencia da ocorrencia.';
  const risk = buildRiskProfile(local.priority, text);
  const duplicateCandidates = findDuplicateCandidates(db.occurrences, {
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

function mergeAssistiveAiSuggestion(aiSuggestion, fallback, db) {
  if (!aiSuggestion || typeof aiSuggestion !== 'object') return fallback;
  const category = findAssistiveChoice(db.categories, aiSuggestion.categoryId || aiSuggestion.categoryName || aiSuggestion.categoria) || db.categories.find((item) => item.id === fallback.categoryId) || null;
  const department = findAssistiveChoice(db.departments, aiSuggestion.departmentId || aiSuggestion.departmentName || aiSuggestion.setor) || db.departments.find((item) => item.id === fallback.departmentId) || null;
  const subcategory = findAssistiveChoice(db.subcategories.filter((item) => !category || item.categoryId === category.id), aiSuggestion.subcategoryId || aiSuggestion.subcategoryName || aiSuggestion.subcategoria) || db.subcategories.find((item) => item.id === fallback.subcategoryId) || null;
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

async function buildAssistiveTriageSuggestion(db, input = {}) {
  const fallback = buildAssistiveTriageFallback(db, input);
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
      categorias: db.categories.filter((item) => item.active !== false).map((item) => ({ id: item.id, nome: item.name })),
      subcategorias: db.subcategories.filter((item) => item.active !== false).map((item) => ({ id: item.id, categoriaId: item.categoryId, nome: item.name })),
      setores: db.departments.filter((item) => (!input.cityId || item.cityId === input.cityId) && item.active !== false).map((item) => ({ id: item.id, nome: item.name })),
      bairros: db.neighborhoods.filter((item) => (!input.cityId || item.cityId === input.cityId) && item.active !== false).map((item) => ({ id: item.id, nome: item.name }))
    },
    candidatosDuplicidade: fallback.duplicateCandidates
  };
  try {
    const aiSuggestion = await callAssistiveAi(payload);
    return mergeAssistiveAiSuggestion(aiSuggestion, fallback, db);
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

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function maskSecret(value = '', visible = 4) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= visible * 2) return `${text.slice(0, 2)}********`;
  return `${text.slice(0, visible)}********${text.slice(-visible)}`;
}

function localEncrypt(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return Buffer.from(text, 'utf8').toString('base64');
}

function localDecrypt(value = '') {
  try {
    const text = String(value || '').trim();
    if (!text) return '';
    return Buffer.from(text, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function publicWhatsAppChannel(channel) {
  if (!channel) return null;
  return {
    id: channel.id,
    cityId: channel.cityId,
    channelName: channel.channelName,
    officialPhone: channel.officialPhone,
    displayPhone: channel.displayPhone,
    defaultDepartmentId: channel.defaultDepartmentId,
    businessHoursJson: channel.businessHoursJson || {},
    defaultWelcomeMessage: channel.defaultWelcomeMessage,
    protocolCreatedMessage: channel.protocolCreatedMessage,
    statusUpdatedMessage: channel.statusUpdatedMessage,
    webhookVerifyTokenMasked: channel.webhookVerifyTokenMasked || '',
    wabaIdMasked: channel.wabaIdMasked || '',
    phoneNumberIdMasked: channel.phoneNumberIdMasked || '',
    appIdMasked: channel.appIdMasked || '',
    accessTokenMasked: channel.accessTokenMasked || '',
    appSecretMasked: channel.appSecretMasked || '',
    templatesJson: channel.templatesJson || {},
    enabled: Boolean(channel.enabled),
    integrationMode: channel.integrationMode || 'PREPARADO',
    connectionStatus: channel.connectionStatus || 'PENDENTE_CONFIGURACAO',
    lastVerifiedAt: channel.lastVerifiedAt || null,
    webhookUrl: `/api/webhooks/whatsapp/${channel.cityId}`,
    updatedAt: channel.updatedAt
  };
}

function whatsappCompleteness(channel) {
  const required = ['officialPhone','wabaIdMasked','phoneNumberIdMasked','appIdMasked','accessTokenMasked','webhookVerifyTokenMasked'];
  const filled = required.filter((key) => String(channel?.[key] || '').trim()).length;
  return { filled, total: required.length, percent: Math.round((filled / required.length) * 100) };
}


function inferWhatsAppClassification(db, text = '', cityId = '') {
  const suggestion = buildAssistiveTriageFallback(db, { text, cityId, messageBody: text });
  return { ...suggestion, title: suggestion.categoryName ? `Solicitação via WhatsApp — ${suggestion.categoryName}` : 'Solicitação via WhatsApp' };
}

function publicWhatsAppMessage(db, message) {
  if (!message) return null;
  const occurrence = message.occurrenceId ? db.occurrences.find((item) => item.id === message.occurrenceId) : null;
  const media = localWhatsAppMediaState(message);
  return {
    ...message,
    mediaId: media.mediaId || message.mediaId || '',
    mediaMimeType: media.contentType || message.mediaMimeType || '',
    mediaStorageBucket: media.bucket || message.mediaStorageBucket || '',
    mediaStoragePath: media.storagePath || message.mediaStoragePath || '',
    hasMedia: media.hasMedia,
    mediaDownloadPending: media.pending,
    mediaDownloadError: media.error || '',
    occurrence: occurrence ? { id: occurrence.id, protocol: occurrence.protocol, title: occurrence.title, status: occurrence.status } : null
  };
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

function localWhatsAppMediaState(message = {}) {
  const payload = message.payloadJson || {};
  const raw = payload.raw || payload || {};
  const storedMedia = payload.storedMedia || message.storedMedia || {};
  const media = raw.image || raw.document || raw.audio || raw.video || {};
  const mediaId = message.mediaId || payload.mediaId || storedMedia.mediaId || media.id || '';
  const storagePath = message.mediaStoragePath || storedMedia.path || '';
  const contentType = message.mediaMimeType || storedMedia.contentType || payload.mediaMimeType || media.mime_type || '';
  return {
    hasMedia: Boolean(mediaId || storagePath || message.hasMedia),
    mediaId,
    bucket: message.mediaStorageBucket || storedMedia.bucket || 'occurrence-attachments',
    storagePath,
    contentType,
    sizeBytes: storedMedia.size || message.mediaSizeBytes || 0,
    fileUrl: storedMedia.url || storedMedia.publicUrl || storagePath || '',
    fileName: storedMedia.fileName || `whatsapp-${message.id || mediaId || Date.now()}.${mediaExtensionFromMime(contentType)}`,
    pending: Boolean((mediaId || message.hasMedia) && !storagePath),
    error: message.mediaDownloadError || message.errorMessage || storedMedia.reason || ''
  };
}

function linkLocalWhatsAppMediaAttachment(db, message, occurrence, userId = null) {
  const media = localWhatsAppMediaState(message);
  if (!media.hasMedia) return { linked: false, skipped: true };
  if (!media.storagePath && !media.fileUrl) {
    addAudit(db, { cityId: occurrence.cityId, userId, action: 'WHATSAPP_MEDIA_ATTACHMENT_PENDING', entityType: 'WhatsAppMessage', entityId: message.id, metadata: { occurrenceId: occurrence.id, mediaId: media.mediaId, reason: media.error || 'Mídia aguardando download.' } });
    return { linked: false, pending: true, reason: media.error || 'Mídia aguardando download.' };
  }
  const duplicate = db.attachments.find((item) => item.occurrenceId === occurrence.id && ((media.storagePath && item.storagePath === media.storagePath) || item.metadata?.whatsappMessageId === message.id));
  if (duplicate) return { linked: false, duplicate: true, attachment: duplicate };
  const attachment = {
    id: uuid('att'), occurrenceId: occurrence.id, uploadedBy: userId, fileUrl: media.fileUrl || media.storagePath,
    storageBucket: media.bucket, storagePath: media.storagePath || media.fileUrl, fileType: media.contentType || 'application/octet-stream',
    fileName: media.fileName, visibility: 'PUBLIC', source: 'whatsapp', sizeBytes: media.sizeBytes || 0,
    metadata: { source: 'whatsapp', whatsappMessageId: message.id, mediaId: media.mediaId, linkedAt: nowIso() },
    archivedAt: null, deletedAt: null, createdAt: nowIso()
  };
  db.attachments.push(attachment);
  addAudit(db, { cityId: occurrence.cityId, userId, action: 'WHATSAPP_MEDIA_LINKED_ATTACHMENT', entityType: 'Attachment', entityId: attachment.id, metadata: { occurrenceId: occurrence.id, messageId: message.id } });
  return { linked: true, attachment };
}

function buildWhatsappPreparedReply(channel, kind, values = {}) {
  const templates = {
    welcome: channel?.defaultWelcomeMessage || 'Recebemos sua mensagem. Para registrar a solicitação, informe bairro, rua ou ponto de referência e descreva o problema.',
    moreInfo: 'Para registrar corretamente sua solicitação, informe o bairro, rua ou ponto de referência e uma breve descrição do problema.',
    protocol: channel?.protocolCreatedMessage || 'Sua solicitação foi registrada com sucesso. Protocolo: {{protocol}}. Acompanhe pelo Portal de Atendimento ao Cidadão.',
    status: channel?.statusUpdatedMessage || 'Seu protocolo {{protocol}} foi atualizado para: {{status}}.'
  };
  return String(templates[kind] || templates.welcome)
    .replaceAll('{{protocol}}', values.protocol || '')
    .replaceAll('{{status}}', values.status || '')
    .trim();
}

function ensureCitizenFromWhatsApp(db, cityId, phone = '') {
  const cleanPhone = onlyDigits(phone);
  let citizen = db.citizens.find((item) => item.cityId === cityId && onlyDigits(item.phone) === cleanPhone);
  if (!citizen) {
    citizen = { id: uuid('cit'), cityId, name: cleanPhone ? `Cidadão WhatsApp ${cleanPhone.slice(-4)}` : 'Cidadão via WhatsApp', phone: cleanPhone, email: '', createdAt: nowIso(), updatedAt: nowIso() };
    db.citizens.push(citizen);
  }
  return citizen;
}

function dashboardMetrics(db, occurrences) {
  const total = occurrences.length;
  const resolved = occurrences.filter((item) => item.status === 'RESOLVIDO').length;
  const open = occurrences.filter((item) => !['RESOLVIDO', 'CANCELADO', 'ARQUIVADO', 'DUPLICADO'].includes(item.status)).length;
  const critical = occurrences.filter((item) => item.priority === 'CRITICA').length;
  const overdue = occurrences.filter((item) => item.slaDueAt && new Date(item.slaDueAt) < new Date() && !['RESOLVIDO', 'CANCELADO', 'ARQUIVADO', 'DUPLICADO'].includes(item.status)).length;
  const byStatus = groupCount(occurrences, 'status');
  const byPriority = groupCount(occurrences, 'priority');
  const byNeighborhood = groupCount(occurrences, 'neighborhoodId', (id) => db.neighborhoods.find((item) => item.id === id)?.name || 'Sem bairro');
  const byCategory = groupCount(occurrences, 'categoryId', (id) => db.categories.find((item) => item.id === id)?.name || 'Sem categoria');
  const byDepartment = groupCount(occurrences, 'departmentId', (id) => db.departments.find((item) => item.id === id)?.name || 'Sem departamento');
  const resolvedDurations = occurrences
    .filter((item) => item.status === 'RESOLVIDO' && item.resolvedAt)
    .map((item) => daysBetween(item.createdAt, item.resolvedAt));
  const averageResolutionDays = resolvedDurations.length
    ? Number((resolvedDurations.reduce((sum, value) => sum + value, 0) / resolvedDurations.length).toFixed(1))
    : 0;
  return { total, open, resolved, critical, overdue, averageResolutionDays, byStatus, byPriority, byNeighborhood, byCategory, byDepartment };
}

function groupCount(items, key, labeler = (value) => value || 'Não informado') {
  const map = new Map();
  for (const item of items) {
    const raw = item[key] || null;
    const label = labeler(raw);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

async function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if ((pathname === '/health' || pathname === '/api/health') && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'CidadeOS AI',
      phase: 'fase-2-0-operacao-real',
      status: 'online',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: nowIso()
    });
  }

  if (pathname === '/api/public/bootstrap' && req.method === 'GET') {
    const db = readDb();
    const city = db.cities.find((item) => item.active) || db.cities[0];
    return sendJson(res, 200, {
      ok: true,
      city,
      cities: db.cities.filter((item) => item.active),
      neighborhoods: db.neighborhoods.filter((item) => item.cityId === city.id && item.active),
      departments: db.departments.filter((item) => item.cityId === city.id && item.active),
      categories: db.categories.filter((item) => item.active),
      subcategories: db.subcategories.filter((item) => item.active),
      alerts: db.alerts.filter((item) => item.active),
      whatsappChannel: publicWhatsAppChannel(db.whatsappChannels.find((item) => item.cityId === city.id))
    });
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const email = normalizeText(body.email).toLowerCase();
    const password = String(body.password || '');
    const user = findUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendError(res, 401, 'E-mail ou senha inválidos.');
    }
    transaction((db) => addAudit(db, { cityId: user.cityId, userId: user.id, action: 'AUTH_LOGIN', entityType: 'User', entityId: user.id }));
    return sendJson(res, 200, { ok: true, token: createToken(user), user: publicUser(user) });
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const user = requireAuth(req, res);
    if (!user) return;
    return sendJson(res, 200, { ok: true, user: publicUser(user) });
  }

  if (pathname === '/api/public/occurrences' && req.method === 'POST') {
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const result = transaction((db) => {
      const cityId = body.cityId || db.cities.find((item) => item.active)?.id;
      const city = db.cities.find((item) => item.id === cityId && item.active);
      if (!city) throw Object.assign(new Error('Cidade inválida.'), { status: 400 });

      const title = normalizeText(body.title) || 'Ocorrência registrada pelo morador';
      const description = normalizeText(body.description);
      if (description.length < 10) throw Object.assign(new Error('Descreva melhor a ocorrência. Use pelo menos 10 caracteres.'), { status: 400 });

      const category = db.categories.find((item) => item.id === body.categoryId && item.active);
      if (!category) throw Object.assign(new Error('Categoria obrigatória.'), { status: 400 });
      const subcategory = db.subcategories.find((item) => item.id === body.subcategoryId && item.categoryId === category.id && item.active) || null;
      const neighborhood = db.neighborhoods.find((item) => item.id === body.neighborhoodId && item.cityId === city.id && item.active) || null;
      const department = findDefaultDepartment(db, category.id);
      const priority = ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(body.priority) ? body.priority : (subcategory?.defaultPriority || 'MEDIA');
      const location = normalizeLocationPayload(body);

      let citizenId = null;
      const citizenName = normalizeText(body.citizenName);
      const citizenPhone = normalizeText(body.citizenPhone);
      const citizenEmail = normalizeText(body.citizenEmail).toLowerCase();
      if (citizenName || citizenPhone || citizenEmail) {
        const citizen = { id: uuid('citizen'), cityId: city.id, name: citizenName, phone: citizenPhone, email: citizenEmail, createdAt: nowIso(), updatedAt: nowIso() };
        db.citizens.push(citizen);
        citizenId = citizen.id;
      }

      const occurrence = {
        id: uuid('occ'),
        cityId: city.id,
        protocol: nextProtocol(db),
        title,
        description,
        categoryId: category.id,
        subcategoryId: subcategory?.id || null,
        neighborhoodId: neighborhood?.id || null,
        departmentId: department?.id || null,
        assignedAgentId: null,
        citizenId,
        priority,
        status: 'RECEBIDO',
        address: normalizeText(body.address),
        referencePoint: normalizeText(body.referencePoint),
        latitude: location.latitude,
        longitude: location.longitude,
        locationPrecision: location.locationPrecision,
        publicVisibility: true,
        duplicateOfId: null,
        slaDueAt: computeSlaDue(priority),
        publicMessage: 'Ocorrência recebida. A equipe responsável poderá atualizar o andamento em breve.',
        resolvedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      db.occurrences.push(occurrence);
      db.statusHistory.push({
        id: uuid('hist'), occurrenceId: occurrence.id, changedBy: null, oldStatus: null, newStatus: 'RECEBIDO',
        comment: 'Ocorrência aberta pela página pública.', publicMessage: occurrence.publicMessage, createdAt: nowIso()
      });

      if (body.attachmentDataUrl) {
        const file = saveDataUrlImage(body.attachmentDataUrl, occurrence.protocol.toLowerCase());
        db.attachments.push({
          id: uuid('att'), occurrenceId: occurrence.id, uploadedBy: citizenId, fileUrl: file.fileUrl,
          fileType: file.fileType, fileName: file.fileName, visibility: 'PUBLIC', source: 'portal', sizeBytes: file.sizeBytes, archivedAt: null, deletedAt: null, createdAt: nowIso()
        });
      }

      addAudit(db, { cityId: city.id, userId: null, action: 'PUBLIC_OCCURRENCE_CREATED', entityType: 'Occurrence', entityId: occurrence.id, metadata: { protocol: occurrence.protocol, locationPrecision: location.locationPrecision } });
      return publicOccurrence(db, occurrence);
    });
    return sendJson(res, 201, { ok: true, occurrence: result });
  }

  const publicOccurrenceMatch = pathname.match(/^\/api\/public\/occurrences\/([^/]+)$/);
  if (publicOccurrenceMatch && req.method === 'GET') {
    const protocol = decodeURIComponent(publicOccurrenceMatch[1]).toUpperCase();
    const db = readDb();
    const occurrence = db.occurrences.find((item) => item.protocol.toUpperCase() === protocol);
    if (!occurrence) return sendError(res, 404, 'Protocolo não encontrado.');
    return sendJson(res, 200, { ok: true, occurrence: publicOccurrence(db, occurrence) });
  }

  if (pathname === '/api/public/transparency' && req.method === 'GET') {
    const db = readDb();
    const cityId = new url.URL(req.url, `http://${req.headers.host}`).searchParams.get('cityId') || db.cities[0]?.id;
    const occurrences = db.occurrences.filter((item) => item.cityId === cityId && item.publicVisibility);
    const activeAlerts = db.alerts.filter((item) => item.cityId === cityId && item.active);
    return sendJson(res, 200, { ok: true, metrics: dashboardMetrics(db, occurrences), activeAlerts });
  }

  const user = requireAuth(req, res);
  if (!user) return;

  if (pathname === '/api/cities' && req.method === 'GET') {
    const db = readDb();
    const cities = user.role === 'SUPER_ADMIN' ? db.cities : db.cities.filter((item) => item.id === user.cityId);
    return sendJson(res, 200, { ok: true, cities });
  }

  if (pathname === '/api/cities' && req.method === 'POST') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN])) return;
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const name = normalizeText(body.name);
    if (name.length < 2) return sendError(res, 400, 'Nome da cidade é obrigatório.');
    const city = transaction((db) => {
      const item = { id: uuid('city'), name, state: normalizeText(body.state), country: normalizeText(body.country) || 'Brasil', slug: toSlug(name), active: true, createdAt: nowIso(), updatedAt: nowIso() };
      db.cities.push(item);
      addAudit(db, { cityId: item.id, userId: user.id, action: 'CITY_CREATED', entityType: 'City', entityId: item.id });
      return item;
    });
    return sendJson(res, 201, { ok: true, city });
  }

  if (pathname === '/api/categories' && req.method === 'GET') {
    const db = readDb();
    return sendJson(res, 200, { ok: true, categories: db.categories, subcategories: db.subcategories });
  }

  const cityNestedMatch = pathname.match(/^\/api\/cities\/([^/]+)\/(neighborhoods|departments|users)$/);
  if (cityNestedMatch && req.method === 'GET') {
    const [, cityId, resource] = cityNestedMatch;
    if (!userCanAccessCity(user, cityId)) return sendError(res, 403, 'Acesso restrito para esta cidade.');
    const db = readDb();
    const map = { neighborhoods: db.neighborhoods, departments: db.departments, users: db.users.map(publicUser) };
    return sendJson(res, 200, { ok: true, [resource]: map[resource].filter((item) => item.cityId === cityId) });
  }

  if (cityNestedMatch && req.method === 'POST') {
    const [, cityId, resource] = cityNestedMatch;
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN])) return;
    if (!userCanAccessCity(user, cityId)) return sendError(res, 403, 'Acesso restrito para esta cidade.');
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const name = normalizeText(body.name);
    if (name.length < 2 && resource !== 'users') return sendError(res, 400, 'Nome obrigatório.');
    const item = transaction((db) => {
      if (resource === 'neighborhoods') {
        const entry = { id: uuid('neigh'), cityId, name, active: true, createdAt: nowIso(), updatedAt: nowIso() };
        db.neighborhoods.push(entry);
        addAudit(db, { cityId, userId: user.id, action: 'NEIGHBORHOOD_CREATED', entityType: 'Neighborhood', entityId: entry.id });
        return entry;
      }
      if (resource === 'departments') {
        const entry = { id: uuid('dep'), cityId, name, description: normalizeText(body.description), active: true, createdAt: nowIso(), updatedAt: nowIso() };
        db.departments.push(entry);
        addAudit(db, { cityId, userId: user.id, action: 'DEPARTMENT_CREATED', entityType: 'Department', entityId: entry.id });
        return entry;
      }
      const email = normalizeText(body.email).toLowerCase();
      const role = normalizeText(body.role) || ROLES.AGENT;
      if (!email || !email.includes('@')) throw Object.assign(new Error('E-mail válido obrigatório.'), { status: 400 });
      if (db.users.some((entry) => entry.email.toLowerCase() === email)) throw Object.assign(new Error('Já existe usuário com este e-mail.'), { status: 409 });
      const entry = {
        id: uuid('user'), cityId, name: normalizeText(body.name), email, phone: normalizeText(body.phone),
        passwordHash: hashPassword(body.password || 'CidadeOS@123'), role, departmentId: body.departmentId || null,
        active: true, createdAt: nowIso(), updatedAt: nowIso()
      };
      db.users.push(entry);
      addAudit(db, { cityId, userId: user.id, action: 'USER_CREATED', entityType: 'User', entityId: entry.id, metadata: { role } });
      return publicUser(entry);
    });
    return sendJson(res, 201, { ok: true, [resource.slice(0, -1)]: item });
  }

  if (pathname === '/api/triage/suggest' && req.method === 'POST') {
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const db = readDb();
    const cityId = user.role === 'SUPER_ADMIN' ? (body.cityId || db.cities[0]?.id) : user.cityId;
    if (cityId && !userCanAccessCity(user, cityId)) return sendError(res, 403, 'Acesso restrito para esta cidade.');
    const text = [body.text, body.title, body.description, body.address, body.referencePoint, body.messageBody].filter(Boolean).join(' ');
    const suggestion = await buildAssistiveTriageSuggestion(db, { ...body, text, cityId });
    return sendJson(res, 200, { ok: true, suggestion });
  }

  if (pathname === '/api/occurrences' && req.method === 'GET') {
    const db = readDb();
    const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
    let occurrences = scopeOccurrencesForUser(db, user);
    const status = params.get('status');
    const priority = params.get('priority');
    const categoryId = params.get('categoryId');
    const query = normalizeText(params.get('q')).toLowerCase();
    const evidence = params.get('evidence');
    const origin = normalizeText(params.get('origin')).toLowerCase();
    if (status) occurrences = occurrences.filter((item) => item.status === status);
    if (priority) occurrences = occurrences.filter((item) => item.priority === priority);
    if (categoryId) occurrences = occurrences.filter((item) => item.categoryId === categoryId);
    if (origin) occurrences = occurrences.filter((item) => normalizeText(item.origin || item.sourceChannel).toLowerCase().includes(origin));
    if (evidence === 'with') occurrences = occurrences.filter((item) => db.attachments.some((att) => att.occurrenceId === item.id && !att.archivedAt && !att.deletedAt));
    if (evidence === 'without') occurrences = occurrences.filter((item) => !db.attachments.some((att) => att.occurrenceId === item.id && !att.archivedAt && !att.deletedAt));
    if (query) occurrences = occurrences.filter((item) => `${item.protocol} ${item.title} ${item.description} ${item.address} ${item.referencePoint}`.toLowerCase().includes(query));
    occurrences = occurrences.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, 200, { ok: true, occurrences: occurrences.map((item) => serializeOccurrence(db, item)) });
  }

  const occurrenceDetailMatch = pathname.match(/^\/api\/occurrences\/([^/]+)$/);
  if (occurrenceDetailMatch && req.method === 'GET') {
    const id = occurrenceDetailMatch[1];
    const db = readDb();
    const occurrence = scopeOccurrencesForUser(db, user).find((item) => item.id === id || item.protocol === id);
    if (!occurrence) return sendError(res, 404, 'Ocorrência não encontrada.');
    return sendJson(res, 200, { ok: true, occurrence: serializeOccurrence(db, occurrence) });
  }

  const occurrenceStatusMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/status$/);
  if (occurrenceStatusMatch && req.method === 'PATCH') {
    const id = occurrenceStatusMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const updated = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      if (!occurrence) throw Object.assign(new Error('Ocorrência não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      if ([ROLES.AGENT, ROLES.HEALTH_AGENT].includes(user.role) && occurrence.assignedAgentId && occurrence.assignedAgentId !== user.id) {
        throw Object.assign(new Error('Esta ocorrência está atribuída a outro agente.'), { status: 403 });
      }
      const validStatuses = ['RECEBIDO', 'EM_ANALISE', 'ENCAMINHADO', 'EM_EXECUCAO', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'CANCELADO', 'DUPLICADO', 'ARQUIVADO'];
      const newStatus = normalizeText(body.status).toUpperCase();
      if (!validStatuses.includes(newStatus)) throw Object.assign(new Error('Status inválido.'), { status: 400 });
      const oldStatus = occurrence.status;
      occurrence.status = newStatus;
      occurrence.publicMessage = normalizeText(body.publicMessage) || occurrence.publicMessage;
      occurrence.updatedAt = nowIso();
      if (newStatus === 'RESOLVIDO') occurrence.resolvedAt = nowIso();
      db.statusHistory.push({
        id: uuid('hist'), occurrenceId: occurrence.id, changedBy: user.id, oldStatus, newStatus,
        comment: normalizeText(body.comment), publicMessage: normalizeText(body.publicMessage), createdAt: nowIso()
      });
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'OCCURRENCE_STATUS_CHANGED', entityType: 'Occurrence', entityId: occurrence.id, metadata: { oldStatus, newStatus } });
      return serializeOccurrence(db, occurrence);
    });
    return sendJson(res, 200, { ok: true, occurrence: updated });
  }

  const occurrenceAssignMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/assign$/);
  if (occurrenceAssignMatch && req.method === 'PATCH') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER])) return;
    const id = occurrenceAssignMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const updated = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      if (!occurrence) throw Object.assign(new Error('Ocorrência não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const department = db.departments.find((item) => item.id === body.departmentId && item.cityId === occurrence.cityId) || null;
      const agent = db.users.find((item) => item.id === body.assignedAgentId && item.cityId === occurrence.cityId) || null;
      const oldDepartmentId = occurrence.departmentId;
      const oldAgentId = occurrence.assignedAgentId;
      if (department) occurrence.departmentId = department.id;
      occurrence.assignedAgentId = agent?.id || null;
      occurrence.status = occurrence.status === 'RECEBIDO' ? 'ENCAMINHADO' : occurrence.status;
      occurrence.updatedAt = nowIso();
      db.statusHistory.push({
        id: uuid('hist'), occurrenceId: occurrence.id, changedBy: user.id, oldStatus: null, newStatus: occurrence.status,
        comment: `Ocorrência atribuída para ${department?.name || 'departamento atual'}${agent ? ` / ${agent.name}` : ''}.`,
        publicMessage: normalizeText(body.publicMessage), createdAt: nowIso()
      });
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'OCCURRENCE_ASSIGNED', entityType: 'Occurrence', entityId: occurrence.id, metadata: { oldDepartmentId, newDepartmentId: occurrence.departmentId, oldAgentId, newAgentId: occurrence.assignedAgentId } });
      return serializeOccurrence(db, occurrence);
    });
    return sendJson(res, 200, { ok: true, occurrence: updated });
  }

  const occurrencePriorityMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/priority$/);
  if (occurrencePriorityMatch && req.method === 'PATCH') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER])) return;
    const id = occurrencePriorityMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const updated = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      if (!occurrence) throw Object.assign(new Error('Ocorrência não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const priority = normalizeText(body.priority).toUpperCase();
      if (!['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(priority)) throw Object.assign(new Error('Prioridade inválida.'), { status: 400 });
      const oldPriority = occurrence.priority;
      occurrence.priority = priority;
      occurrence.slaDueAt = computeSlaDue(priority);
      occurrence.updatedAt = nowIso();
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'OCCURRENCE_PRIORITY_CHANGED', entityType: 'Occurrence', entityId: occurrence.id, metadata: { oldPriority, priority } });
      return serializeOccurrence(db, occurrence);
    });
    return sendJson(res, 200, { ok: true, occurrence: updated });
  }

  const occurrenceTriageSuggestionMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/triage-suggestion$/);
  if (occurrenceTriageSuggestionMatch && req.method === 'PATCH') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER, ROLES.AGENT, ROLES.HEALTH_AGENT])) return;
    const id = occurrenceTriageSuggestionMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const updated = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      if (!occurrence) throw Object.assign(new Error('Ocorrência não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const suggestion = body.suggestion || {};
      const pickSuggested = (key) => Object.prototype.hasOwnProperty.call(body, key) ? body[key] : suggestion[key];
      const category = db.categories.find((item) => item.id === pickSuggested('categoryId') && item.active) || null;
      const subcategory = db.subcategories.find((item) => item.id === pickSuggested('subcategoryId') && (!category || item.categoryId === category.id) && item.active) || null;
      const department = db.departments.find((item) => item.id === pickSuggested('departmentId') && item.cityId === occurrence.cityId) || null;
      const priority = normalizeText(pickSuggested('priority')).toUpperCase();
      const oldSnapshot = { categoryId: occurrence.categoryId, subcategoryId: occurrence.subcategoryId, departmentId: occurrence.departmentId, priority: occurrence.priority };
      if (category) occurrence.categoryId = category.id;
      if (subcategory) occurrence.subcategoryId = subcategory.id;
      if (department) occurrence.departmentId = department.id;
      if (['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'].includes(priority)) {
        occurrence.priority = priority;
        occurrence.slaDueAt = computeSlaDue(priority);
      }
      occurrence.publicMessage = normalizeText(pickSuggested('publicMessage') || pickSuggested('citizenResponse')) || occurrence.publicMessage;
      occurrence.updatedAt = nowIso();
      db.statusHistory.push({
        id: uuid('hist'), occurrenceId: occurrence.id, changedBy: user.id, oldStatus: occurrence.status, newStatus: occurrence.status,
        comment: triageSuggestionApplicationComment(suggestion), publicMessage: occurrence.publicMessage, createdAt: nowIso()
      });
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'ASSISTIVE_TRIAGE_SUGGESTION_APPLIED', entityType: 'Occurrence', entityId: occurrence.id, metadata: { before: oldSnapshot, after: { categoryId: occurrence.categoryId, subcategoryId: occurrence.subcategoryId, departmentId: occurrence.departmentId, priority: occurrence.priority }, confidence: suggestion.confidence, source: suggestion.source, riskLevel: suggestion.riskLevel, duplicateRisk: suggestion.duplicateRisk, missingFields: suggestion.missingFields || [] } });
      return serializeOccurrence(db, occurrence);
    });
    return sendJson(res, 200, { ok: true, occurrence: updated });
  }

  const occurrenceDuplicateCandidatesMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/duplicate-candidates$/);
  if (occurrenceDuplicateCandidatesMatch && req.method === 'GET') {
    const id = occurrenceDuplicateCandidatesMatch[1];
    const db = readDb();
    const occurrence = scopeOccurrencesForUser(db, user).find((item) => item.id === id || item.protocol === id);
    if (!occurrence) return sendError(res, 404, 'Ocorrencia nao encontrada.');
    return sendJson(res, 200, { ok: true, ...duplicateCandidateContext(db, occurrence) });
  }

  const occurrenceDuplicateMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/mark-duplicate$/);
  if (occurrenceDuplicateMatch && req.method === 'PATCH') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER])) return;
    const id = occurrenceDuplicateMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const updated = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      const target = normalizeText(body.duplicateOfId || body.candidateId || body.protocol);
      const parent = db.occurrences.find((item) => item.id === target || item.protocol === target);
      if (!occurrence || !parent) throw Object.assign(new Error('Ocorrência original ou duplicada não encontrada.'), { status: 404 });
      if (occurrence.id === parent.id) throw Object.assign(new Error('Uma ocorrencia nao pode ser duplicada dela mesma.'), { status: 400 });
      if (parent.duplicateOfId === occurrence.id) throw Object.assign(new Error('Vinculo recusado para evitar ciclo de duplicidade.'), { status: 400 });
      if (occurrence.cityId !== parent.cityId || !userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const oldStatus = occurrence.status;
      const archiveDuplicate = Boolean(body.archiveDuplicate);
      occurrence.duplicateOfId = parent.id;
      occurrence.status = archiveDuplicate ? 'ARQUIVADO' : 'DUPLICADO';
      occurrence.publicMessage = `Esta ocorrencia foi vinculada ao protocolo principal ${parent.protocol}.`;
      occurrence.updatedAt = nowIso();
      db.statusHistory.push({
        id: uuid('hist'), occurrenceId: occurrence.id, changedBy: user.id, oldStatus, newStatus: occurrence.status,
        comment: `${archiveDuplicate ? 'Ocorrencia arquivada como duplicada' : 'Ocorrencia marcada como duplicada'} do protocolo ${parent.protocol}.`,
        publicMessage: occurrence.publicMessage, createdAt: nowIso()
      });
      db.comments.push({
        id: uuid('comment'), occurrenceId: parent.id, userId: user.id,
        comment: `Ocorrencia ${occurrence.protocol} agrupada como duplicada. ${trimAssistiveText(occurrence.title || occurrence.description || '', 140)}`,
        visibility: 'INTERNAL', createdAt: nowIso()
      });
      addAudit(db, {
        cityId: occurrence.cityId,
        userId: user.id,
        action: archiveDuplicate ? 'OCCURRENCE_ARCHIVED_AS_DUPLICATE' : 'OCCURRENCE_MARKED_DUPLICATE',
        entityType: 'Occurrence',
        entityId: occurrence.id,
        metadata: { duplicateOfId: parent.id, parentProtocol: parent.protocol, archiveDuplicate, previousStatus: oldStatus }
      });
      return serializeOccurrence(db, occurrence);
    });
    return sendJson(res, 200, { ok: true, occurrence: updated });
  }

  const occurrenceCommentsMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/comments$/);
  if (occurrenceCommentsMatch && req.method === 'POST') {
    const id = occurrenceCommentsMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const comment = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      if (!occurrence) throw Object.assign(new Error('Ocorrência não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const text = normalizeText(body.comment);
      if (text.length < 2) throw Object.assign(new Error('Comentário obrigatório.'), { status: 400 });
      const entry = { id: uuid('comment'), occurrenceId: occurrence.id, userId: user.id, comment: text, visibility: body.visibility === 'PUBLIC' ? 'PUBLIC' : 'INTERNAL', createdAt: nowIso() };
      db.comments.push(entry);
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'OCCURRENCE_COMMENT_CREATED', entityType: 'Occurrence', entityId: occurrence.id });
      return entry;
    });
    return sendJson(res, 201, { ok: true, comment });
  }

  const occurrenceAttachmentsMatch = pathname.match(/^\/api\/occurrences\/([^/]+)\/attachments$/);
  if (occurrenceAttachmentsMatch && req.method === 'POST') {
    const id = occurrenceAttachmentsMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const attachment = transaction((db) => {
      const occurrence = db.occurrences.find((item) => item.id === id || item.protocol === id);
      if (!occurrence) throw Object.assign(new Error('Ocorrência não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const file = saveDataUrlImage(body.attachmentDataUrl, occurrence.protocol.toLowerCase());
      const entry = { id: uuid('att'), occurrenceId: occurrence.id, uploadedBy: user.id, fileUrl: file.fileUrl, fileType: file.fileType, fileName: file.fileName, visibility: normalizeAttachmentVisibility(body.visibility), source: 'painel', sizeBytes: file.sizeBytes, archivedAt: null, deletedAt: null, createdAt: nowIso() };
      db.attachments.push(entry);
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'OCCURRENCE_ATTACHMENT_CREATED', entityType: 'Occurrence', entityId: occurrence.id });
      return entry;
    });
    return sendJson(res, 201, { ok: true, attachment });
  }

  const attachmentVisibilityMatch = pathname.match(/^\/api\/attachments\/([^/]+)\/visibility$/);
  if (attachmentVisibilityMatch && req.method === 'PATCH') {
    const id = attachmentVisibilityMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const attachment = transaction((db) => {
      const att = db.attachments.find((item) => item.id === id);
      if (!att) throw Object.assign(new Error('Anexo não encontrado.'), { status: 404 });
      const occurrence = db.occurrences.find((item) => item.id === att.occurrenceId);
      if (!occurrence || !userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      att.visibility = normalizeAttachmentVisibility(body.visibility);
      att.updatedAt = nowIso();
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'ATTACHMENT_VISIBILITY_UPDATED', entityType: 'Attachment', entityId: att.id, metadata: { occurrenceId: occurrence.id, visibility: att.visibility } });
      return att;
    });
    return sendJson(res, 200, { ok: true, attachment });
  }

  const attachmentArchiveMatch = pathname.match(/^\/api\/attachments\/([^/]+)\/archive$/);
  if (attachmentArchiveMatch && req.method === 'POST') {
    const id = attachmentArchiveMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const attachment = transaction((db) => {
      const att = db.attachments.find((item) => item.id === id);
      if (!att) throw Object.assign(new Error('Anexo não encontrado.'), { status: 404 });
      const occurrence = db.occurrences.find((item) => item.id === att.occurrenceId);
      if (!occurrence || !userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      att.archivedAt = nowIso();
      att.archivedBy = user.id;
      att.archivedReason = normalizeText(body.reason) || 'Arquivado pelo painel.';
      att.visibility = 'RESTRICTED';
      att.updatedAt = nowIso();
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'ATTACHMENT_ARCHIVED', entityType: 'Attachment', entityId: att.id, metadata: { occurrenceId: occurrence.id, reason: att.archivedReason } });
      return att;
    });
    return sendJson(res, 200, { ok: true, attachment });
  }

  const attachmentRemoveMatch = pathname.match(/^\/api\/attachments\/([^/]+)$/);
  if (attachmentRemoveMatch && req.method === 'DELETE') {
    const id = attachmentRemoveMatch[1];
    transaction((db) => {
      const index = db.attachments.findIndex((item) => item.id === id);
      if (index < 0) throw Object.assign(new Error('Anexo não encontrado.'), { status: 404 });
      const att = db.attachments[index];
      const occurrence = db.occurrences.find((item) => item.id === att.occurrenceId);
      if (!occurrence || !userCanAccessCity(user, occurrence.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      db.attachments.splice(index, 1);
      addAudit(db, { cityId: occurrence.cityId, userId: user.id, action: 'ATTACHMENT_LINK_REMOVED', entityType: 'Attachment', entityId: id, metadata: { occurrenceId: occurrence.id, fileUrl: att.fileUrl } });
      return true;
    });
    return sendJson(res, 200, { ok: true, removed: true });
  }

  if (pathname === '/api/dashboard/city' && req.method === 'GET') {
    const db = readDb();
    const occurrences = scopeOccurrencesForUser(db, user);
    return sendJson(res, 200, { ok: true, metrics: dashboardMetrics(db, occurrences), recentOccurrences: occurrences.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8).map((item) => serializeOccurrence(db, item)) });
  }

  if (pathname === '/api/dashboard/agent' && req.method === 'GET') {
    const db = readDb();
    const occurrences = scopeOccurrencesForUser(db, user);
    return sendJson(res, 200, { ok: true, metrics: dashboardMetrics(db, occurrences), occurrences: occurrences.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item) => serializeOccurrence(db, item)) });
  }

  if (pathname === '/api/dashboard/super-admin' && req.method === 'GET') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN])) return;
    const db = readDb();
    return sendJson(res, 200, {
      ok: true,
      metrics: {
        cities: db.cities.length,
        activeCities: db.cities.filter((item) => item.active).length,
        users: db.users.length,
        occurrences: db.occurrences.length,
        auditLogs: db.auditLogs.length,
        health: 'online'
      },
      moduleUsage: db.moduleConfigs
    });
  }

  if (pathname === '/api/reports/monthly' && req.method === 'GET') {
    const db = readDb();
    const occurrences = scopeOccurrencesForUser(db, user);
    const key = new url.URL(req.url, `http://${req.headers.host}`).searchParams.get('month') || monthKey();
    const filtered = occurrences.filter((item) => monthKey(item.createdAt) === key);
    return sendJson(res, 200, { ok: true, month: key, metrics: dashboardMetrics(db, filtered), occurrences: filtered.map((item) => serializeOccurrence(db, item)) });
  }

  if (pathname === '/api/reports/monthly/generate' && req.method === 'POST') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER])) return;
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const generated = transaction((db) => {
      const cityId = user.role === 'SUPER_ADMIN' ? (body.cityId || db.cities[0]?.id) : user.cityId;
      const month = normalizeText(body.month) || monthKey();
      const occurrences = db.occurrences.filter((item) => item.cityId === cityId && monthKey(item.createdAt) === month);
      const metrics = dashboardMetrics(db, occurrences);
      const report = { id: uuid('report'), cityId, month, year: Number(month.split('-')[0]), summary: `Relatório ${month}: ${metrics.total} ocorrências, ${metrics.resolved} resolvidas, ${metrics.overdue} atrasadas.`, metricsJson: metrics, createdAt: nowIso() };
      db.monthlyReports.push(report);
      addAudit(db, { cityId, userId: user.id, action: 'MONTHLY_REPORT_GENERATED', entityType: 'MonthlyReport', entityId: report.id });
      return report;
    });
    return sendJson(res, 201, { ok: true, report: generated });
  }


  if (pathname === '/api/whatsapp/config' && req.method === 'GET') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER])) return;
    const db = readDb();
    const cityId = user.role === 'SUPER_ADMIN'
      ? (new url.URL(req.url, `http://${req.headers.host}`).searchParams.get('cityId') || db.cities[0]?.id)
      : user.cityId;
    const channel = db.whatsappChannels.find((item) => item.cityId === cityId) || null;
    const events = db.whatsappWebhookEvents.filter((item) => item.cityId === cityId).slice(-50).reverse();
    const rawMessages = db.whatsappMessages.filter((item) => item.cityId === cityId).slice(-100).reverse();
    const messages = rawMessages.map((item) => publicWhatsAppMessage(db, item));
    const triage = {
      new: db.whatsappMessages.filter((item) => item.cityId === cityId && item.status === 'RECEBIDA_PENDENTE_TRIAGEM').length,
      waitingInfo: db.whatsappMessages.filter((item) => item.cityId === cityId && item.status === 'AGUARDANDO_INFORMACOES').length,
      converted: db.whatsappMessages.filter((item) => item.cityId === cityId && item.status === 'CONVERTIDA_EM_OCORRENCIA').length,
      linked: db.whatsappMessages.filter((item) => item.cityId === cityId && item.status === 'VINCULADA_A_PROTOCOLO').length,
      archived: db.whatsappMessages.filter((item) => item.cityId === cityId && item.status === 'ARQUIVADA').length
    };
    return sendJson(res, 200, { ok: true, channel: publicWhatsAppChannel(channel), completeness: whatsappCompleteness(channel), events, messages, triage });
  }

  if (pathname === '/api/whatsapp/config' && req.method === 'PUT') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN])) return;
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const saved = transaction((db) => {
      const cityId = user.role === 'SUPER_ADMIN' ? (body.cityId || db.cities[0]?.id) : user.cityId;
      const city = db.cities.find((item) => item.id === cityId);
      if (!city) throw Object.assign(new Error('Cidade inválida para configuração do WhatsApp.'), { status: 400 });
      let channel = db.whatsappChannels.find((item) => item.cityId === cityId);
      if (!channel) {
        channel = { id: uuid('wa'), cityId, createdBy: user.id, createdAt: nowIso() };
        db.whatsappChannels.push(channel);
      }
      const officialDigits = onlyDigits(body.officialPhone);
      channel.channelName = normalizeText(body.channelName) || 'WhatsApp oficial';
      channel.officialPhone = officialDigits;
      channel.displayPhone = normalizeText(body.displayPhone) || (officialDigits ? `+${officialDigits}` : '');
      channel.defaultDepartmentId = body.defaultDepartmentId || null;
      channel.businessHoursJson = { weekdays: normalizeText(body.businessHours) || '08:00 às 17:00', emergencyNotice: normalizeText(body.emergencyNotice) || 'Em risco imediato, acione os canais emergenciais competentes.' };
      channel.defaultWelcomeMessage = normalizeText(body.defaultWelcomeMessage) || 'Olá. Este é o canal oficial de atendimento digital. Descreva sua solicitação e informe o endereço.';
      channel.protocolCreatedMessage = normalizeText(body.protocolCreatedMessage) || 'Sua solicitação foi registrada com sucesso. Protocolo: {{protocol}}.';
      channel.statusUpdatedMessage = normalizeText(body.statusUpdatedMessage) || 'Seu protocolo {{protocol}} foi atualizado para {{status}}.';
      channel.templatesJson = {
        protocolCreated: normalizeText(body.templateProtocolCreated) || 'protocolo_criado',
        statusUpdated: normalizeText(body.templateStatusUpdated) || 'status_atualizado',
        neighborhoodAlert: normalizeText(body.templateNeighborhoodAlert) || 'alerta_bairro'
      };
      const secretFields = [
        ['wabaId', 'wabaIdMasked'], ['phoneNumberId', 'phoneNumberIdMasked'], ['appId', 'appIdMasked'],
        ['accessToken', 'accessTokenMasked'], ['appSecret', 'appSecretMasked'], ['webhookVerifyToken', 'webhookVerifyTokenMasked']
      ];
      for (const [field, masked] of secretFields) {
        const value = String(body[field] || '').trim();
        if (value) {
          channel[`${field}Encrypted`] = localEncrypt(value);
          channel[masked] = maskSecret(value);
        }
      }
      if (!channel.webhookVerifyTokenMasked) {
        const generated = `cidadeos_${city.slug || city.id}_${Date.now()}`;
        channel.webhookVerifyTokenEncrypted = localEncrypt(generated);
        channel.webhookVerifyTokenMasked = maskSecret(generated);
      }
      channel.enabled = Boolean(body.enabled);
      const completeness = whatsappCompleteness(channel);
      channel.integrationMode = 'CLOUD_API_CLIENTE_CONFIGURA';
      channel.connectionStatus = completeness.filled === completeness.total && channel.enabled ? 'PRONTO_PARA_TESTE' : 'PENDENTE_CONFIGURACAO';
      channel.lastVerifiedAt = null;
      channel.updatedAt = nowIso();
      addAudit(db, { cityId, userId: user.id, action: 'WHATSAPP_CONFIG_SAVED', entityType: 'WhatsAppChannel', entityId: channel.id, metadata: { completeness, enabled: channel.enabled } });
      return { channel: publicWhatsAppChannel(channel), completeness };
    });
    return sendJson(res, 200, { ok: true, ...saved });
  }

  if (pathname === '/api/whatsapp/test' && req.method === 'POST') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN])) return;
    const result = transaction((db) => {
      const cityId = user.role === 'SUPER_ADMIN' ? db.cities[0]?.id : user.cityId;
      const channel = db.whatsappChannels.find((item) => item.cityId === cityId);
      if (!channel) throw Object.assign(new Error('Configure o canal de WhatsApp antes de testar.'), { status: 400 });
      const completeness = whatsappCompleteness(channel);
      channel.connectionStatus = completeness.filled === completeness.total && channel.enabled ? 'VALIDACAO_LOCAL_OK' : 'PENDENTE_CONFIGURACAO';
      channel.lastVerifiedAt = nowIso();
      channel.updatedAt = nowIso();
      db.whatsappWebhookEvents.push({ id: uuid('wa_evt'), cityId, channelId: channel.id, eventType: 'LOCAL_VALIDATION', payloadJson: { completeness, note: 'Validação local: campos obrigatórios, mascaramento e webhook preparado.' }, processed: true, errorMessage: '', createdAt: nowIso() });
      addAudit(db, { cityId, userId: user.id, action: 'WHATSAPP_CONFIG_TESTED', entityType: 'WhatsAppChannel', entityId: channel.id, metadata: completeness });
      return { channel: publicWhatsAppChannel(channel), completeness };
    });
    return sendJson(res, 200, { ok: true, ...result });
  }

  const whatsappVerifyMatch = pathname.match(/^\/api\/webhooks\/whatsapp\/([^/]+)$/);
  if (whatsappVerifyMatch && req.method === 'GET') {
    const cityId = whatsappVerifyMatch[1];
    const params = new url.URL(req.url, `http://${req.headers.host}`).searchParams;
    const mode = params.get('hub.mode');
    const challenge = params.get('hub.challenge');
    const verifyToken = params.get('hub.verify_token') || '';
    const db = readDb();
    const channel = db.whatsappChannels.find((item) => item.cityId === cityId);
    const savedVerifyToken = localDecrypt(channel?.webhookVerifyTokenEncrypted || '');
    if (mode === 'subscribe' && challenge && savedVerifyToken && verifyToken === savedVerifyToken) {
      transaction((tx) => {
        tx.whatsappWebhookEvents.push({ id: uuid('wa_evt'), cityId, channelId: channel?.id || null, eventType: 'META_WEBHOOK_VERIFIED', payloadJson: { mode, challenge: '***' }, processed: true, errorMessage: '', createdAt: nowIso() });
        addAudit(tx, { cityId, userId: null, action: 'WHATSAPP_WEBHOOK_VERIFIED', entityType: 'WhatsAppChannel', entityId: channel?.id || cityId });
      });
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(challenge);
    }
    return sendError(res, 403, 'Verificação de webhook inválida. Confira o Verify Token informado na Meta.');
  }

  if (whatsappVerifyMatch && req.method === 'POST') {
    const cityId = whatsappVerifyMatch[1];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const event = transaction((db) => {
      const channel = db.whatsappChannels.find((item) => item.cityId === cityId);
      const item = { id: uuid('wa_evt'), cityId, channelId: channel?.id || null, eventType: 'META_WEBHOOK_RECEIVED', payloadJson: body, processed: true, errorMessage: '', createdAt: nowIso() };
      db.whatsappWebhookEvents.push(item);
      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change.value || {};
          const messages = Array.isArray(value.messages) ? value.messages : [];
          for (const message of messages) {
            const media = message.image || message.document || message.audio || message.video || null;
            const text = message.text?.body || message.image?.caption || message.document?.caption || message.button?.text || message.interactive?.button_reply?.title || (media ? `[${message.type || 'midia'}] mídia recebida pelo WhatsApp` : '[mensagem sem texto]');
            const classification = inferWhatsAppClassification(db, text, cityId);
            const payloadJson = {
              ...message,
              source: 'meta_webhook_local',
              localTriageSuggestion: classification,
              mediaId: media?.id || '',
              mediaMimeType: media?.mime_type || '',
              mediaSha256: media?.sha256 || '',
              raw: message
            };
            db.whatsappMessages.push({
              id: uuid('wa_msg'), cityId, channelId: channel?.id || null, occurrenceId: null,
              citizenPhone: message.from || '', direction: 'INBOUND', messageType: message.type || 'unknown', messageBody: text,
              metaMessageId: message.id || '', status: 'RECEBIDA_PENDENTE_TRIAGEM', processingStatus: 'PENDENTE_TRIAGEM',
              suggestedCategoryId: classification.categoryId, suggestedDepartmentId: classification.departmentId, suggestedPriority: classification.priority,
              preparedReply: buildWhatsappPreparedReply(channel, 'moreInfo'), payloadJson,
              mediaId: payloadJson.mediaId, mediaMimeType: payloadJson.mediaMimeType, mediaStorageBucket: '', mediaStoragePath: '',
              hasMedia: Boolean(payloadJson.mediaId), mediaDownloadError: payloadJson.mediaId ? 'Mídia recebida no webhook local; download real ocorre no modo Supabase/Vercel.' : '',
              createdAt: nowIso(), updatedAt: nowIso()
            });
          }
        }
      }
      addAudit(db, { cityId, userId: null, action: 'WHATSAPP_WEBHOOK_RECEIVED', entityType: 'WhatsAppWebhookEvent', entityId: item.id });
      return item;
    });
    return sendJson(res, 200, { ok: true, eventId: event.id });
  }

  const whatsappMessageActionMatch = pathname.match(/^\/api\/whatsapp\/messages\/([^/]+)\/(create-occurrence|link-occurrence|send-prepared|status|reply)$/);
  if (whatsappMessageActionMatch && req.method === 'POST') {
    const messageId = whatsappMessageActionMatch[1];
    const actionName = whatsappMessageActionMatch[2];
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const result = transaction((db) => {
      const message = db.whatsappMessages.find((item) => item.id === messageId);
      if (!message) throw Object.assign(new Error('Mensagem do WhatsApp não encontrada.'), { status: 404 });
      if (!userCanAccessCity(user, message.cityId)) throw Object.assign(new Error('Acesso restrito para esta cidade.'), { status: 403 });
      const channel = db.whatsappChannels.find((item) => item.id === message.channelId || item.cityId === message.cityId) || null;
      if (actionName === 'send-prepared') {
        const text = normalizeText(body.messageBody) || message.preparedReply || buildWhatsappPreparedReply(channel, 'moreInfo');
        const outbound = {
          id: uuid('wa_msg'), cityId: message.cityId, channelId: message.channelId, occurrenceId: message.occurrenceId || null,
          citizenPhone: message.citizenPhone, direction: 'FAILED', messageType: 'text', messageBody: text,
          metaMessageId: '', status: 'ERRO', processingStatus: 'ERRO', errorMessage: 'Envio real indisponível no servidor local sem WhatsApp Cloud API.',
          createdAt: nowIso(), updatedAt: nowIso()
        };
        db.whatsappMessages.push(outbound);
        addAudit(db, { cityId: message.cityId, userId: user.id, action: 'WHATSAPP_PREPARED_REPLY_LOCAL_FALLBACK', entityType: 'WhatsAppMessage', entityId: message.id, metadata: { outboundId: outbound.id } });
        return { sent: false, fallback: true, error: outbound.errorMessage, outboundMessage: publicWhatsAppMessage(db, outbound) };
      }
      if (actionName === 'create-occurrence' && message.occurrenceId) {
        const existing = db.occurrences.find((item) => item.id === message.occurrenceId);
        if (existing) {
          const mediaAttachment = linkLocalWhatsAppMediaAttachment(db, message, existing, user.id);
          return { occurrence: serializeOccurrence(db, existing), message: publicWhatsAppMessage(db, message), preparedReply: message.preparedReply || '', mediaAttachment, alreadyConverted: true };
        }
      }
      if (actionName === 'status') {
        const allowed = ['RECEBIDA_PENDENTE_TRIAGEM','AGUARDANDO_INFORMACOES','ARQUIVADA','ERRO_PROCESSAMENTO'];
        const nextStatus = normalizeText(body.status).toUpperCase();
        if (!allowed.includes(nextStatus)) throw Object.assign(new Error('Status inválido para triagem de WhatsApp.'), { status: 400 });
        message.status = nextStatus;
        message.processingStatus = nextStatus;
        message.preparedReply = normalizeText(body.preparedReply) || (nextStatus === 'AGUARDANDO_INFORMACOES' ? buildWhatsappPreparedReply(channel, 'moreInfo') : message.preparedReply);
        message.updatedAt = nowIso();
        addAudit(db, { cityId: message.cityId, userId: user.id, action: 'WHATSAPP_MESSAGE_STATUS_CHANGED', entityType: 'WhatsAppMessage', entityId: message.id, metadata: { status: nextStatus } });
        return { message: publicWhatsAppMessage(db, message), preparedReply: message.preparedReply || '' };
      }
      if (actionName === 'reply') {
        const kind = normalizeText(body.kind) || 'moreInfo';
        message.preparedReply = normalizeText(body.message) || buildWhatsappPreparedReply(channel, kind, body.values || {});
        message.status = kind === 'moreInfo' ? 'AGUARDANDO_INFORMACOES' : message.status;
        message.processingStatus = 'RESPOSTA_PREPARADA';
        message.updatedAt = nowIso();
        db.whatsappMessages.push({
          id: uuid('wa_msg'), cityId: message.cityId, channelId: message.channelId, occurrenceId: message.occurrenceId || null,
          citizenPhone: message.citizenPhone, direction: 'OUTBOUND_PREPARED', messageType: 'text', messageBody: message.preparedReply,
          metaMessageId: '', status: 'PREPARADA_NAO_ENVIADA', processingStatus: 'AGUARDANDO_ENVIO_REAL_OU_MANUAL', createdAt: nowIso(), updatedAt: nowIso()
        });
        addAudit(db, { cityId: message.cityId, userId: user.id, action: 'WHATSAPP_REPLY_PREPARED', entityType: 'WhatsAppMessage', entityId: message.id });
        return { message: publicWhatsAppMessage(db, message), preparedReply: message.preparedReply };
      }
      if (actionName === 'link-occurrence') {
        const target = db.occurrences.find((item) => item.id === body.occurrenceId || item.protocol === String(body.protocol || body.occurrenceId || '').toUpperCase());
        if (!target || target.cityId !== message.cityId) throw Object.assign(new Error('Protocolo/ocorrência não encontrado para vincular.'), { status: 404 });
        message.occurrenceId = target.id;
        message.status = 'VINCULADA_A_PROTOCOLO';
        message.processingStatus = 'VINCULADA_A_PROTOCOLO';
        message.preparedReply = buildWhatsappPreparedReply(channel, 'status', { protocol: target.protocol, status: statusLabel(target.status) });
        message.updatedAt = nowIso();
        db.comments.push({ id: uuid('comment'), occurrenceId: target.id, userId: user.id, comment: `Mensagem do WhatsApp vinculada ao protocolo. Telefone: ${message.citizenPhone}. Conteúdo: ${message.messageBody}`, visibility: 'INTERNAL', createdAt: nowIso() });
        addAudit(db, { cityId: message.cityId, userId: user.id, action: 'WHATSAPP_MESSAGE_LINKED_OCCURRENCE', entityType: 'Occurrence', entityId: target.id, metadata: { messageId: message.id } });
        const mediaAttachment = linkLocalWhatsAppMediaAttachment(db, message, target, user.id);
        return { occurrence: serializeOccurrence(db, target), message: publicWhatsAppMessage(db, message), preparedReply: message.preparedReply, mediaAttachment };
      }
      const classification = inferWhatsAppClassification(db, message.messageBody, message.cityId);
      const citizen = ensureCitizenFromWhatsApp(db, message.cityId, message.citizenPhone);
      const neighborhoodId = body.neighborhoodId || null;
      const protocol = nextProtocol(db);
      const occurrence = {
        id: uuid('occ'), cityId: message.cityId, protocol,
        title: normalizeText(body.title) || classification.title,
        description: normalizeText(body.description) || `Mensagem recebida pelo WhatsApp oficial: ${message.messageBody}`,
        categoryId: body.categoryId || classification.categoryId,
        subcategoryId: body.subcategoryId || null,
        neighborhoodId,
        departmentId: body.departmentId || classification.departmentId || channel?.defaultDepartmentId || null,
        assignedAgentId: body.assignedAgentId || null,
        citizenId: citizen.id,
        priority: normalizeText(body.priority || classification.priority).toUpperCase(),
        status: 'RECEBIDO', address: normalizeText(body.address), referencePoint: normalizeText(body.referencePoint),
        latitude: null, longitude: null, publicVisibility: true, duplicateOfId: null,
        slaDueAt: computeSlaDue(normalizeText(body.priority || classification.priority).toUpperCase()),
        origin: 'WHATSAPP', whatsappMessageId: message.id, publicMessage: classification.publicMessage || 'Solicitação recebida pelo WhatsApp oficial e registrada para triagem da equipe responsável.',
        resolvedAt: null, createdAt: nowIso(), updatedAt: nowIso()
      };
      db.occurrences.push(occurrence);
      db.statusHistory.push({ id: uuid('hist'), occurrenceId: occurrence.id, changedBy: user.id, oldStatus: null, newStatus: 'RECEBIDO', comment: 'Ocorrência criada a partir de mensagem recebida pelo WhatsApp oficial.', publicMessage: occurrence.publicMessage, createdAt: nowIso() });
      message.occurrenceId = occurrence.id;
      message.status = 'CONVERTIDA_EM_OCORRENCIA';
      message.processingStatus = 'CONVERTIDA_EM_OCORRENCIA';
      message.preparedReply = buildWhatsappPreparedReply(channel, 'protocol', { protocol });
      message.updatedAt = nowIso();
      db.whatsappMessages.push({
        id: uuid('wa_msg'), cityId: message.cityId, channelId: message.channelId, occurrenceId: occurrence.id,
        citizenPhone: message.citizenPhone, direction: 'OUTBOUND_PREPARED', messageType: 'text', messageBody: message.preparedReply,
        metaMessageId: '', status: 'PREPARADA_NAO_ENVIADA', processingStatus: 'AGUARDANDO_ENVIO_REAL_OU_MANUAL', createdAt: nowIso(), updatedAt: nowIso()
      });
      addAudit(db, { cityId: message.cityId, userId: user.id, action: 'WHATSAPP_MESSAGE_CONVERTED_OCCURRENCE', entityType: 'Occurrence', entityId: occurrence.id, metadata: { messageId: message.id, protocol } });
      const mediaAttachment = linkLocalWhatsAppMediaAttachment(db, message, occurrence, user.id);
      return { occurrence: serializeOccurrence(db, occurrence), message: publicWhatsAppMessage(db, message), preparedReply: message.preparedReply, mediaAttachment };
    });
    return sendJson(res, 200, { ok: true, ...result });
  }

  if (pathname === '/api/whatsapp/simulate-message' && req.method === 'POST') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN, ROLES.DEPARTMENT_MANAGER, ROLES.AGENT, ROLES.HEALTH_AGENT])) return;
    const body = await parseJsonBody(req, MAX_JSON_BYTES);
    const result = transaction((db) => {
      const cityId = user.role === 'SUPER_ADMIN' ? (body.cityId || db.cities[0]?.id) : user.cityId;
      const channel = db.whatsappChannels.find((item) => item.cityId === cityId) || null;
      const text = normalizeText(body.messageBody) || 'Mensagem de teste recebida pelo WhatsApp oficial.';
      const classification = inferWhatsAppClassification(db, text, cityId);
      const payloadJson = { simulated: true, localTriageSuggestion: classification };
      if (body.mediaId || body.mediaStoragePath) {
        payloadJson.mediaId = body.mediaId || uuid('wamedia');
        payloadJson.mediaMimeType = body.mediaMimeType || 'image/jpeg';
        payloadJson.storedMedia = body.mediaStoragePath ? { uploaded: true, bucket: 'occurrence-attachments', path: body.mediaStoragePath, contentType: payloadJson.mediaMimeType, size: Number(body.mediaSizeBytes || 0) } : { uploaded: false, reason: 'Mídia simulada aguardando download.' };
      }
      const media = localWhatsAppMediaState({ payloadJson });
      const message = {
        id: uuid('wa_msg'), cityId, channelId: channel?.id || null, occurrenceId: null,
        citizenPhone: onlyDigits(body.citizenPhone) || '5511999990000', direction: 'INBOUND', messageType: media.hasMedia ? 'image' : 'text', messageBody: text,
        metaMessageId: `sim_${Date.now()}`, status: 'RECEBIDA_PENDENTE_TRIAGEM', processingStatus: 'PENDENTE_TRIAGEM',
        suggestedCategoryId: classification.categoryId, suggestedDepartmentId: classification.departmentId, suggestedPriority: classification.priority,
        preparedReply: buildWhatsappPreparedReply(channel, 'moreInfo'), payloadJson,
        mediaId: media.mediaId, mediaMimeType: media.contentType, mediaStorageBucket: media.bucket, mediaStoragePath: media.storagePath,
        hasMedia: media.hasMedia, mediaDownloadError: media.pending ? 'Mídia simulada aguardando download.' : '',
        createdAt: nowIso(), updatedAt: nowIso()
      };
      db.whatsappMessages.push(message);
      addAudit(db, { cityId, userId: user.id, action: 'WHATSAPP_MESSAGE_SIMULATED', entityType: 'WhatsAppMessage', entityId: message.id });
      return publicWhatsAppMessage(db, message);
    });
    return sendJson(res, 201, { ok: true, message: result });
  }

  if (pathname === '/api/audit-logs' && req.method === 'GET') {
    if (!requireRole(res, user, [ROLES.SUPER_ADMIN, ROLES.CITY_ADMIN])) return;
    const db = readDb();
    const logs = user.role === 'SUPER_ADMIN' ? db.auditLogs : db.auditLogs.filter((item) => item.cityId === user.cityId);
    return sendJson(res, 200, { ok: true, auditLogs: logs.slice(-200).reverse() });
  }

  notFound(res);
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const filePath = safeFileJoin(ATTACHMENTS_DIR, pathname.replace('/uploads/', ''));
    if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return notFound(res);
    res.writeHead(200, { 'Content-Type': getContentType(filePath), 'Cache-Control': 'public, max-age=3600' });
    return fs.createReadStream(filePath).pipe(res);
  }

  let requested = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  let filePath = safeFileJoin(PUBLIC_DIR, requested);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': getContentType(filePath), 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', 'Pragma': 'no-cache', 'Expires': '0' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  withCors(res);
  const parsed = new url.URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsed.pathname);
  try {
    if (pathname === '/health' || pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (error) {
    if (error.code === 'ECONNRESET') return;
    console.error('[CidadeOS API Error]', error);
    sendError(res, error.status || 500, error.message || 'Erro interno do servidor.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CidadeOS AI Fase 3.2 mapa e geolocalizacao rodando em http://${HOST}:${PORT}`);
  console.log('Contas demo: admin@cidadeos.local / CidadeOS@123 | agente@cidadeos.local / CidadeOS@123');
});
