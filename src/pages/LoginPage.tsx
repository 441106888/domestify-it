import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LogIn, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!loading && user && role) {
      navigate(role === "admin" ? "/admin" : "/dashboard");
    }
  }, [user, role, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

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
          transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
          className="text-center space-y-3"
        >
          <motion.div
            className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4"
            initial={{ rotate: -10 }}
            animate={{ rotate: 0 }}
            transition={{ type: "spring" as const, stiffness: 200 }}
          >
            <Sparkles className="h-8 w-8 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-bold text-foreground">نظام المهام المنزلية</h1>
          <p className="text-muted-foreground">سجل دخولك بالبريد الإلكتروني وكلمة المرور</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="overflow-hidden">
            <CardHeader className="bg-primary/5">
              <CardTitle className="flex items-center gap-2">
                <LogIn className="h-5 w-5 text-primary" />
                تسجيل الدخول
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
                    {submitting ? "جاري..." : "تسجيل الدخول"}
                  </Button>
                </motion.div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
