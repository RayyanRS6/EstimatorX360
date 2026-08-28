'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Firestore } = require('@google-cloud/firestore');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config({ quiet: true });

const ROOT = __dirname;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const COOKIE_NAME = IS_PRODUCTION ? '__Host-priceguide_admin' : 'priceguide_admin';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || '(default)';
const FIRESTORE_SERVICES_COLLECTION = process.env.FIRESTORE_SERVICES_COLLECTION || 'services';
const FIRESTORE_CATEGORIES_COLLECTION = process.env.FIRESTORE_CATEGORIES_COLLECTION || 'categories';
const FIRESTORE_WEBHOOK_CONFIGS_COLLECTION = process.env.FIRESTORE_WEBHOOK_CONFIGS_COLLECTION || 'webhook_configs';
const CURRENCY_CODE = 'CAD';
const CURRENCY_LOCALE = 'en-CA';
const DEFAULT_CATEGORY = Object.freeze({ id: 'residential', name: 'Residential' });

if (ADMIN_PASSWORD.length < 16) {
  throw new Error('ADMIN_PASSWORD must be at least 16 characters. Set it in .env.');
}
if (SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters. Set it in .env.');
}
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(FIREBASE_PROJECT_ID)) {
  throw new Error('FIREBASE_PROJECT_ID is required and invalid.');
}
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(FIRESTORE_SERVICES_COLLECTION)) {
  throw new Error('FIRESTORE_SERVICES_COLLECTION is invalid.');
}
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(FIRESTORE_CATEGORIES_COLLECTION)) {
  throw new Error('FIRESTORE_CATEGORIES_COLLECTION is invalid.');
}
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(FIRESTORE_WEBHOOK_CONFIGS_COLLECTION)) {
  throw new Error('FIRESTORE_WEBHOOK_CONFIGS_COLLECTION is invalid.');
}
if (new Set([FIRESTORE_SERVICES_COLLECTION, FIRESTORE_CATEGORIES_COLLECTION, FIRESTORE_WEBHOOK_CONFIGS_COLLECTION]).size !== 3) {
  throw new Error('Firestore collection names must be unique.');
}

const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL || '';
const firebasePrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const useApplicationDefaultCredentials = process.env.FIREBASE_USE_ADC === 'true' || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
let firestore = null;
let servicesCollection = null;
let categoriesCollection = null;
let webhookConfigsCollection = null;
if (firebaseClientEmail || firebasePrivateKey || useApplicationDefaultCredentials) {
  if (!firebaseClientEmail || !firebasePrivateKey) {
    if (!useApplicationDefaultCredentials) {
      throw new Error('Both FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required when using explicit credentials.');
    }
  }
  const firestoreOptions = {
    projectId: FIREBASE_PROJECT_ID,
    databaseId: FIRESTORE_DATABASE_ID
  };
  if (firebaseClientEmail && firebasePrivateKey) {
    firestoreOptions.credentials = {
      client_email: firebaseClientEmail,
      private_key: firebasePrivateKey
    };
  }
  firestore = new Firestore(firestoreOptions);
  servicesCollection = firestore.collection(FIRESTORE_SERVICES_COLLECTION);
  categoriesCollection = firestore.collection(FIRESTORE_CATEGORIES_COLLECTION);
  webhookConfigsCollection = firestore.collection(FIRESTORE_WEBHOOK_CONFIGS_COLLECTION);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

const DEFAULT_FRAME_ANCESTORS = [
  "'self'",
  'http://localhost:*',
  'http://127.0.0.1:*',
  'https://bridgelandbuilders.com',
  'https://*.bridgelandbuilders.com'
];

function normalizeFrameAncestor(candidate) {
  const item = (candidate || '').trim();
  if (!item) return null;
  if (['self', "'self'", '"self"'].includes(item.toLowerCase())) return "'self'";
  if (['none', "'none'", '"none"'].includes(item.toLowerCase())) return "'none'";
  if (item === '*') return '*';

  const match = item.match(/^(https?:\/\/)?(\*\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)(?::(\*|\d+))?$/i);
  if (!match) {
    throw new Error(`FRAME_ANCESTORS contains an invalid origin or pattern: ${item}`);
  }

  const [_, scheme, wildcard, host, port] = match;
  const isLocal = host.toLowerCase() === 'localhost' || host === '127.0.0.1';
  const finalScheme = scheme ? scheme.toLowerCase() : (isLocal ? 'http://' : 'https://');
  const finalHost = (wildcard || '') + host.toLowerCase();
  const finalPort = port ? `:${port}` : '';

  if (IS_PRODUCTION && !isLocal && finalScheme === 'http://') {
    throw new Error(`FRAME_ANCESTORS must use HTTPS in production (except localhost): ${item}`);
  }

  return `${finalScheme}${finalHost}${finalPort}`;
}

function parseFrameAncestors(value) {
  if (!value || value.trim() === '' || value.trim() === 'self' || value.trim() === "'self'") {
    return [...DEFAULT_FRAME_ANCESTORS];
  }
  const sources = ["'self'"];
  for (const entry of value.split(',')) {
    const normalized = normalizeFrameAncestor(entry);
    if (normalized) {
      sources.push(normalized);
    }
  }
  for (const def of DEFAULT_FRAME_ANCESTORS) {
    if (!sources.includes(def) && !sources.includes("'none'")) {
      sources.push(def);
    }
  }
  return [...new Set(sources)];
}

const embedFrameAncestors = parseFrameAncestors(process.env.FRAME_ANCESTORS || 'self');
const externalFrameAncestors = embedFrameAncestors.filter(source => source !== "'self'");

app.use(helmet({
  frameguard: false,
  referrerPolicy: { policy: 'no-referrer' },
  contentSecurityPolicy: false,
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true } : false
}));

function createContentSecurityPolicy(frameAncestors) {
  return helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors,
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com'],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null
    }
  });
}

const dashboardContentSecurityPolicy = createContentSecurityPolicy(["'self'"]);
const embedContentSecurityPolicy = createContentSecurityPolicy(embedFrameAncestors);
app.use((req, res, next) => {
  const policy = req.path === '/embed' ? embedContentSecurityPolicy : dashboardContentSecurityPolicy;
  policy(req, res, next);
});

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false
}));
app.use(express.json({ limit: '100kb', strict: true }));
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Try again later.' }
});

const estimateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many submissions. Try again later.' }
});

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(value => {
    const separator = value.indexOf('=');
    if (separator < 0) return ['', ''];
    return [value.slice(0, separator).trim(), decodeURIComponent(value.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sign(value) {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('base64url');
}

function createSessionToken() {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    nonce: crypto.randomBytes(18).toString('base64url')
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isInteger(decoded.exp) && decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!verifySessionToken(token)) return sendError(res, 401, 'Administrator authentication required.');
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const originUrl = new URL(origin);
    if (originUrl.host === req.get('host')) return next();
  } catch {
    // Invalid origins are rejected below.
  }
  return sendError(res, 403, 'Cross-origin request rejected.');
}

function cleanString(value, maxLength, required = false) {
  if (typeof value !== 'string') return required ? null : '';
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > maxLength) return null;
  return cleaned;
}

function normalizeName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getAnswerFieldKey(questionTitle) {
  return String(questionTitle || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanMoney(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100000000 ? Math.round(value * 100) / 100 : null;
}

function formatCurrency(value) {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY_CODE,
    maximumFractionDigits: 0
  }).format(value);
}

function hasValidImageSignature(buffer, contentType) {
  if (contentType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (contentType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function validateCategories(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) return null;
  const categoryIds = new Set();
  const categoryNames = new Set();
  const result = [];

  for (const category of input) {
    const id = cleanString(category?.id, 80, true);
    const name = cleanString(category?.name, 120, true);
    const normalizedName = normalizeName(name);
    if (!id || !/^[a-z0-9][a-z0-9-]*$/i.test(id) || categoryIds.has(id) || !name || categoryNames.has(normalizedName)) return null;
    categoryIds.add(id);
    categoryNames.add(normalizedName);
    result.push({ id, name });
  }
  return result;
}

function validateServices(input, categories = [DEFAULT_CATEGORY]) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 30) return null;
  const categoryIds = new Set(categories.map(category => category.id));
  const serviceIds = new Set();
  const serviceTitles = new Set();
  const questionIds = new Set();
  const result = [];

  for (const service of input) {
    const id = cleanString(service?.id, 80, true);
    const title = cleanString(service?.title, 120, true);
    const icon = cleanString(service?.icon || 'house', 40, true);
    const baseCost = cleanMoney(service?.baseCost);
    const rawCategoryIds = service?.categoryIds === undefined ? [DEFAULT_CATEGORY.id] : service.categoryIds;
    const normalizedTitle = normalizeName(title);
    if (!id || !/^[a-z0-9][a-z0-9-]*$/i.test(id) || serviceIds.has(id) || !title || serviceTitles.has(normalizedTitle) || !icon || baseCost === null) return null;
    if (!Array.isArray(rawCategoryIds) || rawCategoryIds.length > 30) return null;
    const cleanCategoryIds = [...new Set(rawCategoryIds.map(categoryId => cleanString(categoryId, 80, true)))];
    if (cleanCategoryIds.some(categoryId => !categoryId || !categoryIds.has(categoryId))) return null;
    if (!Array.isArray(service.questions) || service.questions.length > 50) return null;
    serviceIds.add(id);
    serviceTitles.add(normalizedTitle);

    const questions = [];
    const answerFieldKeys = new Set();
    for (const question of service.questions) {
      const qid = cleanString(question?.id, 100, true);
      const qtitle = cleanString(question?.title, 240, true);
      const answerFieldKey = getAnswerFieldKey(qtitle);
      if (!qid || !/^[a-z0-9][a-z0-9_-]*$/i.test(qid) || questionIds.has(qid) || !qtitle || !answerFieldKey || answerFieldKeys.has(answerFieldKey)) return null;
      if (!['single', 'multiple'].includes(question.type) || !Array.isArray(question.options) || question.options.length > 50) return null;
      questionIds.add(qid);
      answerFieldKeys.add(answerFieldKey);

      const options = [];
      for (const option of question.options) {
        const label = cleanString(option?.label, 200, true);
        const minPrice = cleanMoney(option?.minPrice);
        const maxPrice = cleanMoney(option?.maxPrice);
        if (!label || minPrice === null || maxPrice === null || minPrice > maxPrice) return null;
        const cleanOption = { label, minPrice, maxPrice };
        if (option.imageUrl) {
          try {
            const image = new URL(option.imageUrl);
            if (image.protocol !== 'https:' || image.hostname !== 'res.cloudinary.com') return null;
            cleanOption.imageUrl = image.toString();
          } catch {
            return null;
          }
        }
        options.push(cleanOption);
      }
      questions.push({ id: qid, title: qtitle, type: question.type, options });
    }
    result.push({ id, title, icon, baseCost, categoryIds: cleanCategoryIds, questions });
  }
  return result;
}

async function readCategories() {
  if (!categoriesCollection) throw new Error('Firestore server credentials are not configured.');
  const snapshot = await categoriesCollection.get();
  if (snapshot.empty) return [{ ...DEFAULT_CATEGORY }];
  const stored = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  const validated = validateCategories(stored);
  if (!validated) throw new Error('Firestore category data failed validation.');
  return validated;
}

async function readServices(categories) {
  if (!servicesCollection) throw new Error('Firestore server credentials are not configured.');
  const availableCategories = categories || await readCategories();
  const snapshot = await servicesCollection.get();
  if (snapshot.empty) throw new Error('No services are configured in Firestore.');
  const stored = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  const validated = validateServices(stored, availableCategories);
  if (!validated) throw new Error('Firestore service data failed validation.');
  return validated;
}

async function readCatalog() {
  const categories = await readCategories();
  return { categories, services: await readServices(categories) };
}

async function writeCatalog(categories, services) {
  if (!firestore || !servicesCollection || !categoriesCollection) throw new Error('Firestore server credentials are not configured.');
  const [existingServices, existingCategories] = await Promise.all([
    servicesCollection.get(),
    categoriesCollection.get()
  ]);
  const incomingIds = new Set(services.map(service => service.id));
  const incomingCategoryIds = new Set(categories.map(category => category.id));
  const batch = firestore.batch();
  for (const document of existingServices.docs) {
    if (!incomingIds.has(document.id)) {
      batch.delete(document.ref);
      batch.delete(webhookConfigsCollection.doc(document.id));
    }
  }
  for (const document of existingCategories.docs) {
    if (!incomingCategoryIds.has(document.id)) batch.delete(document.ref);
  }
  for (const category of categories) {
    batch.set(categoriesCollection.doc(category.id), category, { merge: false });
  }
  for (const service of services) {
    batch.set(servicesCollection.doc(service.id), service, { merge: false });
  }
  await batch.commit();
}

async function buildEstimate(input) {
  const lead = input?.lead;
  const selection = input?.selection;
  const fullName = cleanString(lead?.full_name, 120, true);
  const email = cleanString(lead?.email, 254, true);
  const phone = cleanString(lead?.phone, 40, true);
  const address = cleanString(lead?.address, 300);
  const notes = cleanString(lead?.notes, 2000);
  if (!fullName || !email || !phone || address === null || notes === null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const serviceId = cleanString(selection?.service_id, 80, true);
  const services = await readServices();
  const service = services.find(item => item.id === serviceId);
  if (!service || !selection.selections || typeof selection.selections !== 'object' || Array.isArray(selection.selections)) return null;

  let minTotal = service.baseCost;
  let maxTotal = service.baseCost;
  const answers = [];
  const answerFields = {};
  for (const question of service.questions) {
    const indices = selection.selections[question.id] || [];
    if (!Array.isArray(indices) || indices.length > question.options.length) return null;
    const uniqueIndices = [...new Set(indices)];
    if (question.type === 'single' && uniqueIndices.length > 1) return null;
    const selectedOptions = [];
    for (const index of uniqueIndices) {
      if (!Number.isInteger(index) || !question.options[index]) return null;
      const option = question.options[index];
      minTotal += option.minPrice;
      maxTotal += option.maxPrice;
      selectedOptions.push({ label: option.label, min_price: option.minPrice, max_price: option.maxPrice });
    }
    answerFields[getAnswerFieldKey(question.title)] = selectedOptions.map(option => option.label).join(', ');
    answers.push({ question_id: question.id, question_title: question.title, selected_options: selectedOptions });
  }

  return {
    event: 'estimate_submitted',
    lead: { full_name: fullName, email: email.toLowerCase(), phone, address, notes },
    estimate: {
      service_id: service.id,
      service_name: service.title,
      base_cost: service.baseCost,
      estimated_lower_bound: minTotal,
      estimated_upper_bound: maxTotal,
      formatted_estimate_range: `${formatCurrency(minTotal)} - ${formatCurrency(maxTotal)}`,
      currency: CURRENCY_CODE
    },
    answers,
    answer_fields: answerFields,
    submitted_at: new Date().toISOString()
  };
}

function validateWebhookUrl(value) {
  const cleaned = cleanString(value, 2048, true);
  if (!cleaned) return null;
  try {
    const webhookUrl = new URL(cleaned);
    if (
      webhookUrl.protocol !== 'https:' ||
      webhookUrl.username ||
      webhookUrl.password ||
      webhookUrl.hash ||
      !['services.leadconnectorhq.com', 'hooks.leadconnectorhq.com'].includes(webhookUrl.hostname)
    ) return null;
    return webhookUrl.toString();
  } catch {
    return null;
  }
}

async function getServiceWebhook(serviceId) {
  if (!webhookConfigsCollection) throw new Error('Webhook configuration storage is unavailable.');
  const document = await webhookConfigsCollection.doc(serviceId).get();
  if (document.exists) {
    const data = document.data() || {};
    if (data.disabled === true) return null;
    const configuredUrl = validateWebhookUrl(data.url);
    if (!configuredUrl) throw new Error('Stored webhook configuration is invalid.');
    return { url: configuredUrl, source: 'form' };
  }

  const fallbackUrl = validateWebhookUrl(process.env.GHL_WEBHOOK_URL || '');
  return fallbackUrl ? { url: fallbackUrl, source: 'default' } : null;
}

async function readWebhookStatuses(services) {
  if (!webhookConfigsCollection) throw new Error('Webhook configuration storage is unavailable.');
  const snapshot = await webhookConfigsCollection.get();
  const documents = new Map(snapshot.docs.map(document => [document.id, document.data() || {}]));
  const fallbackConfigured = Boolean(validateWebhookUrl(process.env.GHL_WEBHOOK_URL || ''));

  return services.map(service => {
    const data = documents.get(service.id);
    if (data?.disabled === true) return { serviceId: service.id, configured: false, source: 'none' };
    if (data) {
      return {
        serviceId: service.id,
        configured: Boolean(validateWebhookUrl(data.url)),
        source: validateWebhookUrl(data.url) ? 'form' : 'invalid'
      };
    }
    return {
      serviceId: service.id,
      configured: fallbackConfigured,
      source: fallbackConfigured ? 'default' : 'none'
    };
  });
}

async function sendWebhook(payload, serviceId) {
  const configuration = await getServiceWebhook(serviceId);
  if (!configuration) throw new Error('Webhook is not configured for this form.');
  const response = await fetch(configuration.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    redirect: 'error',
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Webhook rejected the request with status ${response.status}.`);
}

app.get('/api/health', async (_req, res) => {
  if (!servicesCollection) return sendError(res, 503, 'Database server credentials are not configured.');
  try {
    await servicesCollection.limit(1).get();
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('Health database check failed:', error.message);
    sendError(res, 503, 'Database unavailable.');
  }
});
app.get('/api/services', async (_req, res) => {
  try {
    const catalog = await readCatalog();
    res.set('Cache-Control', 'no-store').json({ currency: CURRENCY_CODE, ...catalog });
  } catch (error) {
    console.error('Service read failed:', error.message);
    sendError(res, 503, 'Unable to load services.');
  }
});

app.get('/api/embed/config', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({
    externalEnabled: externalFrameAncestors.length > 0,
    allowedParentOrigins: externalFrameAncestors
  });
});

app.get('/api/admin/session', (req, res) => {
  const authenticated = verifySessionToken(parseCookies(req.headers.cookie)[COOKIE_NAME]);
  res.set('Cache-Control', 'no-store').json({ authenticated, webhookConfigured: Boolean(process.env.GHL_WEBHOOK_URL) });
});

app.post('/api/admin/login', requireSameOrigin, loginLimiter, (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(password, ADMIN_PASSWORD)) return sendError(res, 401, 'Invalid administrator credentials.');
  res.cookie(COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  });
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', requireSameOrigin, (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: IS_PRODUCTION, sameSite: 'strict', path: '/' });
  res.status(204).end();
});

app.put('/api/services', requireSameOrigin, requireAdmin, async (req, res) => {
  const categories = validateCategories(req.body?.categories);
  const services = categories && validateServices(req.body?.services, categories);
  if (!categories || !services) return sendError(res, 400, 'Category or service data is invalid.');
  try {
    await writeCatalog(categories, services);
    res.json({ currency: CURRENCY_CODE, categories, services });
  } catch (error) {
    console.error('Service save failed:', error.message);
    sendError(res, 500, 'Unable to save services.');
  }
});

app.post('/api/estimate', requireSameOrigin, estimateLimiter, async (req, res) => {
  let payload;
  try {
    payload = await buildEstimate(req.body);
  } catch (error) {
    console.error('Estimate calculation failed:', error.message);
    return sendError(res, 500, 'Unable to calculate estimate.');
  }
  if (!payload) return sendError(res, 400, 'Submission data is invalid.');
  try {
    await sendWebhook(payload, payload.estimate.service_id);
    res.status(202).json({ accepted: true, estimate: payload.estimate });
  } catch (error) {
    console.error('Webhook delivery failed:', error.message);
    sendError(res, 502, 'The estimate could not be delivered. Please contact us directly.');
  }
});

app.get('/api/admin/webhooks', requireAdmin, async (_req, res) => {
  try {
    const services = await readServices();
    res.json({ webhooks: await readWebhookStatuses(services) });
  } catch (error) {
    console.error('Webhook configuration read failed:', error.message);
    sendError(res, 500, 'Unable to load webhook configuration.');
  }
});

app.put('/api/admin/webhooks/:serviceId', requireSameOrigin, requireAdmin, async (req, res) => {
  const serviceId = cleanString(req.params.serviceId, 80, true);
  const webhookUrl = validateWebhookUrl(req.body?.webhookUrl);
  if (!serviceId || !/^[a-z0-9][a-z0-9-]*$/i.test(serviceId) || !webhookUrl) {
    return sendError(res, 400, 'A valid HTTPS LeadConnector webhook URL is required.');
  }
  try {
    const services = await readServices();
    if (!services.some(service => service.id === serviceId)) return sendError(res, 404, 'Form not found.');
    await webhookConfigsCollection.doc(serviceId).set({
      url: webhookUrl,
      disabled: false,
      updatedAt: new Date().toISOString()
    }, { merge: false });
    res.json({ serviceId, configured: true, source: 'form' });
  } catch (error) {
    console.error('Webhook configuration save failed:', error.message);
    sendError(res, 500, 'Unable to save webhook configuration.');
  }
});

app.delete('/api/admin/webhooks/:serviceId', requireSameOrigin, requireAdmin, async (req, res) => {
  const serviceId = cleanString(req.params.serviceId, 80, true);
  if (!serviceId || !/^[a-z0-9][a-z0-9-]*$/i.test(serviceId)) return sendError(res, 400, 'Invalid form identifier.');
  try {
    const services = await readServices();
    if (!services.some(service => service.id === serviceId)) return sendError(res, 404, 'Form not found.');
    await webhookConfigsCollection.doc(serviceId).set({
      disabled: true,
      updatedAt: new Date().toISOString()
    }, { merge: false });
    res.json({ serviceId, configured: false, source: 'none' });
  } catch (error) {
    console.error('Webhook configuration clear failed:', error.message);
    sendError(res, 500, 'Unable to clear webhook configuration.');
  }
});

app.post('/api/admin/webhooks/:serviceId/test', requireSameOrigin, requireAdmin, async (req, res) => {
  const serviceId = cleanString(req.params.serviceId, 80, true);
  if (!serviceId || !/^[a-z0-9][a-z0-9-]*$/i.test(serviceId)) return sendError(res, 400, 'Invalid form identifier.');
  try {
    const services = await readServices();
    const service = services.find(item => item.id === serviceId);
    if (!service) return sendError(res, 404, 'Form not found.');
    const selections = Object.fromEntries(service.questions.map(question => [question.id, question.options.length ? [0] : []]));
    const payload = await buildEstimate({
      lead: {
        full_name: 'Webhook Mapping Test',
        email: 'webhook-test@example.com',
        phone: '+15550100000',
        address: 'Test submission',
        notes: 'Generated by the secure per-form webhook test button.'
      },
      selection: { service_id: serviceId, selections }
    });
    if (!payload) return sendError(res, 500, 'Unable to build the webhook test payload.');
    payload.event = 'test_estimate_submitted';
    await sendWebhook(payload, serviceId);
    res.json({ delivered: true, serviceId });
  } catch (error) {
    console.error('Per-form webhook test failed:', error.message);
    sendError(res, 502, 'Webhook test failed. Check this form\'s webhook configuration.');
  }
});

app.post('/api/admin/upload', requireSameOrigin, requireAdmin,
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }),
  async (req, res) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    const apiKey = process.env.CLOUDINARY_API_KEY || '';
    const apiSecret = process.env.CLOUDINARY_API_SECRET || '';
    if (!cloudName || !apiKey || !apiSecret) return sendError(res, 503, 'Image upload is not configured.');
    if (!Buffer.isBuffer(req.body) || req.body.length < 1) return sendError(res, 400, 'A JPEG, PNG, or WebP image is required.');
    if (!hasValidImageSignature(req.body, req.get('content-type'))) return sendError(res, 400, 'The uploaded file content is not a valid image.');

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'priceguide-options';
    const signature = crypto.createHash('sha1').update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`).digest('hex');
    const form = new FormData();
    const contentType = req.get('content-type');
    form.append('file', new Blob([req.body], { type: contentType }), 'option-image');
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('signature', signature);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
        method: 'POST', body: form, signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) throw new Error(`Cloudinary returned ${response.status}.`);
      const result = await response.json();
      const secureUrl = new URL(result.secure_url);
      if (secureUrl.protocol !== 'https:' || secureUrl.hostname !== 'res.cloudinary.com') throw new Error('Unexpected upload URL.');
      res.status(201).json({ url: secureUrl.toString() });
    } catch (error) {
      console.error('Image upload failed:', error.message);
      sendError(res, 502, 'Image upload failed.');
    }
  }
);

function getFrontendFilePath(filename) {
  const candidates = [
    path.join(__dirname, 'public', filename),
    path.join(process.cwd(), 'public', filename),
    path.join(__dirname, filename),
    path.join(process.cwd(), filename),
    path.join(__dirname, '..', filename),
    path.join(__dirname, '..', 'public', filename),
    path.join(__dirname, 'api', filename),
    path.join(process.cwd(), 'api', filename)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(__dirname, filename);
}

function sendFrontendFile(filename, cacheControl, crossOrigin = false) {
  return (_req, res, next) => {
    res.set('Cache-Control', cacheControl);
    if (crossOrigin) res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    const targetFile = getFrontendFilePath(filename);
    res.sendFile(targetFile, error => error ? next(error) : undefined);
  };
}

app.get(['/', '/index.html'], sendFrontendFile('index.html', 'no-store'));
app.get('/embed', sendFrontendFile('index.html', 'no-store', true));
app.get('/app.js', sendFrontendFile('app.js', IS_PRODUCTION ? 'public, max-age=3600' : 'no-store', true));
app.get('/styles.css', sendFrontendFile('styles.css', IS_PRODUCTION ? 'public, max-age=3600' : 'no-store', true));

app.use('/api', (_req, res) => sendError(res, 404, 'API endpoint not found.'));
app.use((error, _req, res, _next) => {
  if (error?.type === 'entity.too.large') return sendError(res, 413, 'Request is too large.');
  if (error instanceof SyntaxError) return sendError(res, 400, 'Malformed JSON request.');
  console.error('Unhandled request error:', error?.message || 'unknown error');
  sendError(res, 500, 'Unexpected server error.');
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Price guide listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
module.exports.app = app;
module.exports.buildEstimate = buildEstimate;
module.exports.formatCurrency = formatCurrency;
module.exports.getAnswerFieldKey = getAnswerFieldKey;
module.exports.normalizeName = normalizeName;
module.exports.validateCategories = validateCategories;
module.exports.validateServices = validateServices;
module.exports.parseFrameAncestors = parseFrameAncestors;
module.exports.readCategories = readCategories;
module.exports.readCatalog = readCatalog;
module.exports.readServices = readServices;
module.exports.readWebhookStatuses = readWebhookStatuses;
module.exports.validateWebhookUrl = validateWebhookUrl;
module.exports.writeCatalog = writeCatalog;
