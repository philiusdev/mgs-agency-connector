import { AppState, type AppStateStatus } from "react-native";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";

type AuthContextValue = {
  client: SupabaseClient;
  websiteUrl: string;
  platformUrl: string;
  siteId: string;
  session: Session | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  client,
  websiteUrl,
  platformUrl,
  siteId,
  children,
}: {
  client: SupabaseClient;
  websiteUrl: string;
  platformUrl: string;
  siteId: string;
  children: ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error("[mgs-mobile] Session Supabase illisible.", error.message);
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    const appState = AppState.addEventListener("change", onAppStateChange);
    if (AppState.currentState === "active") client.auth.startAutoRefresh();

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      appState.remove();
      client.auth.stopAutoRefresh();
    };
  }, [client]);

  return <AuthContext.Provider value={{ client, websiteUrl, platformUrl, siteId, session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("Le contexte d’authentification mobile est absent.");
  return context;
}
