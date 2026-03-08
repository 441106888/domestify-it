import { supabase } from "@/integrations/supabase/client";

/**
 * Send a Telegram notification to a user (fire-and-forget).
 * Also inserts into the notifications table.
 */
export async function sendNotification(userId: string, title: string, message: string) {
  // Insert DB notification
  await supabase.from("notifications").insert({ user_id: userId, title, message });

  // Send Telegram (fire-and-forget, don't block on failure)
  supabase.functions.invoke("send-telegram", {
    body: { user_id: userId, title, message },
  }).catch(() => {});
}
