import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, Search, LogOut, X, Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar, getNavigationItemsForRole } from "@/components/app-sidebar";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Role } from "@/lib/mock-data";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedSession, homePathForRole, logout, type AuthSession } from "@/lib/auth";
import { ForcedPasswordChange } from "@/components/forced-password-change";
import {
  endActivitySession,
  heartbeatActivitySession,
  startActivitySession,
} from "@/lib/activity-session-utils";
import { SECURE_MESSAGES_CHANGED_EVENT } from "@/features/messages/api/messages-api";
import {
  getMyAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
  renderNotificationDateTokens,
} from "@/lib/achievements";

interface AppShellProps {
  role: Role;
  children: ReactNode;
}

type ShellNotification = {
  id: string;
  title: string;
  body: string;
  type: "info" | "warning" | "achievement";
  actionUrl?: string | null;
  persistent: boolean;
  read: boolean;
};

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "ک";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

export function AppShell({ role, children }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [authSession, setAuthSession] = useState<AuthSession | null | undefined>(undefined);

  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [readSummaryIds, setReadSummaryIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);
  const navigationItems = useMemo(() => getNavigationItemsForRole(role), [role]);
  const navigationMatches = useMemo(() => {
    const query = globalSearch.trim().toLocaleLowerCase("fa-IR");
    if (!query) return [];
    return navigationItems
      .filter((item) => item.title.toLocaleLowerCase("fa-IR").includes(query))
      .slice(0, 8);
  }, [globalSearch, navigationItems]);

  const openSearchResult = (url: string) => {
    setGlobalSearch("");
    setSearchFocused(false);
    window.location.href = url;
  };

  useEffect(() => {
    let mounted = true;

    const verifyAccess = async () => {
      const session = await getAuthenticatedSession();
      if (!mounted) return;

      if (!session) {
        window.location.replace("/login");
        return;
      }

      if (session.role !== role) {
        window.location.replace(homePathForRole(session.role));
        return;
      }

      setAuthSession(session);
    };

    void verifyAccess();
    return () => {
      mounted = false;
    };
  }, [role]);

  useEffect(() => {
    if (!authSession) return;

    let active = true;
    const start = async () => {
      await startActivitySession();
      if (!active) return;
      await heartbeatActivitySession();
    };
    void start();

    const heartbeat = () => void heartbeatActivitySession();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
    };

    const intervalId = window.setInterval(heartbeat, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void endActivitySession();
    };
  }, [authSession?.userId]);

  useEffect(() => {
    if (!authSession) return;
    try {
      const saved = localStorage.getItem(`quran_notification_summaries:${authSession.userId}`);
      setReadSummaryIds(saved ? (JSON.parse(saved) as string[]) : []);
    } catch {
      setReadSummaryIds([]);
    }
    void loadNotifications(authSession);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.userId]);

  const loadNotifications = async (session: AuthSession) => {
    const currentRole = session.role;
    let parentChildIds: string[] = [];

    if (currentRole === "parent") {
      const { data: links } = await supabase
        .from("student_parents")
        .select("student_id")
        .eq("parent_id", session.entityId);
      parentChildIds = (links ?? []).map((link) => String(link.student_id));
    }

    const messageQuery = supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("recipient_user_id", session.userId)
      .eq("unread", true);

    const pendingQueries: PromiseLike<{ count: number | null }>[] = [messageQuery];
    const shouldLoadPayments = currentRole === "admin" || currentRole === "parent";
    if (shouldLoadPayments) {
      let paymentQuery = supabase
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", "overdue");
      if (currentRole === "parent") {
        paymentQuery = parentChildIds.length
          ? paymentQuery.in("student_id", parentChildIds)
          : paymentQuery.in("student_id", [-1]);
      }
      pendingQueries.push(paymentQuery);
    }

    const [summaryResults, achievementResult] = await Promise.all([
      Promise.all(pendingQueries),
      getMyAppNotifications(30),
    ]);

    const nextNotifications: ShellNotification[] = (achievementResult.data ?? []).map(
      (notification) => ({
        id: notification.id,
        // متغیر {تاریخ} در متن قالب اعلان، هنگام نمایش با تاریخ ثبت اعلان (جلالی) جایگزین می‌شود
        title: renderNotificationDateTokens(notification.title, notification.created_at),
        body: renderNotificationDateTokens(notification.body, notification.created_at),
        type:
          notification.notification_type === "achievement_candidate" ? "warning" : "achievement",
        actionUrl: notification.action_url,
        persistent: true,
        read: notification.read_at != null,
      }),
    );

    const unreadMessageCount = summaryResults[0]?.count ?? 0;
    if (unreadMessageCount > 0) {
      nextNotifications.push({
        id: `summary-messages-${unreadMessageCount}`,
        title: "پیام‌های جدید",
        body: `${unreadMessageCount} پیام خوانده‌نشده دارید`,
        type: "info",
        actionUrl: `/${currentRole}/messages`,
        persistent: false,
        read: false,
      });
    }

    if (shouldLoadPayments) {
      const overdueCount = summaryResults[1]?.count ?? 0;
      if (overdueCount > 0) {
        nextNotifications.push({
          id: `summary-overdue-${overdueCount}`,
          title: "پرداخت‌های معوق",
          body: `${overdueCount} پرداخت معوق نیاز به پیگیری دارد`,
          type: "warning",
          actionUrl: currentRole === "admin" ? "/admin/payments" : "/parent/payments",
          persistent: false,
          read: false,
        });
      }
    }

    setNotifications(nextNotifications);
  };

  useEffect(() => {
    if (!authSession) return;
    const refreshMessageSummary = () => void loadNotifications(authSession);
    window.addEventListener(SECURE_MESSAGES_CHANGED_EVENT, refreshMessageSummary);
    const channel = supabase
      .channel(`shell-secure-messages-${authSession.userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        refreshMessageSummary,
      )
      .subscribe();
    return () => {
      window.removeEventListener(SECURE_MESSAGES_CHANGED_EVENT, refreshMessageSummary);
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.userId]);

  const saveReadSummaryIds = (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    setReadSummaryIds(uniqueIds);
    if (authSession) {
      localStorage.setItem(
        `quran_notification_summaries:${authSession.userId}`,
        JSON.stringify(uniqueIds),
      );
    }
  };

  const markNotificationRead = async (notification: ShellNotification) => {
    if (notification.persistent && !notification.read) {
      const result = await markAppNotificationRead(notification.id);
      if (result.error) console.warn("mark notification read failed:", result.error);
    } else if (!notification.persistent) {
      saveReadSummaryIds([...readSummaryIds, notification.id]);
    }

    setNotifications((previous) =>
      previous.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
    );
  };

  const openNotification = async (notification: ShellNotification) => {
    await markNotificationRead(notification);
    if (notification.actionUrl) {
      setShowNotifications(false);
      window.location.href = notification.actionUrl;
    }
  };

  const markAllNotificationsRead = async () => {
    const result = await markAllAppNotificationsRead();
    if (result.error) console.warn("mark all notifications failed:", result.error);
    saveReadSummaryIds([
      ...readSummaryIds,
      ...notifications.filter((item) => !item.persistent).map((notification) => notification.id),
    ]);
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
  };

  const handleLogout = async () => {
    await logout();
    window.location.replace("/login");
  };

  if (authSession === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-islamic-pattern" dir="rtl">
        <div className="flex items-center gap-3 rounded-2xl border bg-card px-6 py-4 shadow-lg">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">در حال بررسی دسترسی امن...</span>
        </div>
      </div>
    );
  }

  if (!authSession) return null;

  if (authSession.mustChangePassword) {
    return (
      <ForcedPasswordChange
        session={authSession}
        onCompleted={(nextSession) => setAuthSession(nextSession)}
      />
    );
  }

  const userRole =
    role === "admin"
      ? "مدیر سامانه"
      : role === "teacher"
        ? "استاد"
        : role === "parent"
          ? "ولی قرآن‌آموز"
          : "قرآن‌آموز";

  const unreadNotifs = notifications.filter(
    (notification) => !notification.read && !readSummaryIds.includes(notification.id),
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-islamic-pattern">
        <AppSidebar role={role} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 flex items-center gap-3 px-4 lg:px-6 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-30">
            <SidebarTrigger className="text-foreground" />

            <div className="hidden md:flex items-center gap-2 max-w-md flex-1">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={globalSearch}
                  onChange={(event) => setGlobalSearch(event.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setGlobalSearch("");
                      setSearchFocused(false);
                    } else if (event.key === "Enter" && navigationMatches[0]) {
                      openSearchResult(navigationMatches[0].url);
                    }
                  }}
                  placeholder="جستجو در بخش‌های پنل..."
                  className="pr-10 bg-secondary/60 border-transparent focus-visible:border-ring"
                  aria-label="جستجو در منوی پنل"
                />
                {searchFocused && globalSearch.trim() && (
                  <div className="absolute right-0 left-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-xl border bg-card shadow-xl">
                    {navigationMatches.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-muted-foreground">
                        بخشی با این عنوان پیدا نشد
                      </p>
                    ) : (
                      navigationMatches.map((item) => (
                        <button
                          key={item.url}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => openSearchResult(item.url)}
                          className="flex w-full items-center gap-2 border-b px-4 py-2.5 text-right text-sm transition last:border-0 hover:bg-secondary"
                        >
                          <item.icon className="h-4 w-4 text-primary" />
                          <span>{item.title}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="mr-auto flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-secondary transition hover:bg-accent md:hidden"
                onClick={() => setShowMobileSearch(true)}
                aria-label="جستجو در بخش‌های پنل"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg bg-secondary hover:bg-accent transition"
                onClick={() => setShowNotifications(true)}
                aria-label="اعلان‌ها"
              >
                <Bell className="h-4 w-4 text-foreground" />
                {unreadNotifs.length > 0 && (
                  <span className="absolute top-1.5 left-1.5 h-2 w-2 rounded-full bg-destructive" />
                )}
              </button>

              <div className="flex items-center gap-2.5 pl-2 border-r border-border pr-3">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-semibold text-foreground leading-tight">
                    {authSession.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{userRole}</div>
                </div>
                <Avatar className="h-9 w-9 border-2 border-gold">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                    {userInitials(authSession.name)}
                  </AvatarFallback>
                </Avatar>
              </div>

              <button
                onClick={() => void handleLogout()}
                title="خروج"
                aria-label="خروج از سامانه"
                className="h-9 w-9 inline-flex items-center justify-center rounded-lg bg-secondary hover:bg-red-100 hover:text-red-600 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="mobile-app-content flex-1 p-4 lg:p-6">
            <Breadcrumb pathname={pathname} />
            {children}
          </main>

          <footer className="px-6 py-3 border-t border-border text-center text-xs text-muted-foreground bg-card/50">
            <div className="ornament-divider mb-2 max-w-xs mx-auto" />
            مرکز تخصصی قرآن بِرّ الوالدین — همه حقوق محفوظ است
          </footer>
        </div>
      </div>

      <Dialog open={showMobileSearch} onOpenChange={setShowMobileSearch}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="h-4 w-4" /> جستجو در پنل
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={globalSearch}
            onChange={(event) => setGlobalSearch(event.target.value)}
            placeholder="نام بخش را بنویسید..."
            onKeyDown={(event) => {
              if (event.key === "Enter" && navigationMatches[0]) {
                setShowMobileSearch(false);
                openSearchResult(navigationMatches[0].url);
              }
            }}
          />
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {!globalSearch.trim() ? (
              navigationItems.slice(0, 8).map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => {
                    setShowMobileSearch(false);
                    openSearchResult(item.url);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm hover:bg-secondary"
                >
                  <item.icon className="h-4 w-4 text-primary" /> {item.title}
                </button>
              ))
            ) : navigationMatches.length ? (
              navigationMatches.map((item) => (
                <button
                  key={item.url}
                  type="button"
                  onClick={() => {
                    setShowMobileSearch(false);
                    openSearchResult(item.url);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-sm hover:bg-secondary"
                >
                  <item.icon className="h-4 w-4 text-primary" /> {item.title}
                </button>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">نتیجه‌ای پیدا نشد</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showNotifications} onOpenChange={setShowNotifications}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> اعلان‌ها
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {notifications.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                اعلان جدیدی وجود ندارد
              </p>
            )}
            {notifications.map((notification) => {
              const isRead = notification.read || readSummaryIds.includes(notification.id);
              return (
                <div
                  key={notification.id}
                  className={`flex items-start gap-2 rounded-xl border p-3 text-sm transition ${
                    isRead ? "opacity-50" : ""
                  } ${
                    notification.type === "warning"
                      ? "border-amber-200 bg-amber-50"
                      : notification.type === "achievement"
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-blue-200 bg-blue-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void openNotification(notification)}
                    className="min-w-0 flex-1 text-right"
                  >
                    <span className="block font-semibold">{notification.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                      {notification.body}
                    </span>
                  </button>
                  {!isRead && (
                    <button
                      type="button"
                      onClick={() => void markNotificationRead(notification)}
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      aria-label="خوانده شد"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {notifications.length > 0 && (
            <button
              className="mt-2 text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => void markAllNotificationsRead()}
            >
              همه را خوانده‌شده علامت بزن
            </button>
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

function Breadcrumb({ pathname }: { pathname: string }) {
  const labelMap: Record<string, string> = {
    admin: "پنل مدیریت",
    teacher: "پنل استاد",
    parent: "پنل ولی",
    student: "پنل قرآن‌آموز",
    users: "کاربران",
    classes: "کلاس‌ها",
    lessons: "کلاس من",
    videos: "ویدیوهای آموزشی",
    payments: "شهریه",
    reports: "گزارش‌ها",
    messages: "پیام‌رسانی",
    students: "قرآن‌آموزان",
    attendance: "حضور و غیاب",
    assignments: "تکالیف",
    reviews: "بررسی پاسخ‌ها",
    progress: "پیشرفت تحصیلی",
    grades: "نمرات",
    achievements: "افتخارات و نشان‌ها",
    "najm-results": "نتایج طرح نجم",
    leaderboard: "رتبه‌بندی افتخارات",
  };

  const parts = pathname.split("/").filter(Boolean);
  return (
    <div className="mb-5 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 text-xs">
      <Badge variant="outline" className="bg-card text-muted-foreground border-border font-normal">
        مرکز قرآن
      </Badge>
      {parts.map((part, index) => (
        <span key={part + index} className="flex items-center gap-2 text-muted-foreground">
          <span className="opacity-50">/</span>
          <span className={index === parts.length - 1 ? "text-primary font-semibold" : ""}>
            {labelMap[part] ?? part}
          </span>
        </span>
      ))}
    </div>
  );
}

