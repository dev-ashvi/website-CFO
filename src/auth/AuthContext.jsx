import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configureHttpClient } from "../api/httpClient.js";
import { login as loginRequest } from "../api/auth.js";

const AuthContext = createContext(null);

const TOKEN_KEY = "wyz_token";
const TENANT_KEY = "wyz_tenant_slug";
const USER_KEY = "wyz_user";

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [state, setState] = useState({
    token: null,
    tenantSlug: null,
    user: null,
    status: "checking", // 'checking' | 'authenticated' | 'unauthenticated'
    error: null,
  });

  // Hydrate from localStorage on first mount.
  useEffect(() => {
    const token = window.localStorage.getItem(TOKEN_KEY);
    const tenantSlug = window.localStorage.getItem(TENANT_KEY);
    const userRaw = window.localStorage.getItem(USER_KEY);
    let user = null;
    if (userRaw) {
      try {
        user = JSON.parse(userRaw);
      } catch {
        user = null;
      }
    }

    if (token) {
      setState({
        token,
        tenantSlug,
        user,
        status: "authenticated",
        error: null,
      });
    } else {
      setState((prev) => ({
        ...prev,
        status: "unauthenticated",
        token: null,
        tenantSlug: null,
        user: null,
      }));
    }
  }, []);

  // Configure HTTP client with token getter and 401 handler.
  useEffect(() => {
    configureHttpClient({
      // Read from storage first to avoid a post-login race where navigation happens
      // before React state-driven reconfiguration catches up.
      getTokenFn: () => window.localStorage.getItem(TOKEN_KEY) || state.token,
      onUnauthorizedFn: () => {
        // Clear auth and redirect to login on 401.
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(TENANT_KEY);
        window.localStorage.removeItem(USER_KEY);
        setState({
          token: null,
          tenantSlug: null,
          user: null,
          status: "unauthenticated",
          error: null,
        });
        navigate("/login", { replace: true });
      },
    });
  }, [state.token, navigate]);

  const login = async ({ tenantSlug, email, password, redirectTo }) => {
    setState((prev) => ({ ...prev, error: null }));
    try {
      const { token, user } = await loginRequest({ tenantSlug, email, password });

      window.localStorage.setItem(TOKEN_KEY, token);
      if (tenantSlug) {
        window.localStorage.setItem(TENANT_KEY, tenantSlug);
      } else {
        window.localStorage.removeItem(TENANT_KEY);
      }
      if (user) {
        window.localStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        window.localStorage.removeItem(USER_KEY);
      }

      setState({
        token,
        tenantSlug: tenantSlug || null,
        user: user || null,
        status: "authenticated",
        error: null,
      });

      if (redirectTo) {
        navigate(redirectTo, { replace: true });
      } else {
        navigate("/app/chat", { replace: true });
      }
    } catch (err) {
      const message = err && err.message ? err.message : "Unable to sign in.";
      setState((prev) => ({
        ...prev,
        status: "unauthenticated",
        token: null,
        error: message,
      }));
      // Keep user on the login page; error will be shown by the login UI.
    }
  };

  const logout = () => {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(TENANT_KEY);
    window.localStorage.removeItem(USER_KEY);
    setState({
      token: null,
      tenantSlug: null,
      user: null,
      status: "unauthenticated",
      error: null,
    });
    navigate("/login", { replace: true });
  };

  const value = useMemo(
    () => ({
      ...state,
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

