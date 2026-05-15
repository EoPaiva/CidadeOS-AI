import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.js';
import { DATA_DIR, ensureRuntimeDirs, nowIso, toSlug, uuid } from './utils.js';

const DB_FILE = path.join(DATA_DIR, 'cidadeos.json');

export const CATEGORY_SEED = [
  {
    id: 'cat_urbano',
    name: 'Urbano',
    module: 'PrevenCidade',
    description: 'Buracos, iluminação, lixo, praças e manutenção urbana.',
    defaultDepartmentName: 'Obras e Serviços Urbanos',
    active: true,
    subcategories: ['Buraco', 'Iluminação pública', 'Lixo acumulado', 'Terreno com mato', 'Praça danificada', 'Calçada danificada']
  },
  {
    id: 'cat_defesa_civil',
    name: 'Defesa Civil',
    module: 'PrevenCidade',
    description: 'Alagamentos, queda de árvore, riscos e eventos críticos.',
    defaultDepartmentName: 'Defesa Civil',
    active: true,
    subcategories: ['Alagamento', 'Risco de enchente', 'Queda de árvore', 'Deslizamento', 'Área de risco', 'Obstrução de via']
  },
  {
    id: 'cat_saude_publica',
    name: 'Saúde Pública',
    module: 'DengueMap',
    description: 'Dengue, risco sanitário, água parada e vigilância.',
    defaultDepartmentName: 'Vigilância Sanitária',
    active: true,
    subcategories: ['Foco de dengue', 'Água parada', 'Terreno abandonado', 'Animal morto', 'Risco sanitário']
  },
  {
    id: 'cat_agua_saneamento',
    name: 'Água e Saneamento',
    module: 'ÁguaGuard',
    description: 'Vazamentos, falta d’água, baixa pressão e esgoto.',
    defaultDepartmentName: 'Saneamento',
    active: true,
    subcategories: ['Vazamento', 'Falta d’água', 'Baixa pressão', 'Esgoto irregular']
  },
  {
    id: 'cat_assistencia_social',
    name: 'Assistência Social',
    module: 'CuidaVila',
    description: 'Idosos e pessoas em situação vulnerável.',
    defaultDepartmentName: 'Assistência Social',
    active: true,
    subcategories: ['Idoso vulnerável', 'Pessoa precisando de visita', 'Pedido de ajuda', 'Situação de risco social']
  },
  {
    id: 'cat_zona_rural',
    name: 'Zona Rural',
    module: 'AgroRadar Local',
    description: 'Estradas rurais, pontes, clima, pragas e acesso.',
    defaultDepartmentName: 'Obras Rurais',
    active: true,
    subcategories: ['Estrada rural', 'Ponte', 'Praga', 'Risco climático', 'Acesso bloqueado']
  },
  {
    id: 'cat_clima_alertas',
    name: 'Clima e Alertas',
    module: 'Alertas AI',
    description: 'Alertas de chuva, calor, vento e risco climático.',
    defaultDepartmentName: 'Defesa Civil',
    active: true,
    subcategories: ['Chuva forte', 'Calor extremo', 'Vento forte', 'Risco de temporal']
  }
];

function createInitialDb() {
  const createdAt = nowIso();
  const cityId = 'city_demo';

  const departments = [
    ['dep_obras', 'Obras e Serviços Urbanos', 'Manutenção urbana, buracos, iluminação, limpeza e infraestrutura.'],
    ['dep_defesa', 'Defesa Civil', 'Riscos, alagamentos, quedas de árvore e ocorrências críticas.'],
    ['dep_vigilancia', 'Vigilância Sanitária', 'Dengue, focos, vistorias e saúde pública.'],
    ['dep_saneamento', 'Saneamento', 'Água, vazamentos, pressão e esgoto.'],
    ['dep_social', 'Assistência Social', 'Pessoas vulneráveis, idosos e pedidos de apoio.'],
    ['dep_rural', 'Obras Rurais', 'Estradas rurais, pontes e acessos.']
  ].map(([id, name, description]) => ({ id, cityId, name, description, active: true, createdAt, updatedAt: createdAt }));

  const departmentByName = Object.fromEntries(departments.map((dep) => [dep.name, dep.id]));

  const categories = CATEGORY_SEED.map((category) => ({
    id: category.id,
    name: category.name,
    module: category.module,
    description: category.description,
    defaultDepartmentId: departmentByName[category.defaultDepartmentName] || null,
    active: true,
    createdAt,
    updatedAt: createdAt
  }));

  const subcategories = CATEGORY_SEED.flatMap((category) => category.subcategories.map((name) => ({
    id: `sub_${toSlug(category.name)}_${toSlug(name)}`,
    categoryId: category.id,
    name,
    description: '',
    defaultPriority: category.name === 'Defesa Civil' ? 'ALTA' : category.name === 'Saúde Pública' ? 'ALTA' : 'MEDIA',
    active: true,
    createdAt,
    updatedAt: createdAt
  })));

  const users = [
    {
      id: 'user_super', cityId: null, name: 'Super Admin CidadeOS', email: 'super@cidadeos.local', phone: '',
      passwordHash: hashPassword('CidadeOS@123'), role: 'SUPER_ADMIN', departmentId: null, active: true, createdAt, updatedAt: createdAt
    },
    {
      id: 'user_admin', cityId, name: 'Admin Cidade Modelo', email: 'admin@cidadeos.local', phone: '',
      passwordHash: hashPassword('CidadeOS@123'), role: 'CITY_ADMIN', departmentId: null, active: true, createdAt, updatedAt: createdAt
    },
    {
      id: 'user_agent', cityId, name: 'Agente de Obras', email: 'agente@cidadeos.local', phone: '',
      passwordHash: hashPassword('CidadeOS@123'), role: 'AGENT', departmentId: 'dep_obras', active: true, createdAt, updatedAt: createdAt
    },
    {
      id: 'user_health', cityId, name: 'Agente de Saúde', email: 'saude@cidadeos.local', phone: '',
      passwordHash: hashPassword('CidadeOS@123'), role: 'HEALTH_AGENT', departmentId: 'dep_vigilancia', active: true, createdAt, updatedAt: createdAt
    }
  ];

  return {
    meta: {
      appName: 'CidadeOS AI',
      version: 'fase-2-1-whatsapp-triagem',
      createdAt,
      updatedAt: createdAt,
      nextProtocolNumber: 1
    },
    cities: [
      { id: cityId, name: 'Cidade Modelo', state: 'SP', country: 'Brasil', slug: 'cidade-modelo', active: true, createdAt, updatedAt: createdAt }
    ],
    neighborhoods: [
      { id: 'neigh_centro', cityId, name: 'Centro', active: true, createdAt, updatedAt: createdAt },
      { id: 'neigh_jardim', cityId, name: 'Jardim América', active: true, createdAt, updatedAt: createdAt },
      { id: 'neigh_rural', cityId, name: 'Zona Rural', active: true, createdAt, updatedAt: createdAt }
    ],
    departments,
    users,
    categories,
    subcategories,
    citizens: [],
    occurrences: [],
    comments: [],
    attachments: [],
    statusHistory: [],
    alerts: [
      {
        id: 'alert_demo', cityId, neighborhoodId: null, title: 'Portal de Atendimento ao Cidadão em implantação',
        message: 'Canal demonstrativo institucional para registro de ocorrências, consulta de protocolo, alertas oficiais e transparência pública.',
        severity: 'INFO', category: 'Sistema', active: true, startsAt: createdAt, endsAt: null, createdBy: 'user_admin', createdAt, updatedAt: createdAt
      },
      {
        id: 'alert_chuvas', cityId, neighborhoodId: null, title: 'Orientação preventiva para períodos de chuva',
        message: 'Em caso de alagamento, queda de árvore ou risco imediato, registre a ocorrência e acione também os canais emergenciais competentes.',
        severity: 'WARNING', category: 'Defesa Civil', active: true, startsAt: createdAt, endsAt: null, createdBy: 'user_admin', createdAt, updatedAt: createdAt
      },
      {
        id: 'alert_smart_city', cityId, neighborhoodId: null, title: 'Central de inteligência urbana em evolução',
        message: 'Indicadores, protocolos e dados públicos são apresentados de forma integrada para apoiar o atendimento ao cidadão.',
        severity: 'INFO', category: 'Transparência', active: true, startsAt: createdAt, endsAt: null, createdBy: 'user_admin', createdAt, updatedAt: createdAt
      },
      {
        id: 'alert_dengue', cityId, neighborhoodId: null, title: 'Atenção para focos de água parada',
        message: 'Relatos sobre água parada, terrenos abandonados e risco sanitário ajudam a orientar ações de vigilância e prevenção.',
        severity: 'INFO', category: 'Saúde Pública', active: true, startsAt: createdAt, endsAt: null, createdBy: 'user_admin', createdAt, updatedAt: createdAt
      }
    ],
    auditLogs: [],
    monthlyReports: [],
    whatsappChannels: [
      {
        id: 'wa_demo', cityId, channelName: 'WhatsApp Oficial da Cidade Modelo', officialPhone: '5511999990000', displayPhone: '+55 11 99999-0000', defaultDepartmentId: 'dep_obras', businessHoursJson: { weekdays: '08:00 às 17:00', emergencyNotice: 'Em risco imediato, acione os canais emergenciais competentes.' }, defaultWelcomeMessage: 'Olá. Este é o canal oficial de atendimento digital da Cidade Modelo. Descreva sua solicitação e informe o endereço.', protocolCreatedMessage: 'Sua solicitação foi registrada com sucesso. Protocolo: {{protocol}}.', statusUpdatedMessage: 'Seu protocolo {{protocol}} foi atualizado para {{status}}.', webhookVerifyTokenMasked: 'cid********demo', wabaIdMasked: '', phoneNumberIdMasked: '', appIdMasked: '', accessTokenMasked: '', appSecretMasked: '', templatesJson: { protocolCreated: 'protocolo_criado', statusUpdated: 'status_atualizado', neighborhoodAlert: 'alerta_bairro' }, enabled: false, integrationMode: 'PREPARADO', connectionStatus: 'PENDENTE_CONFIGURACAO', lastVerifiedAt: null, createdBy: 'user_admin', createdAt, updatedAt: createdAt }
    ],
    whatsappWebhookEvents: [],
    whatsappMessages: [],
    whatsappConversations: [],
    whatsappOccurrenceLinks: [],
    moduleConfigs: [
      { id: 'mod_preven_cidade', cityId, moduleName: 'PrevenCidade', enabled: true, configJson: {}, createdAt, updatedAt: createdAt },
      { id: 'mod_dengue_map', cityId, moduleName: 'DengueMap', enabled: true, configJson: {}, createdAt, updatedAt: createdAt },
      { id: 'mod_agua_guard', cityId, moduleName: 'ÁguaGuard', enabled: true, configJson: {}, createdAt, updatedAt: createdAt },
      { id: 'mod_cuida_vila', cityId, moduleName: 'CuidaVila', enabled: false, configJson: { phase: 'future' }, createdAt, updatedAt: createdAt },
      { id: 'mod_agro_radar', cityId, moduleName: 'AgroRadar Local', enabled: false, configJson: { phase: 'future' }, createdAt, updatedAt: createdAt },
      { id: 'mod_alertas_ai', cityId, moduleName: 'Alertas AI', enabled: false, configJson: { phase: 'future' }, createdAt, updatedAt: createdAt }
    ]
  };
}


function ensureSchema(db) {
  const createdAt = nowIso();
  db.meta = db.meta || {};
  db.meta.version = 'fase-2-1-whatsapp-triagem';
  if (!Array.isArray(db.whatsappChannels)) {
    const city = db.cities?.find((item) => item.active) || db.cities?.[0];
    db.whatsappChannels = city ? [{
      id: 'wa_default_' + city.id,
      cityId: city.id,
      channelName: 'WhatsApp oficial',
      officialPhone: '',
      displayPhone: '',
      defaultDepartmentId: db.departments?.find((dep) => dep.cityId === city.id)?.id || null,
      businessHoursJson: { weekdays: '08:00 às 17:00', emergencyNotice: 'Em risco imediato, acione os canais emergenciais competentes.' },
      defaultWelcomeMessage: 'Olá. Este é o canal oficial de atendimento digital. Descreva sua solicitação e informe o endereço.',
      protocolCreatedMessage: 'Sua solicitação foi registrada com sucesso. Protocolo: {{protocol}}.',
      statusUpdatedMessage: 'Seu protocolo {{protocol}} foi atualizado para {{status}}.',
      webhookVerifyTokenMasked: '',
      wabaIdMasked: '',
      phoneNumberIdMasked: '',
      appIdMasked: '',
      accessTokenMasked: '',
      appSecretMasked: '',
      templatesJson: { protocolCreated: 'protocolo_criado', statusUpdated: 'status_atualizado', neighborhoodAlert: 'alerta_bairro' },
      enabled: false,
      integrationMode: 'PREPARADO',
      connectionStatus: 'PENDENTE_CONFIGURACAO',
      lastVerifiedAt: null,
      createdBy: null,
      createdAt,
      updatedAt: createdAt
    }] : [];
  }
  if (!Array.isArray(db.whatsappWebhookEvents)) db.whatsappWebhookEvents = [];
  if (!Array.isArray(db.whatsappMessages)) db.whatsappMessages = [];
  if (!Array.isArray(db.whatsappConversations)) db.whatsappConversations = [];
  if (!Array.isArray(db.whatsappOccurrenceLinks)) db.whatsappOccurrenceLinks = [];
  return db;
}

export function readDb() {
  ensureRuntimeDirs();
  if (!fs.existsSync(DB_FILE)) {
    const initial = createInitialDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = ensureSchema(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  writeDb(db);
  return db;
}

export function writeDb(db) {
  ensureRuntimeDirs();
  db.meta.updatedAt = nowIso();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  return db;
}

export function transaction(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

export function findUserByEmail(email) {
  const db = readDb();
  return db.users.find((user) => user.email.toLowerCase() === String(email || '').toLowerCase() && user.active);
}

export function findUserById(id) {
  const db = readDb();
  return db.users.find((user) => user.id === id && user.active);
}

export function addAudit(db, { cityId, userId, action, entityType, entityId, metadata = {} }) {
  db.auditLogs.push({ id: uuid('audit'), cityId: cityId || null, userId: userId || null, action, entityType, entityId, metadata, createdAt: nowIso() });
}

export function nextProtocol(db) {
  const year = new Date().getFullYear();
  const number = db.meta.nextProtocolNumber++;
  return `CID-${year}-${String(number).padStart(6, '0')}`;
}

export function findDefaultDepartment(db, categoryId) {
  const category = db.categories.find((item) => item.id === categoryId);
  if (!category) return null;
  return db.departments.find((dep) => dep.id === category.defaultDepartmentId) || null;
}

export function userCanAccessCity(user, cityId) {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  return user.cityId === cityId;
}
