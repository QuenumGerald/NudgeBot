import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface SessionUser {
  id: number;
  email: string;
}

export const useSession = () => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ user: SessionUser | null }>("/api/auth/session")
      .then((data) => setUser(data.user))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
};
