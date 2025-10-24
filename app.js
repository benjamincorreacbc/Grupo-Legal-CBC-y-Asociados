<!-- archivo: app.js (no es módulo) -->
<script>
// === Configuración Supabase ===
const SUPABASE_URL  = 'https://focxelshnrrvanlnusqf.supabase.co';   // ← pega tu URL
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvY3hlbHNobnJydmFubG51c3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzMTAyNDAsImV4cCI6MjA3Njg4NjI0MH0.VNFpA5hESELQpjKbhZPMPOIGJiX0mV5bJVg5FbtqH1s';                 // ← pega tu anon key

// usa el build global de la CDN
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ====== AUTENTICACIÓN ======
window.loginUser = async function () {
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;

  if (!email || !password) { alert('Completa correo y contraseña.'); return; }

  const btn = document.querySelector('#loginForm button[type="submit"]');
  if (btn) btn.disabled = true;

  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (btn) btn.disabled = false;

  if (error) { alert(error.message); return; }
  // OK → ir al panel
  window.location.href = 'dashboard.html';
};

window.requestAccount = async function () {
  const name     = document.getElementById('regName')?.value?.trim();
  const email    = document.getElementById('regEmail')?.value?.trim();
  const pass     = document.getElementById('regPassword')?.value;
  const pass2    = document.getElementById('regConfirm')?.value;
  const reqRole  = document.getElementById('regRole')?.value;

  if (!name || !email || !pass || !pass2 || !reqRole) { alert('Completa todos los campos.'); return; }
  if (pass !== pass2) { alert('Las contraseñas no coinciden.'); return; }

  // Registro estándar (si en Supabase tienes "Confirm email" ON, te pedirá verificar por correo)
  const { error } = await sb.auth.signUp({
    email,
    password: pass,
    options: { data: { full_name: name, requested_role: reqRole } }
  });

  if (error) { alert(error.message); return; }
  alert('Solicitud enviada. Revisa tu correo para confirmar.');
};

// Requiere sesión para ver el dashboard
window.requireAuth = async function () {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; }
};

// Cerrar sesión
window.logout = async function () {
  await sb.auth.signOut();
  window.location.href = 'login.html';
};

// Inicialización simple del panel
window.initDashboard = async function () {
  const { data: { session } } = await sb.auth.getSession();
  // Muestra correo si existe (opcional)
  const emailSpan = document.getElementById('user-email');
  if (emailSpan && session?.user?.email) emailSpan.textContent = session.user.email;

  // Marca como activo el primer módulo visible
  window.switchModule?.('home');
};

// Navegación entre módulos del dashboard (general)
window.switchModule = function (id) {
  document.querySelectorAll('.module').forEach(el => el.style.display = 'none');
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
};

// Por si quieres también enganchar el submit desde aquí (redundante con tu inline):
document.getElementById('loginForm')?.addEventListener('submit', function (e) {
  e.preventDefault();
  window.loginUser();
});

console.log('Supabase listo en:', SUPABASE_URL);
</script>
