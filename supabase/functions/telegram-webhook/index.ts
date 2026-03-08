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
    const body = await req.json();
    const message = body?.message;

    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const chatId = String(message.chat.id);
    const text = message.text?.trim() || "";

    // Handle /start command with user ID parameter
    // Format: /start <user_email>
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const identifier = parts.slice(1).join(" ").trim();

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      if (identifier) {
        let targetUserId: string | null = null;

        // Preferred path: Telegram deep-link sends user UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(identifier)) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("id", identifier)
            .single();

          if (profile?.id) targetUserId = profile.id;
        }

        // Fallback path: manual email input
        if (!targetUserId) {
          let page = 1;
          const perPage = 100;

          while (!targetUserId) {
            const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
            if (error || !users || users.length === 0) break;

            const found = users.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
            if (found?.id) {
              targetUserId = found.id;
              break;
            }

            if (users.length < perPage) break;
            page++;
          }
        }

        if (targetUserId) {
          await supabaseAdmin
            .from("profiles")
            .update({ telegram_chat_id: chatId })
            .eq("id", targetUserId);

          const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "✅ تم ربط حسابك بنجاح! ستصلك الإشعارات هنا.",
              parse_mode: "HTML",
            }),
          });
        } else {
          const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: "❌ ما قدرت أحدد حسابك. ارجع للتطبيق واضغط زر البوت مرة ثانية، أو أرسل /start بريدك@المسجل.com",
            }),
          });
        }
      } else {
        const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "👋 مرحباً! لربط حسابك أرسل:\n\n/start your@email.com\n\nاستبدل your@email.com ببريدك المسجل في التطبيق.",
          }),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
