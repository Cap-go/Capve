import { logoutSession } from "./logout";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setRequestAccount, type User } from "./api";

type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, updateUser] = useState<User | null>(null);
  const setUser = (next: User | null) => {
    setRequestAccount(next?.account_id ?? null);
    updateUser(next);
  };
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const { user: next } = await api.me();
      setUser(next);
    } catch {
      setUser(null);
    }
  };

  const logout = async () => {
    await logoutSession(user?.id, "current").catch(() => undefined);
    setUser(null);
  };

  const logoutAll = async () => {
    await logoutSession(user?.id, "all");
    setUser(null);
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, setUser, logout, logoutAll }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth requires AuthProvider");
  return ctx;
}
