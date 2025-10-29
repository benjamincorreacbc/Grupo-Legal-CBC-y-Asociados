/*
 * Portal Integral GL-CBC — implementación front-end conforme a la especificación.
 *
 * Características clave:
 * - Autenticación Supabase (correo/contraseña) con preservación del rol en metadata.
 * - Capa de datos híbrida: estado persistente en localStorage con sincronización
 *   opcional hacia Supabase (tabla portal_state.slug = "glcbc").
 * - Módulos de intranet y portal cliente conectados con permisos por rol,
 *   auditoría, colas de autorización y estados vacíos/errores consistentes.
 * - Formularios con validaciones, modales y toasts para todas las acciones
 *   descritas en la guía funcional.
 */

const FALLBACK_SUPABASE_URL = 'https://focxelshnrrvanlnusqf.supabase.co';
const FALLBACK_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvY3hlbHNobnJydmFubG51c3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMTAyNDAsImV4cCI6MjA3Njg4NjI0MH0.VNFpA5hESELQpjKbhZPMPOIGJiX0mV5bJVg5FbtqH1s';

const SUPABASE_URL = window.__GLCBC_SUPABASE_URL__ || FALLBACK_SUPABASE_URL;
const SUPABASE_ANON_KEY = window.__GLCBC_SUPABASE_ANON_KEY__ || FALLBACK_SUPABASE_ANON;
const API_BASE = window.__GLCBC_API_BASE__ || '';
const ORG_SLUG = window.__GLCBC_ORG_SLUG__ || 'glcbc';
const USE_REMOTE_API = Boolean(API_BASE);
let Supabase;

const Http = (() => {
  async function injectHeaders(headers = {}) {
    const enriched = { ...headers };
    const { data: sessionData } = await Supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      enriched.Authorization = `Bearer ${token}`;
    }
    if (ORG_SLUG) {
      enriched['X-GLCBC-ORG'] = ORG_SLUG;
    }
    return enriched;
  }

  async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    if (!USE_REMOTE_API) {
      throw new Error('La API remota no está configurada.');
    }
    const options = { method, headers: await injectHeaders(headers) };
    if (body !== undefined) {
      if (body instanceof FormData) {
        options.body = body;
      } else {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
      }
    }
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
      let message = 'Error inesperado en la API.';
      try {
        const error = await response.json();
        message = error?.message || message;
      } catch (error) {
        // ignore
      }
      throw new Error(message);
    }
    if (raw) return response;
    if (response.status === 204) return null;
    return response.json();
  }

  return { request };
})();

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const Utils = (() => {
  const TZ = 'America/Santiago';

  function nowISO() {
    return new Date().toISOString();
  }

  function uid(prefix) {
    const base = crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
    return prefix ? `${prefix}_${base}` : base;
  }

  function formatDate(value, withTime = false) {
    if (!value) return '—';
    const options = withTime
      ? { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
      : { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Intl.DateTimeFormat('es-CL', options).format(new Date(value));
  }

  function formatMoney(value, currency = 'CLP') {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    const code = currency === 'UF' ? 'CLF' : currency;
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: currency === 'UF' ? 4 : 0,
      maximumFractionDigits: currency === 'UF' ? 4 : 0,
    }).format(value);
  }

  function percent(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '0%';
    return `${value.toFixed(1)}%`;
  }

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function daysBetween(a, b) {
    if (!a || !b) return Infinity;
    return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.readAsDataURL(file);
    });
  }

  return { nowISO, uid, formatDate, formatMoney, percent, escapeHtml, clone, daysBetween, fileToDataUrl };
})();

function createLocalSupabaseClient() {
  const USERS_KEY = `glcbc:localUsers:${ORG_SLUG}`;
  const SESSION_KEY = `glcbc:localSession:${ORG_SLUG}`;

  function readUsers() {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.warn('No se pudieron leer usuarios locales.', error);
      return [];
    }
  }

  function writeUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (error) {
      console.warn('No se pudieron guardar usuarios locales.', error);
    }
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('No se pudo leer la sesión local.', error);
      return null;
    }
  }

  function writeSession(session) {
    try {
      if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (error) {
      console.warn('No se pudo actualizar la sesión local.', error);
    }
  }

  async function getCurrentUser() {
    const session = readSession();
    if (!session?.userId) return null;
    const user = readUsers().find((item) => item.id === session.userId);
    return user || null;
  }

  return {
    auth: {
      async getUser() {
        return { data: { user: await getCurrentUser() }, error: null };
      },
      async getSession() {
        const user = await getCurrentUser();
        if (!user) return { data: { session: null }, error: null };
        return { data: { session: { user, access_token: null } }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const normalizedEmail = (email || '').trim().toLowerCase();
        const users = readUsers();
        const user = users.find(
          (item) => item.email && item.email.toLowerCase() === normalizedEmail && item.password === password,
        );
        if (!user) {
          return { data: null, error: { message: 'Credenciales inválidas.' } };
        }
        writeSession({ userId: user.id });
        user.updated_at = new Date().toISOString();
        writeUsers(users);
        return { data: { user }, error: null };
      },
      async signUp({ email, password, options }) {
        const normalizedEmail = (email || '').trim().toLowerCase();
        const users = readUsers();
        if (users.some((item) => item.email && item.email.toLowerCase() === normalizedEmail)) {
          return { data: null, error: { message: 'El correo ya está registrado.' } };
        }
        const now = new Date().toISOString();
        const user = {
          id: Utils.uid('user'),
          email: normalizedEmail,
          password,
          created_at: now,
          updated_at: now,
          user_metadata: options?.data || {},
        };
        users.push(user);
        writeUsers(users);
        writeSession({ userId: user.id });
        return { data: { user }, error: null };
      },
      async signOut() {
        writeSession(null);
        return { error: null };
      },
      async updateUser({ data }) {
        const session = readSession();
        if (!session?.userId) {
          return { data: null, error: { message: 'No hay sesión activa.' } };
        }
        const users = readUsers();
        const user = users.find((item) => item.id === session.userId);
        if (!user) {
          return { data: null, error: { message: 'Usuario no encontrado.' } };
        }
        user.user_metadata = { ...user.user_metadata, ...(data || {}) };
        user.updated_at = new Date().toISOString();
        writeUsers(users);
        return { data: { user }, error: null };
      },
    },
  };
}

if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  Supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true },
  });
} else {
  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('Supabase no está configurado. Se usará modo local sin conexión.');
  }
  Supabase = createLocalSupabaseClient();
}

window.__glcbcSupabase = Supabase;

const Auth = (() => {
  const USER_KEY = 'glcbc:user';
  let profile = null;

  function normalizeUser(user) {
    if (!user) return null;
    const metadata = user.user_metadata || {};
    return {
      id: user.id,
      email: user.email,
      name: metadata.name || metadata.full_name || user.email?.split('@')[0] || 'Usuario',
      role: metadata.role || 'cliente',
      phone: metadata.phone || null,
      timezone: metadata.timezone || 'America/Santiago',
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  function loadLocal() {
    if (profile) return profile;
    try {
      const stored = localStorage.getItem(USER_KEY);
      if (stored) profile = JSON.parse(stored);
    } catch (error) {
      console.warn('No se pudo leer perfil local', error);
    }
    return profile;
  }

  async function ensure() {
    loadLocal();
    const { data, error } = await Supabase.auth.getUser();
    if (error || !data?.user) {
      logout();
      return null;
    }
    profile = normalizeUser(data.user);
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
    return profile;
  }

  async function login(email, password) {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const { data, error } = await Supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (error) {
      throw new Error(error.message || 'No se pudo iniciar sesión');
    }
    profile = normalizeUser(data.user);
    localStorage.setItem(USER_KEY, JSON.stringify(profile));
    return profile;
  }

  async function register({ name, email, password, role, phone, comment }) {
    const metadata = {
      name,
      role: role || 'cliente',
      phone: phone || null,
      comment: comment || null,
    };
    const normalizedEmail = (email || '').trim().toLowerCase();
    const { data, error } = await Supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: metadata,
      },
    });
    if (error) {
      throw new Error(error.message || 'No se pudo crear la cuenta');
    }
    if (data.user) {
      profile = normalizeUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(profile));
    }
    return { message: 'Solicitud enviada. Un administrador debe aprobar tu acceso.' };
  }

  async function fetchProfile() {
    const current = await ensure();
    return current;
  }

  function getProfile() {
    return profile;
  }

  function setProfile(data) {
    profile = data;
    if (data) {
      localStorage.setItem(USER_KEY, JSON.stringify(data));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }

  function logout() {
    Supabase.auth.signOut().catch(() => {});
    profile = null;
    localStorage.removeItem(USER_KEY);
  }

  return { ensure, login, register, fetchProfile, getProfile, setProfile, logout };
})();

// ---------------------------------------------------------------------------
// Roles y permisos
// ---------------------------------------------------------------------------
const ALL_ROLES = ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado', 'cliente'];

const Roles = {
  PRIORITY: [...ALL_ROLES],
  LABELS: {
    admin: 'Admin',
    socio_fundador: 'Socio Fundador',
    socio_mayorista: 'Socio Mayorista',
    socio: 'Socio',
    asociado: 'Asociado',
    abogado_asociado: 'Abogado Asociado',
    cliente: 'Cliente',
  },
  MODULE_ACCESS: {
    home: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    clientHome: ['cliente'],
    cases: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    caseDetails: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    calendar: ALL_ROLES,
    billing: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    crm: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado'],
    directory: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    documents: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    clients: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado'],
    reports: ['admin', 'socio_fundador', 'socio_mayorista'],
    profile: ALL_ROLES,
    notifications: ALL_ROLES,
    chat: ALL_ROLES,
    officeBooking: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
    meetings: ALL_ROLES,
    authorizations: ['admin', 'socio_fundador'],
    bitacora: ['admin', 'socio_fundador'],
    financials: ['admin', 'socio_fundador', 'socio_mayorista'],
    accountRequests: ['admin', 'socio_fundador'],
    userManagement: ['admin', 'socio_fundador'],
    settings: ['admin'],
    earnings: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado', 'abogado_asociado'],
  },
  CAN_APPROVE: ['admin', 'socio_fundador'],
  CAN_SEE_SPLIT: ['admin', 'socio_fundador', 'socio_mayorista', 'socio', 'asociado'],
};

// ---------------------------------------------------------------------------
// Toasts, modales y estados
// ---------------------------------------------------------------------------
const UI = (() => {
  let toastTimer = null;

  function ensureToast() {
    let node = document.getElementById('toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'toast';
      node.className = 'toast hidden';
      document.body.appendChild(node);
    }
    return node;
  }

  function showToast(message, kind = 'info', timeout = 4000) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.className = `toast toast-${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hideToast(), timeout);
  }

  function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.className = 'toast hidden';
  }

  function showModal({ title, body, confirmLabel = 'Guardar', cancelLabel = 'Cancelar', onConfirm, onCancel }) {
    let wrapper = document.getElementById('portal-modal');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'portal-modal';
      wrapper.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-window">
          <header><h3 id="modalTitle"></h3></header>
          <section id="modalBody"></section>
          <footer>
            <button id="modalCancel" class="btn">Cancelar</button>
            <button id="modalConfirm" class="btn btn-primary">Guardar</button>
          </footer>
        </div>`;
      document.body.appendChild(wrapper);
    }
    document.getElementById('modalTitle').textContent = title;
    const bodyNode = document.getElementById('modalBody');
    bodyNode.innerHTML = '';
    if (typeof body === 'string') {
      bodyNode.innerHTML = body;
    } else {
      bodyNode.appendChild(body);
    }
    const confirmBtn = document.getElementById('modalConfirm');
    const cancelBtn = document.getElementById('modalCancel');
    confirmBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    confirmBtn.onclick = async () => {
      try {
        await onConfirm?.();
        closeModal();
      } catch (error) {
        console.error(error);
        showToast(error.message || 'Error al guardar', 'error');
      }
    };
    cancelBtn.onclick = () => {
      closeModal();
      onCancel?.();
    };
    wrapper.classList.add('visible');
  }

  function closeModal() {
    document.getElementById('portal-modal')?.classList.remove('visible');
  }

  function setEmpty(node, message) {
    node.innerHTML = `<p class="empty">${message}</p>`;
  }

  function setLoading(node, message = 'Cargando…') {
    node.innerHTML = `<p class="loading">${message}</p>`;
  }

  function confirmDanger(message, onConfirm) {
    showModal({ title: 'Confirmar acción', body: `<p>${message}</p>`, confirmLabel: 'Confirmar', onConfirm });
  }

  return { showToast, hideToast, showModal, closeModal, setEmpty, setLoading, confirmDanger };
})();

// ---------------------------------------------------------------------------
// DataService: persistencia y sincronización
// ---------------------------------------------------------------------------
const LocalDataService = (() => {
  const STORAGE_KEY = `glcbc:state:${ORG_SLUG}`;
  let cache = null;

  function createDefaultState() {
    const now = Utils.nowISO();
    return {
      parameters: {
        pjudThresholdDays: 2,
        staleCaseDays: 7,
        iva: 0.19,
        ufValue: 36000,
      },
      users: [],
      cases: [],
      caseNotes: [],
      tasks: [],
      documents: [],
      fees: [],
      feeSplits: [],
      events: [
        {
          id: Utils.uid('evt'),
          title: 'Reunión general',
          description: 'Planificación semanal',
          start: now,
          end: now,
          visibility: 'todos',
          participantIds: [],
          ownerId: null,
          createdAt: now,
        },
      ],
      contacts: [],
      notifications: [],
      notificationPrefs: [],
      chats: [
        {
          id: 'chat_general',
          title: 'Equipo GL-CBC',
          participantIds: [],
          createdAt: now,
          autoJoin: true,
        },
      ],
      chatMessages: [],
      offices: [
        { id: 'office_quilpue', name: 'Quilpué — Thompson 889', address: 'Quilpué' },
        { id: 'office_santiago', name: 'Santiago — Oficina central', address: 'Santiago' },
      ],
      officeBookings: [],
      meetings: [],
      approvals: [],
      audit: [],
      accountRequests: [],
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.warn('No se pudo persistir el estado local.', error);
    }
  }

  function ensureCache() {
    if (cache) return cache;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        cache = JSON.parse(stored);
      }
    } catch (error) {
      console.warn('No se pudo leer el estado local. Se usará el predeterminado.', error);
    }
    if (!cache) {
      cache = createDefaultState();
      persist();
    }
    return cache;
  }

  function currentUserId() {
    return Auth.getProfile()?.id || null;
  }

  function pushAudit(entry) {
    const state = ensureCache();
    state.audit.push({
      id: Utils.uid('audit'),
      createdAt: Utils.nowISO(),
      ...entry,
    });
  }

  const handlers = {
    'audit.add': ({ userId = null, type, message, payload = null }) => {
      pushAudit({ userId, type, message, payload });
    },
    'approvals.queue': ({ userId, action, entityId, entityType, reason }) => {
      const state = ensureCache();
      state.approvals.push({
        id: Utils.uid('approval'),
        userId,
        action,
        entityId,
        entityType,
        reason,
        status: 'pending',
        createdAt: Utils.nowISO(),
      });
    },
    'approvals.resolve': ({ approvalId, approved, comment }) => {
      const state = ensureCache();
      const approval = state.approvals.find((item) => item.id === approvalId);
      if (!approval) {
        throw new Error('Autorización no encontrada.');
      }
      approval.status = approved ? 'approved' : 'rejected';
      approval.comment = comment || null;
      approval.resolvedAt = Utils.nowISO();
    },
    'notifications.send': ({ userIds = null, title, body, channel }) => {
      const state = ensureCache();
      state.notifications.push({
        id: Utils.uid('notif'),
        userIds,
        title,
        body,
        channel: channel || 'app',
        createdAt: Utils.nowISO(),
      });
    },
    'users.upsertProfile': ({ id, email, name, role }) => {
      const state = ensureCache();
      let user = state.users.find((item) => item.id === id);
      if (!user) {
        user = {
          id,
          email,
          createdAt: Utils.nowISO(),
          phone: '',
          timezone: 'America/Santiago',
          status: 'active',
          role: role || 'cliente',
          name: name || email,
        };
        state.users.push(user);
      }
      user.email = email || user.email;
      user.name = name || user.name;
      if (role) user.role = role;
      const general = state.chats.find((thread) => thread.autoJoin);
      if (general && !general.participantIds.includes(id)) {
        general.participantIds.push(id);
      }
      if (user.role === 'cliente' && email && !state.contacts.some((contact) => contact.email === email)) {
        state.contacts.push({
          id: Utils.uid('contact'),
          type: 'cliente',
          name: name || email,
          email,
          phone: '',
          createdAt: Utils.nowISO(),
        });
      }
    },
    'cases.create': (payload = {}) => {
      const state = ensureCache();
      const now = Utils.nowISO();
      const assigned = Array.isArray(payload.assignedUserIds) && payload.assignedUserIds.length ? payload.assignedUserIds : [];
      if (!assigned.length && currentUserId()) {
        assigned.push(currentUserId());
      }
      state.cases.push({
        id: Utils.uid('case'),
        name: payload.name || 'Causa sin nombre',
        clientUserId: payload.clientUserId || null,
        summary: payload.summary || '',
        number: payload.number || null,
        category: payload.category || 'otro',
        status: payload.status || 'iniciado',
        tags: Array.isArray(payload.tags) ? payload.tags : [],
        court: payload.court || '',
        assignedUserIds: assigned,
        createdAt: now,
        updatedAt: now,
        lastActivityAt: now,
        lastReviewedAt: now,
        archivedAt: null,
      });
    },
    'cases.update': ({ caseId, ...changes }) => {
      const state = ensureCache();
      const caseItem = state.cases.find((item) => item.id === caseId);
      if (!caseItem) throw new Error('Causa no encontrada.');
      Object.assign(caseItem, changes);
      caseItem.updatedAt = Utils.nowISO();
      caseItem.lastActivityAt = Utils.nowISO();
    },
    'cases.markReviewed': ({ caseId, novelty, note, onlyReviewed }) => {
      const state = ensureCache();
      const caseItem = state.cases.find((item) => item.id === caseId);
      if (!caseItem) throw new Error('Causa no encontrada.');
      caseItem.lastReviewedAt = Utils.nowISO();
      if (!onlyReviewed || novelty === 'yes') {
        caseItem.lastActivityAt = Utils.nowISO();
      }
      if (note || novelty === 'yes') {
        state.caseNotes.push({
          id: Utils.uid('note'),
          caseId,
          userId: currentUserId(),
          novelty: novelty === 'yes',
          note: note || '',
          createdAt: Utils.nowISO(),
        });
      }
    },
    'tasks.create': ({ caseId, name, title, dueDate, assigneeId, ownerId, visibleToClient }) => {
      const state = ensureCache();
      const caseItem = state.cases.find((item) => item.id === caseId);
      if (!caseItem) throw new Error('Causa no encontrada.');
      const taskName = title || name;
      state.tasks.push({
        id: Utils.uid('task'),
        caseId,
        name: taskName,
        title: taskName,
        dueDate,
        assigneeId: assigneeId || ownerId || currentUserId(),
        visibleToClient: Boolean(visibleToClient),
        status: 'pending',
        createdAt: Utils.nowISO(),
      });
      caseItem.lastActivityAt = Utils.nowISO();
    },
    'tasks.complete': ({ taskId }) => {
      const state = ensureCache();
      const task = state.tasks.find((item) => item.id === taskId);
      if (!task) throw new Error('Tarea no encontrada.');
      task.status = 'done';
      task.completedAt = Utils.nowISO();
      const caseItem = state.cases.find((item) => item.id === task.caseId);
      if (caseItem) caseItem.lastActivityAt = Utils.nowISO();
    },
    'documents.create': (payload = {}) => {
      const state = ensureCache();
      const caseItem = state.cases.find((item) => item.id === payload.caseId);
      if (!caseItem) throw new Error('Causa no encontrada.');
      const title = payload.title || payload.name || 'Documento';
      state.documents.push({
        id: Utils.uid('doc'),
        caseId: payload.caseId,
        title,
        description: payload.description || '',
        category: payload.category || payload.type || 'otro',
        visibleToClient: Boolean(payload.visibleToClient),
        fileName: payload.fileName || null,
        mimeType: payload.mimeType || null,
        size: payload.size || 0,
        dataUrl: payload.dataUrl || payload.content || null,
        uploadedById: currentUserId(),
        createdAt: Utils.nowISO(),
      });
      caseItem.lastActivityAt = Utils.nowISO();
    },
    'documents.toggleVisibility': ({ docId }) => {
      const state = ensureCache();
      const doc = state.documents.find((item) => item.id === docId);
      if (!doc) throw new Error('Documento no encontrado.');
      doc.visibleToClient = !doc.visibleToClient;
    },
    'fees.create': ({ caseId, concept, amount, iva, includeIva, currency, dueDate, splits = [] }) => {
      const state = ensureCache();
      const caseItem = state.cases.find((item) => item.id === caseId);
      if (!caseItem) throw new Error('Causa no encontrada.');
      const feeId = Utils.uid('fee');
      const createdAt = Utils.nowISO();
      const ivaRate = includeIva ? state.parameters.iva : Number.isFinite(iva) ? iva : 0;
      state.fees.push({
        id: feeId,
        caseId,
        concept: concept || 'Honorario',
        amount: Number(amount) || 0,
        iva: ivaRate,
        currency: currency || 'CLP',
        dueDate: dueDate || null,
        status: 'pending',
        createdAt,
      });
      splits
        .filter((split) => split.userId)
        .forEach((split) => {
          state.feeSplits.push({
            id: Utils.uid('split'),
            feeId,
            userId: split.userId,
            percent: Number(split.percent) || 0,
            createdAt,
          });
        });
      caseItem.lastActivityAt = Utils.nowISO();
    },
    'notificationPrefs.save': ({ userId, email, push, whatsapp }) => {
      const state = ensureCache();
      const existing = state.notificationPrefs.find((item) => item.userId === userId);
      if (existing) {
        existing.email = Boolean(email);
        existing.push = Boolean(push);
        existing.whatsapp = Boolean(whatsapp);
        existing.updatedAt = Utils.nowISO();
      } else {
        state.notificationPrefs.push({
          id: Utils.uid('pref'),
          userId,
          email: Boolean(email),
          push: Boolean(push),
          whatsapp: Boolean(whatsapp),
          createdAt: Utils.nowISO(),
        });
      }
    },
    'chat.postMessage': ({ threadId, body }) => {
      const state = ensureCache();
      let thread = state.chats.find((item) => item.id === threadId);
      if (!thread) {
        thread = {
          id: threadId,
          title: 'Conversación',
          participantIds: [currentUserId()].filter(Boolean),
          createdAt: Utils.nowISO(),
        };
        state.chats.push(thread);
      }
      if (currentUserId() && !thread.participantIds.includes(currentUserId())) {
        thread.participantIds.push(currentUserId());
      }
      state.chatMessages.push({
        id: Utils.uid('msg'),
        threadId,
        userId: currentUserId(),
        body,
        createdAt: Utils.nowISO(),
      });
    },
    'offices.book': ({ officeId, start, end, reason }) => {
      const state = ensureCache();
      const startDate = new Date(start);
      const endDate = new Date(end);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        throw new Error('Rango horario inválido.');
      }
      const overlap = state.officeBookings.some((booking) => {
        if (booking.officeId !== officeId) return false;
        const existingStart = new Date(booking.start);
        const existingEnd = new Date(booking.end);
        return startDate < existingEnd && endDate > existingStart;
      });
      if (overlap) {
        throw new Error('La oficina ya está reservada en ese horario.');
      }
      state.officeBookings.push({
        id: Utils.uid('booking'),
        officeId,
        userId: currentUserId(),
        start,
        end,
        reason,
        createdAt: Utils.nowISO(),
      });
    },
    'meetings.create': ({ title, start, end, description, caseId, participantIds = [] }) => {
      const state = ensureCache();
      const meetingId = Utils.uid('meeting');
      const participants = Array.from(new Set([currentUserId(), ...participantIds].filter(Boolean)));
      state.meetings.push({
        id: meetingId,
        title,
        start,
        end,
        description: description || '',
        caseId: caseId || null,
        participantIds: participants,
        requestedBy: currentUserId(),
        status: 'programada',
        createdAt: Utils.nowISO(),
      });
      state.events.push({
        id: Utils.uid('evt'),
        title,
        description: description || '',
        start,
        end,
        caseId: caseId || null,
        visibility: 'todos',
        participantIds: participants,
        ownerId: currentUserId(),
        createdAt: Utils.nowISO(),
      });
    },
    'accountRequests.create': ({ name, email, phone, role, comment }) => {
      const state = ensureCache();
      state.accountRequests.push({
        id: Utils.uid('accreq'),
        name: name || '',
        email,
        phone: phone || '',
        role: role || 'cliente',
        comment: comment || '',
        status: 'pending',
        createdAt: Utils.nowISO(),
      });
    },
    'accountRequests.resolve': ({ requestId, approved, comment }) => {
      const state = ensureCache();
      const request = state.accountRequests.find((item) => item.id === requestId);
      if (!request) throw new Error('Solicitud no encontrada.');
      request.status = approved ? 'approved' : 'rejected';
      request.comment = comment || null;
      request.resolvedAt = Utils.nowISO();
    },
    'settings.update': ({ pjudThresholdDays, staleCaseDays, ufValue, iva }) => {
      const state = ensureCache();
      state.parameters.pjudThresholdDays = Number.isFinite(pjudThresholdDays) ? pjudThresholdDays : state.parameters.pjudThresholdDays;
      state.parameters.staleCaseDays = Number.isFinite(staleCaseDays) ? staleCaseDays : state.parameters.staleCaseDays;
      state.parameters.ufValue = Number.isFinite(ufValue) ? ufValue : state.parameters.ufValue;
      state.parameters.iva = Number.isFinite(iva) ? iva : state.parameters.iva;
      state.parameters.updatedAt = Utils.nowISO();
    },
    'profile.update': ({ name, phone }) => {
      const state = ensureCache();
      const userId = currentUserId();
      const user = state.users.find((item) => item.id === userId);
      if (!user) throw new Error('Usuario no encontrado.');
      if (name) user.name = name;
      user.phone = phone || '';
      user.updatedAt = Utils.nowISO();
    },
  };

  async function load() {
    return ensureCache();
  }

  async function dispatch(action, payload) {
    const handler = handlers[action];
    if (!handler) {
      throw new Error(`Acción no soportada sin API: ${action}`);
    }
    handler(payload || {});
    persist();
    return cache;
  }

  function getState() {
    return ensureCache();
  }

  return { load, getState, dispatch };
})();

const RemoteDataService = (() => {
  let cache = null;

  async function load() {
    const { state } = await Http.request('/state');
    cache = state;
    return cache;
  }

  async function dispatch(action, payload) {
    const { state } = await Http.request('/actions', { method: 'POST', body: { action, payload } });
    cache = state;
    return cache;
  }

  function getState() {
    return cache;
  }

  return { load, getState, dispatch };
})();

const DataService = USE_REMOTE_API ? RemoteDataService : LocalDataService;

// ---------------------------------------------------------------------------
// Servicios de dominio: auditoría, autorizaciones, notificaciones
// ---------------------------------------------------------------------------
const Domain = (() => {
  const AUDIT = {
    LOGIN: 'auth.login',
    LOGOUT: 'auth.logout',
    CASE_CREATE: 'case.create',
    CASE_UPDATE: 'case.update',
    CASE_ARCHIVE: 'case.archive',
    TASK_CREATE: 'task.create',
    TASK_COMPLETE: 'task.complete',
    DOCUMENT_UPLOAD: 'document.upload',
    DOCUMENT_VISIBILITY: 'document.visibility',
    FEE_CREATE: 'fee.create',
    FEE_PAY_REQUEST: 'fee.pay.request',
    APPROVAL_REQUEST: 'approval.request',
    APPROVAL_DECISION: 'approval.decision',
    OFFICE_BOOKING: 'office.booking',
    OFFICE_CANCEL: 'office.cancel',
    NOTIFICATION: 'notification.send',
  };

  async function addAudit({ userId, type, message, payload }) {
    await DataService.dispatch('audit.add', { userId, type, message, payload });
  }

  async function queueAuthorization({ userId, action, entityId, entityType, reason }) {
    const entry = {
      userId,
      action,
      entityId,
      entityType,
      reason,
    };
    await DataService.dispatch('approvals.queue', entry);
    await addAudit({ userId, type: AUDIT.APPROVAL_REQUEST, message: `Solicitud ${action}`, payload: entry });
  }

  async function resolveAuthorization({ approvalId, approverId, approved, comment }) {
    await DataService.dispatch('approvals.resolve', { approvalId, approved, comment });
    await addAudit({ userId: approverId, type: AUDIT.APPROVAL_DECISION, message: approved ? 'Aprobado' : 'Rechazado', payload: { approvalId, comment } });
  }

  async function sendNotification({ userIds, title, body, channel }) {
    await DataService.dispatch('notifications.send', { userIds, title, body, channel });
    await addAudit({ userId: null, type: AUDIT.NOTIFICATION, message: `${channel}: ${title}`, payload: { userIds, body } });
  }

  return { AUDIT, addAudit, queueAuthorization, resolveAuthorization, sendNotification };
})();

// ---------------------------------------------------------------------------
// Acciones de login / registro (páginas públicas)
// ---------------------------------------------------------------------------
function showStatus(message, kind = 'error') {
  const node = document.getElementById('status');
  if (!node) {
    alert(message);
    return;
  }
  node.style.display = 'block';
  node.style.color = kind === 'success' ? '#0a7a3d' : '#b00020';
  node.textContent = message;
}

window.loginUser = async function loginUser() {
  try {
    const email = document.getElementById('loginEmail')?.value?.trim().toLowerCase();
    const password = document.getElementById('loginPassword')?.value;
    if (!email || !password) {
      showStatus('Completa correo y contraseña.');
      return;
    }
    showStatus('Ingresando…', 'success');
    await Auth.login(email, password);
    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Error inesperado en login.');
  }
};

window.requestAccount = async function requestAccount() {
  try {
    const name = document.getElementById('regName')?.value?.trim();
    const email = document.getElementById('regEmail')?.value?.trim().toLowerCase();
    const pass = document.getElementById('regPassword')?.value;
    const confirm = document.getElementById('regConfirm')?.value;
    const role = document.getElementById('regRole')?.value;
    if (!name || !email || !pass || !confirm || !role) {
      showStatus('Completa todos los campos.');
      return;
    }
    if (pass !== confirm) {
      showStatus('Las contraseñas no coinciden.');
      return;
    }
    const response = await Auth.register({
      name,
      email,
      password: pass,
      role,
      phone: document.getElementById('regPhone')?.value,
      comment: document.getElementById('regComment')?.value,
    });
    if (USE_REMOTE_API) {
      try {
        await Http.request('/actions', {
          method: 'POST',
          body: {
            action: 'accountRequests.create',
            payload: {
              name,
              email,
              phone: document.getElementById('regPhone')?.value,
              role,
              comment: document.getElementById('regComment')?.value,
            },
          },
        });
      } catch (error) {
        console.warn('No se pudo guardar la solicitud en el estado central', error);
      }
    } else {
      await DataService.dispatch('accountRequests.create', {
        name,
        email,
        phone: document.getElementById('regPhone')?.value,
        role,
        comment: document.getElementById('regComment')?.value,
      });
    }
    showStatus(response.message || '✅ Solicitud enviada. Revisa tu correo.', 'success');
  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Error inesperado en registro.');
  }
};

window.requireAuth = async function requireAuth() {
  const profile = await Auth.ensure();
  if (!profile) {
    window.location.href = 'login.html';
  }
};

window.logout = async function logout() {
  Auth.logout();
  window.location.href = 'login.html';
};

// ---------------------------------------------------------------------------
// Portal principal
// ---------------------------------------------------------------------------
const Portal = (() => {
  let profile = null;
  let state = null;
  let activeModule = 'home';
  let activeCaseId = null;

  // -------------------------- Inicialización -----------------------------
  async function init() {
    profile = await ensureAuthenticated();
    if (!profile) return;
    state = await DataService.load();
    await ensureUserRegistered();
    bindGlobals();
    applyNavigation();
    renderHeader();
    switchModule(getRole() === 'cliente' ? 'clientHome' : 'home');
    await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.LOGIN, message: 'Inicio de sesión', payload: { email: profile.email } });
  }

  async function ensureAuthenticated() {
    const current = await Auth.ensure();
    if (!current) {
      window.location.href = 'login.html';
      return null;
    }
    return current;
  }

  function getRole() {
    return profile?.role || 'cliente';
  }

  async function ensureUserRegistered() {
    await DataService.dispatch('users.upsertProfile', {
      id: profile.id,
      email: profile.email,
      name: profile.name,
      role: profile.role,
    });
    state = DataService.getState();
  }

  // -------------------------- Listeners globales -------------------------
  function bindGlobals() {
    window.switchModule = switchModule;
    window.toggleAddCaseForm = () => toggleSection('addCaseContainer');
    window.toggleAddDocumentForm = () => toggleSection('addDocumentContainer');
    window.toggleAddClientForm = () => toggleSection('addClientContainer');
    window.toggleAddGlobalDocForm = () => toggleSection('addGlobalDocContainer');
    window.toggleAddDirectoryForm = () => toggleSection('addDirectoryContainer');
    window.toggleAddEventForm = () => toggleSection('addEventContainer');
    window.backToCases = () => switchModule('cases');
    window.markReviewedFromCase = () => {
      if (activeCaseId) {
        promptReview(activeCaseId);
      }
    };
    document.getElementById('addCaseForm')?.addEventListener('submit', handleCreateCase);
    document.getElementById('addTaskForm')?.addEventListener('submit', handleAddTask);
    document.getElementById('addDocumentForm')?.addEventListener('submit', handleAddDocument);
    document.getElementById('addHonorarioForm')?.addEventListener('submit', handleAddFee);
    document.getElementById('meetingForm')?.addEventListener('submit', handleAddMeeting);
    document.getElementById('bookOfficeForm')?.addEventListener('submit', handleAddReservation);
    document.getElementById('editProfileForm')?.addEventListener('submit', handleProfileSave);
    document.getElementById('notificationPrefsForm')?.addEventListener('submit', handleNotificationPrefsSave);
    document.getElementById('accountRequestsList')?.addEventListener('click', handleAccountRequestDecision);
    document.getElementById('authorizationsList')?.addEventListener('click', handleAuthorizationDecision);
    document.getElementById('partnerChatForm')?.addEventListener('submit', handleChatMessage);
    document.getElementById('documentsUploadForm')?.addEventListener('submit', handleClientDocumentUpload);
    document.getElementById('showAddActBtn')?.addEventListener('click', () => toggleSection('addActContainer'));
    document.getElementById('showAddLinkBtn')?.addEventListener('click', () => toggleSection('addLinkContainer'));
    document.getElementById('showAddAlertBtn')?.addEventListener('click', () => toggleSection('addAlertContainer'));
    document.getElementById('showBookingFormBtn')?.addEventListener('click', () => toggleSection('bookingFormContainer'));
    document.getElementById('bookingVisibility')?.addEventListener('change', handleBookingVisibilityChange);
    document.getElementById('meetingType')?.addEventListener('change', handleMeetingTypeChange);
    window.addEventListener('hashchange', () => {
      const hash = location.hash.replace('#', '');
      if (hash && hash !== activeModule) switchModule(hash);
    });
  }

  function toggleSection(id) {
    const node = document.getElementById(id);
    if (!node) return;
    node.style.display = node.style.display === 'none' ? 'block' : 'none';
  }

  // -------------------------- Navegación ---------------------------------
  function applyNavigation() {
    const role = getRole();
    Object.entries(Roles.MODULE_ACCESS).forEach(([module, allowed]) => {
      const btn = document.getElementById(`nav-${module}`);
      if (!btn) return;
      btn.style.display = allowed.includes(role) ? '' : 'none';
    });
  }

  function switchModule(moduleId) {
    const allowed = Roles.MODULE_ACCESS[moduleId];
    if (allowed && !allowed.includes(getRole())) {
      UI.showToast('No tienes permiso para ver este módulo.', 'error');
      return;
    }
    activeModule = moduleId;
    location.hash = moduleId;
    document.querySelectorAll('.module').forEach((section) => {
      section.style.display = section.id === moduleId ? 'block' : 'none';
    });
    document.querySelectorAll('.sidebar button').forEach((btn) => {
      btn.classList.toggle('active', btn.id === `nav-${moduleId}`);
    });
    renderModule(moduleId);
  }

  function renderModule(moduleId) {
    switch (moduleId) {
      case 'home':
        renderHome();
        break;
      case 'clientHome':
        renderClientHome();
        break;
      case 'cases':
        renderCases();
        break;
      case 'caseDetails':
        renderCaseDetails();
        break;
      case 'calendar':
        renderCalendar();
        break;
      case 'billing':
        renderBilling();
        break;
      case 'documents':
        renderDocuments();
        break;
      case 'clients':
        renderCRM();
        break;
      case 'crm':
        renderCRM();
        break;
      case 'directory':
        renderDirectory();
        break;
      case 'reports':
        renderReports();
        break;
      case 'profile':
        renderProfile();
        break;
      case 'notifications':
        renderNotificationPrefs();
        break;
      case 'chat':
        renderChat();
        break;
      case 'officeBooking':
        renderOfficeBookings();
        break;
      case 'meetings':
        renderMeetings();
        break;
      case 'authorizations':
        renderAuthorizations();
        break;
      case 'bitacora':
        renderAudit();
        break;
      case 'financials':
        renderFinancials();
        break;
      case 'accountRequests':
        renderAccountRequests();
        break;
      case 'userManagement':
        renderUsers();
        break;
      case 'settings':
        renderSettings();
        break;
      case 'earnings':
        renderEarnings();
        break;
      default:
        break;
    }
  }

  function renderHeader() {
    document.getElementById('user-email')?.replaceChildren(document.createTextNode(profile.email));
    document.getElementById('user-role')?.replaceChildren(document.createTextNode(Roles.LABELS[getRole()] || getRole()));
  }

  // --------------------------- Home interno ------------------------------
  function renderHome() {
    const ownedCases = state.cases.filter((c) => c.assignedUserIds?.includes(profile.id));
    const tasks = state.tasks.filter((t) => ownedCases.some((c) => c.id === t.caseId));
    document.getElementById('sumCases')?.replaceChildren(document.createTextNode(String(ownedCases.length)));
    const critical = tasks.filter((t) => t.status !== 'done' && Utils.daysBetween(Utils.nowISO(), t.dueDate) <= 3);
    document.getElementById('sumCriticalTasks')?.replaceChildren(document.createTextNode(String(critical.length)));
    const near = tasks.filter((t) => t.status !== 'done' && Utils.daysBetween(Utils.nowISO(), t.dueDate) <= 7);
    document.getElementById('sumNearExpTasks')?.replaceChildren(document.createTextNode(String(near.length)));

    const staleNode = document.getElementById('staleCases');
    const stale = ownedCases.filter((c) => Utils.daysBetween(c.lastActivityAt, Utils.nowISO()) > state.parameters.staleCaseDays);
    staleNode.innerHTML = stale.length
      ? stale
          .map((c) => `<div class="item"><strong>${Utils.escapeHtml(c.name)}</strong> · Último hito ${Utils.formatDate(c.lastActivityAt, true)} <button class="btn" data-case="${c.id}" data-action="review">Marcar revisada</button></div>`)
          .join('')
      : '<p class="empty">Sin causas atrasadas.</p>';

    const pjudNode = document.getElementById('notReviewedCases');
    const pjud = ownedCases.filter((c) => Utils.daysBetween(c.lastReviewedAt, Utils.nowISO()) > state.parameters.pjudThresholdDays);
    pjudNode.innerHTML = pjud.length
      ? pjud
          .map((c) => `<div class="item"><strong>${Utils.escapeHtml(c.name)}</strong> · Última revisión ${Utils.formatDate(c.lastReviewedAt, true)} <button class="btn" data-case="${c.id}" data-action="pjud">Marcar revisada</button></div>`)
          .join('')
      : '<p class="empty">Todo al día.</p>';

    const criticalNode = document.getElementById('criticalTasks');
    criticalNode.innerHTML = critical.length
      ? critical
          .map((t) => `<div class="item">${Utils.escapeHtml(t.name)} · ${Utils.formatDate(t.dueDate)} <button class="btn" data-task="${t.id}">Completar</button></div>`)
          .join('')
      : '<p class="empty">Sin tareas críticas.</p>';

    const nearNode = document.getElementById('nearExpiryTasks');
    nearNode.innerHTML = near.length
      ? near.map((t) => `<div class="item">${Utils.escapeHtml(t.name)} · ${Utils.formatDate(t.dueDate)}</div>`).join('')
      : '<p class="empty">Sin tareas próximas.</p>';

    staleNode.querySelectorAll('button[data-action="review"]').forEach((btn) => btn.addEventListener('click', () => promptReview(btn.dataset.case)));
    pjudNode.querySelectorAll('button[data-action="pjud"]').forEach((btn) => btn.addEventListener('click', () => promptReview(btn.dataset.case, true)));
    criticalNode.querySelectorAll('button[data-task]').forEach((btn) => btn.addEventListener('click', () => void completeTask(btn.dataset.task)));
  }

  function promptReview(caseId, onlyReviewed = false) {
    const caseItem = state.cases.find((c) => c.id === caseId);
    if (!caseItem) return;
    const form = document.createElement('form');
    form.innerHTML = `
      <label>¿Hubo novedad en PJud?
        <select name="novelty">
          <option value="no">No</option>
          <option value="yes">Sí</option>
        </select>
      </label>
      <label>Nota
        <textarea name="note" rows="3"></textarea>
      </label>`;
    UI.showModal({
      title: `Revisión de ${Utils.escapeHtml(caseItem.name)}`,
      body: form,
      onConfirm: async () => {
        const formData = new FormData(form);
        const novelty = formData.get('novelty');
        const note = formData.get('note');
        await DataService.dispatch('cases.markReviewed', { caseId, novelty, note, onlyReviewed });
        state = DataService.getState();
        renderHome();
        UI.showToast('Revisión registrada.', 'success');
      },
    });
  }

  async function completeTask(taskId) {
    try {
      await DataService.dispatch('tasks.complete', { taskId });
      state = DataService.getState();
      renderHome();
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.TASK_COMPLETE, message: 'Tarea completada', payload: { taskId } });
      UI.showToast('Tarea completada.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo completar la tarea.', 'error');
    }
  }

  // --------------------------- Portal cliente ---------------------------
  function renderClientHome() {
    const clientCases = state.cases.filter((c) => c.clientUserId === profile.id);
    document.getElementById('cliCasesCount')?.replaceChildren(document.createTextNode(String(clientCases.length)));
    const visibleTasks = state.tasks.filter((t) => t.visibleToClient && clientCases.some((c) => c.id === t.caseId));
    document.getElementById('cliNextSteps')?.replaceChildren(document.createTextNode(String(visibleTasks.length)));
    const visibleDocs = state.documents.filter((d) => d.visibleToClient && clientCases.some((c) => c.id === d.caseId));
    document.getElementById('cliDocsCount')?.replaceChildren(document.createTextNode(String(visibleDocs.length)));

    const cliCases = document.getElementById('cliCases');
    cliCases.innerHTML = clientCases.length
      ? clientCases
          .map((c) => `<article class="card"><h4>${Utils.escapeHtml(c.name)}</h4><p>${Utils.escapeHtml(c.summary || 'Sin descripción')}</p><p>Último movimiento: ${Utils.formatDate(c.lastActivityAt, true)}</p></article>`)
          .join('')
      : '<p class="empty">Aún no tienes causas asignadas.</p>';

    const cliTasks = document.getElementById('cliNextTasks');
    cliTasks.innerHTML = visibleTasks.length
      ? visibleTasks.map((t) => `<div class="item">${Utils.escapeHtml(t.name)} · ${Utils.formatDate(t.dueDate)}</div>`).join('')
      : '<p class="empty">Sin tareas habilitadas.</p>';

    const cliDocs = document.getElementById('cliDocuments');
    cliDocs.innerHTML = visibleDocs.length
      ? visibleDocs
          .map((d) => {
            const downloadBtn = d.dataUrl ? `<button class="btn" data-download="${d.id}">Descargar</button>` : '<span style="opacity:.7;">Sin archivo</span>';
            return `<div class="item">${Utils.escapeHtml(d.title)} · ${Utils.formatDate(d.createdAt)} ${downloadBtn}</div>`;
          })
          .join('')
      : '<p class="empty">Sin documentos visibles.</p>';

    const cliResolutions = document.getElementById('cliResolutions');
    const resol = visibleDocs.filter((d) => d.category === 'resolucion');
    cliResolutions.innerHTML = resol.length
      ? resol
          .map((d) => {
            const downloadBtn = d.dataUrl ? `<button class="btn" data-download="${d.id}">Descargar</button>` : '<span style="opacity:.7;">Sin archivo</span>';
            return `<div class="item">${Utils.escapeHtml(d.title)} · ${Utils.formatDate(d.createdAt)} ${downloadBtn}</div>`;
          })
          .join('')
      : '<p class="empty">Sin resoluciones habilitadas.</p>';

    document.querySelectorAll('#cliDocuments button[data-download], #cliResolutions button[data-download]').forEach((btn) =>
      btn.addEventListener('click', () => downloadDocument(btn.dataset.download))
    );
  }

  // --------------------------- Causas ------------------------------------
  function renderCases() {
    const list = document.getElementById('casesList');
    if (!list) return;
    const cases = getRole() === 'cliente'
      ? state.cases.filter((c) => c.clientUserId === profile.id)
      : state.cases.filter((c) => !c.archivedAt && (Roles.CAN_APPROVE.includes(getRole()) || c.assignedUserIds?.includes(profile.id)));
    if (!cases.length) {
      UI.setEmpty(list, 'Aún no hay causas.');
      populateCaseFormOptions();
      return;
    }
    list.innerHTML = cases
      .map((c) => `
        <article class="card">
          <header><h4>${Utils.escapeHtml(c.name)}</h4></header>
          <p>${Utils.escapeHtml(c.summary || 'Sin descripción')}</p>
          <p>Cliente: ${resolveUserName(c.clientUserId)}</p>
          <p>Estado: ${Utils.escapeHtml(c.status || '—')}</p>
          <footer>
            <button class="btn btn-primary" data-action="view" data-id="${c.id}">Ver</button>
            ${Roles.CAN_APPROVE.includes(getRole()) ? `<button class="btn" data-action="edit" data-id="${c.id}">Editar</button>` : ''}
            <button class="btn" data-action="archive" data-id="${c.id}">Archivar</button>
          </footer>
        </article>`)
      .join('');
    list.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => handleCaseAction(btn.dataset.action, btn.dataset.id)));
    populateCaseFormOptions();
  }

  function populateCaseFormOptions() {
    const clientSelect = document.getElementById('caseClient');
    if (clientSelect) {
      clientSelect.innerHTML = state.users
        .filter((u) => u.role === 'cliente')
        .map((u) => `<option value="${u.id}">${Utils.escapeHtml(u.name)}</option>`)
        .join('');
    }
    const assigneeSelect = document.getElementById('taskAssignee');
    if (assigneeSelect) {
      assigneeSelect.innerHTML = state.users
        .filter((u) => u.role !== 'cliente')
        .map((u) => `<option value="${u.id}">${Utils.escapeHtml(u.name)}</option>`)
        .join('');
    }
    const clientDocCase = document.getElementById('clientDocCase');
    if (clientDocCase) {
      clientDocCase.innerHTML = state.cases
        .filter((c) => c.clientUserId === profile.id)
        .map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`)
        .join('');
    }
  }

  function handleCaseAction(action, caseId) {
    if (action === 'view') {
      activeCaseId = caseId;
      switchModule('caseDetails');
    } else if (action === 'edit') {
      openEditCase(caseId);
    } else if (action === 'archive') {
      void requestArchiveCase(caseId);
    }
  }

  function openEditCase(caseId) {
    const caseItem = state.cases.find((c) => c.id === caseId);
    if (!caseItem) return;
    const form = document.createElement('form');
    form.innerHTML = `
      <label>Nombre<input name="name" required value="${Utils.escapeHtml(caseItem.name)}" /></label>
      <label>Tribunal<input name="court" value="${Utils.escapeHtml(caseItem.court || '')}" /></label>
      <label>Estado
        <select name="status">
          <option value="iniciado" ${caseItem.status === 'iniciado' ? 'selected' : ''}>Iniciado</option>
          <option value="en_proceso" ${caseItem.status === 'en_proceso' ? 'selected' : ''}>En proceso</option>
          <option value="finalizado" ${caseItem.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
        </select>
      </label>
      <label>Descripción<textarea name="summary" rows="4">${Utils.escapeHtml(caseItem.summary || '')}</textarea></label>`;
    UI.showModal({
      title: 'Editar causa',
      body: form,
      onConfirm: async () => {
        const data = new FormData(form);
        await DataService.dispatch('cases.update', {
          caseId,
          name: data.get('name'),
          court: data.get('court'),
          status: data.get('status'),
          summary: data.get('summary'),
        });
        state = DataService.getState();
        renderCases();
        await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.CASE_UPDATE, message: 'Causa actualizada', payload: { caseId } });
      },
    });
  }

  async function requestArchiveCase(caseId) {
    try {
      await Domain.queueAuthorization({
        userId: profile.id,
        action: 'case_archive',
        entityId: caseId,
        entityType: 'case',
        reason: 'Solicita archivar la causa',
      });
      state = DataService.getState();
      UI.showToast('Solicitud de archivo enviada a autorización.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo enviar la solicitud de archivo.', 'error');
    }
  }

  async function handleCreateCase(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = data.get('caseName');
    const client = data.get('caseClient');
    if (!name || !client) {
      UI.showToast('Nombre y cliente son obligatorios.', 'error');
      return;
    }
    const tags = (data.get('caseTags') || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      name,
      clientUserId: client,
      summary: data.get('caseDescription'),
      number: data.get('caseNumber') || null,
      category: data.get('caseCategory') || 'otro',
      status: data.get('caseState') || 'iniciado',
      tags,
      court: data.get('caseCourt') || '',
      assignedUserIds: [profile.id],
    };
    try {
      await DataService.dispatch('cases.create', payload);
      state = DataService.getState();
      const createdCase = state.cases.find((item) => item.name === name && item.clientUserId === client);
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.CASE_CREATE, message: `Nueva causa: ${name}`, payload: { caseId: createdCase?.id } });
      event.currentTarget.reset();
      toggleSection('addCaseContainer');
      renderCases();
      UI.showToast('Causa creada correctamente.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo crear la causa.', 'error');
    }
  }

  function renderCaseDetails() {
    const caseItem = state.cases.find((c) => c.id === activeCaseId);
    if (!caseItem) {
      UI.showToast('Selecciona una causa válida.', 'error');
      switchModule('cases');
      return;
    }
    document.getElementById('caseTitle')?.replaceChildren(document.createTextNode(caseItem.name));
    document.getElementById('caseDescriptionText')?.replaceChildren(document.createTextNode(caseItem.summary || 'Sin descripción'));
    document.getElementById('caseInfo').innerHTML = `
      <p>Cliente: ${resolveUserName(caseItem.clientUserId)}</p>
      <p>Tribunal: ${Utils.escapeHtml(caseItem.court || '—')}</p>
      <p>Estado: ${Utils.escapeHtml(caseItem.status || '—')}</p>
      <p>Equipo: ${(caseItem.assignedUserIds || []).map((id) => Utils.escapeHtml(resolveUserName(id))).join(', ') || '—'}</p>`;

    const tasksNode = document.getElementById('tasksList');
    const tasks = state.tasks.filter((t) => t.caseId === activeCaseId);
    tasksNode.innerHTML = tasks.length
      ? tasks
          .map((t) => `<div class="item">${Utils.escapeHtml(t.name)} · ${Utils.formatDate(t.dueDate)} · ${t.status === 'done' ? '✅' : '⏳'} <button class="btn" data-task="${t.id}">Completar</button></div>`)
          .join('')
      : '<p class="empty">Sin tareas.</p>';
    tasksNode.querySelectorAll('button[data-task]').forEach((btn) => btn.addEventListener('click', () => void completeTask(btn.dataset.task)));

    const docsNode = document.getElementById('documentsList');
    const docs = state.documents.filter((d) => d.caseId === activeCaseId);
    docsNode.innerHTML = docs.length
      ? docs
          .map((d) => {
            const visibilityBtn = `<button class="btn" data-doc="${d.id}">${d.visibleToClient ? 'Ocultar' : 'Habilitar'}</button>`;
            const downloadBtn = d.dataUrl
              ? `<button class="btn" data-download="${d.id}">Descargar</button>`
              : '<span style="opacity:.7;">Sin archivo</span>';
            return `<div class="item">${Utils.escapeHtml(d.title)} (${Utils.escapeHtml(d.category || 'otro')}) · ${Utils.formatDate(d.createdAt)} · ${d.visibleToClient ? 'Visible cliente' : 'Interno'} ${downloadBtn} ${visibilityBtn}</div>`;
          })
          .join('')
      : '<p class="empty">Sin documentos.</p>';
    docsNode.querySelectorAll('button[data-doc]').forEach((btn) => btn.addEventListener('click', () => void toggleDocumentVisibility(btn.dataset.doc)));
    docsNode.querySelectorAll('button[data-download]').forEach((btn) => btn.addEventListener('click', () => downloadDocument(btn.dataset.download)));

    const feesNode = document.getElementById('caseFeesList');
    if (feesNode) {
      const fees = state.fees.filter((f) => f.caseId === activeCaseId);
      feesNode.innerHTML = fees.length ? fees.map(renderFeeCard).join('') : '<p class="empty">Sin honorarios.</p>';
    }

    populateCaseFormOptions();
  }

  async function toggleDocumentVisibility(docId) {
    try {
      await DataService.dispatch('documents.toggleVisibility', { docId });
      state = DataService.getState();
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.DOCUMENT_VISIBILITY, message: 'Cambio de visibilidad', payload: { docId } });
      renderCaseDetails();
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo cambiar visibilidad.', 'error');
    }
  }

  function downloadDocument(docId) {
    const doc = state.documents.find((item) => item.id === docId);
    if (!doc || !doc.dataUrl) {
      UI.showToast('Documento sin archivo disponible.', 'error');
      return;
    }
    const link = document.createElement('a');
    link.href = doc.dataUrl;
    link.download = doc.fileName || `${doc.title || 'documento'}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function handleAddTask(event) {
    event.preventDefault();
    if (!activeCaseId) return;
    const data = new FormData(event.currentTarget);
    const name = data.get('taskName');
    const due = data.get('taskDue');
    if (!name || !due) {
      UI.showToast('Nombre y fecha son obligatorios.', 'error');
      return;
    }
    try {
      await DataService.dispatch('tasks.create', {
        caseId: activeCaseId,
        name,
        title: name,
        dueDate: due,
        assigneeId: data.get('taskAssignee'),
        ownerId: data.get('taskAssignee') || profile.id,
        visibleToClient: data.get('taskVisible') === 'on',
      });
      state = DataService.getState();
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.TASK_CREATE, message: 'Nueva tarea', payload: { caseId: activeCaseId, name } });
      event.currentTarget.reset();
      renderCaseDetails();
      UI.showToast('Tarea agregada.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo crear la tarea.', 'error');
    }
  }

  async function handleAddDocument(event) {
    event.preventDefault();
    if (!activeCaseId) return;
    const data = new FormData(event.currentTarget);
    const title = data.get('docTitle');
    if (!title) {
      UI.showToast('Título obligatorio.', 'error');
      return;
    }
    const file = data.get('docFile');
    if (file && file.size > 25 * 1024 * 1024) {
      UI.showToast('Archivo supera 25 MB.', 'error');
      return;
    }
    try {
      let dataUrl = null;
      let fileName = null;
      let mimeType = null;
      let size = 0;
      if (file && file.size) {
        dataUrl = await Utils.fileToDataUrl(file);
        fileName = file.name;
        mimeType = file.type || 'application/octet-stream';
        size = file.size;
      }
      await DataService.dispatch('documents.create', {
        caseId: activeCaseId,
        title,
        name: title,
        description: data.get('docDescription'),
        type: 'otro',
        category: 'otro',
        visibleToClient: data.get('docVisible') === 'on',
        fileName,
        mimeType,
        size,
        dataUrl,
        content: dataUrl,
      });
      state = DataService.getState();
      const doc = state.documents.find((item) => item.caseId === activeCaseId && item.title === title);
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.DOCUMENT_UPLOAD, message: 'Documento cargado', payload: { docId: doc?.id, caseId: activeCaseId } });
      event.currentTarget.reset();
      toggleSection('addDocumentContainer');
      renderCaseDetails();
      UI.showToast('Documento guardado.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo cargar el documento.', 'error');
    }
  }

  async function handleAddFee(event) {
    event.preventDefault();
    if (!activeCaseId) return;
    const data = new FormData(event.currentTarget);
    const amount = Number(data.get('honAmount'));
    if (!amount || amount <= 0) {
      UI.showToast('Monto inválido.', 'error');
      return;
    }
    const withIVA = data.get('honIncludeIVA') === 'on';
    const currency = data.get('honCurrency') || 'CLP';
    const splitRaw = [];
    try {
      await DataService.dispatch('fees.create', {
        caseId: activeCaseId,
        concept: data.get('honDetail') || 'Honorario',
        amount,
        includeIva: withIVA,
        iva: withIVA ? state.parameters.iva : 0,
        currency,
        dueDate: data.get('honDate'),
        splits: splitRaw,
      });
      state = DataService.getState();
      const fee = state.fees.find((item) => item.caseId === activeCaseId && item.amount === amount && item.currency === currency && item.status === 'pending');
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.FEE_CREATE, message: 'Honorario creado', payload: { feeId: fee?.id, caseId: activeCaseId } });
      event.currentTarget.reset();
      renderCaseDetails();
      UI.showToast('Honorario registrado.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo registrar el honorario.', 'error');
    }
  }

  function renderFeeCard(fee) {
    const total = fee.amount + fee.amount * (fee.iva || 0);
    const splits = state.feeSplits.filter((split) => split.feeId === fee.id);
    const splitInfo = Roles.CAN_SEE_SPLIT.includes(getRole())
      ? `<div class="splits">${splits.map((split) => `${Utils.escapeHtml(resolveUserName(split.userId))}: ${Utils.percent(split.percent)}`).join(' · ') || 'Sin distribución'}</div>`
      : '';
    return `<article class="card">
      <header><h4>${Utils.escapeHtml(fee.concept)}</h4></header>
      <p>Monto: ${Utils.formatMoney(total, fee.currency)}</p>
      <p>Vence: ${Utils.formatDate(fee.dueDate)}</p>
      <p>Estado: ${fee.status === 'paid' ? 'Pagado' : 'Pendiente'}</p>
      ${splitInfo}
      ${fee.status !== 'paid' && Roles.CAN_APPROVE.includes(getRole()) ? `<button class="btn" data-action="markPaid" data-id="${fee.id}">Marcar pagado</button>` : ''}
    </article>`;
  }

  function renderBilling() {
    const list = document.getElementById('billingList');
    if (!list) return;
    const fees = state.fees.filter((fee) => (getRole() === 'cliente' ? state.cases.find((c) => c.id === fee.caseId)?.clientUserId === profile.id : true));
    if (!fees.length) {
      UI.setEmpty(list, 'Sin honorarios registrados.');
      return;
    }
    list.innerHTML = fees.map(renderFeeCard).join('');
    list.querySelectorAll('button[data-action="markPaid"]').forEach((btn) => btn.addEventListener('click', () => void requestMarkPaid(btn.dataset.id)));
  }

  async function requestMarkPaid(feeId) {
    try {
      await Domain.queueAuthorization({
        userId: profile.id,
        action: 'fee_mark_paid',
        entityId: feeId,
        entityType: 'fee',
        reason: 'Confirmar pago de honorario',
      });
      state = DataService.getState();
      UI.showToast('Solicitud enviada para marcar pago.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo enviar la solicitud.', 'error');
    }
  }

  // --------------------------- Calendario --------------------------------
  function renderCalendar() {
    const list = document.getElementById('calendarList');
    if (!list) return;
    const events = state.events.filter((evt) => !evt.cancelled && (evt.visibility === 'todos' || evt.ownerId === profile.id || evt.participantIds?.includes(profile.id)));
    if (!events.length) {
      UI.setEmpty(list, 'No hay eventos en el calendario.');
      return;
    }
    list.innerHTML = events
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .map((evt) => `<div class="item">${Utils.formatDate(evt.start, true)} · ${Utils.escapeHtml(evt.title)} ${evt.caseId ? `(Causa: ${Utils.escapeHtml(resolveCaseName(evt.caseId))})` : ''}</div>`)
      .join('');
  }

  function resolveCaseName(caseId) {
    const caseItem = state.cases.find((c) => c.id === caseId);
    return caseItem ? caseItem.name : '—';
  }

  // --------------------------- Documentos global -------------------------
  function renderDocuments() {
    const list = document.getElementById('documentsGlobalList') || document.getElementById('globalDocumentsList');
    if (!list) return;
    const docs = state.documents;
    list.innerHTML = docs.length
      ? docs
          .map((doc) => {
            const downloadBtn = doc.dataUrl ? `<button class="btn" data-download="${doc.id}">Descargar</button>` : '<span style="opacity:.7;">Sin archivo</span>';
            return `<div class="item">${Utils.escapeHtml(doc.title)} · ${Utils.escapeHtml(resolveCaseName(doc.caseId))} · ${doc.visibleToClient ? 'Cliente' : 'Interno'} ${downloadBtn}</div>`;
          })
          .join('')
      : '<p class="empty">Sin documentos.</p>';
    list.querySelectorAll('button[data-download]').forEach((btn) => btn.addEventListener('click', () => downloadDocument(btn.dataset.download)));
  }

  async function handleClientDocumentUpload(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get('clientDocFile');
    const caseId = data.get('clientDocCase');
    if (!file || !caseId) {
      UI.showToast('Selecciona archivo y causa.', 'error');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      UI.showToast('Archivo excede 25 MB.', 'error');
      return;
    }
    try {
      const dataUrl = await Utils.fileToDataUrl(file);
      await DataService.dispatch('documents.create', {
        caseId,
        title: file.name,
        description: data.get('clientDocNote'),
        category: 'aporte_cliente',
        visibleToClient: false,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      });
      state = DataService.getState();
      UI.showToast('Documento enviado. Queda pendiente de habilitación.', 'success');
      event.currentTarget.reset();
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo subir el documento.', 'error');
    }
  }

  // --------------------------- CRM / Directorio -------------------------
  function renderCRM() {
    const list = document.getElementById('crmList') || document.getElementById('clientsList');
    if (!list) return;
    const contacts = state.contacts.filter((contact) => (contact.type || '').toLowerCase().includes('client'));
    const dataset = contacts.length ? contacts : state.contacts;
    list.innerHTML = dataset.length
      ? dataset
          .map(
            (contact) =>
              `<div class="item"><strong>${Utils.escapeHtml(contact.name)}</strong> (${Utils.escapeHtml(contact.email || 'Sin correo')}) · ${Utils.escapeHtml(contact.phone || 'Sin teléfono')}</div>`
          )
          .join('')
      : '<p class="empty">Aún no hay clientes registrados.</p>';
  }

  function renderDirectory() {
    const list = document.getElementById('directoryList');
    if (!list) return;
    list.innerHTML = state.users
      .map((user) => `<div class="item">${Utils.escapeHtml(user.name)} · ${Roles.LABELS[user.role] || user.role} · ${Utils.escapeHtml(user.email)}</div>`)
      .join('');
  }

  // --------------------------- Reportes ---------------------------------
  function renderReports() {
    const operational = document.getElementById('reportOperational');
    const financial = document.getElementById('reportFinancial');
    if (operational) {
      const openTasks = state.tasks.filter((t) => t.status !== 'done');
      const casesByStatus = state.cases.reduce((acc, c) => {
        acc[c.status || 'sin_estado'] = (acc[c.status || 'sin_estado'] || 0) + 1;
        return acc;
      }, {});
      operational.innerHTML = `
        <p>Tareas abiertas: ${openTasks.length}</p>
        <p>Causas por estado: ${Object.entries(casesByStatus)
          .map(([status, count]) => `${Utils.escapeHtml(status)} (${count})`)
          .join(' · ')}</p>`;
    }
    if (financial) {
      const total = state.fees.reduce((acc, fee) => acc + fee.amount + fee.amount * (fee.iva || 0), 0);
      const paid = state.fees.filter((fee) => fee.status === 'paid').reduce((acc, fee) => acc + fee.amount + fee.amount * (fee.iva || 0), 0);
      financial.innerHTML = `
        <p>Total facturado: ${Utils.formatMoney(total)}</p>
        <p>Pagado: ${Utils.formatMoney(paid)}</p>
        <p>Pendiente: ${Utils.formatMoney(total - paid)}</p>`;
    }
  }

  // --------------------------- Notificaciones ---------------------------
  function renderNotificationPrefs() {
    const form = document.getElementById('notificationPrefsForm');
    if (!form) return;
    const prefs = state.notificationPrefs.find((pref) => pref.userId === profile.id) || { email: true, push: true, whatsapp: false };
    form.email.checked = prefs.email;
    form.push.checked = prefs.push;
    form.whatsapp.checked = prefs.whatsapp;
    const list = document.getElementById('notificationsList');
    if (list) {
      const notifications = state.notifications.filter((n) => !n.userIds || n.userIds.includes(profile.id));
      list.innerHTML = notifications.length
        ? notifications.map((n) => `<div class="item">${Utils.formatDate(n.createdAt, true)} · ${Utils.escapeHtml(n.title)} (${n.channel})</div>`).join('')
        : '<p class="empty">No hay notificaciones registradas.</p>';
    }
  }

  async function handleNotificationPrefsSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await DataService.dispatch('notificationPrefs.save', {
        userId: profile.id,
        email: form.email.checked,
        push: form.push.checked,
        whatsapp: form.whatsapp.checked,
      });
      state = DataService.getState();
      UI.showToast('Preferencias guardadas.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudieron guardar las preferencias.', 'error');
    }
  }

  // --------------------------- Chat -------------------------------------
  function renderChat() {
    const threadsNode = document.getElementById('chatUsers');
    const messagesNode = document.getElementById('chatMessages');
    if (!threadsNode || !messagesNode) return;
    const threads = state.chats.filter((thread) => thread.participantIds.includes(profile.id));
    threadsNode.innerHTML = threads.length
      ? threads.map((thread) => `<button class="btn" data-thread="${thread.id}">${Utils.escapeHtml(thread.title || 'Conversación')}</button>`).join('')
      : '<p class="empty">Sin conversaciones.</p>';
    threadsNode.querySelectorAll('button[data-thread]').forEach((btn) => btn.addEventListener('click', () => selectThread(btn.dataset.thread)));
    if (threads.length) {
      selectThread(threads[0].id);
    } else {
      messagesNode.innerHTML = '<p class="empty">Selecciona una conversación.</p>';
    }
  }

  function selectThread(threadId) {
    const messagesNode = document.getElementById('chatMessages');
    const thread = state.chats.find((t) => t.id === threadId);
    if (!thread || !messagesNode) return;
    const messages = state.chatMessages.filter((msg) => msg.threadId === threadId);
    messagesNode.innerHTML = messages.length
      ? messages
          .map((msg) => `<div class="message ${msg.userId === profile.id ? 'me' : ''}"><span>${Utils.escapeHtml(resolveUserName(msg.userId))}</span><p>${Utils.escapeHtml(msg.body)}</p><time>${Utils.formatDate(msg.createdAt, true)}</time></div>`)
          .join('')
      : '<p class="empty">Sin mensajes.</p>';
    const form = document.getElementById('partnerChatForm');
    if (form) form.dataset.threadId = threadId;
  }

  async function handleChatMessage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const threadId = form.dataset.threadId;
    const input = document.getElementById('partnerChatInput');
    const body = input?.value?.trim();
    if (!body || !threadId) return;
    try {
      await DataService.dispatch('chat.postMessage', { threadId, body });
      state = DataService.getState();
      form.reset();
      selectThread(threadId);
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo enviar el mensaje.', 'error');
    }
  }

  // --------------------------- Oficinas ----------------------------------
  function renderOfficeBookings() {
    const list = document.getElementById('officeSchedule');
    if (!list) return;
    const bookings = state.officeBookings.filter((booking) => booking.userId === profile.id || Roles.CAN_APPROVE.includes(getRole()));
    list.innerHTML = bookings.length
      ? bookings
          .map((booking) => `<div class="item">${Utils.escapeHtml(resolveOfficeName(booking.officeId))} · ${Utils.formatDate(booking.start, true)} - ${Utils.formatDate(booking.end, true)} · ${Utils.escapeHtml(booking.reason)} ${booking.status === 'cancelled' ? '(Cancelada)' : ''}</div>`)
          .join('')
      : '<p class="empty">Sin reservas de oficinas.</p>';
    const officesSelect = document.getElementById('bookingOffice');
    if (officesSelect) {
      officesSelect.innerHTML = state.offices.map((office) => `<option value="${office.id}">${Utils.escapeHtml(office.name)}</option>`).join('');
    }
    const participantsSelect = document.getElementById('bookingParticipants');
    if (participantsSelect) {
      participantsSelect.innerHTML = state.users
        .filter((user) => user.status !== 'inactive')
        .map((user) => `<option value="${user.id}">${Utils.escapeHtml(user.name || user.email)}</option>`)
        .join('');
    }
    handleBookingVisibilityChange({ target: document.getElementById('bookingVisibility') });
  }

  function resolveOfficeName(id) {
    const office = state.offices.find((o) => o.id === id);
    return office ? office.name : '—';
  }

  function handleBookingVisibilityChange(event) {
    const container = document.getElementById('bookingParticipantsContainer');
    if (!container) return;
    container.style.display = event?.target?.value === 'custom' ? 'block' : 'none';
  }

  async function handleAddReservation(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const officeId = data.get('bookingOffice');
    const date = data.get('bookingDate');
    const startTime = data.get('bookingStart');
    const endTime = data.get('bookingEnd');
    const reason = data.get('bookingReason');
    if (!officeId || !date || !startTime || !endTime || !reason) {
      UI.showToast('Completa oficina, fecha, horario y motivo.', 'error');
      return;
    }
    const start = `${date}T${startTime}:00`;
    const end = `${date}T${endTime}:00`;
    if (new Date(end) <= new Date(start)) {
      UI.showToast('La hora de término debe ser posterior al inicio.', 'error');
      return;
    }
    try {
      await DataService.dispatch('offices.book', { officeId, start, end, reason });
      state = DataService.getState();
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.OFFICE_BOOKING, message: 'Reserva de oficina', payload: { officeId, start, end } });
      form.reset();
      renderOfficeBookings();
      UI.showToast('Reserva registrada.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo registrar la reserva.', 'error');
    }
  }

  function handleMeetingTypeChange(event) {
    const group = document.getElementById('meetingCaseGroup');
    if (!group) return;
    group.style.display = event?.target?.value === 'case' ? 'block' : 'none';
  }

  // --------------------------- Reuniones ---------------------------------
  function renderMeetings() {
    const list = document.getElementById('meetingsList');
    if (!list) return;
    const meetings = state.meetings.filter((meeting) => meeting.participantIds.includes(profile.id) || meeting.requestedBy === profile.id);
    list.innerHTML = meetings.length
      ? meetings
          .map((meeting) => `<div class="item">${Utils.formatDate(meeting.start, true)} · ${Utils.escapeHtml(meeting.title)} ${meeting.caseId ? `(Causa: ${Utils.escapeHtml(resolveCaseName(meeting.caseId))})` : ''} · ${meeting.status}</div>`)
          .join('')
      : '<p class="empty">Sin reuniones agendadas.</p>';
    const caseSelect = document.getElementById('meetingCase');
    if (caseSelect) {
      caseSelect.innerHTML = ['<option value="">Sin causa</option>']
        .concat(state.cases.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.name)}</option>`))
        .join('');
    }
    const participantsSelect = document.getElementById('meetingParticipants');
    if (participantsSelect) {
      participantsSelect.innerHTML = state.users
        .filter((user) => user.status !== 'inactive')
        .map((user) => `<option value="${user.id}">${Utils.escapeHtml(user.name || user.email)}</option>`)
        .join('');
    }
    handleMeetingTypeChange({ target: document.getElementById('meetingType') });
  }

  async function handleAddMeeting(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = data.get('meetingTitle');
    const date = data.get('meetingDate');
    const time = data.get('meetingTime');
    const participantsSelect = document.getElementById('meetingParticipants');
    const participants = Array.from(participantsSelect?.selectedOptions || []).map((option) => option.value);
    if (!title || !date || !time) {
      UI.showToast('Completa título, fecha y hora.', 'error');
      return;
    }
    const start = `${date}T${time}:00`;
    const endDate = new Date(start);
    endDate.setHours(endDate.getHours() + 1);
    const end = endDate.toISOString();
    try {
      await DataService.dispatch('meetings.create', {
        title,
        start,
        end,
        description: data.get('meetingDescription'),
        caseId: data.get('meetingType') === 'case' ? data.get('meetingCase') || null : null,
        participantIds: participants,
      });
      state = DataService.getState();
      await Domain.addAudit({ userId: profile.id, type: Domain.AUDIT.NOTIFICATION, message: 'Reunión creada', payload: { title, start } });
      form.reset();
      Array.from(participantsSelect?.options || []).forEach((option) => {
        option.selected = false;
      });
      renderMeetings();
      UI.showToast('Reunión agendada.', 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo agendar la reunión.', 'error');
    }
  }

  // --------------------------- Autorizaciones ----------------------------
  function renderAuthorizations() {
    const list = document.getElementById('authorizationsList');
    if (!list) return;
    const approvals = state.approvals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = approvals.length
      ? approvals
          .map((approval) => `
            <article class="card" data-id="${approval.id}">
              <h4>${Utils.escapeHtml(approval.action)}</h4>
              <p>Entidad: ${Utils.escapeHtml(approval.entityType)} (${Utils.escapeHtml(approval.entityId)})</p>
              <p>Solicitado por: ${Utils.escapeHtml(resolveUserName(approval.requestedBy))}</p>
              <p>Estado: ${approval.status}</p>
              <p>Motivo: ${Utils.escapeHtml(approval.reason || '—')}</p>
              ${approval.status === 'pending'
                ? `<div class="actions">
                    <button class="btn btn-primary" data-action="approve">Aprobar</button>
                    <button class="btn" data-action="reject">Rechazar</button>
                  </div>`
                : `<p>Resuelto por: ${Utils.escapeHtml(resolveUserName(approval.decidedBy))} (${Utils.formatDate(approval.decidedAt, true)})</p>`}
            </article>`)
          .join('')
      : '<p class="empty">No hay solicitudes pendientes.</p>';
  }

  async function handleAuthorizationDecision(event) {
    const article = event.target.closest('article[data-id]');
    if (!article) return;
    const approvalId = article.dataset.id;
    const action = event.target.dataset.action;
    if (!action) return;
    const comment = prompt('Comentario');
    const approved = action === 'approve';
    try {
      await Domain.resolveAuthorization({ approvalId, approverId: profile.id, approved, comment });
      state = DataService.getState();
      renderAuthorizations();
      renderCases();
      UI.showToast(`Solicitud ${approved ? 'aprobada' : 'rechazada'}.`, 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo procesar la autorización.', 'error');
    }
  }

  // --------------------------- Bitácora ----------------------------------
  function renderAudit() {
    const list = document.getElementById('auditList');
    if (!list) return;
    const logs = state.audit.slice(-100).reverse();
    list.innerHTML = logs.length
      ? logs
          .map((entry) => `<div class="item">${Utils.formatDate(entry.timestamp, true)} · ${Utils.escapeHtml(entry.type)} · ${Utils.escapeHtml(resolveUserName(entry.userId) || 'Sistema')} · ${Utils.escapeHtml(entry.message || '')}</div>`)
          .join('')
      : '<p class="empty">Sin eventos registrados.</p>';
  }

  // --------------------------- Finanzas ---------------------------------
  function renderFinancials() {
    const summaryNode = document.getElementById('financialSummary');
    if (!summaryNode) return;
    const totalFees = state.fees.reduce((acc, fee) => acc + fee.amount + fee.amount * (fee.iva || 0), 0);
    const paid = state.fees.filter((fee) => fee.status === 'paid').reduce((acc, fee) => acc + fee.amount + fee.amount * (fee.iva || 0), 0);
    summaryNode.innerHTML = `
      <p>Total facturado: ${Utils.formatMoney(totalFees)}</p>
      <p>Pagado: ${Utils.formatMoney(paid)}</p>
      <p>Pendiente: ${Utils.formatMoney(totalFees - paid)}</p>`;
  }

  // --------------------------- Solicitudes de cuenta ---------------------
  function renderAccountRequests() {
    const list = document.getElementById('accountRequestsList');
    if (!list) return;
    const requests = state.accountRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = requests.length
      ? requests
          .map((req) => `
            <article class="card" data-email="${Utils.escapeHtml(req.email)}">
              <h4>${Utils.escapeHtml(req.name)}</h4>
              <p>${Utils.escapeHtml(req.email)}</p>
              <p>Rol solicitado: ${Utils.escapeHtml(Roles.LABELS[req.role] || req.role)}</p>
              <p>Estado: ${req.status}</p>
              ${req.status === 'pending'
                ? `<div class="actions">
                    <button class="btn btn-primary" data-action="approve">Aprobar</button>
                    <button class="btn" data-action="reject">Rechazar</button>
                  </div>`
                : `<p>Decidido por: ${Utils.escapeHtml(resolveUserName(req.decidedBy))} (${Utils.formatDate(req.decidedAt, true)})</p>`}
            </article>`)
          .join('')
      : '<p class="empty">Sin solicitudes pendientes.</p>';
  }

  async function handleAccountRequestDecision(event) {
    const article = event.target.closest('article[data-email]');
    if (!article) return;
    const email = article.dataset.email;
    const action = event.target.dataset.action;
    if (!action) return;
    const request = state.accountRequests.find((req) => req.email === email);
    if (!request) return;
    try {
      await DataService.dispatch('accountRequests.resolve', {
        requestId: request.id,
        approved: action === 'approve',
        comment: action === 'approve' ? 'Aprobado' : 'Rechazado',
      });
      state = DataService.getState();
      renderAccountRequests();
      UI.showToast(`Solicitud ${action === 'approve' ? 'aprobada' : 'rechazada'}.`, 'success');
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo actualizar la solicitud.', 'error');
    }
  }

  // --------------------------- Usuarios ---------------------------------
  function renderUsers() {
    const list = document.getElementById('usersList');
    if (!list) return;
    list.innerHTML = state.users
      .map((user) => `<div class="item">${Utils.escapeHtml(user.name)} · ${Roles.LABELS[user.role] || user.role} · ${Utils.escapeHtml(user.email)}</div>`)
      .join('');
  }

  // --------------------------- Configuraciones --------------------------
  function renderSettings() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    form.pjudThreshold.value = state.parameters.pjudThresholdDays;
    form.staleCases.value = state.parameters.staleCaseDays;
    form.ufValue.value = state.parameters.ufValue;
    form.ivaDefault.value = state.parameters.iva;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      try {
        await DataService.dispatch('settings.update', {
          pjudThresholdDays: Number(data.get('pjudThreshold')) || 2,
          staleCaseDays: Number(data.get('staleCases')) || 7,
          ufValue: Number(data.get('ufValue')) || state.parameters.ufValue,
          iva: Number(data.get('ivaDefault')) || state.parameters.iva,
        });
        state = DataService.getState();
        UI.showToast('Parámetros guardados.', 'success');
      } catch (error) {
        console.error(error);
        UI.showToast(error.message || 'No se pudieron guardar las configuraciones.', 'error');
      }
    };
  }

  // --------------------------- Perfil / Preferencias --------------------
  function renderProfile() {
    const form = document.getElementById('profileForm');
    if (!form) return;
    form.fullName.value = profile.name;
    form.phone.value = state.users.find((u) => u.id === profile.id)?.phone || '';
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await DataService.dispatch('profile.update', {
        name: form.fullName.value,
        phone: form.phone.value,
      });
      state = DataService.getState();
      profile.name = form.fullName.value;
      Auth.setProfile(profile);
      UI.showToast('Perfil actualizado.', 'success');
      renderHeader();
    } catch (error) {
      console.error(error);
      UI.showToast(error.message || 'No se pudo actualizar el perfil.', 'error');
    }
  }

  // --------------------------- Ingresos personales ----------------------
  function renderEarnings() {
    const list = document.getElementById('earningsList');
    if (!list) return;
    const relevantSplits = state.feeSplits.filter((split) => split.userId === profile.id);
    if (!relevantSplits.length) {
      UI.setEmpty(list, 'Sin participaciones en honorarios.');
      return;
    }
    list.innerHTML = relevantSplits
      .map((split) => {
        const fee = state.fees.find((f) => f.id === split.feeId);
        if (!fee) return '';
        const base = fee.amount + fee.amount * (fee.iva || 0);
        const amount = (base * (split.percent || 0)) / 100;
        return `<div class="item">${Utils.escapeHtml(fee.concept)} · ${Utils.formatMoney(amount, fee.currency)} · ${Utils.formatDate(fee.dueDate)}</div>`;
      })
      .join('');
  }

  // --------------------------- Helpers ----------------------------------
  function resolveUserName(userId) {
    if (!userId) return '';
    const user = state.users.find((u) => u.id === userId);
    return user ? user.name : '';
  }

  // --------------------------- API pública ------------------------------
  return {
    init,
  };
})();

Object.assign(window, {
  Auth,
  Http,
  DataService,
  Roles,
  Domain,
  UI,
  Utils,
  Portal,
  USE_REMOTE_API,
});

// Inicializar portal cuando exista el layout de dashboard
if (document.querySelector('.dashboard')) {
  Portal.init().catch((error) => {
    console.error(error);
    UI.showToast('No se pudo iniciar el portal.', 'error');
  });
}

