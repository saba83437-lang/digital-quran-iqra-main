import { useState, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Loader2, LogOut, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { logout, updateCurrentPassword, type AuthSession } from "@/lib/auth";

interface ForcedPasswordChangeProps {
  session: AuthSession;
  onCompleted: (session: AuthSession) => void;
}

export function ForcedPasswordChange({
  session,
  onCompleted,
}: ForcedPasswordChangeProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("رمز جدید باید حداقل ۸ کاراکتر باشد.");
      return;
    }

    if (password !== confirmPassword) {
      setError("رمز جدید و تکرار آن یکسان نیستند.");
      return;
    }

    if (password === "12345678") {
      setError("رمز جدید نباید همان رمز اولیه باشد.");
      return;
    }

    setSaving(true);
    const updateError = await updateCurrentPassword(password);
    setSaving(false);

    if (updateError) {
      setError(updateError);
      return;
    }

    onCompleted({ ...session, mustChangePassword: false });
  };

  const handleLogout = async () => {
    await logout();
    window.location.replace("/login");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-islamic-pattern p-4" dir="rtl">
      <Card className="w-full max-w-md border-amber-200 shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="font-display text-2xl font-black text-emerald-950">
            تغییر رمز عبور الزامی است
          </CardTitle>
          <CardDescription className="leading-7">
            برای حفظ امنیت حساب، پیش از ورود به سامانه یک رمز جدید تعیین کنید.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">رمز عبور جدید</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="px-10"
                  autoComplete="new-password"
                  minLength={8}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">تکرار رمز عبور جدید</Label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="px-10"
                  autoComplete="new-password"
                  minLength={8}
                  disabled={saving}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showConfirmPassword ? "پنهان کردن تکرار رمز" : "نمایش تکرار رمز"}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? (
              <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700">
                {error}
              </p>
            ) : null}

            <Button type="submit" className="w-full gap-2" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              ذخیره رمز جدید و ورود به سامانه
            </Button>

            <Button type="button" variant="ghost" className="w-full gap-2" onClick={() => void handleLogout()} disabled={saving}>
              <LogOut className="h-4 w-4" />
              خروج از حساب
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
