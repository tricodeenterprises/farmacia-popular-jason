import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

type User = any;
type Session = any;

type AppRole = "master" | "operador" | "inspetor" | "chefe";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: { nome: string; role: AppRole } | null;
  roles: AppRole[];
  loading: boolean;
  profileReady: boolean;
  isMaster: boolean;
  effectiveRole: AppRole;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ nome: string; role: AppRole } | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);

  const fetchProfile = async (userId: string) => {
    setProfileReady(false);
    const [{ data: profileData }, { data: rolesData }] = await Promise.all([
      supabase.from("profiles").select("nome, role").eq("id", userId).single(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (profileData) {
      setProfile(profileData as { nome: string; role: AppRole });
    }
    if (rolesData) {
      setRoles(rolesData.map((r: any) => r.role as AppRole));
    }
    setProfileReady(true);
  };

  useEffect(() => {
    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => fetchProfile(session.user.id), 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
        setLoading(false);
      }
    );

    (supabase.auth as any).getSession().then(({ data: { session } }: any) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await (supabase.auth as any).signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await (supabase.auth as any).signOut();
    setProfile(null);
    setRoles([]);
  };

  // Priority: user_roles table > profiles.role fallback
  const effectiveRole = roles.length > 0 ? (roles.includes("master") ? "master" : roles.includes("chefe") ? "chefe" : roles.includes("inspetor") ? "inspetor" : "operador") : (profile?.role || "operador");
  const isMaster = effectiveRole === "master";

  return (
    <AuthContext.Provider value={{ user, session, profile, roles, loading, profileReady, isMaster, effectiveRole, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
