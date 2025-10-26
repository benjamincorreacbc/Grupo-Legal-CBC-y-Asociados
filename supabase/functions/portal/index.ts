import { serve } from 'https://deno.land/std@0.204.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno';
import { executeAction } from './actions.ts';
import { readState } from './stateStore.ts';
import { filterStateForUser } from './utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const DEFAULT_SLUG = Deno.env.get('GLCBC_ORG_SLUG') || 'glcbc';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function resolveUser(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization || !authorization.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authorization.slice(7);
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  const user = data.user;
  return {
    id: user.id,
    email: user.email,
    name: (user.user_metadata as any)?.name || user.email || 'Usuario',
    role: (user.user_metadata as any)?.role || 'cliente',
    metadata: user.user_metadata,
  };
}

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init.headers,
    },
  });
}

function errorResponse(message: string, status = 400) {
  return json({ message }, { status });
}

serve(async (request) => {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/*$/, '');
    const slug = request.headers.get('x-glcbc-org') || DEFAULT_SLUG;
    if (request.method === 'GET' && pathname.endsWith('/state')) {
      const user = await resolveUser(request);
      if (!user) {
        return errorResponse('No autorizado', 401);
      }
      const { state } = await readState(adminClient, slug);
      return json({ state: filterStateForUser(state, user) });
    }

    if (request.method === 'POST' && pathname.endsWith('/actions')) {
      const user = await resolveUser(request);
      const body = await request.json().catch(() => null);
      if (!body || typeof body.action !== 'string') {
        return errorResponse('Solicitud inválida', 400);
      }
      const result = await executeAction(adminClient, slug, body.action, body.payload ?? {}, { user });
      return json({ state: filterStateForUser(result, user) });
    }

    return errorResponse('Ruta no encontrada', 404);
  } catch (error) {
    console.error('Edge function error', error);
    const message = error instanceof Error ? error.message : 'Error inesperado';
    return errorResponse(message, 500);
  }
});
