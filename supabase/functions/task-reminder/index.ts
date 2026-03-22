import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "No bot token" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    // Tasks due in 1.5 hours (check window: 85-95 minutes from now to avoid duplicates with 1-min cron)
    const reminderStart = new Date(now.getTime() + 85 * 60 * 1000);
    const reminderEnd = new Date(now.getTime() + 95 * 60 * 1000);

    // Get pending tasks with deadlines in the reminder window
    const { data: tasks, error: tasksErr } = await supabaseAdmin
      .from("tasks")
      .select("id, title, deadline, assigned_to, points")
      .eq("status", "pending")
      .eq("reminder_sent", false)
      .gte("deadline", reminderStart.toISOString())
      .lte("deadline", reminderEnd.toISOString());

    if (tasksErr) {
      console.error("Error fetching tasks:", tasksErr);
      return new Response(JSON.stringify({ error: tasksErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tasks || tasks.length === 0) {
      return new Response(JSON.stringify({ ok: true, reminded: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let reminded = 0;
    const appUrl = "https://domestify-it.lovable.app";

    for (const task of tasks) {
      if (!task.assigned_to) continue;

      // Get user's telegram chat ID
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("telegram_chat_id, name")
        .eq("id", task.assigned_to)
        .single();

      if (!profile?.telegram_chat_id) continue;

      const deadlineDate = new Date(task.deadline);
      const timeStr = deadlineDate.toLocaleString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Riyadh",
      });

      const text = `<b>⏰ تذكير: مهمتك على وشك الانتهاء!</b>\n\n📋 المهمة: ${task.title}\n⏳ الموعد النهائي: ${timeStr}\n⭐ النقاط: ${task.points}\n\nتبقى ساعة ونصف تقريباً. أسرع بإنجازها!\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>`;

      try {
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
        if (tgResult.ok) {
          reminded++;
          // Also insert in-app notification
          await supabaseAdmin.from("notifications").insert({
            user_id: task.assigned_to,
            title: "⏰ تذكير بموعد المهمة",
            message: `مهمة "${task.title}" ستنتهي خلال ساعة ونصف. أسرع بإنجازها!`,
          });
        }
        console.log(`Reminder for task ${task.id}:`, tgResult.ok);
      } catch (e) {
        console.error(`Failed to send reminder for task ${task.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ ok: true, reminded, total: tasks.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Task reminder error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
