import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type UserRole = "admin" | "member" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  profile: { name: string; avatar_url: string | null; total_points: number } | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;

    const loadUserState = async (userId: string) => {
      const [{ data: rolesData }, { data: profileData }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("profiles").select("name, avatar_url, total_points").eq("id", userId).single(),
      ]);

      const roles = rolesData?.map((r) => r.role) || [];
      const primaryRole = roles.includes("admin") ? "admin" : roles.includes("member") ? "member" : null;
      setRole(primaryRole as UserRole);
      setProfile(profileData ?? null);
      setLoading(false);
    };

    const subscribeToProfile = (userId: string) => {
      if (profileChannel) {
        supabase.removeChannel(profileChannel);
      }

      profileChannel = supabase
        .channel(`auth-profile-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
          async () => {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("name, avatar_url, total_points")
              .eq("id", userId)
              .single();
            setProfile(profileData ?? null);
          }
        )
        .subscribe();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession?.user) {
        setLoading(true);
        await loadUserState(nextSession.user.id);
        subscribeToProfile(nextSession.user.id);
        return;
      }

      if (profileChannel) {
        supabase.removeChannel(profileChannel);
        profileChannel = null;
      }

      setRole(null);
      setProfile(null);
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (!currentSession?.user) {
        setLoading(false);
        return;
      }

      setSession(currentSession);
      setUser(currentSession.user);
      await loadUserState(currentSession.user.id);
      subscribeToProfile(currentSession.user.id);
    });

    return () => {
      subscription.unsubscribe();
      if (profileChannel) {
        supabase.removeChannel(profileChannel);
      }
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
