import { supabase } from './auth.js';

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, email')
    .eq('id', user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function listCases() {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCase(payload) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('cases')
    .insert({ ...payload, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function uploadCaseDocument({ caseId, file, visibleCliente = false }) {
  const path = `cases/${caseId}/${Date.now()}_${file.name}`;
  const uploadResult = await supabase.storage.from('documents').upload(path, file);
  if (uploadResult.error) throw uploadResult.error;

  const { data: { user } } = await supabase.auth.getUser();
  const insertResult = await supabase.from('documents').insert({
    case_id: caseId,
    path,
    visible_cliente: visibleCliente,
    uploaded_by: user?.id ?? null,
  }).select().single();
  if (insertResult.error) throw insertResult.error;
  return insertResult.data;
}

export async function getSignedUrl(path, secs = 1800) {
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(path, secs);
  if (error) throw error;
  return data.signedUrl;
}

export async function createMeeting({ type = 'general', caseId = null, title, description, startsAt, endsAt, participants = [] }) {
  const { data, error } = await supabase
    .from('meetings')
    .insert({ type, case_id: caseId, title, description, starts_at: startsAt, ends_at: endsAt })
    .select()
    .single();
  if (error) throw error;

  if (participants.length) {
    const rows = participants.map((uid) => ({ meeting_id: data.id, user_id: uid }));
    const { error: participantsError } = await supabase.from('meeting_participants').insert(rows);
    if (participantsError) throw participantsError;
  }

  return data;
}

export async function createContact(contact) {
  const { data, error } = await supabase.from('contacts').insert(contact).select().single();
  if (error) throw error;
  return data;
}

export async function listOffices() {
  const { data, error } = await supabase.from('offices').select('*').order('name');
  if (error) throw error;
  return data;
}

export async function addOffice({ name, address }) {
  const { data, error } = await supabase.from('offices').insert({ name, address }).select().single();
  if (error) throw error;
  return data;
}
