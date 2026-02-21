import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Shield, Users, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [mode, setMode] = useState<"choose" | "admin" | "member">("choose");
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, role, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-xl text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">نظام المهام المنزلية</h1>
          <p className="text-muted-foreground">إدارة ومتابعة المهام بكفاءة</p>
        </div>

        {mode === "choose" && (
          <div className="grid gap-4">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary/50" onClick={() => setMode("admin")}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-xl bg-primary/10 p-3">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">دخول الأدمن</h3>
                  <p className="text-sm text-muted-foreground">إدارة المهام والأشخاص</p>
                </div>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-primary/50" onClick={() => setMode("member")}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="rounded-xl bg-accent/20 p-3">
                  <Users className="h-8 w-8 text-accent-foreground" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">دخول الأعضاء</h3>
                  <p className="text-sm text-muted-foreground">عرض وتنفيذ المهام</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {mode === "admin" && <AdminLoginForm onBack={() => setMode("choose")} />}
        {mode === "member" && <MemberLoginForm onBack={() => setMode("choose")} />}
      </div>
    </div>
  );
}

function AdminLoginForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name: email.split("@")[0] } } });
        if (error) throw error;
        // Assign admin role
        if (data.user) {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role: "admin" as any });
          toast({ title: "تم إنشاء الحساب بنجاح" });
          navigate("/admin");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/admin");
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          {isSignUp ? "إنشاء حساب أدمن" : "دخول الأدمن"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
          <Input placeholder="كلمة المرور" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" />
          <Button type="submit" className="w-full" disabled={submitting}>
            <LogIn className="h-4 w-4" />
            {submitting ? "جاري..." : isSignUp ? "إنشاء حساب" : "تسجيل الدخول"}
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="text-primary hover:underline" onClick={() => setIsSignUp(!isSignUp)}>
              {isSignUp ? "لدي حساب بالفعل" : "إنشاء حساب جديد"}
            </button>
            <button type="button" className="text-muted-foreground hover:underline" onClick={onBack}>رجوع</button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberLoginForm({ onBack }: { onBack: () => void }) {
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("list-members");
      setMembers(data?.members || []);
    } catch {
      // Fallback: empty list
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleLogin = async () => {
    if (!selectedMember || pin.length < 4) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("member-login", {
        body: { member_id: selectedMember, pin },
      });

      if (error || data?.error) {
        throw new Error(data?.error || "فشل تسجيل الدخول");
      }

      // Set session from edge function response
      if (data.session) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          دخول الأعضاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingMembers ? (
          <div className="text-center text-muted-foreground py-4">جاري تحميل القائمة...</div>
        ) : members.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">لا يوجد أعضاء مسجلين بعد. يرجى التواصل مع الأدمن.</div>
        ) : (
          <div className="grid gap-2">
            {members.map((m) => (
              <Button
                key={m.id}
                variant={selectedMember === m.id ? "default" : "outline"}
                className="w-full justify-start"
                onClick={() => setSelectedMember(m.id)}
              >
                {m.name}
              </Button>
            ))}
          </div>
        )}

        {selectedMember && (
          <div className="space-y-3">
            <p className="text-sm text-center text-muted-foreground">أدخل رمز الدخول</p>
            <div className="flex justify-center" dir="ltr">
              <InputOTP maxLength={4} value={pin} onChange={setPin}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button className="w-full" onClick={handleLogin} disabled={pin.length < 4 || submitting}>
              {submitting ? "جاري الدخول..." : "دخول"}
            </Button>
          </div>
        )}

        <button type="button" className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={onBack}>
          رجوع
        </button>
      </CardContent>
    </Card>
  );
}
