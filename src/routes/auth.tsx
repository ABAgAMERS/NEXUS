import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gamepad2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startLogin, finishLogin } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — NEXUS" },
      { name: "description", content: "Entre ou crie sua conta no NEXUS." },
      { property: "og:title", content: "Entrar — NEXUS" },
      { property: "og:description", content: "Entre ou crie sua conta no NEXUS." },
    ],
  }),
  component: AuthPage,
});

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,32}$/;

function AuthPage() {
  const navigate = useNavigate();
  // Clicking the "Log In" link in the email lands here already signed in.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) navigate({ to: "/app", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-rail bg-grid px-4">
      <div className="w-full max-w-md rounded-2xl border bg-panel p-8 shadow-neon">
        <div className="mb-6 flex items-center justify-center gap-2 font-display text-3xl font-bold tracking-widest">
          <Gamepad2 className="size-8 text-neon" />
          <span className="text-neon-gradient">NEXUS</span>
        </div>
        <Tabs defaultValue="login">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Entrar</TabsTrigger>
            <TabsTrigger value="signup">Criar conta</TabsTrigger>
          </TabsList>
          <TabsContent value="login"><LoginForm /></TabsContent>
          <TabsContent value="signup"><SignupForm /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const start = useServerFn(startLogin);
  const finish = useServerFn(finishLogin);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onStart(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await start({ data: { username, password, redirectTo: window.location.origin } });
      setSentTo(r.maskedEmail);
      toast.success("Código enviado para o seu email");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFinish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const s = await finish({ data: { username, password, code } });
      const { error } = await supabase.auth.setSession(s);
      if (error) throw error;
      navigate({ to: "/app" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <form onSubmit={onFinish} className="mt-6 space-y-4">
        <p className="text-muted-foreground">
          Enviamos um email para <span className="text-foreground">{sentTo}</span>. Clique no botão <b>Log In</b> do email para entrar, ou digite aqui o código se ele aparecer.
        </p>
        <div className="space-y-2">
          <Label htmlFor="code">Código de verificação</Label>
          <Input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required />
        </div>
        <Button type="submit" variant="neon" className="w-full" disabled={busy}>Verificar e entrar</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => { setSentTo(null); setCode(""); }}>Voltar</Button>
      </form>
    );
  }

  return (
    <form onSubmit={onStart} className="mt-6 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="lu">Nome de usuário</Label>
        <Input id="lu" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lp">Senha</Label>
        <Input id="lp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
      </div>
      <Button type="submit" variant="neon" className="w-full" disabled={busy}>Continuar</Button>
    </form>
  );
}

function SignupForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!USERNAME_RE.test(username)) return void toast.error("Usuário: 3–32 letras, números, _ ou .");
    if (password.length < 8) return void toast.error("A senha precisa ter pelo menos 8 caracteres");
    setBusy(true);
    try {
      const { data: free } = await supabase.rpc("username_available", { _username: username });
      if (!free) throw new Error("Esse nome de usuário já está em uso");
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo: window.location.origin + "/auth" },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes("weak") || msg.includes("pwned") || msg.includes("guess")) {
          throw new Error("Essa senha é fraca ou já vazou na internet. Escolha uma senha mais forte (misture letras, números e símbolos).");
        }
        if (msg.includes("already registered")) throw new Error("Esse email já tem uma conta.");
        throw error;
      }
      setDone(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 space-y-2 text-center">
        <h3 className="text-xl font-semibold text-neon">Verifique seu email</h3>
        <p className="text-muted-foreground">Enviamos um link de confirmação para {email}. Depois de confirmar, entre com seu nome de usuário.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="su">Nome de usuário</Label>
        <Input id="su" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sp">Senha</Label>
        <Input id="sp" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="se">Email (para verificação)</Label>
        <Input id="se" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <Button type="submit" variant="neon" className="w-full" disabled={busy}>Criar conta</Button>
    </form>
  );
}
