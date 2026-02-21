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

    const { member_id, pin } = await req.json();

    if (!member_id || !pin) {
      return new Response(JSON.stringify({ error: "البيانات مطلوبة" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get member's pin and auth email
    const { data: member } = await supabaseAdmin
      .from("members")
      .select("pin_code")
      .eq("id", member_id)
      .single();

    if (!member || member.pin_code !== pin) {
      return new Response(JSON.stringify({ error: "رمز الدخول غير صحيح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email for sign in
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(member_id);
    if (!user) {
      return new Response(JSON.stringify({ error: "المستخدم غير موجود" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sign in with email + pin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: user.email!,
      password: pin,
    });

    if (signInError) {
      return new Response(JSON.stringify({ error: "فشل تسجيل الدخول" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ 
      session: signInData.session,
      user: signInData.user,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
