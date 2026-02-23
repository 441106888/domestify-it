import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Shield, Users, LogIn, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const item = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

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
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 }}
          className="text-xl text-muted-foreground"
        >
          جاري التحميل...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-secondary/30 to-background p-4 overflow-hidden">
      {/* Floating background shapes */}
      <motion.div
        className="absolute top-20 right-20 w-72 h-72 rounded-full bg-primary/5 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-accent/5 blur-3xl"
        animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
          className="text-center space-y-3"
        >
          <motion.div
            className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <Sparkles className="h-8 w-8 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">نظام المهام المنزلية</h1>
          <p className="text-muted-foreground">إدارة ومتابعة المهام بكفاءة</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {mode === "choose" && (
            <motion.div
              key="choose"
              variants={container}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, y: -20 }}
              className="grid gap-4"
            >
              <motion.div variants={item}>
                <Card
                  className="cursor-pointer border-2 hover:border-primary/50 transition-colors group"
                  onClick={() => setMode("admin")}
                >
                  <CardContent className="flex items-center gap-4 p-6">
                    <motion.div
                      className="rounded-xl bg-primary/10 p-3"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Shield className="h-8 w-8 text-primary" />
                    </motion.div>
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-primary transition-colors">دخول الأدمن</h3>
                      <p className="text-sm text-muted-foreground">إدارة المهام والأشخاص</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div variants={item}>
                <Card
                  className="cursor-pointer border-2 hover:border-accent/50 transition-colors group"
                  onClick={() => setMode("member")}
                >
                  <CardContent className="flex items-center gap-4 p-6">
                    <motion.div
                      className="rounded-xl bg-accent/20 p-3"
                      whileHover={{ scale: 1.1, rotate: -5 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Users className="h-8 w-8 text-accent-foreground" />
                    </motion.div>
                    <div>
                      <h3 className="font-bold text-lg group-hover:text-accent transition-colors">دخول الأعضاء</h3>
                      <p className="text-sm text-muted-foreground">عرض وتنفيذ المهام</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}

          {mode === "admin" && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
            >
              <AdminLoginForm onBack={() => setMode("choose")} />
            </motion.div>
          )}

          {mode === "member" && (
            <motion.div
              key="member"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
            >
              <MemberLoginForm onBack={() => setMode("choose")} />
            </motion.div>
          )}
        </AnimatePresence>
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
    <Card className="overflow-hidden">
      <CardHeader className="bg-primary/5">
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          {isSignUp ? "إنشاء حساب أدمن" : "دخول الأدمن"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Input placeholder="البريد الإلكتروني" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Input placeholder="كلمة المرور" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Button type="submit" className="w-full" disabled={submitting}>
              <LogIn className="h-4 w-4" />
              {submitting ? "جاري..." : isSignUp ? "إنشاء حساب" : "تسجيل الدخول"}
            </Button>
          </motion.div>
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
    <Card className="overflow-hidden">
      <CardHeader className="bg-accent/5">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          دخول الأعضاء
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {loadingMembers ? (
          <div className="text-center text-muted-foreground py-4">جاري تحميل القائمة...</div>
        ) : members.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">لا يوجد أعضاء مسجلين بعد. يرجى التواصل مع الأدمن.</div>
        ) : (
          <motion.div variants={container} initial="hidden" animate="show" className="grid gap-2">
            {members.map((m) => (
              <motion.div key={m.id} variants={item}>
                <Button
                  variant={selectedMember === m.id ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => setSelectedMember(m.id)}
                >
                  <motion.span
                    className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm ml-2"
                    whileHover={{ scale: 1.1 }}
                  >
                    {m.name.charAt(0)}
                  </motion.span>
                  {m.name}
                </Button>
              </motion.div>
            ))}
          </motion.div>
        )}

        <AnimatePresence>
          {selectedMember && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
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
            </motion.div>
          )}
        </AnimatePresence>

        <button type="button" className="text-sm text-muted-foreground hover:underline w-full text-center" onClick={onBack}>
          رجوع
        </button>
      </CardContent>
    </Card>
  );
}
