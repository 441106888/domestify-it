import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  LogOut, Plus, Users, ClipboardList, Trophy, BarChart3, 
  Bell, Crown, Medal, Award, Clock, CheckCircle2, XCircle, AlertTriangle,
  Trash2, ArrowLeft, RefreshCw
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  avatar_url: string | null;
  total_points: number;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  points: number;
  deadline: string;
  assigned_to: string | null;
  status: string;
  completed_at: string | null;
  failure_reason: string | null;
  points_awarded: number;
  created_at: string;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.06, type: "spring" as const, stiffness: 300, damping: 24 }
  }),
};

const statCard = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number) => ({
    opacity: 1, scale: 1,
    transition: { delay: i * 0.08, type: "spring" as const, stiffness: 300, damping: 20 }
  }),
};

export default function AdminDashboard() {
  const { user, role, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "tasks" | "leaderboard" | "reports">("overview");
  const [members, setMembers] = useState<Member[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPin, setNewMemberPin] = useState("");
  const [newTask, setNewTask] = useState({ title: "", description: "", points: 10, deadline: "", assigned_to: "" });
  const [submitting, setSubmitting] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) {
      navigate("/");
    }
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (user && role === "admin") {
      loadData();
    }
  }, [user, role]);

  const loadData = async () => {
    const { data: profilesData } = await supabase.from("profiles").select("*");
    const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
    
    const memberIds = rolesData?.filter(r => r.role === "member").map(r => r.user_id) || [];
    const memberProfiles = profilesData?.filter(p => memberIds.includes(p.id)) || [];
    setMembers(memberProfiles as Member[]);

    const { data: tasksData } = await supabase.from("tasks").select("*").order("created_at", { ascending: false });
    setTasks((tasksData || []) as Task[]);
  };

  const addMember = async () => {
    if (!newMemberName || !newMemberPin || newMemberPin.length < 4) {
      toast({ title: "خطأ", description: "يرجى إدخال الاسم ورمز من 4 أرقام", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-members", {
        body: { action: "create", name: newMemberName, pin: newMemberPin },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل إضافة العضو");
      toast({ title: "تم إضافة العضو بنجاح" });
      setNewMemberName("");
      setNewMemberPin("");
      setShowAddMember(false);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteMember = async (memberId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العضو؟ سيتم حذف جميع بياناته.")) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-members", {
        body: { action: "delete", member_id: memberId },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل حذف العضو");
      toast({ title: "تم حذف العضو بنجاح" });
      setSelectedMember(null);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذه المهمة؟")) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
      toast({ title: "تم حذف المهمة بنجاح" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const addTask = async () => {
    if (!newTask.title || !newTask.deadline || !newTask.assigned_to) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("tasks").insert({
        title: newTask.title,
        description: newTask.description || null,
        points: newTask.points,
        deadline: newTask.deadline,
        assigned_to: newTask.assigned_to,
        created_by: user!.id,
      });
      if (error) throw error;

      await supabase.from("notifications").insert({
        user_id: newTask.assigned_to,
        title: "مهمة جديدة",
        message: `تم تكليفك بمهمة: ${newTask.title}`,
      });

      toast({ title: "تم إضافة المهمة بنجاح" });
      setNewTask({ title: "", description: "", points: 10, deadline: "", assigned_to: "" });
      setShowAddTask(false);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const deductPoints = async (task: Task) => {
    if (!confirm(`هل تريد خصم ${task.points} نقطة من العضو؟`)) return;
    setSubmitting(true);
    try {
      const penalty = -task.points;
      await supabase.from("tasks").update({
        status: "deducted" as any,
        points_awarded: penalty,
        updated_at: new Date().toISOString(),
      }).eq("id", task.id);

      await supabase.rpc("increment_points", { _user_id: task.assigned_to!, _amount: penalty });

      toast({ title: "تم خصم النقاط" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const reassignTask = async (taskId: string, newAssignee: string) => {
    setSubmitting(true);
    try {
      await supabase.from("tasks").update({
        assigned_to: newAssignee,
        status: "pending",
        failure_reason: null,
        points_awarded: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", taskId);

      await supabase.from("notifications").insert({
        user_id: newAssignee,
        title: "مهمة محولة إليك",
        message: `تم تحويل مهمة إليك`,
      });

      toast({ title: "تم تحويل المهمة بنجاح" });
      setReassignTaskId(null);
      setReassignTo("");
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const todayTasks = tasks.filter(t => {
    const today = new Date().toDateString();
    return new Date(t.created_at).toDateString() === today;
  });
  const completedTasks = tasks.filter(t => t.status === "completed");
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const failedTasks = tasks.filter(t => t.status === "failed");
  const overdueTasks = tasks.filter(t => t.status === "pending" && new Date(t.deadline) < new Date());
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;

  const sortedMembers = [...members].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));

  const getRankIcon = (index: number) => {
    if (index === 0) return <Crown className="h-6 w-6 text-[hsl(var(--gold))]" />;
    if (index === 1) return <Medal className="h-6 w-6 text-[hsl(var(--silver))]" />;
    if (index === 2) return <Award className="h-6 w-6 text-[hsl(var(--bronze))]" />;
    return <span className="text-sm text-muted-foreground font-bold">{index + 1}</span>;
  };

  const tabs = [
    { id: "overview" as const, label: "نظرة عامة", icon: BarChart3 },
    { id: "members" as const, label: "الأعضاء", icon: Users },
    { id: "tasks" as const, label: "المهام", icon: ClipboardList },
    { id: "leaderboard" as const, label: "الترتيب", icon: Trophy },
    { id: "reports" as const, label: "التقارير", icon: BarChart3 },
  ];

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 }}
        className="text-xl"
      >
        جاري التحميل...
      </motion.div>
    </div>
  );

  // Member detail view
  if (selectedMember) {
    const mTasks = tasks.filter(t => t.assigned_to === selectedMember.id);
    const mCompleted = mTasks.filter(t => t.status === "completed");
    const mFailed = mTasks.filter(t => t.status === "failed" || t.status === "deducted");
    const mPending = mTasks.filter(t => t.status === "pending");
    const mRate = mTasks.length > 0 ? Math.round((mCompleted.length / mTasks.length) * 100) : 0;

    return (
      <div className="min-h-screen bg-background">
        <motion.header
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
            <Button variant="ghost" onClick={() => setSelectedMember(null)}>
              <ArrowLeft className="h-5 w-5 ml-1" /> رجوع
            </Button>
            <Button variant="destructive" size="sm" onClick={() => deleteMember(selectedMember.id)} disabled={submitting}>
              <Trash2 className="h-4 w-4 ml-1" /> حذف العضو
            </Button>
          </div>
        </motion.header>

        <main className="p-4 max-w-3xl mx-auto space-y-6">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring" }}>
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <motion.div
                  className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-3xl mx-auto"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                >
                  {selectedMember.name.charAt(0)}
                </motion.div>
                <h2 className="text-2xl font-bold">{selectedMember.name}</h2>
                <div className="flex justify-center gap-4">
                  {[
                    { value: selectedMember.total_points || 0, label: "نقطة", color: "text-primary" },
                    { value: mCompleted.length, label: "مكتملة", color: "text-[hsl(var(--success))]" },
                    { value: mFailed.length, label: "لم تنفذ", color: "text-destructive" },
                    { value: mPending.length, label: "قيد التنفيذ", color: "text-[hsl(var(--warning))]" },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      className="text-center"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + i * 0.1 }}
                    >
                      <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </motion.div>
                  ))}
                </div>
                <Progress value={mRate} className="h-3" />
                <p className="text-sm text-muted-foreground">نسبة الإنجاز: {mRate}%</p>
              </CardContent>
            </Card>
          </motion.div>

          {mPending.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3">المهام الحالية</h3>
              <div className="space-y-2">
                {mPending.map((t, i) => (
                  <motion.div key={t.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className={new Date(t.deadline) < new Date() ? "border-destructive/50" : ""}>
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{new Date(t.deadline).toLocaleString("ar-SA")}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/10 text-primary">{t.points} نقطة</Badge>
                          <Button variant="ghost" size="icon" onClick={() => deleteTask(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {mCompleted.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3">المهام المكتملة</h3>
              <div className="space-y-2">
                {mCompleted.map((t, i) => (
                  <motion.div key={t.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="bg-[hsl(var(--success))]/5">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.completed_at && new Date(t.completed_at).toLocaleString("ar-SA")}</p>
                        </div>
                        <Badge className={t.points_awarded >= 0 ? "bg-[hsl(var(--success))] text-white" : "bg-destructive text-white"}>
                          {t.points_awarded > 0 ? "+" : ""}{t.points_awarded} نقطة
                        </Badge>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {mFailed.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3">المهام غير المنجزة</h3>
              <div className="space-y-2">
                {mFailed.map((t, i) => (
                  <motion.div key={t.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="border-destructive/30">
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{t.title}</p>
                          <Badge variant="destructive">{t.status === "deducted" ? `خُصم ${Math.abs(t.points_awarded)}` : "بانتظار القرار"}</Badge>
                        </div>
                        {t.failure_reason && <p className="text-sm text-destructive mt-1">{t.failure_reason}</p>}
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <motion.header
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm"
      >
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div>
            <h1 className="text-xl font-bold">لوحة التحكم</h1>
            <p className="text-sm text-muted-foreground">مرحباً، {profile?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Bell className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </motion.header>

      {/* Tabs */}
      <div className="border-b bg-card">
        <div className="flex gap-1 px-4 max-w-7xl mx-auto overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="p-4 max-w-7xl mx-auto space-y-6">
        <AnimatePresence mode="wait">
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { value: members.length, label: "الأعضاء", color: "text-primary" },
                  { value: tasks.length, label: "إجمالي المهام", color: "text-primary" },
                  { value: completedTasks.length, label: "مكتملة", color: "text-[hsl(var(--success))]" },
                  { value: overdueTasks.length, label: "متأخرة", color: "text-destructive" },
                ].map((stat, i) => (
                  <motion.div key={stat.label} custom={i} variants={statCard} initial="hidden" animate="visible">
                    <Card className="hover-scale">
                      <CardContent className="p-4 text-center">
                        <motion.p
                          className={`text-3xl font-bold ${stat.color}`}
                          key={stat.value}
                          initial={{ scale: 1.3 }}
                          animate={{ scale: 1 }}
                        >
                          {stat.value}
                        </motion.p>
                        <p className="text-sm text-muted-foreground">{stat.label}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {failedTasks.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <Card className="border-destructive/50">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> مهام بانتظار قرارك ({failedTasks.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {failedTasks.map((task, i) => {
                        const assignee = members.find(m => m.id === task.assigned_to);
                        return (
                          <motion.div
                            key={task.id}
                            custom={i}
                            variants={cardVariants}
                            initial="hidden"
                            animate="visible"
                            className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold">{task.title}</p>
                                <p className="text-sm text-muted-foreground">{assignee?.name} • {task.points} نقطة</p>
                                {task.failure_reason && <p className="text-sm text-destructive mt-1">السبب: {task.failure_reason}</p>}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="destructive" onClick={() => deductPoints(task)} disabled={submitting}>
                                <XCircle className="h-4 w-4" /> خصم النقاط
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setReassignTaskId(task.id); setReassignTo(""); }}>
                                <RefreshCw className="h-4 w-4" /> تحويل لآخر
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                <Card>
                  <CardHeader><CardTitle>نسبة الإنجاز الكلية</CardTitle></CardHeader>
                  <CardContent>
                    <Progress value={completionRate} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-2">{completionRate}% من المهام مكتملة</p>
                  </CardContent>
                </Card>
              </motion.div>

              {sortedMembers.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                  <Card>
                    <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-[hsl(var(--gold))]" /> لوحة المتصدرين</CardTitle></CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {sortedMembers.slice(0, 3).map((m, i) => (
                          <motion.div
                            key={m.id}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.6 + i * 0.1 }}
                            className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50"
                          >
                            {getRankIcon(i)}
                            <span className="font-medium flex-1">{m.name}</span>
                            <Badge variant="secondary">{m.total_points || 0} نقطة</Badge>
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          )}

          {activeTab === "members" && (
            <motion.div key="members" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">الأعضاء ({members.length})</h2>
                <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4" /> إضافة عضو</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>إضافة عضو جديد</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <Input placeholder="اسم العضو" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} />
                      <Input placeholder="رمز الدخول (4 أرقام)" value={newMemberPin} onChange={(e) => setNewMemberPin(e.target.value)} maxLength={4} dir="ltr" type="password" />
                      <Button onClick={addMember} disabled={submitting} className="w-full">
                        {submitting ? "جاري الإضافة..." : "إضافة"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {members.map((m, i) => {
                  const memberTasks = tasks.filter(t => t.assigned_to === m.id);
                  const memberCompleted = memberTasks.filter(t => t.status === "completed").length;
                  const memberRate = memberTasks.length > 0 ? Math.round((memberCompleted / memberTasks.length) * 100) : 0;
                  return (
                    <motion.div key={m.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                      <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group" onClick={() => setSelectedMember(m)}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <motion.div
                              className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg"
                              whileHover={{ scale: 1.1 }}
                            >
                              {m.name.charAt(0)}
                            </motion.div>
                            <div className="flex-1">
                              <h3 className="font-bold group-hover:text-primary transition-colors">{m.name}</h3>
                              <p className="text-sm text-muted-foreground">{m.total_points || 0} نقطة</p>
                            </div>
                            <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteMember(m.id); }}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1">
                              <span>نسبة الإنجاز</span>
                              <span>{memberRate}%</span>
                            </div>
                            <Progress value={memberRate} className="h-2" />
                          </div>
                          <div className="flex gap-2 text-xs">
                            <Badge variant="secondary">{memberTasks.length} مهام</Badge>
                            <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">{memberCompleted} مكتملة</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === "tasks" && (
            <motion.div key="tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">المهام ({tasks.length})</h2>
                <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4" /> مهمة جديدة</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>إضافة مهمة جديدة</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <Input placeholder="عنوان المهمة" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                      <Textarea placeholder="وصف المهمة (اختياري)" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
                      <Input type="number" placeholder="عدد النقاط" value={newTask.points} onChange={(e) => setNewTask({ ...newTask, points: parseInt(e.target.value) || 10 })} dir="ltr" />
                      <div>
                        <label className="text-sm text-muted-foreground mb-1 block">الموعد النهائي (الوقت المحدد للنقاط الكاملة)</label>
                        <Input type="datetime-local" value={newTask.deadline} onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} dir="ltr" />
                      </div>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={newTask.assigned_to}
                        onChange={(e) => setNewTask({ ...newTask, assigned_to: e.target.value })}
                      >
                        <option value="">اختر العضو</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <Button onClick={addTask} disabled={submitting} className="w-full">
                        {submitting ? "جاري الإضافة..." : "إضافة المهمة"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-3">
                {tasks.map((task, i) => {
                  const assignee = members.find(m => m.id === task.assigned_to);
                  const isOverdue = task.status === "pending" && new Date(task.deadline) < new Date();
                  return (
                    <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" layout>
                      <Card className={isOverdue ? "border-destructive/50" : task.status === "failed" ? "border-[hsl(var(--warning))]/50" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {task.status === "completed" ? (
                                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                                ) : task.status === "failed" ? (
                                  <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
                                ) : isOverdue ? (
                                  <AlertTriangle className="h-5 w-5 text-destructive" />
                                ) : (
                                  <Clock className="h-5 w-5 text-[hsl(var(--warning))]" />
                                )}
                                <h3 className="font-bold">{task.title}</h3>
                              </div>
                              {task.description && <p className="text-sm text-muted-foreground mb-2">{task.description}</p>}
                              <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline"><Clock className="h-3 w-3 ml-1" />{new Date(task.deadline).toLocaleString("ar-SA")}</Badge>
                                {assignee && <Badge variant="secondary">{assignee.name}</Badge>}
                                <Badge className="bg-primary/10 text-primary">{task.points} نقطة</Badge>
                                {task.points_awarded !== 0 && <Badge className={task.points_awarded > 0 ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "bg-destructive/10 text-destructive"}>{task.points_awarded > 0 ? "+" : ""}{task.points_awarded}</Badge>}
                              </div>
                              {task.failure_reason && (
                                <p className="text-sm text-destructive mt-2 flex items-center gap-1">
                                  <XCircle className="h-4 w-4" /> {task.failure_reason}
                                </p>
                              )}
                              {task.status === "failed" && (
                                <div className="flex gap-2 mt-3">
                                  <Button size="sm" variant="destructive" onClick={() => deductPoints(task)} disabled={submitting}>
                                    خصم النقاط
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => { setReassignTaskId(task.id); setReassignTo(""); }}>
                                    تحويل لآخر
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant={task.status === "completed" ? "default" : task.status === "failed" ? "secondary" : isOverdue ? "destructive" : "secondary"}>
                                {task.status === "completed" ? "مكتملة" : task.status === "failed" ? "بانتظار القرار" : task.status === "deducted" ? "خُصمت" : isOverdue ? "متأخرة" : "قيد التنفيذ"}
                              </Badge>
                              <Button variant="ghost" size="icon" onClick={() => deleteTask(task.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
                {tasks.length === 0 && <p className="text-center text-muted-foreground py-8">لا توجد مهام بعد</p>}
              </div>
            </motion.div>
          )}

          {activeTab === "leaderboard" && (
            <motion.div key="leaderboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><Trophy className="text-[hsl(var(--gold))]" /> لوحة المتصدرين</h2>
              {sortedMembers.map((m, i) => (
                <motion.div
                  key={m.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <Card className={i < 3 ? "border-2 " + (i === 0 ? "border-[hsl(var(--gold))]" : i === 1 ? "border-[hsl(var(--silver))]" : "border-[hsl(var(--bronze))]") : ""}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="text-center w-12">{getRankIcon(i)}</div>
                      <motion.div
                        className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg"
                        whileHover={{ scale: 1.1 }}
                      >
                        {m.name.charAt(0)}
                      </motion.div>
                      <div className="flex-1">
                        <h3 className="font-bold text-lg">{m.name}</h3>
                        <p className="text-sm text-muted-foreground">{tasks.filter(t => t.assigned_to === m.id && t.status === "completed").length} مهمة مكتملة</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{m.total_points || 0}</p>
                        <p className="text-xs text-muted-foreground">نقطة</p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {sortedMembers.length === 0 && <p className="text-center text-muted-foreground py-8">لا يوجد أعضاء بعد</p>}
            </motion.div>
          )}

          {activeTab === "reports" && (
            <motion.div key="reports" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <h2 className="text-xl font-bold">التقارير والإحصائيات</h2>
              
              <div className="grid gap-4 md:grid-cols-2">
                <motion.div custom={0} variants={statCard} initial="hidden" animate="visible">
                  <Card>
                    <CardHeader><CardTitle>إحصائيات اليوم</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between"><span>مهام اليوم</span><Badge>{todayTasks.length}</Badge></div>
                      <div className="flex justify-between"><span>المكتملة</span><Badge className="bg-[hsl(var(--success))] text-white">{todayTasks.filter(t => t.status === "completed").length}</Badge></div>
                      <div className="flex justify-between"><span>المتبقية</span><Badge variant="secondary">{todayTasks.filter(t => t.status === "pending").length}</Badge></div>
                    </CardContent>
                  </Card>
                </motion.div>

                <motion.div custom={1} variants={statCard} initial="hidden" animate="visible">
                  <Card>
                    <CardHeader><CardTitle>إحصائيات عامة</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex justify-between"><span>نسبة الإنجاز</span><Badge>{completionRate}%</Badge></div>
                      <div className="flex justify-between"><span>المهام المتأخرة</span><Badge variant="destructive">{overdueTasks.length}</Badge></div>
                      <div className="flex justify-between"><span>إجمالي النقاط الموزعة</span><Badge variant="secondary">{tasks.reduce((sum, t) => sum + (t.points_awarded || 0), 0)}</Badge></div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                  <CardHeader><CardTitle>مقارنة الأعضاء</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {members.map((m, i) => {
                      const mTasks = tasks.filter(t => t.assigned_to === m.id);
                      const mCompleted = mTasks.filter(t => t.status === "completed").length;
                      const mRate = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;
                      return (
                        <motion.div
                          key={m.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + i * 0.08 }}
                          className="space-y-1 cursor-pointer hover:bg-secondary/30 p-2 rounded-lg transition-colors"
                          onClick={() => setSelectedMember(m)}
                        >
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{m.name}</span>
                            <span>{mRate}% ({mCompleted}/{mTasks.length})</span>
                          </div>
                          <Progress value={mRate} className="h-2" />
                        </motion.div>
                      );
                    })}
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Card>
                  <CardHeader><CardTitle>المهام غير المنجزة وأسبابها</CardTitle></CardHeader>
                  <CardContent>
                    {tasks.filter(t => t.failure_reason).length > 0 ? (
                      <div className="space-y-3">
                        {tasks.filter(t => t.failure_reason).map((t) => {
                          const assignee = members.find(m => m.id === t.assigned_to);
                          return (
                            <div key={t.id} className="p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium">{t.title}</p>
                                  <p className="text-sm text-muted-foreground">{assignee?.name}</p>
                                </div>
                              </div>
                              <p className="text-sm text-destructive mt-1">{t.failure_reason}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">لا توجد أسباب عدم تنفيذ مسجلة</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Reassign dialog */}
      <Dialog open={!!reassignTaskId} onOpenChange={() => setReassignTaskId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>تحويل المهمة لعضو آخر</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
            >
              <option value="">اختر العضو</option>
              {members.filter(m => m.id !== tasks.find(t => t.id === reassignTaskId)?.assigned_to).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <Button onClick={() => reassignTaskId && reassignTo && reassignTask(reassignTaskId, reassignTo)} disabled={!reassignTo || submitting} className="w-full">
              {submitting ? "جاري التحويل..." : "تحويل المهمة"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
