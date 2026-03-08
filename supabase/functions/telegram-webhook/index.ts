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

    // Handle /start command with payload (user_id) or email
    // Format: /start <user_id_or_email>
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      const identifier = parts[1]?.trim();

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      if (identifier) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);

        let targetUserId: string | null = null;

        if (isUuid) {
          targetUserId = identifier;
        } else {
          const { data: { users: authUsers } } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
          const targetUser = authUsers?.find((u: any) => u.email?.toLowerCase() === identifier.toLowerCase());
          targetUserId = targetUser?.id ?? null;
        }

        if (targetUserId) {
          await supabaseAdmin
            .from("profiles")
            .update({ telegram_chat_id: chatId })
            .eq("id", targetUserId);

          // Send confirmation
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
              text: "❌ تعذر التعرف على الحساب. افتح البوت من داخل التطبيق عبر زر (فتح بوت تلقرام) أو استخدم: /start your@email.com",
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
            text: "👋 مرحباً! لربط حسابك افتح البوت من التطبيق عبر زر (فتح بوت تلقرام) ثم اضغط Start، أو أرسل: /start your@email.com",
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
