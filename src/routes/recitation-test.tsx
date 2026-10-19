// ============================================================================
// صفحه تست سلامت ماژول چالش تقلید — برای پیدا کردن دقیق محل مشکل
// مسیر: /recitation-test
// اگر دکمه این صفحه کار کرد → جاوااسکریپت و مسیرها سالم‌اند (مشکل از داده/دیتابیس است)
// اگر کار نکرد → مشکل از نصب/کش/بارگذاری فایل‌هاست
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/recitation-test")({
  component: RecitationSelfTestPage,
});

function RecitationSelfTestPage() {
  const [clicks, setClicks] = useState(0);
  const [authInfo, setAuthInfo] = useState<string>("در حال بررسی...");
  const [rpcInfo, setRpcInfo] = useState<string>("—");
  const [dbInfo, setDbInfo] = useState<string>("—");

  // ۱) تست اینکه React و جاوااسکریپت اصلاً کار می‌کنند
  useEffect(() => {
    console.log("[SELF-TEST] صفحه تست بارگذاری شد — React کار می‌کند");
    supabase.auth
      .getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        setAuthInfo(
          user
            ? `✅ وارد شده — userId: ${user.id}`
            : "❌ وارد نشده (بدون سشن) — وارد حساب شوید",
        );
      })
      .catch((e) => setAuthInfo("❌ خطا: " + (e?.message || String(e))));
  }, []);

  // ۲) تست فراخوانی یک RPC ساده (بدون نیاز به نقش خاص)
  const testRpc = async () => {
    setRpcInfo("در حال تست...");
    try {
      const { data, error } = await supabase.rpc("recitation_default_scoring_config");
      if (error) {
        setRpcInfo("❌ خطای RPC: " + error.message);
      } else {
        setRpcInfo("✅ RPC جواب داد: " + JSON.stringify(data).slice(0, 120));
      }
    } catch (e: any) {
      setRpcInfo("❌ خطا: " + (e?.message || String(e)));
    }
  };

  // ۳) تست خواندن جدول فرازها (تست RLS)
  const testDb = async () => {
    setDbInfo("در حال تست...");
    try {
      const { data, error } = await supabase
        .from("recitation_passages")
        .select("id, title, status")
        .limit(5);
      if (error) {
        setDbInfo("❌ خطای RLS/جدول: " + error.message);
      } else {
        setDbInfo(`✅ جدول پاسخ داد — ${data.length} فراز دیده شد`);
      }
    } catch (e: any) {
      setDbInfo("❌ خطا: " + (e?.message || String(e)));
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
      <h1 className="font-display text-3xl font-black">🩺 تست سلامت ماژول چالش تقلید</h1>
      <p className="text-muted-foreground text-sm">
        نسخه بسته: <b dir="ltr">21B-4</b> — اگر این نسخه را نمی‌بینید یعنی صفحه قدیمی از کش
        نمایش داده می‌شود.
      </p>

      {/* تست ۱ */}
      <div className="rounded-2xl border p-5 space-y-3">
        <div className="font-bold">تست ۱: کلیک و جاوااسکریپت</div>
        <p className="text-sm text-muted-foreground">
          اگر با هر کلیک عدد زیر زیاد شود، جاوااسکریپت سالم است.
        </p>
        <div className="flex items-center gap-4">
          <Button onClick={() => setClicks((c) => c + 1)}>کلیک کن</Button>
          <span className="text-2xl font-black">{clicks}</span>
        </div>
      </div>

      {/* تست ۲ */}
      <div className="rounded-2xl border p-5 space-y-3">
        <div className="font-bold">تست ۲: ورود (Auth)</div>
        <p className="text-sm text-muted-foreground">{authInfo}</p>
      </div>

      {/* تست ۳ */}
      <div className="rounded-2xl border p-5 space-y-3">
        <div className="font-bold">تست ۳: فراخوانی RPC دیتابیس</div>
        <Button variant="outline" onClick={testRpc}>
          اجرای تست RPC
        </Button>
        <p className="text-sm text-muted-foreground break-all">{rpcInfo}</p>
      </div>

      {/* تست ۴ */}
      <div className="rounded-2xl border p-5 space-y-3">
        <div className="font-bold">تست ۴: خواندن جدول فرازها (RLS)</div>
        <Button variant="outline" onClick={testDb}>
          اجرای تست جدول
        </Button>
        <p className="text-sm text-muted-foreground break-all">{dbInfo}</p>
      </div>

      <p className="text-xs text-muted-foreground">
        نتیجه هر ۴ تست را برای من بفرستید — با همین‌ها دقیق می‌فهمیم مشکل کجاست.
      </p>
    </div>
  );
}
