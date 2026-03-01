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

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "غير مصرح" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "صلاحيات غير كافية" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, ...body } = await req.json();

    if (action === "create") {
      const { name, email, password, role: newRole } = body;
      const assignedRole = newRole || "member";
      
      if (!name || !email || !password) {
        return new Response(JSON.stringify({ error: "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let userId: string;

      // Try to create user, handle if already exists
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });

      if (createError) {
        if (createError.message.includes("already been registered")) {
          // User exists in auth - find them and reuse
          const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
          const existingUser = users?.find((u: any) => u.email === email);
          if (!existingUser) {
            return new Response(JSON.stringify({ error: "تعذر العثور على المستخدم" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          userId = existingUser.id;
          // Update password and name
          await supabaseAdmin.auth.admin.updateUser(userId, { password, user_metadata: { name } });
        } else {
          return new Response(JSON.stringify({ error: createError.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        userId = newUser.user.id;
      }

      // Ensure profile exists
      const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id").eq("id", userId).single();
      if (!existingProfile) {
        await supabaseAdmin.from("profiles").insert({ id: userId, name });
      }

      if (assignedRole === "member") {
        // Upsert member record
        await supabaseAdmin.from("members").upsert({
          id: userId,
          pin_code: "deprecated",
          created_by: user.id,
        });
      }

      // Upsert role
      await supabaseAdmin.from("user_roles").upsert({
        user_id: userId,
        role: assignedRole,
      });

      return new Response(JSON.stringify({ success: true, member_id: userId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { member_id } = body;
      
      // Clean up related data first
      await supabaseAdmin.from("notifications").delete().eq("user_id", member_id);
      await supabaseAdmin.from("tasks").delete().eq("assigned_to", member_id);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", member_id);
      await supabaseAdmin.from("members").delete().eq("id", member_id);
      await supabaseAdmin.from("profiles").delete().eq("id", member_id);
      
      // Delete auth user last
      await supabaseAdmin.auth.admin.deleteUser(member_id);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "member");
      const memberIds = roles?.map((r: any) => r.user_id) || [];
      
      if (memberIds.length === 0) {
        return new Response(JSON.stringify({ members: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id, name, avatar_url, total_points")
        .in("id", memberIds);

      return new Response(JSON.stringify({ members: members || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "إجراء غير معروف" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
