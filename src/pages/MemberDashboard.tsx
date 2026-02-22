import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LogOut, CheckCircle2, Clock, XCircle, AlertTriangle,
  Trophy, Crown, Medal, Award, Bell, Star
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
}

interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
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
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; total_points: number }[]>([]);

  useEffect(() => {
    if (!loading && (!user || role !== "member")) {
      navigate("/");
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (user && role === "member") {
      loadData();
      const channel = supabase
        .channel("member-tasks")
        .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `assigned_to=eq.${user.id}` }, () => loadData())
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, () => loadData())
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user, role]);

  const loadData = async () => {
    if (!user) return;
    const { data: tasksData } = await supabase.from("tasks").select("*").eq("assigned_to", user.id).order("created_at", { ascending: false });
    setTasks((tasksData || []) as Task[]);

    const { data: notifData } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    setNotifications((notifData || []) as Notification[]);

    const { data: profiles } = await supabase.from("profiles").select("id, name, total_points");
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "member");
    const memberIds = roles?.map(r => r.user_id) || [];
    const memberProfiles = (profiles || []).filter(p => memberIds.includes(p.id)).sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
    setLeaderboard(memberProfiles);
  };

  const completeTask = async (taskId: string) => {
    setSubmitting(true);
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const now = new Date();
      const deadline = new Date(task.deadline);
      
      // Calculate the final cutoff: midnight of the deadline day
      // If deadline is multi-day (more than same day from creation), use midnight after deadline day
      const taskCreated = new Date(task.created_at);
      const isSameDay = taskCreated.toDateString() === deadline.toDateString();
      
      // Final cutoff is midnight (00:00) of the day after deadline
      const finalCutoff = new Date(deadline);
      finalCutoff.setDate(finalCutoff.getDate() + 1);
      finalCutoff.setHours(0, 0, 0, 0);

      let pointsAwarded = 0;
      if (now <= deadline) {
        // Completed within the specified time → full points
        pointsAwarded = task.points;
      } else if (now < finalCutoff) {
        // After deadline but before midnight → half points
        pointsAwarded = Math.floor(task.points / 2);
      } else {
        // After midnight → half points deducted (still completing late)
        pointsAwarded = Math.floor(task.points / 2);
      }

      const { error } = await supabase.from("tasks").update({
        status: "completed",
        completed_at: now.toISOString(),
        points_awarded: pointsAwarded,
        updated_at: now.toISOString(),
      }).eq("id", taskId);

      if (error) throw error;

      await supabase.from("profiles").update({
        total_points: (profile?.total_points || 0) + pointsAwarded,
        updated_at: now.toISOString(),
      }).eq("id", user!.id);

      toast({
        title: "أحسنت! 🎉",
        description: `حصلت على ${pointsAwarded} نقطة${pointsAwarded < task.points ? " (تأخر في التنفيذ - نصف النقاط)" : ""}`,
      });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const submitFailureReason = async () => {
    if (!failureTaskId || !failureReason) return;
    setSubmitting(true);
    try {
      // Don't deduct points - send to admin for review
      await supabase.from("tasks").update({
        status: "failed" as any,
        failure_reason: failureReason,
        points_awarded: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", failureTaskId);

      toast({ title: "تم إرسال السبب للأدمن", description: "سيقوم الأدمن بمراجعة طلبك واتخاذ القرار" });
      setFailureTaskId(null);
      setFailureReason("");
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingTasks = tasks.filter(t => t.status === "pending");
  const completedTasks = tasks.filter(t => t.status === "completed");
  const failedTasks = tasks.filter(t => t.status === "failed");
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const unreadNotifs = notifications.filter(n => !n.is_read).length;
  const myRank = leaderboard.findIndex(m => m.id === user?.id) + 1;

  const getTimeRemaining = (deadline: string) => {
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return "انتهى الوقت";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 24) return `${Math.floor(hours / 24)} يوم و ${hours % 24} ساعة`;
    return `${hours} ساعة و ${mins} دقيقة`;
  };

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="h-5 w-5 text-[hsl(var(--gold))]" />;
    if (index === 1) return <Medal className="h-5 w-5 text-[hsl(var(--silver))]" />;
    if (index === 2) return <Award className="h-5 w-5 text-[hsl(var(--bronze))]" />;
    return null;
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><div className="animate-pulse text-xl">جاري التحميل...</div></div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-3xl mx-auto">
          <div>
            <h1 className="text-xl font-bold">مرحباً، {profile?.name} 👋</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Star className="h-4 w-4 text-[hsl(var(--gold))]" /> {profile?.total_points || 0} نقطة</span>
              {myRank > 0 && <span>المركز #{myRank}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadNotifs > 0 && <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">{unreadNotifs}</span>}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium">نسبة الإنجاز</span>
              <span className="text-primary font-bold">{completionRate}%</span>
            </div>
            <Progress value={completionRate} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">{completedTasks.length} من {tasks.length} مهام مكتملة</p>
          </CardContent>
        </Card>

        {/* Pending tasks */}
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Clock className="h-5 w-5 text-[hsl(var(--warning))]" /> المهام المطلوبة ({pendingTasks.length})</h2>
          <div className="space-y-3">
            {pendingTasks.map((task) => {
              const isOverdue = new Date(task.deadline) < new Date();
              return (
                <Card key={task.id} className={isOverdue ? "border-destructive/50" : "border-primary/20"}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold">{task.title}</h3>
                        {task.description && <p className="text-sm text-muted-foreground">{task.description}</p>}
                      </div>
                      <Badge className="bg-primary/10 text-primary">{task.points} نقطة</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {isOverdue ? (
                        <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> انتهى الوقت (نصف النقاط)</Badge>
                      ) : (
                        <Badge variant="secondary" className="flex items-center gap-1"><Clock className="h-3 w-3" /> {getTimeRemaining(task.deadline)}</Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => completeTask(task.id)} disabled={submitting}>
                        <CheckCircle2 className="h-4 w-4" /> تم التنفيذ
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setFailureTaskId(task.id)}>
                        <XCircle className="h-4 w-4" /> لم أتمكن
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {pendingTasks.length === 0 && <p className="text-center text-muted-foreground py-6">🎉 لا توجد مهام معلقة!</p>}
          </div>
        </div>

        {/* Failed tasks awaiting admin */}
        {failedTasks.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" /> بانتظار قرار الأدمن ({failedTasks.length})</h2>
            <div className="space-y-2">
              {failedTasks.map((task) => (
                <Card key={task.id} className="border-[hsl(var(--warning))]/30">
                  <CardContent className="p-3">
                    <h3 className="font-medium">{task.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">السبب: {task.failure_reason}</p>
                    <Badge variant="secondary" className="mt-2">بانتظار المراجعة</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Completed tasks */}
        {completedTasks.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" /> المهام المكتملة ({completedTasks.length})</h2>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <Card key={task.id} className="bg-[hsl(var(--success))]/5">
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">{task.title}</h3>
                      <p className="text-xs text-muted-foreground">{task.completed_at && new Date(task.completed_at).toLocaleString("ar-SA")}</p>
                    </div>
                    <Badge className={task.points_awarded >= 0 ? "bg-[hsl(var(--success))] text-white" : "bg-destructive text-white"}>
                      {task.points_awarded > 0 ? "+" : ""}{task.points_awarded} نقطة
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Mini leaderboard */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-5 w-5 text-[hsl(var(--gold))]" /> الترتيب</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {leaderboard.slice(0, 5).map((m, i) => (
              <div key={m.id} className={`flex items-center gap-3 p-2 rounded-lg ${m.id === user?.id ? "bg-primary/10" : "bg-secondary/30"}`}>
                <span className="w-6 text-center">{getRankIcon(i) || <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>}</span>
                <span className={`flex-1 ${m.id === user?.id ? "font-bold" : ""}`}>{m.name} {m.id === user?.id ? "(أنت)" : ""}</span>
                <Badge variant="secondary">{m.total_points || 0}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>

      {/* Failure reason dialog */}
      <Dialog open={!!failureTaskId} onOpenChange={() => setFailureTaskId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>سبب عدم التنفيذ</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">سيتم إرسال السبب للأدمن لمراجعته واتخاذ القرار المناسب.</p>
            <Textarea placeholder="اكتب سبب عدم تمكنك من تنفيذ المهمة..." value={failureReason} onChange={(e) => setFailureReason(e.target.value)} />
            <Button onClick={submitFailureReason} disabled={!failureReason || submitting} className="w-full">
              {submitting ? "جاري الإرسال..." : "إرسال للأدمن"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
