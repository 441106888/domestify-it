import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify auth
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id, title, message } = await req.json();

    if (!user_id || !message) {
      return new Response(JSON.stringify({ error: "user_id and message required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's telegram chat ID
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("telegram_chat_id, name")
      .eq("id", user_id)
      .single();

    if (!profile?.telegram_chat_id) {
      return new Response(JSON.stringify({ sent: false, reason: "no_telegram" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    const appUrl = "https://domestify-it.lovable.app";
    const text = title ? `<b>${title}</b>\n\n${message}\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>` : `${message}\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>`;

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: profile.telegram_chat_id,
        text,
        parse_mode: "HTML",
      }),
    });

    const tgResult = await tgResponse.json();

    return new Response(JSON.stringify({ sent: tgResult.ok }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
