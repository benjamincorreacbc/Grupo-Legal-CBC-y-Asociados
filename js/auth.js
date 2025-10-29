import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = window.__GLCBC_SUPABASE_URL__;
const SUPABASE_ANON_KEY = window.__GLCBC_SUPABASE_ANON_KEY__;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message || 'No se pudo iniciar sesión');
  return data;
}

export async function requestAccount({ email, password, fullName, requestedRole }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, requested_role: requestedRole } },
  });
  if (error) throw new Error(error.message || 'No se pudo registrar la cuenta');
  return data;
}

export async function requireSessionOrRedirect(loginHref = './login.html') {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) window.location.href = loginHref;
  return session;
}

export async function signOutAndGoLogin(loginHref = './login.html') {
  await supabase.auth.signOut();
  window.location.href = loginHref;
}
