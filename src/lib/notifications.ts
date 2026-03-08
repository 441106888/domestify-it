export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

export function sendBrowserNotification(title: string, body: string, icon?: string) {
  if (Notification.permission !== "granted") return;

  const notification = new Notification(title, {
    body,
    icon: icon || "/pwa-icon-192.png",
    dir: "rtl",
    lang: "ar",
    badge: "/pwa-icon-192.png",
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
