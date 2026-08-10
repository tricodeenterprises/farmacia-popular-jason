import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    // Check if this is a bootstrap request (no users exist yet)
    const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1 });
    const isBootstrap = !allUsers || allUsers.length === 0;

    if (!isBootstrap) {
      const authHeader = req.headers.get("Authorization");
      const isServiceRole = body.admin_key === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (!isServiceRole && !authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Não autorizado" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      let callerId: string | null = null;
      
      if (!isServiceRole) {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const callerClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader! } },
        });

        const { data: userData, error: userError } = await callerClient.auth.getUser();
        if (userError || !userData?.user) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        callerId = userData.user.id;
      }

      // Reset password action
      if (body.action === "reset-password") {
        const { userId, password } = body;
        if (!userId || !password) throw new Error("userId e password são obrigatórios");
        const { error } = await supabase.auth.admin.updateUserById(userId, { password });
        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!isServiceRole) {
        const { data: hasRole } = await supabase.rpc("has_role", {
          _user_id: callerId!,
          _role: "master",
        });
        if (!hasRole) throw new Error("Apenas administradores podem gerenciar usuários");
      }
    }

    // Create user action
    const { username, password, role } = body;
    if (!username || !password) throw new Error("Nome de usuário e senha são obrigatórios");

    const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, "_");
    const email = `${cleanUsername}@farmacia.local`;

    // Check if username already exists
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existingProfile) {
      throw new Error("Nome de usuário já existe. Escolha outro.");
    }

    // Force master role on bootstrap
    const finalRole = isBootstrap ? "master" : (role || "operador");

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome: username.trim() },
    });

    if (createErr) throw createErr;
    if (!newUser.user) throw new Error("Falha ao criar usuário");

    await supabase.from("profiles").update({ username: cleanUsername, nome: username.trim() }).eq("id", newUser.user.id);

    await supabase.from("user_roles").insert({
      user_id: newUser.user.id,
      role: finalRole,
    });

    return new Response(JSON.stringify({ success: true, userId: newUser.user.id, bootstrap: isBootstrap }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Create user error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
