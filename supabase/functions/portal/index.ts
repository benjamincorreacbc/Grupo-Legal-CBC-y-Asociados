// supabase/functions/portal/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers || {}),
    },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, { status });
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return err("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY", 500);
  }

  // Cliente admin (para leer/escribir en profiles)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // JWT del usuario
  const auth = req.headers.get("authorization") || "";
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : undefined;

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, ""); // sin barra final

  try {
    // Salud
    if (path.endsWith("/healthz")) return json({ ok: true });

    // Estado inicial
    if (path.endsWith("/state") && req.method === "GET") {
      if (!jwt) return err("JWT faltante", 401);
      const { data: { user }, error } = await admin.auth.getUser(jwt);
      if (error || !user) return err("Usuario no válido", 401);

      const { data: profile } = await admin
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      return json({
        ok: true,
        user: { id: user.id, email: user.email },
        profile,
        org: { slug: Deno.env.get("GLCBC_ORG_SLUG") || "glcbc" },
      });
    }

    // Acciones
    if (path.endsWith("/actions") && req.method === "POST") {
      if (!jwt) return err("JWT faltante", 401);
      const { data: { user }, error } = await admin.auth.getUser(jwt);
      if (error || !user) return err("Usuario no válido", 401);

      const body = await req.json().catch(() => ({} as any));
      const action = body?.action as string;
      const payload = body?.payload ?? {};

      // Usada por set-role.html
      if (action === "users.upsertProfile") {
        const row = {
          id: payload.id ?? user.id,
          email: payload.email ?? user.email,
          name: payload.name ?? null,
          role: payload.role ?? null,
          updated_at: new Date().toISOString(),
        };
        const { error: upErr } = await admin
          .from("profiles")
          .upsert(row, { onConflict: "id" });
        if (upErr) return err(upErr.message, 400);
        return json({ ok: true });
      }

      // Alternativa: cambiar solo rol
      if (action === "users.setRole") {
        const role = payload.role;
        if (!role) return err("role requerido");
        const { error: upErr } = await admin
          .from("profiles")
          .update({ role })
          .eq("id", user.id);
        if (upErr) return err(upErr.message, 400);
        return json({ ok: true });
      }

      return err("acción no soportada", 404);
    }

    // No coincide ninguna ruta
    return err("not found", 404);
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, { status: 500 });
  }
});