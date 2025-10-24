
const SUPABASE_URL  = 'https://focxelshnrrvanlnusqf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvY3hlbHNobnJydmFubG51c3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMTAyNDAsImV4cCI6MjA3Njg4NjI0MH0.VNFpA5hESELQpjKbhZPMPOIGJiX0mV5bJVg5FbtqH1s';

// Verifica que la librería Supabase esté cargada vía CDN ANTES de este archivo.
if (!window.supabase) {
  console.error('Supabase SDK no está cargado. Agrega antes: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
}

const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

// Mostrar estado en pantalla
function showStatus(msg) {
  const s = document.getElementById('status');
  if (s) { s.style.display = 'block'; s.textContent = msg; }
  else { alert(msg); }
}

// === AUTENTICACIÓN ===
window.loginUser = async function () {
  try {
    const email = document.getElementById('loginEmail')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;
    if (!email || !password) { showStatus('Completa correo y contraseña.'); return; }

    showStatus('Ingresando…');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { 
  showStatus('Error: ' + error.message); 
  alert('Error: ' + error.message); 
  return; 
    }
    // OK → al panel
    window.location.href = 'dashboard.html';
  } catch (e) {
    console.error(e);
    showStatus('Error inesperado en login.');
  }
};

// (Opcional) Si usas registro:
window.requestAccount = async function () {
  try {
    const name  = document.getElementById('regName')?.value?.trim();
    const email = document.getElementById('regEmail')?.value?.trim();
    const pass  = document.getElementById('regPassword')?.value;
    const pass2 = document.getElementById('regConfirm')?.value;
    const role  = document.getElementById('regRole')?.value;
    if (!name || !email || !pass || !pass2 || !role) { showStatus('Completa todos los campos.'); return; }
    if (pass !== pass2) { showStatus('Las contraseñas no coinciden.'); return; }

    const { error } = await sb.auth.signUp({
      email,
      password: pass,
      options: { data: { full_name: name, requested_role: role } }
    });
    if (error) { showStatus('Error: ' + error.message); return; }

    showStatus('✅ Registro creado. Revisa tu correo para confirmar.');
  } catch (e) {
    console.error(e);
    showStatus('Error inesperado en registro.');
  }
};

// Proteger dashboard
window.requireAuth = async function () {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; }
};

// Cerrar sesión
window.logout = async function () {
  await sb.auth.signOut();
  window.location.href = 'login.html';
};

// Inicializar dashboard (opcional)
window.initDashboard = async function () {
  const { data: { session } } = await sb.auth.getSession();
  const emailSpan = document.getElementById('user-email');
  if (emailSpan && session?.user?.email) emailSpan.textContent = session.user.email;
  window.switchModule?.('home');
};

// Navegación simple entre módulos (si usas secciones con class="module")
window.switchModule = function (id) {
  document.querySelectorAll('.module').forEach(el => el.style.display = 'none');
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
};

console.log('Supabase listo en:', SUPABASE_URL);

/***** ===== ROLES Y PERMISOS GL CBC ===== *****/

// 1) Alias → slug interno
const ROLE_ALIASES = {
  'admin': 'admin',
  'socio fundador': 'socio_fundador',
  'socio mayorista': 'socio_mayorista',
  'socio': 'socio',
  'asociado': 'asociado',
  'abogado asociado': 'abogado_asociado',
  'cliente': 'cliente',
};

// 2) Permisos por rol (IDs deben existir en tu HTML: #nav-<id> y <section id="<id>" class="module">)
const PERMISSIONS = {
  admin: { start: 'home', nav: ['home','cases','calendar','billing','crm','directory','documents','clients','reports','profile','financials','accountRequests','userManagement','settings','earnings','notifications','chat','authorizations','bitacora','officeBooking','meetings'] },
  socio_fundador:  { start: 'home', nav: ['home','cases','calendar','billing','crm','directory','documents','clients','reports','profile','financials','accountRequests','userManagement','settings','earnings','notifications','chat','authorizations','bitacora','officeBooking','meetings'] },
  socio_mayorista: { start: 'home', nav: ['home','cases','calendar','billing','crm','directory','documents','clients','reports','profile','financials','earnings','notifications','chat','officeBooking','meetings'] },
  socio:           { start: 'home', nav: ['home','cases','calendar','crm','directory','documents','reports','profile','earnings','chat','meetings'] },
  asociado:        { start: 'home', nav: ['home','cases','calendar','crm','documents','profile','earnings','meetings'] },
  abogado_asociado:{ start: 'home', nav: ['home','cases','calendar','crm','documents','profile','earnings','meetings'] },
  cliente:         { start: 'home', nav: ['home','cases','documents','profile','meetings'] },
};

// 3) Utilidades
const norm = (s) => s ? (s.normalize?.('NFD').replace(/[\u0300-\u036f]/g, '') || s).toLowerCase().trim() : '';

async function getUserRoleSlug() {
  const res = await sb.auth.getUser();
  const user = res?.data?.user;
  const raw = user?.user_metadata?.role ?? user?.user_metadata?.roles; // admite "role" o "roles[]"
  const priority = ['socio_fundador','socio_mayorista','socio','asociado','abogado_asociado','cliente'];

  if (Array.isArray(raw)) {
    const slugs = raw.map(r => ROLE_ALIASES[norm(String(r))]).filter(Boolean);
    return priority.find(p => slugs.includes(p)) ?? slugs[0] ?? 'socio';
  }
  return ROLE_ALIASES[norm(String(raw))] ?? 'socio';
}

function setActiveNav(id) {
  document.querySelectorAll('.sidebar button[id^="nav-"]').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`nav-${id}`);
  if (btn) btn.classList.add('active');
}

// Muestra un único módulo y marca el botón correspondiente
window.switchModule = function (id) {
  document.querySelectorAll('.module').forEach(el => (el.style.display = 'none'));
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
  setActiveNav(id);
};

// 4) Aplica permisos (oculta todo y muestra solo lo permitido)
async function applyRolePermissions() {
  const slug = await getUserRoleSlug();
  const cfg = PERMISSIONS[slug] ?? PERMISSIONS.socio;

  // Oculta todo
  document.querySelectorAll('.sidebar button[id^="nav-"]').forEach(btn => (btn.style.display = 'none'));
  document.querySelectorAll('.module').forEach(el => (el.style.display = 'none'));

  // Filtra a los que existan realmente en el HTML
  const existing = (cfg.nav || []).filter(id =>
    document.getElementById(`nav-${id}`) || document.getElementById(id)
  );

  // Muestra permitidos
  existing.forEach(id => {
    const btn = document.getElementById(`nav-${id}`);
    if (btn) btn.style.display = '';
  });

  // Enlaza clicks de la sidebar a switchModule
  document.querySelectorAll('.sidebar button[id^="nav-"]').forEach(btn => {
    const id = btn.id.replace(/^nav-/, '');
    btn.onclick = () => switchModule(id);
  });

  // Abre módulo inicial
  const start = existing.includes(cfg.start) ? cfg.start : (existing[0] ?? 'home');
  switchModule(start);
}

// 5) Arranque del dashboard (guard + permisos + listeners)
window.initDashboard = async function () {
  const res = await sb.auth.getSession();
  const session = res?.data?.session;
  if (!session) { window.location.href = 'login.html'; return; }

  // pinta correo si existe <span id="user-email">
  const emailSpan = document.getElementById('user-email');
  if (emailSpan && session?.user?.email) emailSpan.textContent = session.user.email;

  await applyRolePermissions();

  // logout si existe #nav-logout
  document.getElementById('nav-logout')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    window.location.href = 'login.html';
  });
};

// 6) Auto-inicio si estamos en el dashboard (busca .dashboard en tu HTML)
if (document.querySelector('.dashboard')) {
  sb.auth.getSession().then(function(res) {
    var session = res && res.data && res.data.session;
    if (!session) window.location.href = 'login.html';
    else initDashboard();
  });
}
