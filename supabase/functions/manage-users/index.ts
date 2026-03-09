import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { action, username, password, role, display_name, user_id } = await req.json();

    // For bootstrap: check if any users exist
    if (action === "bootstrap") {
      const { count } = await adminClient
        .from("user_roles")
        .select("*", { count: "exact", head: true });

      if (count && count > 0) {
        return new Response(
          JSON.stringify({ error: "Users already exist. Use admin login." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!username || !password) {
        return new Response(
          JSON.stringify({ error: "Username and password required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const email = `${username.toLowerCase().replace(/[^a-z0-9_]/g, "")}@cashmanager.local`;
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: display_name || "Administrator" },
      });

      if (createErr) throw createErr;

      // Create profile and admin role
      await adminClient.from("profiles").insert({
        id: newUser.user.id,
        username,
        display_name: display_name || "Administrator",
      });
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role: "admin",
      });

      return new Response(
        JSON.stringify({ success: true, message: "Admin account created" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All other actions require authenticated admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = user.id;

    // Check admin role
    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: create user
    if (action === "create") {
      if (!username || !password || !role) {
        return new Response(
          JSON.stringify({ error: "Username, password, and role required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check duplicate username
      const { data: existing } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ error: "Username already taken" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const email = `${username.toLowerCase().replace(/[^a-z0-9_]/g, "")}@cashmanager.local`;
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username, display_name: display_name || username },
      });

      if (createErr) throw createErr;

      await adminClient.from("profiles").insert({
        id: newUser.user.id,
        username,
        display_name: display_name || username,
      });
      await adminClient.from("user_roles").insert({
        user_id: newUser.user.id,
        role: role as "admin" | "employee",
      });

      return new Response(
        JSON.stringify({ success: true, user_id: newUser.user.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: update-password
    if (action === "update-password") {
      if (!user_id || !password) {
        return new Response(
          JSON.stringify({ error: "User ID and password required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(user_id, {
        password,
      });
      if (updateErr) throw updateErr;

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: update-username
    if (action === "update-username") {
      if (!user_id || !username) {
        return new Response(
          JSON.stringify({ error: "User ID and username required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existing } = await adminClient
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", user_id)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ error: "Username already taken" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const email = `${username.toLowerCase().replace(/[^a-z0-9_]/g, "")}@cashmanager.local`;
      await adminClient.auth.admin.updateUserById(user_id, {
        email,
        user_metadata: { username },
      });
      await adminClient.from("profiles").update({ username, updated_at: new Date().toISOString() }).eq("id", user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: update-role
    if (action === "update-role") {
      if (!user_id || !role) {
        return new Response(
          JSON.stringify({ error: "User ID and role required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Remove existing roles then add new one
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").insert({ user_id, role: role as "admin" | "employee" });

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: delete user
    if (action === "delete") {
      if (!user_id) {
        return new Response(
          JSON.stringify({ error: "User ID required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Prevent self-delete
      if (user_id === callerUserId) {
        return new Response(
          JSON.stringify({ error: "Cannot delete your own account" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("id", user_id);
      await adminClient.auth.admin.deleteUser(user_id);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ACTION: list users
    if (action === "list") {
      const { data: profiles } = await adminClient
        .from("profiles")
        .select("id, username, display_name")
        .order("username");
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("user_id, role");

      const users = (profiles || []).map((p: any) => ({
        ...p,
        role: (roles || []).find((r: any) => r.user_id === p.id)?.role || "employee",
      }));

      return new Response(
        JSON.stringify({ users }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("manage-users error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
