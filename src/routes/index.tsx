import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Gamepad2, Headphones, MessagesSquare, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXUS — Comunidades, chat e voz para gamers" },
      { name: "description", content: "Crie comunidades, converse em canais de texto e jogue junto nos canais de voz do NEXUS." },
      { property: "og:title", content: "NEXUS — Comunidades para gamers" },
      { property: "og:description", content: "Chat geral, canais de texto e voz em tempo real para a sua squad." },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Users, title: "Comunidades", text: "Crie a sua em segundos." },
  { icon: MessagesSquare, title: "Chat & canais", text: "Chat geral e canais de texto em tempo real." },
  { icon: Headphones, title: "Voz", text: "Entre num canal de voz e fale com a squad." },
];

function Index() {
  return (
    <div className="min-h-screen bg-rail bg-grid">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-display text-2xl font-bold tracking-widest">
          <Gamepad2 className="size-7 text-neon" />
          <span className="text-neon-gradient">NEXUS</span>
        </div>
        <Button asChild variant="outline">
          <Link to="/auth">Entrar</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 text-center">
        <h1 className="mx-auto max-w-3xl text-5xl font-bold uppercase leading-tight md:text-7xl">
          Sua squad. <span className="text-neon-gradient">Um só lugar.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-xl text-muted-foreground">
          Comunidades, chat e voz feitos para quem joga.
        </p>
        <Button asChild variant="neon" size="lg" className="mt-10 h-12 px-10 text-base">
          <Link to="/auth">Criar conta grátis</Link>
        </Button>
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-panel p-6 text-left">
              <f.icon className="size-8 text-neon" />
              <h3 className="mt-4 text-xl font-semibold">{f.title}</h3>
              <p className="mt-1 text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
