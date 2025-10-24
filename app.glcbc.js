// app.js — GL CBC (CDN global, sin módulos).
// Seguridad: esta es una anon key pública por diseño. Activa RLS y políticas en tus tablas.
// Recomendación: rota la anon luego de terminar las pruebas (Settings → API → Rotate).

const SUPABASE_URL  = 'https://focxelshnrrvanlnusqf.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvY3hlbHNobnJydmFubG51c3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMTAyNDAsImV4cCI6MjA3Njg4NjI0MH0.VNFpA5hESELQpjKbhZPMPOIGJiX0mV5bJVg5FbtqH1s';

// Verifica que la librería Supabase esté cargada vía CDN ANTES de este archivo.
if (!window.supabase) {
  console.error('Supabase SDK no está cargado. Agrega antes: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
}

const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) : null;

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
    if (error) { showStatus('Error: ' + error.message); return; }

    // OK → al panel
    window.location.href = 'dashboard.html';
  } catch (e) {
    console.error(e);
    showStatus('Error inesperado en login.');
  }
};

// Registro básico (si usas register.html)
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

// Exigir sesión en dashboard
window.requireAuth = async function () {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; }
};

// Cerrar sesión
window.logout = async function () {
  await sb.auth.signOut();
  window.location.href = 'login.html';
};

// Inicializa dashboard
window.initDashboard = async function () {
  const { data: { session } } = await sb.auth.getSession();
  const emailSpan = document.getElementById('user-email');
  if (emailSpan && session?.user?.email) emailSpan.textContent = session.user.email;
  window.switchModule?.('home');
};

// Navegación simple (si usas secciones con class="module")
window.switchModule = function (id) {
  document.querySelectorAll('.module').forEach(el => el.style.display = 'none');
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
};

console.log('Supabase listo en:', SUPABASE_URL);
