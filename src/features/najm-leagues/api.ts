import { supabase } from "@/lib/supabase";
import type { NajmTerm } from "@/lib/najm";
import type {
  LeagueMembershipHistoryData,
  LeaguePosterLayout,
  NajmLeagueWorkspaceData,
} from "./types";

export type LeagueResult<T> = { data: T | null; error: string | null };

function localizeLeagueError(message: string): string {
  const knownMessages: Record<string, string> = {
    "League management access required": "دسترسی مدیریت رده لازم است.",
    "Teacher may only create a league for an owned class":
      "استاد فقط برای کلاس تحت تدریس خود می‌تواند رده بسازد.",
    "A selected student already belongs to another league":
      "یکی از قرآن‌آموزان انتخاب‌شده در این ماه عضو رده دیگری است.",
    "Active league not found": "رده فعال پیدا نشد.",
    "Class league access denied": "دسترسی به رده‌های این کلاس مجاز نیست.",
    "Class membership history access denied":
      "دسترسی به تاریخچه عضویت این کلاس مجاز نیست.",
    "History period is required": "دوره تاریخچه عضویت مشخص نشده است.",
    "Finalized league month cannot be changed":
      "رده‌های ماه نهایی‌شده قابل تغییر نیستند.",
    "Completed league months cannot be changed":
      "رده‌های ماه‌های پایان‌یافته قابل تغییر نیستند.",
    "Only completed league months can be finalized":
      "فقط رده‌های ماه‌های پایان‌یافته قابل نهایی‌سازی هستند.",
  };
  return (
    knownMessages[message] ??
    message
      .replace(/Najm leagues?/gi, "رده‌های نجم")
      .replace(/leagues?/gi, "رده")
  );
}

export async function getNajmLeagueWorkspace(
  classId: number,
  monthKey: string,
  period?: { term: NajmTerm; academicYear: string },
): Promise<LeagueResult<NajmLeagueWorkspaceData>> {
  const { data, error } = await supabase.rpc("get_najm_league_workspace", {
    p_class_id: classId,
    p_month_key: monthKey,
    p_term: period?.term ?? null,
    p_academic_year: period?.academicYear ?? null,
  });
  return error
    ? { data: null, error: localizeLeagueError(error.message) }
    : { data: data as NajmLeagueWorkspaceData, error: null };
}

export async function getNajmLeagueMembershipHistory(input: {
  classId: number;
  term: NajmTerm;
  academicYear: string;
  studentId?: number | null;
  limit?: number;
}): Promise<LeagueResult<LeagueMembershipHistoryData>> {
  const { data, error } = await supabase.rpc(
    "get_najm_league_membership_history",
    {
      p_class_id: input.classId,
      p_term: input.term,
      p_academic_year: input.academicYear,
      p_student_id: input.studentId ?? null,
      p_limit: input.limit ?? 300,
    },
  );
  return error
    ? { data: null, error: localizeLeagueError(error.message) }
    : { data: data as LeagueMembershipHistoryData, error: null };
}

export async function saveNajmLeague(input: {
  id?: string | null;
  classId: number;
  term: NajmTerm;
  academicYear: string;
  title: string;
  color: string;
  iconKey: string;
  memberIds: number[];
  effectiveMonth: string;
}): Promise<LeagueResult<string>> {
  const { data, error } = await supabase.rpc("save_najm_league", {
    p_league_id: input.id ?? null,
    p_class_id: input.classId,
    p_term: input.term,
    p_academic_year: input.academicYear,
    p_title: input.title.trim(),
    p_color: input.color,
    p_icon_key: input.iconKey,
    p_member_ids: input.memberIds,
    p_effective_month: input.effectiveMonth,
  });
  return error
    ? { data: null, error: localizeLeagueError(error.message) }
    : { data: String(data), error: null };
}

export async function archiveNajmLeague(
  leagueId: string,
  effectiveMonth: string,
): Promise<LeagueResult<boolean>> {
  const { data, error } = await supabase.rpc("admin_archive_najm_league", {
    p_league_id: leagueId,
    p_effective_month: effectiveMonth,
  });
  return error
    ? { data: null, error: localizeLeagueError(error.message) }
    : { data: data === true, error: null };
}

export async function finalizeNajmLeagueMonth(
  monthKey: string,
): Promise<LeagueResult<number>> {
  const { data, error } = await supabase.rpc("finalize_najm_league_month", {
    p_month_key: monthKey,
    p_mode: "manual",
  });
  return error
    ? { data: null, error: localizeLeagueError(error.message) }
    : { data: Number(data ?? 0), error: null };
}

export async function saveNajmLeaguePosterSetting(input: {
  term: NajmTerm;
  academicYear: string;
  classId: number | null;
  backgroundPath: string | null;
  layout: LeaguePosterLayout;
  displayLimit: number | null;
}): Promise<LeagueResult<string>> {
  const { data, error } = await supabase.rpc(
    "admin_save_najm_league_poster_setting",
    {
      p_term: input.term,
      p_academic_year: input.academicYear,
      p_class_id: input.classId,
      p_background_path: input.backgroundPath,
      p_layout: input.layout,
      p_display_limit: input.displayLimit,
    },
  );
  return error
    ? { data: null, error: localizeLeagueError(error.message) }
    : { data: String(data), error: null };
}
