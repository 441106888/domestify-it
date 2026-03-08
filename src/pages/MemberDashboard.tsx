import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer
} from "recharts";
import {
  LogOut, CheckCircle2, Clock, XCircle, AlertTriangle,
  Trophy, Crown, Medal, Award, Bell, Star, Timer, TrendingUp, Upload, Image as ImageIcon, Camera, Shield, Send, Edit
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  description: string | null;
  points: number;
  deadline: string;
  status: string;
  completed_at: string | null;
  failure_reason: string | null;
  points_awarded: number;
  created_at: string;
  proof_url: string | null;
  requires_proof: boolean;
  rejection_reason: string | null;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

const SA_LOCALE_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh"
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.07, type: "spring" as const, stiffness: 300, damping: 24 }
  }),
};

// Countdown Timer Component
function CountdownTimer({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const deadlineDate = new Date(deadline);
  const endOfDay = new Date(deadlineDate);
  endOfDay.setHours(23, 59, 59, 999);

  const diffToDeadline = deadlineDate.getTime() - now.getTime();
  const diffToMidnight = endOfDay.getTime() - now.getTime();

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)} يوم و ${hours % 24} ساعة`;
    return `${hours} ساعة و ${mins} دقيقة`;
  };

  if (diffToMidnight <= 0) {
    return <Badge variant="destructive" className="animate-pulse">⛔ انتهى الوقت تماماً</Badge>;
  }

  if (diffToDeadline > 0) {
    return (
      <div className="space-y-1">
        <Badge className="bg-[hsl(var(--success))] text-white flex items-center gap-1">
          <Timer className="h-3 w-3" /> {formatTime(diffToDeadline)} للنقاط الكاملة
        </Badge>
      </div>
    );
  }

  if (diffToMidnight <= 7200000) {
    return (
      <motion.div initial={{ scale: 0.9 }} animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
        <Badge variant="destructive" className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> ⚠️ {formatTime(diffToMidnight)} فقط! (نصف النقاط)
        </Badge>
      </motion.div>
    );
  }

  return (
    <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] flex items-center gap-1">
      <Clock className="h-3 w-3" /> {formatTime(diffToMidnight)} لنصف النقاط
    </Badge>
  );
}

export default function MemberDashboard() {
  const { user, role, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [failureTaskId, setFailureTaskId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; total_points: number; avatar_url: string | null }[]>([]);
  const [expiredPromptShown, setExpiredPromptShown] = useState(false);
  const [proofTaskId, setProofTaskId] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [isAlsoAdmin, setIsAlsoAdmin] = useState(false);
  const [showTelegramBanner, setShowTelegramBanner] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);

  const openEditProfile = async () => {
    setShowEditProfile(true);
    setEditName(profile?.name || "");
    setEditPassword("");
    setLoadingEmail(true);
    try {
      const { data } = await supabase.functions.invoke("manage-members", {
        body: { action: "get_email", member_id: user?.id },
      });
      setEditEmail(data?.email || "");
    } catch { setEditEmail(""); }
    finally { setLoadingEmail(false); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const body: any = { action: "update", member_id: user.id };
      if (editName && editName !== profile?.name) body.name = editName;
      if (editEmail) body.email = editEmail;
      if (editPassword && editPassword.length >= 6) body.password = editPassword;
      const { data, error } = await supabase.functions.invoke("manage-members", { body });
      if (error || data?.error) throw new Error(data?.error || "فشل التعديل");
      toast({ title: "تم تعديل بياناتك بنجاح ✅" });
      setShowEditProfile(false);
      // Refresh page to update profile
      window.location.reload();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      // Check if also admin
      supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
        .then(({ data }) => setIsAlsoAdmin(!!data));
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadData();
      const channel = supabase
        .channel("member-tasks")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `assigned_to=eq.${user.id}` }, () => loadData())
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => loadData())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  // Request browser notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Show Telegram banner once on first visit
  useEffect(() => {
    if (user) {
      const key = `telegram_banner_shown_${user.id}`;
      if (!localStorage.getItem(key)) {
        setShowTelegramBanner(true);
        localStorage.setItem(key, "1");
      }
    }
  }, [user]);

  // Watch for new notifications and send browser notification
  const prevNotifCountRef = useRef(0);
  useEffect(() => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length > prevNotifCountRef.current && prevNotifCountRef.current > 0) {
      const latest = unread[0];
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(latest.title, { body: latest.message, icon: "/pwa-icon-192.png" });
      }
    }
    prevNotifCountRef.current = unread.length;
  }, [notifications]);

  const loadData = async () => {
    if (!user) return;
    const { data: tasksData } = await supabase.from("tasks").select("*").eq("assigned_to", user.id).order("deadline", { ascending: true });
    const loadedTasks = (tasksData || []).map((t: any) => ({ ...t, requires_proof: t.requires_proof ?? true })) as Task[];
    setTasks(loadedTasks);

    const { data: notifData } = await (supabase.from("notifications").select("*").eq("user_id", user.id) as any).eq("context", "member").order("created_at", { ascending: false }).limit(20);
    setNotifications((notifData || []) as Notification[]);

    // Leaderboard: fetch only members (users with member role)
    // Use edge function to get member list since RLS blocks cross-user role queries
    try {
      const { data: memberData, error: fnError } = await supabase.functions.invoke("manage-members", {
        body: { action: "list" },
      });
      if (fnError || memberData?.error) {
        throw new Error("function error");
      }
      const memberProfiles = (memberData?.members || []).sort((a: any, b: any) => (b.total_points || 0) - (a.total_points || 0));
      setLeaderboard(memberProfiles);
    } catch {
      // Fallback: just show profiles (works even if session issues)
      const { data: profiles } = await supabase.from("profiles").select("id, name, total_points, avatar_url");
      setLeaderboard((profiles || []).sort((a, b) => (b.total_points || 0) - (a.total_points || 0)) as any);
    }

    // Check for expired tasks
    if (!expiredPromptShown) {
      const expiredTask = loadedTasks.find(t => {
        if (t.status !== "pending") return false;
        const deadline = new Date(t.deadline);
        const endOfDay = new Date(deadline);
        endOfDay.setHours(23, 59, 59, 999);
        return new Date() > endOfDay;
      });
      if (expiredTask) {
        setFailureTaskId(expiredTask.id);
        setExpiredPromptShown(true);
        toast({ title: "⚠️ مهمة لم تُنفذ", description: `المهمة "${expiredTask.title}" انتهى وقتها. يرجى كتابة المبرر.`, variant: "destructive" });
      }
    }
  };

  const handleProofUpload = async (file: File) => {
    if (!proofTaskId || !user) return;
    setProofUploading(true);
    try {
      const task = tasks.find(t => t.id === proofTaskId);
      if (!task) return;

      const fileExt = file.name.split('.').pop();
      const filePath = `proofs/${proofTaskId}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error } = await supabase.from("tasks").update({
        status: "pending_review" as any,
        proof_url: urlData.publicUrl,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", proofTaskId);
      if (error) throw error;

      // Notify admins via Telegram
      const memberName = profile?.name || "عضو";
      supabase.functions.invoke("notify-admins", {
        body: {
          title: "إثبات مهمة جديد 📸",
          message: `${memberName} أرسل إثبات لمهمة: "${task.title}"`,
        },
      }).catch(() => {});

      toast({ title: "تم إرسال الإثبات ✅", description: "بانتظار موافقة الأدمن لمنح النقاط" });
      setProofTaskId(null);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setProofUploading(false); }
  };

  const completeTaskWithoutProof = async (taskId: string) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("tasks").update({
        status: "pending_review" as any,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", taskId);
      if (error) throw error;

      const task = tasks.find(t => t.id === taskId);
      const memberName = profile?.name || "عضو";
      supabase.functions.invoke("notify-admins", {
        body: {
          title: "مهمة مكتملة ✅",
          message: `${memberName} أكمل مهمة: "${task?.title || ""}"`,
        },
      }).catch(() => {});

      toast({ title: "تم تسجيل إتمام المهمة ✅", description: "بانتظار موافقة الأدمن" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const submitFailureReason = async () => {
    if (!failureTaskId || !failureReason) return;
    setSubmitting(true);
    try {
      await supabase.from("tasks").update({
        status: "failed" as any, failure_reason: failureReason,
        points_awarded: 0, updated_at: new Date().toISOString(),
      }).eq("id", failureTaskId);
      toast({ title: "تم إرسال السبب للأدمن", description: "سيقوم الأدمن بمراجعة طلبك واتخاذ القرار" });
      setFailureTaskId(null); setFailureReason("");
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const markNotificationsRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    if (unread.length === 0) return;
    await Promise.all(unread.map(n => supabase.from("notifications").update({ is_read: true }).eq("id", n.id)));
    loadData();
  };

  const pendingTasks = tasks.filter(t => t.status === "pending");
  const pendingReviewTasks = tasks.filter(t => t.status === "pending_review");
  const completedTasks = tasks.filter(t => t.status === "completed");
  const failedTasks = tasks.filter(t => t.status === "failed");
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const unreadNotifs = notifications.filter(n => !n.is_read).length;
  // Dense ranking: same points = same rank
  const getRank = (index: number) => {
    if (index === 0) return 1;
    if ((leaderboard[index]?.total_points || 0) === (leaderboard[index - 1]?.total_points || 0)) {
      return getRank(index - 1);
    }
    return index + 1;
  };
  const myIndex = leaderboard.findIndex(m => m.id === user?.id);
  const myRank = myIndex >= 0 ? getRank(myIndex) : 0;

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekTasks = tasks.filter(t => new Date(t.created_at) >= weekAgo);
  const weekCompleted = weekTasks.filter(t => t.status === "completed").length;
  const totalPointsEarned = tasks.reduce((sum, t) => sum + (t.points_awarded || 0), 0);

  const reportChartData = [
    { name: "مكتملة", عدد: completedTasks.length },
    { name: "قيد التنفيذ", عدد: pendingTasks.length },
    { name: "بانتظار الموافقة", عدد: pendingReviewTasks.length },
    { name: "غير مكتملة", عدد: failedTasks.length },
  ];

  const getRankIcon = (rank: number) => {
    if (rank === 1) return (
      <div className="flex items-center gap-0.5">
        <Crown className="h-5 w-5 text-[hsl(var(--gold))]" />
        <span className="font-bold text-xs text-[hsl(var(--gold))]">1</span>
      </div>
    );
    if (rank === 2) return (
      <div className="flex items-center gap-0.5">
        <Award className="h-4 w-4 text-[hsl(var(--silver))]" />
        <span className="font-bold text-xs text-[hsl(var(--silver))]">2</span>
      </div>
    );
    if (rank === 3) return (
      <div className="flex items-center gap-0.5">
        <Award className="h-4 w-4 text-[hsl(var(--bronze))]" />
        <span className="font-bold text-xs text-[hsl(var(--bronze))]">3</span>
      </div>
    );
    return null;
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 }} className="text-xl">
        جاري التحميل...
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      <motion.header
        initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring" as const, stiffness: 200, damping: 20 }}
        className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm safe-area-top"
      >
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 max-w-3xl mx-auto">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">{profile?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">مرحباً، {profile?.name} 👋</h1>
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground">
                <motion.span className="flex items-center gap-1" key={profile?.total_points}
                  initial={{ scale: 1.3, color: "hsl(var(--gold))" }} animate={{ scale: 1, color: "hsl(var(--muted-foreground))" }}>
                  <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[hsl(var(--gold))]" /> {profile?.total_points || 0} نقطة
                </motion.span>
                {myRank > 0 && <span>المركز #{myRank}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {isAlsoAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate("/admin")} className="text-xs sm:text-sm px-2 sm:px-3">
                <Shield className="h-4 w-4 ml-1" /> الأدمن
              </Button>
            )}
            <Sheet onOpenChange={(open) => { if (open) markNotificationsRead(); }}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                  <Bell className="h-5 w-5" />
                  <AnimatePresence>
                    {unreadNotifs > 0 && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {unreadNotifs}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader><SheetTitle>الإشعارات والتذكيرات</SheetTitle></SheetHeader>
                <div className="space-y-3 mt-4 pb-6">
                  {pendingTasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-primary">⏰ مهام تحتاج تنفيذ</p>
                      {pendingTasks.map(t => (
                        <Card key={t.id} className="border-primary/20">
                          <CardContent className="p-3">
                            <p className="font-medium text-sm">{t.title}</p>
                            <CountdownTimer deadline={t.deadline} />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                  <div className="border-t pt-3">
                    <p className="text-sm font-bold text-muted-foreground mb-2">الإشعارات السابقة</p>
                    {notifications.length > 0 ? notifications.map(n => (
                      <Card key={n.id} className={`mb-2 ${!n.is_read ? 'border-primary/30 bg-primary/5' : ''}`}>
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{n.title}</p>
                              <p className="text-xs text-muted-foreground">{n.message}</p>
                              <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("ar-SA", SA_LOCALE_OPTS)}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={async () => {
                                await supabase.from("notifications").delete().eq("id", n.id);
                                setNotifications(prev => prev.filter(x => x.id !== n.id));
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )) : <p className="text-sm text-muted-foreground text-center">لا توجد إشعارات</p>}
                  </div>
                  <div className="border-t pt-3 mt-3">
                    <p className="text-sm font-bold text-muted-foreground mb-2">📱 إشعارات تلقرام</p>
                    <Card className="border-primary/20 bg-primary/5">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm">فعّل إشعارات تلقرام لتصلك التنبيهات على جوالك مباشرة!</p>
                        <p className="text-xs text-muted-foreground">1. افتح البوت بالضغط على الزر أدناه</p>
                        <p className="text-xs text-muted-foreground">2. اضغط <span className="font-semibold">Start</span> داخل البوت (ما تحتاج تكتب البريد يدويًا)</p>
                        <p className="text-xs text-muted-foreground">3. ستصلك رسالة تأكيد ✅</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full mt-1"
                          onClick={() => window.open(`https://t.me/taskhome_noti_bot?start=${user?.id ?? ""}`, "_blank")}
                        >
                          <Send className="h-4 w-4 ml-1" />
                          فتح بوت تلقرام
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" onClick={openEditProfile} className="h-9 w-9">
              <Edit className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} className="h-9 w-9">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {showTelegramBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-4 mt-3 max-w-3xl lg:mx-auto"
          >
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <p className="font-bold text-sm">📱 فعّل إشعارات تلقرام!</p>
                    <p className="text-xs text-muted-foreground">تصلك تنبيهات المهام مباشرة على جوالك عبر بوت تلقرام. فعّلها من قسم الإشعارات (🔔).</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => setShowTelegramBanner(false)}
                  >
                    <XCircle className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    window.open(`https://t.me/taskhome_noti_bot?start=${user?.id ?? ""}`, "_blank");
                    setShowTelegramBanner(false);
                  }}
                >
                  <Send className="h-4 w-4 ml-1" />
                  فتح بوت تلقرام الآن
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="p-3 sm:p-4 max-w-3xl mx-auto space-y-4 sm:space-y-6 pb-8">
        {/* Progress card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="overflow-hidden bg-gradient-to-l from-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">نسبة الإنجاز</span>
                <motion.span key={completionRate} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="text-primary font-bold text-lg">
                  {completionRate}%
                </motion.span>
              </div>
              <Progress value={completionRate} className="h-3" />
              <p className="text-xs text-muted-foreground mt-2">{completedTasks.length} من {tasks.length} مهام مكتملة</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Pending tasks */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-[hsl(var(--warning))]" /> المهام المطلوبة ({pendingTasks.length})
          </h2>
          <div className="space-y-3">
            <AnimatePresence>
              {pendingTasks.map((task, i) => {
                return (
                  <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible"
                    exit={{ opacity: 0, x: -100, transition: { duration: 0.3 } }} layout>
                    <Card className={(() => {
                      const deadlineDate = new Date(task.deadline);
                      const endOfDay = new Date(deadlineDate);
                      endOfDay.setHours(23, 59, 59, 999);
                      const isExpired = new Date() > endOfDay;
                      return isExpired ? "border-destructive" : new Date(task.deadline) < new Date() ? "border-[hsl(var(--warning))]/50" : "border-primary/20";
                    })()}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold">{task.title}</h3>
                            {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                          </div>
                          <Badge className="bg-primary/10 text-primary">{task.points} نقطة</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">الموعد النهائي: {new Date(task.deadline).toLocaleString("ar-SA", SA_LOCALE_OPTS)}</p>
                        <CountdownTimer deadline={task.deadline} />
                        {task.rejection_reason && (
                          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2">
                            <p className="text-sm text-destructive">سبب الرفض السابق: {task.rejection_reason}</p>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
                            {task.requires_proof ? (
                              <Button size="sm" className="w-full" onClick={() => { setProofTaskId(task.id); }} disabled={submitting}>
                                <Upload className="h-4 w-4" /> تم التنفيذ (أرفق إثبات)
                              </Button>
                            ) : (
                              <Button size="sm" className="w-full" onClick={() => completeTaskWithoutProof(task.id)} disabled={submitting}>
                                <CheckCircle2 className="h-4 w-4" /> تم التنفيذ
                              </Button>
                            )}
                          </motion.div>
                          <motion.div className="flex-1" whileTap={{ scale: 0.97 }}>
                            <Button size="sm" variant="outline" className="w-full" onClick={() => setFailureTaskId(task.id)}>
                              <XCircle className="h-4 w-4" /> لم أتمكن
                            </Button>
                          </motion.div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {pendingTasks.length === 0 && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-muted-foreground py-6">
                🎉 لا توجد مهام معلقة!
              </motion.p>
            )}
          </div>
        </motion.div>

        {/* Pending review tasks */}
        <AnimatePresence>
          {pendingReviewTasks.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> بانتظار موافقة الأدمن ({pendingReviewTasks.length})
              </h2>
              <div className="space-y-2">
                {pendingReviewTasks.map((task, i) => (
                  <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="border-primary/30">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <h3 className="font-medium">{task.title}</h3>
                          <Badge className="bg-primary/10 text-primary">{task.points} نقطة</Badge>
                        </div>
                        {task.proof_url && (
                          <a href={task.proof_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
                            <ImageIcon className="h-4 w-4" /> عرض الإثبات
                          </a>
                        )}
                        <Badge variant="secondary">بانتظار الموافقة</Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Failed tasks */}
        <AnimatePresence>
          {failedTasks.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" /> بانتظار قرار الأدمن ({failedTasks.length})
              </h2>
              <div className="space-y-2">
                {failedTasks.map((task, i) => (
                  <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="border-[hsl(var(--warning))]/30">
                      <CardContent className="p-3">
                        <h3 className="font-medium">{task.title}</h3>
                        <p className="text-xs text-muted-foreground mt-1">السبب: {task.failure_reason}</p>
                        <Badge variant="secondary" className="mt-2">بانتظار المراجعة</Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Completed tasks */}
        <AnimatePresence>
          {completedTasks.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" /> المهام المكتملة ({completedTasks.length})
              </h2>
              <div className="space-y-2">
                {completedTasks.map((task, i) => (
                  <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="bg-[hsl(var(--success))]/5">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <h3 className="font-medium">{task.title}</h3>
                          <p className="text-xs text-muted-foreground">
                            {task.completed_at && new Date(task.completed_at).toLocaleString("ar-SA", SA_LOCALE_OPTS)}
                          </p>
                        </div>
                        <Badge className={task.points_awarded >= 0 ? "bg-[hsl(var(--success))] text-white" : "bg-destructive text-white"}>
                          {task.points_awarded > 0 ? "+" : ""}{task.points_awarded} نقطة
                        </Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leaderboard */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-[hsl(var(--gold))]" /> لوحة المتصدرين</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {leaderboard.map((m, i) => (
                  <motion.div key={m.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.08 }}
                    className={`flex items-center gap-3 p-2 rounded-lg ${m.id === user?.id ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/50'}`}>
                    <div className="w-8 text-center">{getRankIcon(getRank(i)) || <span className="text-xs font-bold text-muted-foreground">{getRank(i)}</span>}</div>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={m.avatar_url || undefined} />
                      <AvatarFallback className="text-sm bg-primary/10 text-primary">{m.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium flex-1">{m.name} {m.id === user?.id && "(أنت)"}</span>
                    <Badge variant="secondary">{m.total_points || 0} نقطة</Badge>
                  </motion.div>
                ))}
                {leaderboard.length === 0 && <p className="text-center text-muted-foreground">لا يوجد متسابقون بعد</p>}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Simple report */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> تقريرك الشخصي</CardTitle></CardHeader>
            <CardContent className="space-y-4">
               <div className="grid grid-cols-3 gap-2 sm:gap-3 text-center">
                <div><p className="text-2xl font-bold text-primary">{totalPointsEarned}</p><p className="text-xs text-muted-foreground">نقاط مكتسبة</p></div>
                <div><p className="text-2xl font-bold text-[hsl(var(--success))]">{weekCompleted}</p><p className="text-xs text-muted-foreground">مكتملة هذا الأسبوع</p></div>
                <div><p className="text-2xl font-bold text-[hsl(var(--warning))]">{completionRate}%</p><p className="text-xs text-muted-foreground">نسبة الإنجاز</p></div>
              </div>
              <div className="space-y-2 mt-3">
                {reportChartData.filter(d => d.عدد > 0).map((d, i) => {
                  const maxVal = Math.max(...reportChartData.map(x => x.عدد), 1);
                  const pct = Math.max((d.عدد / maxVal) * 100, 5);
                  const colors = ["hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--primary))", "hsl(var(--destructive))"];
                  return (
                    <div key={d.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{d.name}</span>
                        <span className="font-bold">{d.عدد}</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.1, duration: 0.5 }}
                          className="h-full rounded-full" style={{ backgroundColor: colors[i] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      {/* Proof upload dialog */}
      <Dialog open={!!proofTaskId} onOpenChange={() => setProofTaskId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>إرفاق إثبات تنفيذ المهمة</DialogTitle></DialogHeader>
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">يرجى إرفاق صورة أو فيديو كإثبات على تنفيذ المهمة. سيتم مراجعتها من قبل الأدمن قبل منح النقاط.</p>
            <input
              ref={proofInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProofUpload(file);
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleProofUpload(file);
              }}
            />
            <div className="flex gap-3">
              <Button onClick={() => proofInputRef.current?.click()} disabled={proofUploading} className="flex-1" size="lg">
                {proofUploading ? "جاري الرفع..." : (
                  <>
                    <Upload className="h-5 w-5" /> من المعرض
                  </>
                )}
              </Button>
              <Button onClick={() => cameraInputRef.current?.click()} disabled={proofUploading} className="flex-1" size="lg" variant="outline">
                {proofUploading ? "جاري الرفع..." : (
                  <>
                    <Camera className="h-5 w-5" /> من الكاميرا
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Failure reason dialog */}
      <Dialog open={!!failureTaskId && !proofTaskId} onOpenChange={() => { setFailureTaskId(null); setFailureReason(""); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>سبب عدم تنفيذ المهمة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea placeholder="اكتب سبب عدم تنفيذ المهمة..." value={failureReason} onChange={(e) => setFailureReason(e.target.value)} rows={4} />
            <Button onClick={submitFailureReason} disabled={!failureReason || submitting} className="w-full">
              {submitting ? "جاري الإرسال..." : "إرسال السبب"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={showEditProfile} onOpenChange={setShowEditProfile}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بياناتي</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2" dir="rtl">
            <div>
              <Label className="text-sm mb-1 block">الاسم</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm mb-1 block">البريد الإلكتروني</Label>
              {loadingEmail ? (
                <p className="text-sm text-muted-foreground p-2">جاري التحميل...</p>
              ) : (
                <Input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} dir="ltr" type="email" />
              )}
            </div>
            <div>
              <Label className="text-sm mb-1 block">كلمة المرور الجديدة (اتركها فارغة إذا لا تريد تغييرها)</Label>
              <Input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} dir="ltr" type="password" placeholder="كلمة مرور جديدة" />
            </div>
            <Button onClick={saveProfile} disabled={submitting} className="w-full">
              {submitting ? "جاري الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
