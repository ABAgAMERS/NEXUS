import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Creds = { username: string; password: string };

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const validate = (input: Creds) => {
  const username = String(input?.username ?? "").trim();
  const password = String(input?.password ?? "");
  if (!username || username.length > 32 || !password || password.length > 128) {
    throw new Error("Dados inválidos");
  }
  return { username, password };
};

async function resolveAndCheck({ username, password }: Creds) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: email } = await supabaseAdmin.rpc("email_for_username", { _username: username });
  if (!email) throw new Error("Usuário ou senha incorretos");
  const client = publicClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("confirm")) {
      throw new Error("Confirme seu email antes de entrar (veja sua caixa de entrada).");
    }
    throw new Error("Usuário ou senha incorretos");
  }
  return { email, client };
}

function mask(email: string) {
  const [u = "", d = ""] = email.split("@");
  return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${d}`;
}

// Step 1: check username + password, then email a one-time code.
export const startLogin = createServerFn({ method: "POST" })
  .validator((input: Creds & { redirectTo?: string }) => {
    const base = validate(input);
    let redirectTo: string | undefined;
    try {
      const u = new URL(String(input?.redirectTo ?? ""));
      if (u.protocol === "https:" || u.hostname === "localhost") redirectTo = `${u.origin}/auth`;
    } catch { /* ignore */ }
    return { ...base, redirectTo };
  })
  .handler(async ({ data }) => {
    const { email, client } = await resolveAndCheck(data);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, ...(data.redirectTo ? { emailRedirectTo: data.redirectTo } : {}) },
    });
    if (error) throw new Error("Não foi possível enviar o código. Tente em alguns instantes.");
    return { maskedEmail: mask(email) };
  });

// Step 2: re-check credentials, verify the emailed code, return the session.
export const finishLogin = createServerFn({ method: "POST" })
  .validator((input: Creds & { code: string }) => {
    const base = validate(input);
    const code = String(input?.code ?? "").trim();
    if (!/^\d{6,8}$/.test(code)) throw new Error("Código inválido");
    return { ...base, code };
  })
  .handler(async ({ data }) => {
    const { email } = await resolveAndCheck(data);
    const client = publicClient();
    const { data: res, error } = await client.auth.verifyOtp({ email, token: data.code, type: "email" });
    if (error || !res.session) throw new Error("Código incorreto ou expirado");
    return { access_token: res.session.access_token, refresh_token: res.session.refresh_token };
  });
