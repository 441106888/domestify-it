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
      const email = parts[1]?.trim();

      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      if (email) {
        // Find user by email - fetch all users with pagination to ensure we find them
        let targetUser: any = null;
        let page = 1;
        const perPage = 100;
        
        while (!targetUser) {
          const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage,
          });
          
          if (error || !users || users.length === 0) break;
          
          targetUser = users.find((u: any) => u.email?.toLowerCase() === email.toLowerCase());
          
          if (users.length < perPage) break; // Last page
          page++;
        }

        if (targetUser) {
          await supabaseAdmin
            .from("profiles")
            .update({ telegram_chat_id: chatId })
            .eq("id", targetUser.id);

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
              text: "❌ لم يتم العثور على حساب بهذا البريد. تأكد من كتابة البريد الصحيح.\n\nاستخدم: /start your@email.com",
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
