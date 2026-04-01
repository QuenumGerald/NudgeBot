"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card-simple";
import { Input } from "@/components/ui/input-simple";
import { Button } from "@/components/ui/button-simple";
import { Alert, AlertDescription } from "@/components/ui/alert-simple";
import { BrainCircuit } from "lucide-react";

function LoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleLogin = async () => {
    setError("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
          const from = searchParams.get("from") || "/";
          router.push(from);
        } else {
          setError(data.error || "Mot de passe incorrect");
        }
      } catch (err) {
        setError("Erreur de connexion");
      }
    });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-bg relative overflow-hidden">
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        <div className="w-[800px] h-[800px] bg-accent/10 rounded-full blur-[120px] absolute mix-blend-screen opacity-50" />
        <div className="w-[600px] h-[600px] bg-accent-2/10 rounded-full blur-[100px] absolute mix-blend-screen opacity-40 translate-x-1/4 -translate-y-1/4" />
      </div>

      <Card className="w-full max-w-md p-8 bg-bg-2 border-border/50 shadow-2xl shadow-black/50 z-10 backdrop-blur-xl relative flex flex-col items-center">
        <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-bg-3 to-bg-4 border-2 border-border/50 shadow-inner flex items-center justify-center mb-6 relative group overflow-hidden">
          <div className="absolute inset-0 bg-accent blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
          <BrainCircuit size={48} className="text-accent drop-shadow-[0_0_15px_rgba(108,99,255,0.5)] z-10 relative" />
        </div>

        <h1 className="text-4xl font-sans font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-text-3 mb-8 tracking-tight text-center">
          Nudgebot
        </h1>

        {error && (
          <Alert variant="destructive" className="mb-6 w-full bg-red/10 text-red border-red/20 font-mono text-sm">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-4 w-full">
          <div className="relative group">
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password && !isPending) {
                  handleLogin();
                }
              }}
              className="font-mono text-center tracking-[0.5em] text-lg py-6 bg-bg-3 border-border/50 focus-visible:ring-accent/50 focus-visible:border-accent/50 transition-all rounded-xl placeholder:tracking-normal placeholder:text-sm"
              disabled={isPending}
            />
          </div>
          <Button
            onClick={handleLogin}
            className="w-full py-6 font-bold text-base bg-gradient-to-r from-accent to-accent-2 hover:opacity-90 text-white border-0 shadow-lg shadow-accent/20 transition-all rounded-xl mt-2"
            disabled={isPending || !password}
          >
            {isPending ? <span className="animate-pulse">Connexion...</span> : "Accéder à Nudgebot"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center bg-bg text-text">Chargement...</div>}>
      <LoginForm />
    </Suspense>
  );
}
