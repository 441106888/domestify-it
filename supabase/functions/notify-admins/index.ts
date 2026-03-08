import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { title, message, exclude_user_id } = await req.json();

    // Get all admin user IDs
    const { data: adminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    let adminIds = adminRoles?.map((r: any) => r.user_id) || [];
    if (exclude_user_id) {
      adminIds = adminIds.filter((id: string) => id !== exclude_user_id);
    }

    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get admin profiles with telegram_chat_id
    const { data: adminProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, telegram_chat_id")
      .in("id", adminIds);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
    let sent = 0;

    for (const admin of adminProfiles || []) {
      // Insert notification in DB
      await supabaseAdmin.from("notifications").insert({
        user_id: admin.id,
        title,
        message,
      });

      // Send Telegram if linked
      if (admin.telegram_chat_id) {
        const appUrl = "https://domestify-it.lovable.app";
        const text = `<b>${title}</b>\n\n${message}\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>`;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: admin.telegram_chat_id,
            text,
            parse_mode: "HTML",
          }),
        });
        sent++;
      }
    }

    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
