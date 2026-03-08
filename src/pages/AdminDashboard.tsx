import { useState, useEffect, useRef } from "react";
import { sendNotification } from "@/lib/telegram";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  PieChart, Pie, Cell, ResponsiveContainer, Legend, LabelList
} from "recharts";
import {
  LogOut, Plus, Users, ClipboardList, Trophy, BarChart3,
  Bell, Crown, Medal, Award, Clock, CheckCircle2, XCircle, AlertTriangle,
  Trash2, ArrowLeft, RefreshCw, Upload, Camera, Star, Edit, UserPlus, Shield, Image as ImageIcon, ShieldCheck, Send
} from "lucide-react";

interface Member {
  id: string;
  name: string;
  avatar_url: string | null;
  total_points: number;
}

interface AdminUser {
  id: string;
  name: string;
  avatar_url: string | null;
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
  proof_url: string | null;
  requires_proof: boolean;
  rejection_reason: string | null;
}

const SA_LOCALE_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh"
};

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

const CHART_COLORS = [
  "hsl(142, 71%, 40%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(199, 89%, 38%)",
];

export default function AdminDashboard() {
  const { user, role, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "tasks" | "leaderboard" | "reports" | "admins">("overview");
  const [members, setMembers] = useState<Member[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberPassword, setNewMemberPassword] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newTask, setNewTask] = useState({ title: "", description: "", points: "", deadline: "", assigned_to: [] as string[], requires_proof: false });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState({ title: "", description: "", points: "", deadline: "", assigned_to: "", requires_proof: true });
  const [submitting, setSubmitting] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [reassignTaskId, setReassignTaskId] = useState<string | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [statDetail, setStatDetail] = useState<{ title: string; tasks: Task[] } | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [editMemberName, setEditMemberName] = useState("");
  const [editMemberEmail, setEditMemberEmail] = useState("");
  const [editMemberPassword, setEditMemberPassword] = useState("");
  const [loadingMemberEmail, setLoadingMemberEmail] = useState(false);
  const [rejectingTask, setRejectingTask] = useState<Task | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionReasons, setRejectionReasons] = useState<string[]>([]);
  // Delete task state
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  const [deleteStep, setDeleteStep] = useState<"confirm" | "points">("confirm");
  // Admin is also member
  const [adminIsMember, setAdminIsMember] = useState(false);
  const [reportFilter, setReportFilter] = useState<"today" | "week" | "month">("today");
  const [adminNotifications, setAdminNotifications] = useState<{ id: string; title: string; message: string; is_read: boolean; created_at: string }[]>([]);

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate("/");
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (user && role === "admin") loadData();
  }, [user, role]);

  // Admin is always also a member
  useEffect(() => {
    setAdminIsMember(true);
  }, [user]);

  const loadData = async () => {
    const { data: profilesData } = await supabase.from("profiles").select("*");
    const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
    const memberIds = rolesData?.filter(r => r.role === "member").map(r => r.user_id) || [];
    const adminIds = rolesData?.filter(r => r.role === "admin").map(r => r.user_id) || [];
    const memberProfiles = profilesData?.filter(p => memberIds.includes(p.id)) || [];
    const adminProfiles = profilesData?.filter(p => adminIds.includes(p.id)) || [];
    setMembers(memberProfiles as Member[]);
    setAdmins(adminProfiles as AdminUser[]);
    const { data: tasksData } = await supabase.from("tasks").select("*").order("deadline", { ascending: true });
    setTasks((tasksData || []).map((t: any) => ({ ...t, requires_proof: t.requires_proof ?? true })) as Task[]);
    
    const reasons = (tasksData || []).map((t: any) => t.rejection_reason).filter(Boolean);
    setRejectionReasons([...new Set(reasons)] as string[]);

    // Fetch admin's own notifications
    if (user) {
      const { data: notifData } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setAdminNotifications(notifData || []);
    }
  };

  const addMember = async () => {
    if (!newMemberName || !newMemberEmail || !newMemberPassword || newMemberPassword.length < 6) {
      toast({ title: "خطأ", description: "يرجى إدخال الاسم والبريد وكلمة مرور (6 أحرف على الأقل)", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-members", {
        body: { action: "create", name: newMemberName, email: newMemberEmail, password: newMemberPassword },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل إضافة العضو");
      // Send welcome notification with Telegram setup instructions
      if (data?.member_id) {
        await sendNotification(data.member_id, "مرحباً بك! 👋",
          `أهلاً ${newMemberName}! فعّل إشعارات تلقرام لتصلك التنبيهات مباشرة على جوالك.\n\n1. افتح بوت تلقرام من قسم الإشعارات\n2. اضغط Start\n3. ستصلك رسالة تأكيد ✅`);
      }
      toast({ title: "تم إضافة العضو بنجاح ✅" });
      setNewMemberName(""); setNewMemberEmail(""); setNewMemberPassword("");
      setShowAddMember(false);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const addAdmin = async () => {
    if (!newAdminName || !newAdminEmail || !newAdminPassword || newAdminPassword.length < 6) {
      toast({ title: "خطأ", description: "يرجى إدخال الاسم والبريد وكلمة مرور (6 أحرف على الأقل)", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-members", {
        body: { action: "create", name: newAdminName, email: newAdminEmail, password: newAdminPassword, role: "admin" },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل إنشاء حساب الأدمن");
      toast({ title: "تم إنشاء حساب الأدمن بنجاح ✅" });
      setNewAdminName(""); setNewAdminEmail(""); setNewAdminPassword("");
      setShowAddAdmin(false);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const deleteAdmin = async (adminId: string) => {
    if (adminId === user?.id) {
      toast({ title: "خطأ", description: "لا يمكنك حذف حسابك الخاص", variant: "destructive" });
      return;
    }
    if (admins.length <= 1) {
      toast({ title: "خطأ", description: "يجب أن يبقى أدمن واحد على الأقل", variant: "destructive" });
      return;
    }
    if (!confirm("هل أنت متأكد من حذف هذا الأدمن؟")) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-members", {
        body: { action: "delete", member_id: adminId },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل حذف الأدمن");
      toast({ title: "تم حذف الأدمن بنجاح" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const deleteMember = async (memberId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا العضو؟")) return;
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
    } finally { setSubmitting(false); }
  };

  const openEditMember = async (member: Member) => {
    setEditingMember(member);
    setEditMemberName(member.name);
    setEditMemberPassword("");
    setLoadingMemberEmail(true);
    try {
      const { data } = await supabase.functions.invoke("manage-members", {
        body: { action: "get_email", member_id: member.id },
      });
      setEditMemberEmail(data?.email || "");
    } catch { setEditMemberEmail(""); }
    finally { setLoadingMemberEmail(false); }
  };

  const updateMember = async () => {
    if (!editingMember) return;
    setSubmitting(true);
    try {
      const body: any = { action: "update", member_id: editingMember.id };
      if (editMemberName && editMemberName !== editingMember.name) body.name = editMemberName;
      if (editMemberEmail) body.email = editMemberEmail;
      if (editMemberPassword && editMemberPassword.length >= 6) body.password = editMemberPassword;
      
      const { data, error } = await supabase.functions.invoke("manage-members", { body });
      if (error || data?.error) throw new Error(data?.error || "فشل التعديل");
      toast({ title: "تم تعديل بيانات العضو بنجاح ✅" });
      setEditingMember(null);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  // Step 1: Ask for confirmation. Step 2: If points awarded, ask about deduction.
  const initiateDeleteTask = (task: Task) => {
    setDeletingTask(task);
    setDeleteStep("confirm");
  };

  const confirmDeleteTask = async (deductPoints?: boolean) => {
    if (!deletingTask) return;
    setSubmitting(true);
    try {
      if (deductPoints && deletingTask.points_awarded > 0 && deletingTask.assigned_to) {
        await supabase.rpc("increment_points", { _user_id: deletingTask.assigned_to, _amount: -deletingTask.points_awarded });
      }
      // Delete related notifications for this task's assigned member
      if (deletingTask.assigned_to) {
        await supabase.from("notifications").delete()
          .eq("user_id", deletingTask.assigned_to)
          .like("message", `%${deletingTask.title}%`);
      }
      const { error } = await supabase.from("tasks").delete().eq("id", deletingTask.id);
      if (error) throw error;
      toast({ title: deductPoints ? "تم حذف المهمة وخصم النقاط" : "تم حذف المهمة بدون خصم النقاط" });
      setDeletingTask(null);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const getTodayMin = () => {
    const now = new Date();
    // Convert to Saudi time
    const saTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const y = saTime.getFullYear();
    const m = String(saTime.getMonth() + 1).padStart(2, "0");
    const d = String(saTime.getDate()).padStart(2, "0");
    const h = String(saTime.getHours()).padStart(2, "0");
    const min = String(saTime.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${d}T${h}:${min}`;
  };

  const addTask = async () => {
    if (!newTask.title || !newTask.deadline || newTask.assigned_to.length === 0) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول المطلوبة واختيار عضو واحد على الأقل", variant: "destructive" });
      return;
    }
    const points = parseInt(newTask.points as string) || 0;
    if (points <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال عدد النقاط", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Create a task for each selected member
      for (const memberId of newTask.assigned_to) {
        const { error } = await supabase.from("tasks").insert({
          title: newTask.title, description: newTask.description || null,
          points, deadline: newTask.deadline + ":00+03:00",
          assigned_to: memberId, created_by: user!.id,
          requires_proof: newTask.requires_proof,
        } as any);
        if (error) throw error;
        
        const memberName = members.find(m => m.id === memberId)?.name || "";
        await sendNotification(memberId, "مهمة جديدة 📋",
          `تم تكليفك بمهمة: ${newTask.title} - الموعد: ${new Date(newTask.deadline).toLocaleString("ar-SA", SA_LOCALE_OPTS)}`);
      }
      toast({ title: `تم إضافة المهمة لـ ${newTask.assigned_to.length} عضو بنجاح ✅` });
      setNewTask({ title: "", description: "", points: "", deadline: "", assigned_to: [], requires_proof: false });
      setShowAddTask(false);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const updateTask = async () => {
    if (!editingTask) return;
    const points = parseInt(editTask.points as string) || 0;
    if (points <= 0) {
      toast({ title: "خطأ", description: "يرجى إدخال عدد النقاط", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const oldAssignee = editingTask.assigned_to;
      const newAssignee = editTask.assigned_to;

      const { error } = await supabase.from("tasks").update({
        title: editTask.title, description: editTask.description || null,
        points, deadline: editTask.deadline + ":00+03:00",
        assigned_to: newAssignee, updated_at: new Date().toISOString(),
        requires_proof: editTask.requires_proof,
      } as any).eq("id", editingTask.id);
      if (error) throw error;

      // If reassigned, notify new member
      if (oldAssignee !== newAssignee && newAssignee) {
        await sendNotification(newAssignee, "مهمة محولة إليك 🔄",
          `تم تحويل مهمة "${editTask.title}" إليك`);
      }

      toast({ title: "تم تعديل المهمة بنجاح ✅" });
      setEditingTask(null);
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const startEditTask = (task: Task) => {
    setEditingTask(task);
    setEditTask({
      title: task.title,
      description: task.description || "",
      points: String(task.points),
      deadline: new Date(task.deadline).toLocaleString("sv-SE", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", "T"),
      assigned_to: task.assigned_to || "",
      requires_proof: task.requires_proof,
    });
  };

  const approveTask = async (task: Task) => {
    setSubmitting(true);
    try {
      const now = new Date();
      const deadline = new Date(task.deadline);
      const endOfDeadlineDay = new Date(deadline);
      endOfDeadlineDay.setHours(23, 59, 59, 999);

      const completedAt = task.completed_at ? new Date(task.completed_at) : now;
      let pointsAwarded = 0;
      if (completedAt <= deadline) {
        pointsAwarded = task.points;
      } else if (completedAt <= endOfDeadlineDay) {
        pointsAwarded = task.points / 2;
      } else {
        pointsAwarded = 0;
      }

      const { error } = await supabase.from("tasks").update({
        status: "completed" as any,
        points_awarded: pointsAwarded,
        updated_at: now.toISOString(),
      }).eq("id", task.id);
      if (error) throw error;

      if (pointsAwarded > 0) {
        await supabase.rpc("increment_points", { _user_id: task.assigned_to!, _amount: pointsAwarded });
      }

      await sendNotification(task.assigned_to!, "تمت الموافقة على مهمتك ✅",
        pointsAwarded > 0
          ? `تم قبول مهمة "${task.title}" وحصلت على ${pointsAwarded} نقطة!`
          : `تم قبول مهمة "${task.title}" لكن لم تحصل على نقاط لأن التنفيذ كان بعد الموعد النهائي.`);

      toast({ title: pointsAwarded > 0 ? `تمت الموافقة ومنح ${pointsAwarded} نقطة ✅` : "تمت الموافقة بدون نقاط (تأخر التنفيذ)" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const openRejectDialog = (task: Task) => {
    setRejectingTask(task);
    setRejectionReason("");
  };

  const rejectTask = async () => {
    if (!rejectingTask || !rejectionReason) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("tasks").update({
        status: "pending" as any,
        proof_url: null,
        completed_at: null,
        rejection_reason: rejectionReason,
        updated_at: new Date().toISOString(),
      } as any).eq("id", rejectingTask.id);
      if (error) throw error;

      await sendNotification(rejectingTask.assigned_to!, "تم رفض الإثبات ❌",
        `تم رفض إثبات مهمة "${rejectingTask.title}". السبب: ${rejectionReason}`);

      toast({ title: "تم رفض الإثبات وإعادة المهمة للعضو" });
      setRejectingTask(null);
      setRejectionReason("");
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const deductPoints = async (task: Task) => {
    if (!confirm(`هل تريد خصم ${task.points} نقطة من العضو؟`)) return;
    setSubmitting(true);
    try {
      const penalty = -task.points;
      await supabase.from("tasks").update({
        status: "deducted" as any, points_awarded: penalty, updated_at: new Date().toISOString(),
      }).eq("id", task.id);
      await supabase.rpc("increment_points", { _user_id: task.assigned_to!, _amount: penalty });
      await sendNotification(task.assigned_to!, "تم خصم نقاط ⚠️",
        `تم خصم ${task.points} نقطة بسبب عدم إتمام مهمة: ${task.title}`);
      toast({ title: "تم خصم النقاط" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const reassignTask = async (taskId: string, newAssignee: string) => {
    setSubmitting(true);
    try {
      await supabase.from("tasks").update({
        assigned_to: newAssignee, status: "pending", failure_reason: null,
        points_awarded: 0, updated_at: new Date().toISOString(),
      }).eq("id", taskId);
      await sendNotification(newAssignee, "مهمة محولة إليك 🔄",
        `تم تحويل مهمة إليك`);
      toast({ title: "تم تحويل المهمة بنجاح" });
      setReassignTaskId(null); setReassignTo("");
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const uploadAvatar = async (memberId: string, file: File) => {
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${memberId}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', memberId);
      toast({ title: "تم تحديث الصورة ✅" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  };

  // Toggle member multi-select
  const toggleMemberSelection = (memberId: string) => {
    setNewTask(prev => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(memberId)
        ? prev.assigned_to.filter(id => id !== memberId)
        : [...prev.assigned_to, memberId]
    }));
  };

  // Derived data
  const completedTasks = tasks.filter(t => t.status === "completed");
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const pendingReviewTasks = tasks.filter(t => t.status === "pending_review");
  const failedTasks = tasks.filter(t => t.status === "failed");
  const deductedTasks = tasks.filter(t => t.status === "deducted");
  const incompleteTasks = [...failedTasks, ...deductedTasks];
  const overdueTasks = tasks.filter(t => t.status === "pending" && new Date(t.deadline) < new Date());
  const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
  const sortedMembers = [...members].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));

  const uniqueTaskTitles = [...new Set(tasks.map(t => t.title))];

  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekTasks = tasks.filter(t => new Date(t.created_at) >= weekAgo);
  const weekCompleted = weekTasks.filter(t => t.status === "completed");
  const weekFailed = weekTasks.filter(t => t.status === "failed" || t.status === "deducted");

  const todayTasks = tasks.filter(t => new Date(t.created_at).toDateString() === new Date().toDateString());

  const memberChartData = members.map(m => ({
    name: m.name,
    نقاط: m.total_points || 0,
    مكتملة: tasks.filter(t => t.assigned_to === m.id && t.status === "completed").length,
  }));

  const statusPieData = [
    { name: "مكتملة", value: completedTasks.length },
    { name: "قيد التنفيذ", value: pendingTasks.length },
    { name: "بانتظار الموافقة", value: pendingReviewTasks.length },
    { name: "غير مكتملة", value: incompleteTasks.length },
  ].filter(d => d.value > 0);

  const getRankIcon = (index: number) => {
    if (index === 0) return (
      <div className="flex items-center gap-0.5">
        <Crown className="h-6 w-6 text-[hsl(var(--gold))]" />
        <span className="font-bold text-sm text-[hsl(var(--gold))]">1</span>
      </div>
    );
    if (index === 1) return (
      <div className="flex items-center gap-0.5">
        <Award className="h-5 w-5 text-[hsl(var(--silver))]" />
        <span className="font-bold text-sm text-[hsl(var(--silver))]">2</span>
      </div>
    );
    if (index === 2) return (
      <div className="flex items-center gap-0.5">
        <Award className="h-5 w-5 text-[hsl(var(--bronze))]" />
        <span className="font-bold text-sm text-[hsl(var(--bronze))]">3</span>
      </div>
    );
    return <span className="text-sm text-muted-foreground font-bold">{index + 1}</span>;
  };

  const tabs = [
    { id: "overview" as const, label: "نظرة عامة", icon: BarChart3 },
    { id: "members" as const, label: "الأعضاء", icon: Users },
    { id: "tasks" as const, label: "المهام", icon: ClipboardList },
    { id: "leaderboard" as const, label: "الترتيب", icon: Trophy },
    { id: "reports" as const, label: "التقارير", icon: BarChart3 },
    { id: "admins" as const, label: "الأدمنز", icon: ShieldCheck },
  ];

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ repeat: Infinity, repeatType: "reverse", duration: 1 }} className="text-xl">
        جاري التحميل...
      </motion.div>
    </div>
  );

  // === Member detail view ===
  if (selectedMember) {
    const mTasks = tasks.filter(t => t.assigned_to === selectedMember.id);
    const mCompleted = mTasks.filter(t => t.status === "completed");
    const mFailed = mTasks.filter(t => t.status === "failed" || t.status === "deducted");
    const mPending = mTasks.filter(t => t.status === "pending");
    const mPendingReview = mTasks.filter(t => t.status === "pending_review");
    const mRate = mTasks.length > 0 ? Math.round((mCompleted.length / mTasks.length) * 100) : 0;

    return (
      <div className="min-h-screen bg-background overflow-y-auto">
        <motion.header initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
            <Button variant="ghost" onClick={() => setSelectedMember(null)}><ArrowLeft className="h-5 w-5 ml-1" /> رجوع</Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openEditMember(selectedMember)}>
                <Edit className="h-4 w-4 ml-1" /> تعديل
              </Button>
              <Button variant="destructive" size="sm" onClick={() => deleteMember(selectedMember.id)} disabled={submitting}>
                <Trash2 className="h-4 w-4 ml-1" /> حذف العضو
              </Button>
            </div>
          </div>
        </motion.header>

        <main className="p-4 max-w-3xl mx-auto space-y-6">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring" as const }}>
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="relative inline-block">
                  <Avatar className="h-20 w-20 mx-auto">
                    <AvatarImage src={selectedMember.avatar_url || undefined} />
                    <AvatarFallback className="text-3xl font-bold bg-primary/10 text-primary">
                      {selectedMember.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <button
                    className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg hover:scale-110 transition-transform"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAvatar(selectedMember.id, file);
                    }}
                  />
                </div>
                <h2 className="text-2xl font-bold">{selectedMember.name}</h2>
                <div className="flex justify-center gap-4">
                  {[
                    { value: selectedMember.total_points || 0, label: "نقطة", color: "text-primary" },
                    { value: mCompleted.length, label: "مكتملة", color: "text-[hsl(var(--success))]" },
                    { value: mFailed.length, label: "غير مكتملة", color: "text-destructive" },
                    { value: mPending.length, label: "قيد التنفيذ", color: "text-[hsl(var(--warning))]" },
                  ].map((stat, i) => (
                    <motion.div key={stat.label} className="text-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.1 }}>
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

          {mPendingReview.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" /> بانتظار موافقتك ({mPendingReview.length})
              </h3>
              <div className="space-y-2">
                {mPendingReview.map((t, i) => (
                  <motion.div key={t.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="border-primary/30">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{t.title}</p>
                          <Badge className="bg-primary/10 text-primary">{t.points} نقطة</Badge>
                        </div>
                        {t.proof_url && (
                          <a href={t.proof_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary hover:underline">
                            <ImageIcon className="h-4 w-4" /> عرض الإثبات
                          </a>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveTask(t)} disabled={submitting}>
                            <CheckCircle2 className="h-4 w-4" /> قبول ومنح النقاط
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openRejectDialog(t)} disabled={submitting}>
                            <XCircle className="h-4 w-4" /> رفض
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

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
                          <p className="text-xs text-muted-foreground">{new Date(t.deadline).toLocaleString("ar-SA", SA_LOCALE_OPTS)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/10 text-primary">{t.points} نقطة</Badge>
                          <Button variant="ghost" size="icon" onClick={() => startEditTask(t)}><Edit className="h-4 w-4 text-primary" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => initiateDeleteTask(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" /> المهام المكتملة
              </h3>
              <div className="space-y-2">
                {mCompleted.map((t, i) => (
                  <motion.div key={t.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className="bg-[hsl(var(--success))]/5">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.completed_at && new Date(t.completed_at).toLocaleString("ar-SA", SA_LOCALE_OPTS)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={t.points_awarded >= 0 ? "bg-[hsl(var(--success))] text-white" : "bg-destructive text-white"}>
                            {t.points_awarded > 0 ? "+" : ""}{t.points_awarded} نقطة
                          </Badge>
                          <Button variant="ghost" size="icon" onClick={() => initiateDeleteTask(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {mFailed.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" /> غير مكتملة
              </h3>
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

        {/* Delete task dialog - in member detail */}
        <Dialog open={!!deletingTask} onOpenChange={() => setDeletingTask(null)}>
           <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{deleteStep === "confirm" ? "تأكيد حذف المهمة" : "خصم النقاط؟"}</DialogTitle></DialogHeader>
            {deleteStep === "confirm" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">هل أنت متأكد أنك تريد حذف مهمة "{deletingTask?.title}"؟</p>
                <div className="flex gap-2">
                  <Button variant="destructive" className="flex-1" onClick={() => {
                    if (deletingTask && deletingTask.points_awarded > 0 && deletingTask.assigned_to) {
                      setDeleteStep("points");
                    } else {
                      confirmDeleteTask(false);
                    }
                  }}>نعم، احذف</Button>
                  <Button variant="outline" className="flex-1" onClick={() => setDeletingTask(null)}>إلغاء</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">هل تريد خصم {deletingTask?.points_awarded} نقطة من العضو؟</p>
                <div className="flex gap-2">
                  <Button variant="destructive" className="flex-1" onClick={() => confirmDeleteTask(true)} disabled={submitting}>
                    نعم، اخصم النقاط واحذف
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => confirmDeleteTask(false)} disabled={submitting}>
                    احذف بدون خصم
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Rejection dialog - in member detail */}
        <Dialog open={!!rejectingTask} onOpenChange={() => setRejectingTask(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>سبب رفض الإثبات</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {rejectionReasons.length > 0 && (
                <div>
                  <Label className="text-sm mb-1 block">اختر من أسباب سابقة أو اكتب سبباً جديداً</Label>
                  <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-2"
                    value="" onChange={(e) => { if (e.target.value) setRejectionReason(e.target.value); }}>
                    <option value="">اختر سبب سابق...</option>
                    {rejectionReasons.map((r, i) => <option key={i} value={r}>{r}</option>)}
                  </select>
                </div>
              )}
              <Textarea placeholder="اكتب سبب الرفض..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} />
              <Button onClick={rejectTask} disabled={!rejectionReason || submitting} className="w-full">
                {submitting ? "جاري الرفض..." : "رفض الإثبات"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit member dialog - in member detail */}
        <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>تعديل بيانات العضو</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm mb-1 block">الاسم</Label>
                <Input value={editMemberName} onChange={(e) => setEditMemberName(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm mb-1 block">البريد الإلكتروني</Label>
                {loadingMemberEmail ? (
                  <p className="text-sm text-muted-foreground p-2">جاري التحميل...</p>
                ) : (
                  <Input value={editMemberEmail} onChange={(e) => setEditMemberEmail(e.target.value)} dir="ltr" type="email" />
                )}
              </div>
              <div>
                <Label className="text-sm mb-1 block">كلمة المرور الجديدة (اتركها فارغة إذا لا تريد تغييرها)</Label>
                <Input value={editMemberPassword} onChange={(e) => setEditMemberPassword(e.target.value)} dir="ltr" type="password" placeholder="كلمة مرور جديدة" />
              </div>
              <Button onClick={updateMember} disabled={submitting} className="w-full">
                {submitting ? "جاري التعديل..." : "حفظ التعديلات"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // === Main Dashboard ===
  return (
    <div className="min-h-screen bg-background overflow-y-auto">
      <motion.header initial={{ y: -60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: "spring" as const, stiffness: 200, damping: 20 }} className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-bold">{profile?.name?.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-lg font-bold">لوحة التحكم</h1>
              <p className="text-sm text-muted-foreground">مرحباً، {profile?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {adminIsMember && (
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")} className="text-xs sm:text-sm px-2 sm:px-3">
                <Users className="h-4 w-4 ml-1" /> لوحة العضو
              </Button>
            )}
            <Sheet onOpenChange={async (open) => {
              if (open) {
                const unread = adminNotifications.filter(n => !n.is_read);
                if (unread.length > 0) {
                  await Promise.all(unread.map(n => supabase.from("notifications").update({ is_read: true }).eq("id", n.id)));
                  setAdminNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
                }
              }
            }}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                  <Bell className="h-5 w-5" />
                  <AnimatePresence>
                    {(failedTasks.length + pendingReviewTasks.length + adminNotifications.filter(n => !n.is_read).length) > 0 && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center">
                        {failedTasks.length + pendingReviewTasks.length + adminNotifications.filter(n => !n.is_read).length}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader><SheetTitle>الإشعارات والتنبيهات</SheetTitle></SheetHeader>
                <div className="space-y-3 mt-4 pb-6">
                  {pendingReviewTasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-primary">⏰ إثباتات بانتظار الموافقة</p>
                      {pendingReviewTasks.map(t => {
                        const assignee = members.find(m => m.id === t.assigned_to);
                        return (
                          <Card key={t.id} className="border-primary/30">
                            <CardContent className="p-3">
                              <p className="font-medium text-sm">{t.title}</p>
                              <p className="text-xs text-muted-foreground">{assignee?.name} أرسل إثبات بانتظار موافقتك</p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                  {failedTasks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-destructive">⚠️ مهام لم تُنفذ</p>
                      {failedTasks.map(t => {
                        const assignee = members.find(m => m.id === t.assigned_to);
                        return (
                          <Card key={t.id} className="border-destructive/30">
                            <CardContent className="p-3">
                              <p className="font-medium text-sm">{t.title}</p>
                              <p className="text-xs text-destructive">{assignee?.name} لم ينفذ المهمة</p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                  <div className="border-t pt-3">
                    <p className="text-sm font-bold text-muted-foreground mb-2">الإشعارات السابقة</p>
                    {adminNotifications.length > 0 ? adminNotifications.map(n => (
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
                                setAdminNotifications(prev => prev.filter(x => x.id !== n.id));
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
                        <p className="text-xs text-muted-foreground">2. اضغط <span className="font-semibold">Start</span> داخل البوت</p>
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
                  {pendingReviewTasks.length === 0 && failedTasks.length === 0 && adminNotifications.length === 0 && <p className="text-center text-muted-foreground">لا توجد تنبيهات</p>}
                </div>
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon" onClick={signOut}><LogOut className="h-5 w-5" /></Button>
          </div>
        </div>
      </motion.header>

      {/* Tabs */}
      <div className="border-b bg-card">
        <div className="flex gap-1 px-4 max-w-7xl mx-auto overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {tab.id === "tasks" && pendingReviewTasks.length > 0 && (
                <span className="bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">{pendingReviewTasks.length}</span>
              )}
              {activeTab === tab.id && (
                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" transition={{ type: "spring" as const, stiffness: 300, damping: 30 }} />
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="p-4 max-w-7xl mx-auto space-y-6">
        <AnimatePresence mode="wait">

          {/* === OVERVIEW === */}
          {activeTab === "overview" && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                  { value: members.length, label: "الأعضاء", color: "text-primary", clickAction: () => { setActiveTab("members"); } },
                  { value: tasks.length, label: "إجمالي المهام", color: "text-primary", tasks: tasks },
                  { value: completedTasks.length, label: "مكتملة", color: "text-[hsl(var(--success))]", tasks: completedTasks },
                  { value: pendingReviewTasks.length, label: "بانتظار الموافقة", color: "text-primary", tasks: pendingReviewTasks },
                  { value: incompleteTasks.length, label: "غير مكتملة", color: "text-destructive", tasks: incompleteTasks },
                  { value: pendingTasks.length, label: "متبقية", color: "text-[hsl(var(--warning))]", tasks: pendingTasks },
                ].map((stat, i) => (
                  <motion.div key={stat.label} custom={i} variants={statCard} initial="hidden" animate="visible">
                    <Card
                      className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] hover:border-primary/50"
                      onClick={() => {
                        if ('clickAction' in stat && stat.clickAction) {
                          (stat as any).clickAction();
                        } else if ('tasks' in stat && (stat as any).tasks?.length > 0) {
                          setStatDetail({ title: stat.label, tasks: (stat as any).tasks });
                        }
                      }}
                    >
                      <CardContent className="p-4 text-center">
                        <motion.p className={`text-3xl font-bold ${stat.color}`} key={stat.value} initial={{ scale: 1.3 }} animate={{ scale: 1 }}>
                          {stat.value}
                        </motion.p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>

              {pendingReviewTasks.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <Card className="border-primary/50">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-primary"><ImageIcon className="h-5 w-5" /> مهام بانتظار موافقتك ({pendingReviewTasks.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {pendingReviewTasks.map((task, i) => {
                        const assignee = members.find(m => m.id === task.assigned_to);
                        return (
                          <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold">{task.title}</p>
                                <p className="text-sm text-muted-foreground">{assignee?.name} • {task.points} نقطة</p>
                              </div>
                              {task.proof_url && (
                                <a href={task.proof_url} target="_blank" rel="noopener noreferrer">
                                  <Button variant="outline" size="sm"><ImageIcon className="h-4 w-4" /> الإثبات</Button>
                                </a>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" onClick={() => approveTask(task)} disabled={submitting}>
                                <CheckCircle2 className="h-4 w-4" /> قبول ومنح النقاط
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => openRejectDialog(task)} disabled={submitting}>
                                <XCircle className="h-4 w-4" /> رفض الإثبات
                              </Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {failedTasks.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                  <Card className="border-destructive/50">
                    <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> مهام بانتظار قرارك ({failedTasks.length})</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {failedTasks.map((task, i) => {
                        const assignee = members.find(m => m.id === task.assigned_to);
                        return (
                          <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
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
                          <motion.div key={m.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.1 }}
                            className="flex items-center gap-3 p-2 rounded-lg bg-secondary/50">
                            <div className="w-8 text-center">{getRankIcon(i)}</div>
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={m.avatar_url || undefined} />
                              <AvatarFallback className="text-sm bg-primary/10 text-primary">{m.name.charAt(0)}</AvatarFallback>
                            </Avatar>
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

          {/* === MEMBERS === */}
          {activeTab === "members" && (
            <motion.div key="members" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">الأعضاء ({members.length})</h2>
                <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
                  <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> إضافة عضو</Button></DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>إضافة عضو جديد</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <Input placeholder="اسم العضو" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} />
                      <Input placeholder="البريد الإلكتروني" type="email" value={newMemberEmail} onChange={(e) => setNewMemberEmail(e.target.value)} dir="ltr" />
                      <Input placeholder="كلمة المرور (6 أحرف على الأقل)" type="password" value={newMemberPassword} onChange={(e) => setNewMemberPassword(e.target.value)} dir="ltr" />
                      <Button onClick={addMember} disabled={submitting} className="w-full">
                        {submitting ? "جاري الإضافة..." : "إضافة العضو"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {members.map((m, i) => {
                  const memberTasks = tasks.filter(t => t.assigned_to === m.id);
                  const memberCompleted = memberTasks.filter(t => t.status === "completed").length;
                  const memberIncomplete = memberTasks.filter(t => t.status === "failed" || t.status === "deducted").length;
                  const memberPending = memberTasks.filter(t => t.status === "pending").length;
                  const memberPendingReview = memberTasks.filter(t => t.status === "pending_review").length;
                  const memberRate = memberTasks.length > 0 ? Math.round((memberCompleted / memberTasks.length) * 100) : 0;
                  return (
                    <motion.div key={m.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                      <Card className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-lg group" onClick={() => setSelectedMember(m)}>
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12">
                              <AvatarImage src={m.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">{m.name.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <h3 className="font-bold group-hover:text-primary transition-colors">{m.name}</h3>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Star className="h-3 w-3 text-[hsl(var(--gold))]" /> {m.total_points || 0} نقطة
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditMember(m); }}>
                                <Edit className="h-4 w-4 text-primary" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteMember(m.id); }}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <div>
                            <div className="flex justify-between text-sm mb-1"><span>نسبة الإنجاز</span><span>{memberRate}%</span></div>
                            <Progress value={memberRate} className="h-2" />
                          </div>
                          <div className="flex gap-2 text-xs flex-wrap">
                            <Badge variant="secondary">{memberTasks.length} مهام</Badge>
                            <Badge className="bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">{memberCompleted} مكتملة</Badge>
                            {memberPendingReview > 0 && <Badge className="bg-primary/10 text-primary">{memberPendingReview} بانتظار الموافقة</Badge>}
                            {memberIncomplete > 0 && <Badge variant="destructive">{memberIncomplete} غير مكتملة</Badge>}
                            {memberPending > 0 && <Badge className="bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]">{memberPending} قيد التنفيذ</Badge>}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* === TASKS === */}
          {activeTab === "tasks" && (
            <motion.div key="tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">المهام ({tasks.length})</h2>
                <Dialog open={showAddTask} onOpenChange={setShowAddTask}>
                  <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> مهمة جديدة</Button></DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>إضافة مهمة جديدة</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm mb-1 block">عنوان المهمة</Label>
                        {uniqueTaskTitles.length > 0 && (
                          <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-2"
                            value="" onChange={(e) => { if (e.target.value) setNewTask({ ...newTask, title: e.target.value }); }}>
                            <option value="">اختر من عناوين سابقة...</option>
                            {uniqueTaskTitles.map((t, i) => <option key={i} value={t}>{t}</option>)}
                          </select>
                        )}
                        <Input
                          placeholder="أو اكتب عنوان جديد"
                          value={newTask.title}
                          onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        />
                      </div>
                      <Textarea placeholder="وصف المهمة (اختياري)" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
                      <Input type="number" placeholder="عدد النقاط" value={newTask.points} onChange={(e) => setNewTask({ ...newTask, points: e.target.value })} min={1} />
                      <div>
                        <Label className="text-sm mb-1 block">الموعد النهائي</Label>
                        <Input type="datetime-local" value={newTask.deadline} onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} dir="ltr" min={getTodayMin()} />
                      </div>
                      <div>
                        <Label className="text-sm mb-1 block">اختر الأعضاء (يمكنك اختيار أكثر من واحد)</Label>
                        <div className="border rounded-md p-2 space-y-1 max-h-48 overflow-y-auto">
                          {members.map((m) => (
                            <label key={m.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-secondary/50 transition-colors ${newTask.assigned_to.includes(m.id) ? 'bg-primary/10 border border-primary/30' : ''}`}>
                              <input
                                type="checkbox"
                                checked={newTask.assigned_to.includes(m.id)}
                                onChange={() => toggleMemberSelection(m.id)}
                                className="rounded"
                              />
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={m.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">{m.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{m.name}</span>
                            </label>
                          ))}
                        </div>
                        {newTask.assigned_to.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">تم اختيار {newTask.assigned_to.length} عضو</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between border rounded-md p-3">
                        <Label className="text-sm">يتطلب إرفاق إثبات</Label>
                        <Switch checked={newTask.requires_proof} onCheckedChange={(checked) => setNewTask({ ...newTask, requires_proof: checked })} />
                      </div>
                      <Button onClick={addTask} disabled={submitting} className="w-full">{submitting ? "جاري الإضافة..." : "إضافة المهمة"}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="space-y-3">
                {tasks.map((task, i) => {
                  const assignee = members.find(m => m.id === task.assigned_to);
                  const isOverdue = task.status === "pending" && new Date(task.deadline) < new Date();
                  const isPendingReview = task.status === "pending_review";
                  return (
                    <motion.div key={task.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" layout>
                      <Card className={isPendingReview ? "border-primary/50" : isOverdue ? "border-destructive/50" : task.status === "failed" ? "border-[hsl(var(--warning))]/50" : ""}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {task.status === "completed" ? <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                                  : isPendingReview ? <ImageIcon className="h-5 w-5 text-primary" />
                                  : task.status === "failed" ? <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
                                  : task.status === "deducted" ? <XCircle className="h-5 w-5 text-destructive" />
                                  : isOverdue ? <AlertTriangle className="h-5 w-5 text-destructive" />
                                  : <Clock className="h-5 w-5 text-[hsl(var(--warning))]" />}
                                <h3 className="font-bold">{task.title}</h3>
                              </div>
                              {task.description && <p className="text-sm text-muted-foreground mb-2">{task.description}</p>}
                              <div className="flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline"><Clock className="h-3 w-3 ml-1" />{new Date(task.deadline).toLocaleString("ar-SA", SA_LOCALE_OPTS)}</Badge>
                                {assignee && <Badge variant="secondary" className="font-bold text-sm">{assignee.name}</Badge>}
                                <Badge className="bg-primary/10 text-primary">{task.points} نقطة</Badge>
                                {!task.requires_proof && <Badge variant="outline">بدون إثبات</Badge>}
                                {task.points_awarded !== 0 && <Badge className={task.points_awarded > 0 ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "bg-destructive/10 text-destructive"}>{task.points_awarded > 0 ? "+" : ""}{task.points_awarded}</Badge>}
                              </div>
                              {task.failure_reason && <p className="text-sm text-destructive mt-2 flex items-center gap-1"><XCircle className="h-4 w-4" /> {task.failure_reason}</p>}
                              {task.rejection_reason && <p className="text-sm text-destructive mt-1 flex items-center gap-1">سبب الرفض: {task.rejection_reason}</p>}
                              
                              {isPendingReview && (
                                <div className="flex gap-2 mt-3 items-center">
                                  {task.proof_url && (
                                    <a href={task.proof_url} target="_blank" rel="noopener noreferrer">
                                      <Button variant="outline" size="sm"><ImageIcon className="h-4 w-4" /> الإثبات</Button>
                                    </a>
                                  )}
                                  <Button size="sm" onClick={() => approveTask(task)} disabled={submitting}>
                                    <CheckCircle2 className="h-4 w-4" /> قبول
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => openRejectDialog(task)} disabled={submitting}>
                                    <XCircle className="h-4 w-4" /> رفض
                                  </Button>
                                </div>
                              )}

                              {task.status === "failed" && (
                                <div className="flex gap-2 mt-3">
                                  <Button size="sm" variant="destructive" onClick={() => deductPoints(task)} disabled={submitting}>خصم النقاط</Button>
                                  <Button size="sm" variant="outline" onClick={() => { setReassignTaskId(task.id); setReassignTo(""); }}>تحويل لآخر</Button>
                                </div>
                              )}

                              {/* Allow reassigning any pending task */}
                              {task.status === "pending" && (
                                <div className="flex gap-2 mt-3">
                                  <Button size="sm" variant="outline" onClick={() => { setReassignTaskId(task.id); setReassignTo(""); }}>
                                    <RefreshCw className="h-4 w-4" /> تحويل لعضو آخر
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant={task.status === "completed" ? "default" : isPendingReview ? "default" : task.status === "failed" ? "secondary" : task.status === "deducted" ? "destructive" : isOverdue ? "destructive" : "secondary"}>
                                {task.status === "completed" ? "مكتملة" : isPendingReview ? "بانتظار الموافقة" : task.status === "failed" ? "بانتظار القرار" : task.status === "deducted" ? "خُصمت" : isOverdue ? "متأخرة" : "قيد التنفيذ"}
                              </Badge>
                              {task.status === "pending" && (
                                <Button variant="ghost" size="icon" onClick={() => startEditTask(task)}><Edit className="h-4 w-4 text-primary" /></Button>
                              )}
                              <Button variant="ghost" size="icon" onClick={() => initiateDeleteTask(task)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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

          {/* === LEADERBOARD === */}
          {activeTab === "leaderboard" && (
            <motion.div key="leaderboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-4">
              <h2 className="text-xl font-bold flex items-center gap-2"><Trophy className="text-[hsl(var(--gold))]" /> لوحة المتصدرين</h2>
              {sortedMembers.map((m, i) => (
                <motion.div key={m.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                  <Card className={i < 3 ? "border-2 " + (i === 0 ? "border-[hsl(var(--gold))]" : i === 1 ? "border-[hsl(var(--silver))]" : "border-[hsl(var(--bronze))]") : ""}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="text-center w-12">{getRankIcon(i)}</div>
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={m.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">{m.name.charAt(0)}</AvatarFallback>
                      </Avatar>
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

          {/* === REPORTS === */}
          {activeTab === "reports" && (
            <motion.div key="reports" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="text-xl font-bold">التقارير والإحصائيات</h2>
                <div className="flex gap-1 bg-secondary rounded-lg p-1">
                  {([
                    { id: "today" as const, label: "اليوم" },
                    { id: "week" as const, label: "الأسبوع" },
                    { id: "month" as const, label: "الشهر" },
                  ]).map(f => (
                    <Button key={f.id} variant={reportFilter === f.id ? "default" : "ghost"} size="sm"
                      className={`text-xs px-3 ${reportFilter === f.id ? "" : "hover:bg-secondary"}`}
                      onClick={() => setReportFilter(f.id)}>
                      {f.label}
                    </Button>
                  ))}
                </div>
              </div>

              {(() => {
                const now = new Date();
                const filterStart = new Date();
                if (reportFilter === "today") filterStart.setHours(0, 0, 0, 0);
                else if (reportFilter === "week") filterStart.setDate(now.getDate() - 7);
                else filterStart.setMonth(now.getMonth() - 1);

                const filtered = tasks.filter(t => new Date(t.created_at) >= filterStart);
                const fCompleted = filtered.filter(t => t.status === "completed");
                const fPending = filtered.filter(t => t.status === "pending");
                const fReview = filtered.filter(t => t.status === "pending_review");
                const fFailed = filtered.filter(t => t.status === "failed" || t.status === "deducted");
                const fRate = filtered.length > 0 ? Math.round((fCompleted.length / filtered.length) * 100) : 0;
                const filterLabel = reportFilter === "today" ? "اليوم" : reportFilter === "week" ? "الأسبوع" : "الشهر";

                return (
                  <>
                    {/* نقاط الأعضاء */}
                    <Card>
                      <CardHeader><CardTitle className="text-base">نقاط الأعضاء</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {[...members].sort((a, b) => (b.total_points || 0) - (a.total_points || 0)).map((m, i) => {
                          const maxPoints = Math.max(...members.map(x => x.total_points || 1), 1);
                          const pct = Math.max(((m.total_points || 0) / maxPoints) * 100, 2);
                          return (
                            <div key={m.id} className="space-y-1">
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-medium flex items-center gap-2">
                                  <span className="text-muted-foreground w-5 text-center">{i + 1}</span>
                                  {m.name}
                                </span>
                                <span className="font-bold text-primary">{m.total_points || 0}</span>
                              </div>
                              <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                  transition={{ delay: i * 0.1, duration: 0.5 }} className="h-full bg-primary rounded-full" />
                              </div>
                            </div>
                          );
                        })}
                        {members.length === 0 && <p className="text-center text-muted-foreground py-4">لا يوجد أعضاء</p>}
                      </CardContent>
                    </Card>

                    {/* حالات المهام للفترة المحددة */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "مكتملة", value: fCompleted.length, icon: CheckCircle2, color: "hsl(var(--success))", tasks: fCompleted },
                        { label: "قيد التنفيذ", value: fPending.length, icon: Clock, color: "hsl(var(--warning))", tasks: fPending },
                        { label: "بانتظار الموافقة", value: fReview.length, icon: ImageIcon, color: "hsl(var(--primary))", tasks: fReview },
                        { label: "غير مكتملة", value: fFailed.length, icon: XCircle, color: "hsl(var(--destructive))", tasks: fFailed },
                      ].map((item, i) => (
                        <motion.div key={item.label} custom={i} variants={statCard} initial="hidden" animate="visible">
                          <Card className="text-center cursor-pointer hover:bg-secondary/20 transition-colors"
                            onClick={() => item.tasks.length > 0 && setStatDetail({ title: `${item.label} - ${filterLabel}`, tasks: item.tasks })}>
                            <CardContent className="p-4">
                              <item.icon className="h-6 w-6 mx-auto mb-2" style={{ color: item.color }} />
                              <p className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</p>
                              <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    {/* ملخص الفترة */}
                    <Card>
                      <CardHeader><CardTitle className="text-base">ملخص {filterLabel}</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-2xl font-bold text-primary">{filtered.length}</p>
                            <p className="text-xs text-muted-foreground">إجمالي المهام</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-[hsl(var(--success))]">{fCompleted.length}</p>
                            <p className="text-xs text-muted-foreground">مكتملة</p>
                          </div>
                          <div>
                            <p className="text-2xl font-bold text-[hsl(var(--warning))]">{fRate}%</p>
                            <p className="text-xs text-muted-foreground">نسبة الإنجاز</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                );
              })()}

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                  <CardHeader><CardTitle>مقارنة الأعضاء</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {[...members].sort((a, b) => {
                      const aT = tasks.filter(t => t.assigned_to === a.id);
                      const bT = tasks.filter(t => t.assigned_to === b.id);
                      const aR = aT.length > 0 ? aT.filter(t => t.status === "completed").length / aT.length : 0;
                      const bR = bT.length > 0 ? bT.filter(t => t.status === "completed").length / bT.length : 0;
                      return bR - aR;
                    }).map((m, i) => {
                      const mTasks = tasks.filter(t => t.assigned_to === m.id);
                      const mCompleted = mTasks.filter(t => t.status === "completed").length;
                      const mRate = mTasks.length > 0 ? Math.round((mCompleted / mTasks.length) * 100) : 0;
                      return (
                        <motion.div key={m.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }}
                          className="space-y-1 cursor-pointer hover:bg-secondary/30 p-2 rounded-lg transition-colors" onClick={() => setSelectedMember(m)}>
                          <div className="flex justify-between text-sm">
                            <span className="font-medium flex items-center gap-2">
                              <Avatar className="h-6 w-6"><AvatarImage src={m.avatar_url || undefined} /><AvatarFallback className="text-xs">{m.name.charAt(0)}</AvatarFallback></Avatar>
                              {m.name}
                            </span>
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
                                <div><p className="font-medium">{t.title}</p><p className="text-sm text-muted-foreground">{assignee?.name}</p></div>
                                <Badge variant={t.status === "deducted" ? "destructive" : "secondary"}>
                                  {t.status === "deducted" ? "خُصمت" : "بانتظار القرار"}
                                </Badge>
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

          {/* === ADMINS === */}
          {activeTab === "admins" && (
            <motion.div key="admins" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> إدارة الأدمنز ({admins.length})</h2>
                <Dialog open={showAddAdmin} onOpenChange={setShowAddAdmin}>
                  <DialogTrigger asChild>
                    <Button><Shield className="h-4 w-4" /> أدمن جديد</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>إنشاء حساب أدمن جديد</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <Input placeholder="اسم الأدمن" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
                      <Input placeholder="البريد الإلكتروني" type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} dir="ltr" />
                      <Input placeholder="كلمة المرور (6 أحرف على الأقل)" type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} dir="ltr" />
                      <Button onClick={addAdmin} disabled={submitting} className="w-full">
                        {submitting ? "جاري الإنشاء..." : "إنشاء حساب الأدمن"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {admins.map((admin, i) => (
                  <motion.div key={admin.id} custom={i} variants={cardVariants} initial="hidden" animate="visible">
                    <Card className={admin.id === user?.id ? "border-primary/50" : ""}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={admin.avatar_url || undefined} />
                            <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">{admin.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h3 className="font-bold">{admin.name}</h3>
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Shield className="h-3 w-3" /> أدمن
                              {admin.id === user?.id && <Badge variant="secondary" className="text-xs mr-1">أنت</Badge>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEditMember({ ...admin, total_points: 0 } as Member)}>
                              <Edit className="h-4 w-4 text-primary" />
                            </Button>
                            {admin.id !== user?.id && admins.length > 1 && (
                              <Button variant="ghost" size="icon" onClick={() => deleteAdmin(admin.id)} disabled={submitting}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Reassign dialog */}
      <Dialog open={!!reassignTaskId} onOpenChange={() => setReassignTaskId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تحويل المهمة لعضو آخر</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
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

      {/* Edit task dialog */}
      <Dialog open={!!editingTask} onOpenChange={() => setEditingTask(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل المهمة</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1 block">عنوان المهمة</Label>
              {uniqueTaskTitles.length > 0 && (
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-2"
                  value="" onChange={(e) => { if (e.target.value) setEditTask({ ...editTask, title: e.target.value }); }}>
                  <option value="">اختر من عناوين سابقة...</option>
                  {uniqueTaskTitles.map((t, i) => <option key={i} value={t}>{t}</option>)}
                </select>
              )}
              <Input placeholder="أو اكتب عنوان جديد" value={editTask.title} onChange={(e) => setEditTask({ ...editTask, title: e.target.value })} />
            </div>
            <Textarea placeholder="وصف المهمة (اختياري)" value={editTask.description} onChange={(e) => setEditTask({ ...editTask, description: e.target.value })} />
            <Input type="number" placeholder="عدد النقاط" value={editTask.points} onChange={(e) => setEditTask({ ...editTask, points: e.target.value })} min={1} />
            <div>
              <Label className="text-sm mb-1 block">الموعد النهائي</Label>
              <Input type="datetime-local" value={editTask.deadline} onChange={(e) => setEditTask({ ...editTask, deadline: e.target.value })} dir="ltr" min={getTodayMin()} />
            </div>
            <div>
              <Label className="text-sm mb-1 block">العضو المسند إليه</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={editTask.assigned_to} onChange={(e) => setEditTask({ ...editTask, assigned_to: e.target.value })}>
                <option value="">اختر العضو</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <Label className="text-sm">يتطلب إرفاق إثبات</Label>
              <Switch checked={editTask.requires_proof} onCheckedChange={(checked) => setEditTask({ ...editTask, requires_proof: checked })} />
            </div>
            <Button onClick={updateTask} disabled={submitting} className="w-full">
              {submitting ? "جاري التعديل..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit member dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل بيانات العضو</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm mb-1 block">الاسم</Label>
              <Input value={editMemberName} onChange={(e) => setEditMemberName(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm mb-1 block">البريد الإلكتروني</Label>
              {loadingMemberEmail ? (
                <p className="text-sm text-muted-foreground p-2">جاري التحميل...</p>
              ) : (
                <Input value={editMemberEmail} onChange={(e) => setEditMemberEmail(e.target.value)} dir="ltr" type="email" />
              )}
            </div>
            <div>
              <Label className="text-sm mb-1 block">كلمة المرور الجديدة (اتركها فارغة إذا لا تريد تغييرها)</Label>
              <Input value={editMemberPassword} onChange={(e) => setEditMemberPassword(e.target.value)} dir="ltr" type="password" placeholder="كلمة مرور جديدة" />
            </div>
            <Button onClick={updateMember} disabled={submitting} className="w-full">
              {submitting ? "جاري التعديل..." : "حفظ التعديلات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rejection reason dialog */}
      <Dialog open={!!rejectingTask} onOpenChange={() => setRejectingTask(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>سبب رفض الإثبات</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {rejectionReasons.length > 0 && (
              <div>
                <Label className="text-sm mb-1 block">اختر من أسباب سابقة أو اكتب سبباً جديداً</Label>
                <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-2"
                  value="" onChange={(e) => { if (e.target.value) setRejectionReason(e.target.value); }}>
                  <option value="">اختر سبب سابق...</option>
                  {rejectionReasons.map((r, i) => <option key={i} value={r}>{r}</option>)}
                </select>
              </div>
            )}
            <Textarea placeholder="اكتب سبب الرفض..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} />
            <Button onClick={rejectTask} disabled={!rejectionReason || submitting} className="w-full">
              {submitting ? "جاري الرفض..." : "رفض الإثبات"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete task dialog */}
      <Dialog open={!!deletingTask} onOpenChange={() => setDeletingTask(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{deleteStep === "confirm" ? "تأكيد حذف المهمة" : "خصم النقاط؟"}</DialogTitle></DialogHeader>
          {deleteStep === "confirm" ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">هل أنت متأكد أنك تريد حذف مهمة "{deletingTask?.title}"؟</p>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={() => {
                  if (deletingTask && deletingTask.points_awarded > 0 && deletingTask.assigned_to) {
                    setDeleteStep("points");
                  } else {
                    confirmDeleteTask(false);
                  }
                }}>نعم، احذف</Button>
                <Button variant="outline" className="flex-1" onClick={() => setDeletingTask(null)}>إلغاء</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">هل تريد خصم {deletingTask?.points_awarded} نقطة من العضو؟</p>
              <div className="flex gap-2">
                <Button variant="destructive" className="flex-1" onClick={() => confirmDeleteTask(true)} disabled={submitting}>
                  نعم، اخصم النقاط واحذف
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => confirmDeleteTask(false)} disabled={submitting}>
                  احذف بدون خصم
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stat detail dialog */}
      <Dialog open={!!statDetail} onOpenChange={() => setStatDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{statDetail?.title}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {statDetail?.tasks.map((t) => {
              const assignee = members.find(m => m.id === t.assigned_to);
              return (
                <Card key={t.id}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{assignee?.name} • {new Date(t.deadline).toLocaleString("ar-SA", SA_LOCALE_OPTS)}</p>
                      </div>
                      <Badge>{t.status === "completed" ? "مكتملة" : t.status === "pending_review" ? "بانتظار الموافقة" : t.status === "failed" ? "غير مكتملة" : t.status === "deducted" ? "خُصمت" : "قيد التنفيذ"}</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Proof preview dialog */}
      <Dialog open={!!proofPreview} onOpenChange={() => setProofPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>عرض الإثبات</DialogTitle></DialogHeader>
          {proofPreview && <img src={proofPreview} alt="إثبات" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
