import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const auth = req.headers.get("authorization") ?? "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (action === "set_role") {
      const role = body?.role;
      if (!role) {
        return json({ error: "role requerido" }, 400);
      }
      if (!jwt) {
        return json({ error: "JWT faltante" }, 401);
      }
      const { data: userInfo, error: userErr } = await supabaseAdmin.auth.getUser(jwt);
      if (userErr || !userInfo?.user) {
        return json({ error: "Usuario no válido" }, 401);
      }
      const userId = userInfo.user.id;

      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ role })
        .eq("id", userId);

      if (upErr) {
        return json({ error: upErr.message }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: "acción no soportada" }, 404);
  } catch (e) {
    return json({ error: e?.message ?? "error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
