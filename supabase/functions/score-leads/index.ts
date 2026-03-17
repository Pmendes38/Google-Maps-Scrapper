import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!anthropicKey) {
    return new Response(
      JSON.stringify({ error: "Missing ANTHROPIC_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const query =
    `${supabaseUrl}/rest/v1/school_leads?` +
    "ai_score=is.null&is_private=eq.Sim&limit=50&" +
    "select=id,name,school_segment,total_matriculas,capital_social,reviews_average,reviews_count,porte,data_abertura,cnae_descricao,situacao_cadastral,website,whatsapp_ready,ideb_af";

  const response = await fetch(query, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return new Response(JSON.stringify({ error: text }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const leads = await response.json();
  if (!Array.isArray(leads) || leads.length === 0) {
    return new Response(JSON.stringify({ scored: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ queued: leads.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
