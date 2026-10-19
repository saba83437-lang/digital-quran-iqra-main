import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Receipt,
  RefreshCw,
  Wallet,
} from "lucide-react";

import { PageHeader, StatCard } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useParentPortal } from "@/hooks/use-parent-portal";
import { useParentChildSelection } from "@/features/parent/parent-child-selection";
import { formatToman, type ParentPortalPayment } from "@/lib/parent-utils";

export const Route = createFileRoute("/parent/payments")({
  head: () => ({
    meta: [
      { title: "شهریه واقعی — پنل والدین" },
      { name: "description", content: "صورتحساب‌ها و پرداخت‌های واقعی فرزندان" },
    ],
  }),
  component: ParentPayments,
});

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFa(value: number | string): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

function ParentPayments() {
  const { data, loading, refreshing, error, refresh } = useParentPortal();
  const { selectedId: childFilter, setSelectedId: setChildFilter } =
    useParentChildSelection(data?.children ?? [], { allowAll: true });
  const childById = new Map((data?.children ?? []).map((child) => [child.id, child]));
  const payments = (data?.children ?? [])
    .flatMap((child) => child.payments)
    .filter((payment) => childFilter === "all" || String(payment.student_id) === childFilter);
  const billablePayments = payments.filter((payment) => payment.status !== "cancelled");
  const total = billablePayments.reduce((sum, payment) => sum + payment.amount, 0);
  const paid = billablePayments.reduce((sum, payment) => sum + payment.paid_amount, 0);
  const remaining = Math.max(0, total - paid);
  const overdue = billablePayments.filter((payment) => payment.status === "overdue").length;

  if (loading) return <LoadingState />;
  if (!data || error)
    return <ErrorState message={error ?? "اطلاعات در دسترس نیست"} onRetry={() => void refresh()} />;

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="شهریه و پرداخت‌ها"
        description="این صفحه فقط اطلاعات واقعی جدول payments را نمایش می‌دهد؛ پرداخت شبیه‌سازی‌شده حذف شده است."
        actions={
          <Button
            variant="outline"
            className="gap-2"
            disabled={refreshing}
            onClick={() => void refresh(true)}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            به‌روزرسانی
          </Button>
        }
      />

      <Card className="rounded-2xl p-4">
        <Select value={childFilter} onValueChange={setChildFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه فرزندان</SelectItem>
            {data.children.map((child) => (
              <SelectItem key={child.id} value={String(child.id)}>
                {child.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="مجموع صورتحساب"
          value={formatToman(total)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="مبلغ پرداخت‌شده"
          value={formatToman(paid)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="success"
        />
        <StatCard
          label="مانده"
          value={formatToman(remaining)}
          icon={<Receipt className="h-5 w-5" />}
          tone="gold"
        />
        <StatCard
          label="موارد معوق"
          value={toFa(overdue)}
          hint={overdue ? "نیازمند پیگیری با مرکز" : "بدون مورد معوق"}
          icon={<AlertCircle className="h-5 w-5" />}
          tone={overdue ? "warning" : "success"}
        />
      </div>

      <Card className="overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-display text-lg font-black">صورتحساب‌های ثبت‌شده</h2>
          <Badge variant="secondary">{toFa(payments.length)} مورد</Badge>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">فرزند</TableHead>
                <TableHead className="text-right">نیمسال</TableHead>
                <TableHead className="text-right">مبلغ</TableHead>
                <TableHead className="text-right">پرداخت‌شده</TableHead>
                <TableHead className="text-right">تاریخ</TableHead>
                <TableHead className="text-right">وضعیت</TableHead>
                <TableHead className="text-right">رسید</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-medium">
                    {childById.get(payment.student_id)?.name ?? "—"}
                  </TableCell>
                  <TableCell>{payment.semester}</TableCell>
                  <TableCell className="font-bold">{formatToman(payment.amount)}</TableCell>
                  <TableCell>{formatToman(payment.paid_amount)}</TableCell>
                  <TableCell className="text-muted-foreground">{payment.date ?? "—"}</TableCell>
                  <TableCell>
                    <PaymentStatus payment={payment} />
                  </TableCell>
                  <TableCell>
                    {payment.receipt_url ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={payment.receipt_url} target="_blank" rel="noreferrer">
                          <ExternalLink className="ml-1 h-3.5 w-3.5" />
                          مشاهده
                        </a>
                      </Button>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {payments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    صورتحسابی ثبت نشده است.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Card className="rounded-2xl border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            درگاه پرداخت آنلاین هنوز متصل نیست. برای پرداخت یا اصلاح وضعیت، با مدیریت مرکز تماس
            بگیرید. هیچ پرداخت شبیه‌سازی‌شده‌ای در این صفحه انجام نمی‌شود.
          </p>
        </div>
      </Card>
    </div>
  );
}

function PaymentStatus({ payment }: { payment: ParentPortalPayment }) {
  if (payment.status === "paid")
    return (
      <Badge className="border-0 bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="ml-1 h-3 w-3" />
        پرداخت‌شده
      </Badge>
    );
  if (payment.status === "overdue")
    return (
      <Badge className="border-0 bg-rose-100 text-rose-700">
        <AlertCircle className="ml-1 h-3 w-3" />
        معوق
      </Badge>
    );
  if (payment.status === "cancelled") return <Badge variant="secondary">لغوشده</Badge>;
  return (
    <Badge className="border-0 bg-amber-100 text-amber-700">
      <Clock className="ml-1 h-3 w-3" />
      در انتظار
    </Badge>
  );
}
function LoadingState() {
  return (
    <div className="flex h-72 items-center justify-center gap-3">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
      در حال دریافت صورتحساب‌های واقعی...
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="rounded-3xl p-10 text-center">
      <AlertCircle className="mx-auto h-10 w-10 text-rose-500" />
      <p className="mt-3">{message}</p>
      <Button className="mt-4" onClick={onRetry}>
        تلاش مجدد
      </Button>
    </Card>
  );
}
