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

    // Get current Saudi time
    const now = new Date();
    const saFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = saFormatter.formatToParts(now);
    const saHour = parseInt(parts.find(p => p.type === "hour")!.value);
    const saMinute = parseInt(parts.find(p => p.type === "minute")!.value);
    const saDate = `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-${parts.find(p => p.type === "day")!.value}`;
    const saTimeMinutes = saHour * 60 + saMinute;

    // For tasks with cross-midnight deadlines, the "task date" is the previous calendar day
    // e.g., a task starting at 21:30 on March 31 with deadline 02:30 belongs to March 31
    // but at 01:00 on April 1, we're still within that task's window
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
    });
    const yParts = yFormatter.formatToParts(yesterday);
    const yesterdayDate = `${yParts.find(p => p.type === "year")!.value}-${yParts.find(p => p.type === "month")!.value}-${yParts.find(p => p.type === "day")!.value}`;

    // Get all active recurring tasks
    const { data: recurringTasks, error: rtErr } = await supabaseAdmin
      .from("recurring_tasks")
      .select("*")
      .eq("is_active", true);

    if (rtErr) {
      console.error("Error fetching recurring tasks:", rtErr);
      return new Response(JSON.stringify({ error: rtErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appUrl = "https://domestify-it.lovable.app";
    let actions = 0;

    for (const rt of recurringTasks || []) {
      const [remH, remM] = rt.reminder_time.split(":").map(Number);
      const [dlH, dlM] = rt.deadline_time.split(":").map(Number);
      const reminderMinutes = remH * 60 + remM;
      const deadlineMinutes = dlH * 60 + dlM;
      
      // Determine if this is a cross-midnight task (deadline < start time means crosses midnight)
      const startMinutes = rt.start_time ? (() => {
        const [sH, sM] = rt.start_time.split(":").map(Number);
        return sH * 60 + sM;
      })() : reminderMinutes;
      
      const crossesMidnight = deadlineMinutes < startMinutes;
      
      // Determine the effective task date
      // If crosses midnight and current time is in the early morning (before deadline), the task date is yesterday
      let effectiveDate = saDate;
      if (crossesMidnight && saTimeMinutes < deadlineMinutes + 30) {
        effectiveDate = yesterdayDate;
      }

      // Ensure today's log exists for the effective date
      const { data: existingLog } = await supabaseAdmin
        .from("daily_task_logs")
        .select("*")
        .eq("recurring_task_id", rt.id)
        .eq("task_date", effectiveDate)
        .maybeSingle();

      let log = existingLog;
      if (!log) {
        const { data: newLog } = await supabaseAdmin
          .from("daily_task_logs")
          .insert({ recurring_task_id: rt.id, task_date: effectiveDate })
          .select()
          .single();
        log = newLog;
      }

      if (!log) continue;

      // Get user profile
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("telegram_chat_id, name")
        .eq("id", rt.assigned_to)
        .single();

      // REMINDER: Send at reminder_time (within 2 min window) - ONCE ONLY
      let reminderMatch = false;
      if (crossesMidnight && reminderMinutes >= startMinutes) {
        // Reminder is on the same day as start (evening)
        reminderMatch = saTimeMinutes >= reminderMinutes && saTimeMinutes <= reminderMinutes + 2;
      } else if (crossesMidnight && reminderMinutes < startMinutes) {
        // Reminder is after midnight
        reminderMatch = saTimeMinutes >= reminderMinutes && saTimeMinutes <= reminderMinutes + 2;
      } else {
        reminderMatch = saTimeMinutes >= reminderMinutes && saTimeMinutes <= reminderMinutes + 2;
      }

      if (!log.reminder_sent && reminderMatch) {
        // Send Telegram reminder
        if (profile?.telegram_chat_id) {
          const text = `<b>🔔 تذكير: ${rt.title}</b>\n\nيجب عليك تنفيذ هذه المهمة قبل الساعة ${rt.deadline_time.substring(0,5)}.\n\nادخل التطبيق واضغط "تم التنفيذ".\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>`;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: profile.telegram_chat_id, text, parse_mode: "HTML" }),
          });
        }

        // In-app notification
        await supabaseAdmin.from("notifications").insert({
          user_id: rt.assigned_to,
          title: `🔔 تذكير: ${rt.title}`,
          message: `يجب تنفيذ هذه المهمة قبل الساعة ${rt.deadline_time.substring(0,5)}. ادخل التطبيق واضغط "تم التنفيذ".`,
        });

        await supabaseAdmin.from("daily_task_logs").update({ reminder_sent: true }).eq("id", log.id);
        actions++;
        console.log(`Reminder sent for ${rt.title} to ${profile?.name}`);
      }

      // DEADLINE CHECK: Check at deadline_time (within 2 min window)
      let deadlineMatch = false;
      if (crossesMidnight) {
        // Deadline is after midnight
        deadlineMatch = saTimeMinutes >= deadlineMinutes && saTimeMinutes <= deadlineMinutes + 2;
      } else {
        deadlineMatch = saTimeMinutes >= deadlineMinutes && saTimeMinutes <= deadlineMinutes + 2;
      }

      if (!log.deadline_checked && deadlineMatch) {
        await supabaseAdmin.from("daily_task_logs").update({ deadline_checked: true }).eq("id", log.id);

        if (!log.completed) {
          // Not completed - apply penalty
          await supabaseAdmin.rpc("increment_points", {
            _user_id: rt.assigned_to,
            _amount: -rt.penalty_points,
          });

          await supabaseAdmin.from("daily_task_logs").update({ penalty_applied: true }).eq("id", log.id);

          // Notify member
          if (profile?.telegram_chat_id) {
            const text = `<b>⚠️ لم تنفذ المهمة: ${rt.title}</b>\n\nتم خصم ${rt.penalty_points} نقطة من رصيدك.\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>`;
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: profile.telegram_chat_id, text, parse_mode: "HTML" }),
            });
          }

          await supabaseAdmin.from("notifications").insert({
            user_id: rt.assigned_to,
            title: `⚠️ خصم نقاط: ${rt.title}`,
            message: `لم تنفذ المهمة في الوقت المحدد. تم خصم ${rt.penalty_points} نقطة.`,
          });

          // Notify all admins
          const { data: adminRoles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
          for (const admin of adminRoles || []) {
            await supabaseAdmin.from("notifications").insert({
              user_id: admin.user_id,
              title: `⚠️ ${profile?.name || "عضو"} لم ينفذ المهمة`,
              message: `لم ينفذ مهمة "${rt.title}" وتم خصم ${rt.penalty_points} نقطة.`,
              context: "admin",
            });

            const { data: adminProfile } = await supabaseAdmin
              .from("profiles").select("telegram_chat_id").eq("id", admin.user_id).single();
            if (adminProfile?.telegram_chat_id) {
              const text = `<b>⚠️ ${profile?.name || "عضو"} لم ينفذ المهمة</b>\n\nالمهمة: ${rt.title}\nتم خصم ${rt.penalty_points} نقطة تلقائياً.\n\n<a href="${appUrl}">🔗 افتح التطبيق</a>`;
              await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: adminProfile.telegram_chat_id, text, parse_mode: "HTML" }),
              });
            }
          }
          actions++;
          console.log(`Penalty applied for ${rt.title} to ${profile?.name}`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, actions, date: saDate, time: `${saHour}:${saMinute}` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Daily task check error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
