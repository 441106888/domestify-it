import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Bell, CheckCircle, Smartphone } from "lucide-react";
import { requestNotificationPermission } from "@/lib/notifications";
import { toast } from "sonner";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallPage = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notifPermission, setNotifPermission] = useState(Notification.permission);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      toast.success("تم تثبيت التطبيق بنجاح!");
    }
    setDeferredPrompt(null);
  };

  const handleNotifPermission = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(Notification.permission);
    if (granted) {
      toast.success("تم تفعيل الإشعارات!");
    } else {
      toast.error("تم رفض إذن الإشعارات");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src="/pwa-icon-192.png" alt="أيقونة التطبيق" className="w-20 h-20 mx-auto mb-4 rounded-2xl" />
          <CardTitle className="text-2xl">نظام المهام المنزلية</CardTitle>
          <p className="text-muted-foreground mt-2">ثبّت التطبيق على جوالك واستقبل الإشعارات</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Install */}
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
            <Smartphone className="w-8 h-8 text-primary shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold">تثبيت التطبيق</h3>
              <p className="text-sm text-muted-foreground">أضف التطبيق للشاشة الرئيسية</p>
            </div>
            {isInstalled ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : deferredPrompt ? (
              <Button size="sm" onClick={handleInstall}>
                <Download className="w-4 h-4 ml-1" /> تثبيت
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">افتح من المتصفح</span>
            )}
          </div>

          {/* Notifications */}
          <div className="flex items-center gap-3 p-4 rounded-lg border bg-card">
            <Bell className="w-8 h-8 text-primary shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold">الإشعارات</h3>
              <p className="text-sm text-muted-foreground">استقبل إشعارات المهام الجديدة</p>
            </div>
            {notifPermission === "granted" ? (
              <CheckCircle className="w-6 h-6 text-green-500" />
            ) : notifPermission === "denied" ? (
              <span className="text-xs text-destructive">مرفوض</span>
            ) : (
              <Button size="sm" variant="outline" onClick={handleNotifPermission}>
                تفعيل
              </Button>
            )}
          </div>

          {/* iOS instructions */}
          <div className="text-center text-xs text-muted-foreground mt-4 p-3 rounded-lg bg-muted/50">
            <p className="font-medium mb-1">📱 لمستخدمي آيفون:</p>
            <p>اضغط زر المشاركة ↗ ثم "إضافة إلى الشاشة الرئيسية"</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default InstallPage;
