import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { deepClone } from './utils.ts';
import { PortalState, seedState } from './state.ts';

export async function readState(supabase: SupabaseClient, slug: string): Promise<{ state: PortalState; version: number }>
{
  const { data, error } = await supabase
    .from('glcbc_state')
    .select('data, version')
    .eq('slug', slug)
    .single();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  if (!data) {
    const seeded = seedState();
    await supabase.from('glcbc_state').insert({ slug, data: seeded, version: 1 });
    return { state: deepClone(seeded), version: 1 };
  }
  return { state: deepClone(data.data as PortalState), version: data.version as number };
}

export async function saveState(
  supabase: SupabaseClient,
  slug: string,
  state: PortalState,
  version: number,
): Promise<PortalState> {
  const nextVersion = version + 1;
  const stateWithVersion: PortalState = { ...state, version: nextVersion };
  const payload = {
    slug,
    data: stateWithVersion,
    version: nextVersion,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('glcbc_state').upsert(payload, { onConflict: 'slug' });
  if (error) throw error;
  return deepClone(stateWithVersion);
}

export async function withState(
  supabase: SupabaseClient,
  slug: string,
  mutator: (draft: PortalState) => PortalState | void,
): Promise<PortalState> {
  const { state, version } = await readState(supabase, slug);
  const draft = deepClone(state);
  const result = mutator(draft);
  const next = result ? (result as PortalState) : draft;
  return saveState(supabase, slug, next, version);
}
