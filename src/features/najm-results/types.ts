import type { AdvancedPosterLayout } from "@/components/posters/advanced-poster-layout-editor";
import type { NajmTerm } from "@/lib/najm";

export type SharedNajmRole = "teacher" | "parent" | "student";
export type SharedNajmScope = "monthly" | "term" | "annual";
export interface SharedNajmTerm {
  term: NajmTerm;
  year_key: string;
  academic_year: string;
  title: string;
  is_active: boolean;
  absence_score_ratio: number;
  overall_results_poster_path: string | null;
  class_results_poster_path: string | null;
  overall_results_layout: AdvancedPosterLayout | null;
  class_results_layout: AdvancedPosterLayout | null;
}
export interface SharedNajmMonth {
  month_key: string;
  term: NajmTerm;
  year_key: string;
}
export interface SharedNajmClass {
  id: number;
  name: string;
  level: string | null;
  teacher_name: string;
  is_relevant: boolean;
}
export interface SharedNajmCatalog {
  role: SharedNajmRole | "admin";
  terms: SharedNajmTerm[];
  months: SharedNajmMonth[];
  relevant_class_ids: number[];
  classes: SharedNajmClass[];
}
export interface SharedNajmStudentResult {
  student_id: number;
  name: string;
  class_id: number;
  class_name: string;
  level: string | null;
  avatar_url: string | null;
  poster_avatar_url: string | null;
  total: number;
  average: number;
  sessions: number;
  present: number;
  absent: number;
  attendance_rate: number;
}
export interface SharedNajmPeriodResults {
  scope: "term" | "annual";
  year_key: string;
  term: NajmTerm | null;
  rows: SharedNajmStudentResult[];
}
