import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Loader2, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthenticatedSession, logout, updateCurrentPassword, type AuthSession, type UserRole } from "@/lib/auth";
import {
  forceManagedAccountPasswordChange,
  loadManagedAccounts,
  setManagedAccountActive,
  type ManagedAccount,
} from "@/lib/admin-account-settings-utils";

const roleLabels: Record<UserRole, string> = {
  admin: "مدیر سامانه",
  teacher: "استاد",
  student: "قرآن‌آموز",
  parent: "ولی قرآن‌آموز",
};

function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  if (totalMinutes < 60) return `${totalMinutes} دقیقه`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ساعت و ${minutes} دقیقه` : `${hours} ساعت`;
}

function formatActivityDate(value: string | null): string {
  if (!value) return "ثبت نشده";
  try {
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function accountStatusLabel(account: ManagedAccount): string {
  if (account.account_status === "connected") return "متصل";
  if (account.account_status === "auth_missing") return "Auth یافت نشد";
  if (account.account_status === "profile_without_mapping") return "بدون mapping";
  if (account.account_status === "mapping_without_profile") return "بدون پرونده";
  return "Auth بدون mapping";
}

export function AccountSettingsPage({ role }: { role: UserRole }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountActionId, setAccountActionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getAuthenticatedSession().then((value) => {
      if (active) {
        setSession(value);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session?.role !== "admin") return;
    setAccountsLoading(true);
    void loadManagedAccounts()
      .then(setAccounts)
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : "دریافت حساب‌ها ناموفق بود");
      })
      .finally(() => setAccountsLoading(false));
  }, [session?.role]);

  const handleLogout = async () => {
    await logout();
    window.location.replace("/login");
  };

  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("رمز جدید باید حداقل ۸ کاراکتر باشد");
      return;
    }
    if (password !== confirm) {
      toast.error("رمز جدید و تکرار آن یکسان نیستند");
      return;
    }

    setSaving(true);
    const error = await updateCurrentPassword(password);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }

    setPassword("");
    setConfirm("");
    setSession((current) => (current ? { ...current, mustChangePassword: false } : current));
    toast.success("رمز عبور با موفقیت تغییر کرد ✅");
  };

  const forcePasswordChange = async (account: ManagedAccount) => {
    if (!account.id) return;
    setAccountActionId(account.id);
    try {
      await forceManagedAccountPasswordChange(account.id);
      setAccounts((previous) =>
        previous.map((item) =>
          item.id === account.id ? { ...item, must_change_password: true } : item,
        ),
      );
      toast.success("اجبار تغییر رمز فعال شد ✅");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "عملیات ناموفق بود");
    } finally {
      setAccountActionId(null);
    }
  };

  const toggleAccount = async (account: ManagedAccount) => {
    if (!account.id || account.is_active === null) return;
    const nextValue = !account.is_active;
    setAccountActionId(account.id);
    try {
      await setManagedAccountActive(account.id, nextValue);
      setAccounts((previous) =>
        previous.map((item) =>
          item.id === account.id ? { ...item, is_active: nextValue } : item,
        ),
      );
      toast.success(nextValue ? "حساب فعال شد ✅" : "حساب غیرفعال شد ✅");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت حساب ناموفق بود");
    } finally {
      setAccountActionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">نشست کاربری معتبر نیست.</p>;
  }

  if (session.role !== role) {
    return <p className="rounded-xl border bg-card p-6 text-center text-sm text-destructive">دسترسی به این بخش مجاز نیست.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <ShieldCheck className="h-5 w-5 text-primary" /> تنظیمات حساب
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <UserRound className="h-5 w-5 text-primary" />
            <div><p className="text-xs text-muted-foreground">نام</p><p className="font-semibold">{session.name}</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <KeyRound className="h-5 w-5 text-primary" />
            <div><p className="text-xs text-muted-foreground">شماره ورود</p><p className="font-semibold" dir="ltr">{session.phone || "—"}</p></div>
          </div>
          <div className="flex items-center gap-3 rounded-xl border p-4">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div><p className="text-xs text-muted-foreground">نقش</p><p className="font-semibold">{roleLabels[session.role]}</p></div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div><p className="text-xs text-muted-foreground">وضعیت</p><Badge variant="outline" className="mt-1">{session.mustChangePassword ? "تغییر رمز الزامی است" : "حساب فعال"}</Badge></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="font-display">تغییر رمز عبور</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="max-w-md space-y-4">
            <div className="space-y-2"><Label htmlFor="settings-password">رمز جدید</Label><Input id="settings-password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={saving} required /></div>
            <div className="space-y-2"><Label htmlFor="settings-password-confirm">تکرار رمز جدید</Label><Input id="settings-password-confirm" type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} disabled={saving} required /></div>
            <Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}ذخیره رمز جدید</Button>
            <Button type="button" variant="outline" className="gap-2" onClick={() => void handleLogout()} disabled={saving}>
              <LogOut className="h-4 w-4" /> خروج از حساب
            </Button>
          </form>
        </CardContent>
      </Card>

      {role === "admin" && (
        <Card>
          <CardHeader><CardTitle className="font-display">مدیریت حساب‌های ورود</CardTitle></CardHeader>
          <CardContent>
            {accountsLoading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />در حال دریافت حساب‌ها...</div>
            ) : accounts.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">حسابی برای نمایش وجود ندارد.</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="border-b text-right"><th className="p-3">نام</th><th className="p-3">نقش</th><th className="p-3">شماره ورود</th><th className="p-3">وضعیت اتصال</th><th className="p-3">وضعیت حساب</th><th className="p-3">آخرین ورود</th><th className="p-3">آخرین فعالیت</th><th className="p-3">استفاده امروز</th><th className="p-3">استفاده این هفته</th><th className="p-3">عملیات</th></tr></thead><tbody>
                {accounts.map((account) => {
                  const busy = accountActionId === account.id;
                  return <tr key={`${account.id ?? "none"}-${account.role}-${account.profile_id ?? "none"}`} className="border-b last:border-0"><td className="p-3 font-medium">{account.name || "—"}</td><td className="p-3">{account.role_label}</td><td className="p-3" dir="ltr">{account.phone || "—"}</td><td className="p-3"><Badge variant="outline">{accountStatusLabel(account)}</Badge></td><td className="p-3">{account.is_active === true ? "فعال" : account.is_active === false ? "غیرفعال" : "—"}{account.must_change_password ? " · تغییر رمز الزامی" : ""}</td><td className="p-3 whitespace-nowrap">{formatActivityDate(account.last_sign_in_at)}</td><td className="p-3 whitespace-nowrap">{formatActivityDate(account.last_active_at)}</td><td className="p-3 whitespace-nowrap">{formatDuration(account.today_active_seconds)}</td><td className="p-3 whitespace-nowrap">{formatDuration(account.week_active_seconds)}</td><td className="flex gap-2 p-3"><Button size="sm" variant="outline" disabled={busy || !account.id} onClick={() => void forcePasswordChange(account)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "اجبار تغییر رمز"}</Button>{account.is_active !== null && account.role !== "admin" && <Button size="sm" variant="outline" disabled={busy} onClick={() => void toggleAccount(account)}>{account.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}</Button>}</td></tr>;
                })}
              </tbody></table></div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
