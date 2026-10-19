import type React from "react";
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCheck,
  ClipboardList,
  Eye,
  GraduationCap,
  Layers,
  ListChecks,
  Search,
  School,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ClassFilterSelect,
  DateRangeFilter,
  ExportButton,
  PanelHeading,
  SessionDateFilter,
} from "../components/report-ui";
import { useReportsTabContext } from "../context/reports-tab-context";
import { formatTomanFa, najmTermLabel, toFa } from "../domain/report-display";
import { reportIdKey, sameReportId } from "../domain/report-id";
import { lookupReportItem } from "../domain/report-lookups";

export function NajmSessionsReportTab() {
  const {
    classes,
    teachers,
    najmScope,
    setNajmScope,
    najmClassFilter,
    setNajmClassFilter,
    najmTeacherFilter,
    setNajmTeacherFilter,
    najmStatusFilter,
    setNajmStatusFilter,
    najmDateRange,
    setNajmDateRange,
    najmSearch,
    setNajmSearch,
    filteredNajmSessions,
    najmSummary,
    exportNajmSessions,
    openNajmSessionDetail,
  } = useReportsTabContext();

  return (
    <TabsContent value="najm-sessions">
      <Card className="quran-panel rounded-[2rem] p-0 mb-6 overflow-hidden relative">
        <PanelHeading
          eyebrow="طرح نجم — رجیستری جلسات"
          title={`جلسات ثبت‌شده اساتید (${toFa(filteredNajmSessions.length)} جلسه)`}
          icon={<ClipboardList className="h-5 w-5" />}
          action={
            <ExportButton
              onExcel={() => exportNajmSessions("excel")}
              onPDF={() => exportNajmSessions("pdf")}
              onWord={() => exportNajmSessions("word")}
              disabled={filteredNajmSessions.length === 0}
            />
          }
        />
        <div className="p-5 space-y-4">
          {/* فیلترها — مطابق منطق بخش مدیریت طرح نجم */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Select
              value={najmScope}
              onValueChange={(v: string) => setNajmScope(v as typeof najmScope)}
            >
              <SelectTrigger>
                <SelectValue placeholder="محدوده" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">فقط ترم فعال</SelectItem>
                <SelectItem value="year">کل سال تحصیلی</SelectItem>
                <SelectItem value="all">همه بازه‌ها</SelectItem>
              </SelectContent>
            </Select>
            <Select value={najmClassFilter} onValueChange={setNajmClassFilter}>
              <SelectTrigger>
                <SelectValue placeholder="کلاس" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه کلاس‌ها</SelectItem>
                {classes
                  .filter((c) => !c.deleted_at)
                  .map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={najmTeacherFilter} onValueChange={setNajmTeacherFilter}>
              <SelectTrigger>
                <SelectValue placeholder="استاد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه اساتید</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={najmStatusFilter}
              onValueChange={(v: string) => setNajmStatusFilter(v as typeof najmStatusFilter)}
            >
              <SelectTrigger>
                <SelectValue placeholder="وضعیت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="applied">اعمال‌شده</SelectItem>
                <SelectItem value="pending">معلق</SelectItem>
              </SelectContent>
            </Select>
            <DateRangeFilter value={najmDateRange} onChange={setNajmDateRange} showToday={false} />
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={najmSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNajmSearch(e.target.value)}
                placeholder="جستجو (کلاس/استاد/تاریخ)..."
                className="pr-9"
              />
            </div>
          </div>

          {/* خلاصه آماری */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="p-3.5 rounded-2xl bg-secondary/40 border border-border/60 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-foreground">{toFa(najmSummary.total)}</p>
              <p className="text-xs text-muted-foreground font-black mt-1">کل جلسات</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-success/10 border border-success/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-success">{toFa(najmSummary.applied)}</p>
              <p className="text-xs text-muted-foreground font-black mt-1">اعمال‌شده</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-warning/10 border border-warning/20 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-warning-foreground">
                {toFa(najmSummary.pending)}
              </p>
              <p className="text-xs text-[#2d2620] font-black mt-1">معلق</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-center quran-soft-clay-card">
              <p className="text-lg font-black text-[#8a6508]">{toFa(najmSummary.totalScore)}</p>
              <p className="text-xs text-muted-foreground font-black mt-1">مجموع امتیاز</p>
            </div>
          </div>

          {filteredNajmSessions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">
              جلسه‌ای با این فیلترها پیدا نشد.
            </div>
          ) : (
            <div className="rounded-2xl border border-border/70 overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/50 font-black">
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>کلاس</TableHead>
                    <TableHead>استاد</TableHead>
                    <TableHead className="text-center">تاریخ</TableHead>
                    <TableHead className="text-center">ترم / سال</TableHead>
                    <TableHead className="text-center">رکورد</TableHead>
                    <TableHead className="text-center">مجموع امتیاز</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredNajmSessions.slice(0, 200).map((session, sessionIndex) => (
                    <TableRow
                      key={session.id}
                      onClick={() => void openNajmSessionDetail(session)}
                      title="نمایش ریز نمرات کلاس"
                      className={`cursor-pointer hover:bg-secondary/40 ${
                        session.is_applied !== true ? "bg-amber-50/50" : ""
                      }`}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {toFa(sessionIndex + 1)}
                      </TableCell>
                      <TableCell>
                        {session.is_applied === true ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">
                            <CheckCheck className="h-3 w-3 ml-0.5" />
                            اعمال‌شده
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px]">
                            <AlertCircle className="h-3 w-3 ml-0.5" />
                            معلق
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-black">{session.className}</TableCell>
                      <TableCell>{session.teacherName}</TableCell>
                      <TableCell className="text-center font-bold">
                        {toFa(session.session_date ?? "—")}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline">
                          {najmTermLabel(session.term)} • {toFa(session.academic_year ?? "—")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{toFa(session.recordsCount)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-[#D4AF37] text-emerald-950">
                          {toFa(session.totalScore)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredNajmSessions.length > 200 && (
                <p className="p-3 text-center text-[11px] text-muted-foreground border-t border-border/70">
                  فقط ۲۰۰ جلسه‌ی اول نمایش داده می‌شود؛ برای دیدن بقیه فیلترها را محدودتر کنید یا
                  خروجی بگیرید.
                </p>
              )}
            </div>
          )}
        </div>
      </Card>
    </TabsContent>
  );
}
