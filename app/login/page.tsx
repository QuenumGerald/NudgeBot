"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg border border-gray-200">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 border-2 border-blue-200 shadow-inner flex items-center justify-center mb-6 mx-auto">
          <BrainCircuit size={48} className="text-white drop-shadow-lg" />
        </div>

        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          Nudgebot
        </h1>

        {error && (
          <div className="mb-6 w-full bg-red-50 text-red-700 border border-red-200 rounded p-3 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-4 w-full">
          <div className="relative">
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password && !isPending) {
                  handleLogin();
                }
              }}
              className="w-full h-12 px-4 text-center text-lg bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
              disabled={isPending}
            />
          </div>
          <button
            onClick={handleLogin}
            className="w-full h-12 font-bold text-base bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-lg rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isPending || !password}
          >
            {isPending ? <span className="animate-pulse">Connexion...</span> : "Accéder à Nudgebot"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen w-full flex items-center justify-center bg-gray-50 text-gray-800">Chargement...</div>}>
      <LoginForm />
    </Suspense>
  );
}
