import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export interface User { id: string; email: string; name: string; phone: string; role: "client" | "admin" | "ceo"; title: string; permissions: string[]; emailVerified: boolean }
interface AuthCtx { user: User | null; ready: boolean; refresh: () => Promise<void>; setUser: (u: User | null) => void; logout: () => Promise<void> }

const Ctx = createContext<AuthCtx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    const r = await api<{ user: User | null }>("/auth/me").catch(() => ({ user: null }));
    setUser(r.user);
    setReady(true);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const logout = async () => { await api("/auth/logout", { method: "POST" }); setUser(null); };
  return <Ctx.Provider value={{ user, ready, refresh, setUser, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
export const can = (u: User | null, p: string) => !!u && (u.role === "ceo" || (u.role === "admin" && u.permissions.includes(p)));
