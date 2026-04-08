import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export const LoginPage = () => {
  const [email, setEmail] = useState("admin@nudgebot.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  };

  return (
    <div className="mx-auto mt-24 w-full max-w-md rounded-lg border bg-white p-6 shadow-sm dark:bg-slate-900">
      <h1 className="mb-4 text-2xl font-semibold">Welcome to NudgeBot</h1>
      <form className="space-y-4" onSubmit={submit}>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" />
        <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button className="w-full" type="submit">Login</Button>
      </form>
    </div>
  );
};
