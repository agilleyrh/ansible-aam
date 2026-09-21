import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { Bullseye, Spinner } from "@patternfly/react-core";

import { api } from "./api";
import type { CurrentUser } from "./types";

type AuthValue = {
  user: CurrentUser | null;
  refresh: () => Promise<CurrentUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    const next = await api.me();
    setUser(next);
    return next;
  }

  useEffect(() => {
    refresh()
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <Bullseye>
        <Spinner aria-label="Checking session" />
      </Bullseye>
    );
  }

  const value: AuthValue = {
    user,
    refresh,
    logout: async () => {
      await api.logout();
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("Authentication is not available on this page.");
  }
  return value;
}

export function RequireAuth() {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
