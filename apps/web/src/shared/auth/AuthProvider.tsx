import { useQueryClient } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../api/client";

export type CurrentUser = {
  id: string;
  tenantId: string | null;
  email: string;
  username: string;
  fullName: string;
  accessLevel: "ENTITY" | "GROUP" | "USER";
  isPlatformSuperAdmin: boolean;
  permissions: string[];
  entityIds: string[];
};

type LoginInput = {
  tenantCode?: string | undefined;
  usernameOrEmail: string;
  password: string;
};

type AuthContextValue = {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: CurrentUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: CurrentUser }>("/auth/me")
      .then((result) => {
        if (active) {
          setUser(result.user);
        }
      })
      .catch(() => {
        if (active) {
          setUser(null);
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      login: async (input) => {
        const result = await apiRequest<{ user: CurrentUser }>("/auth/login", {
          body: JSON.stringify(input),
          method: "POST",
        });
        setUser(result.user);
      },
      logout: async () => {
        setUser(null);
        queryClient.clear();
        try {
          await apiRequest("/auth/logout", { method: "POST" });
        } catch {
          // The local session is intentionally cleared even if the server request
          // fails due to an expired CSRF cookie or a transient network issue.
        }
      },
      updateUser: setUser,
    }),
    [isLoading, queryClient, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
