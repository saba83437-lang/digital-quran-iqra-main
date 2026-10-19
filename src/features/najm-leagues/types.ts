import type { NajmTerm } from "@/lib/najm";

export type LeagueRole = "admin" | "teacher" | "student" | "parent";

export interface NajmLeagueMember {
  student_id: number;
  student_name: string;
  avatar_url: string | null;
  poster_avatar_url: string | null;
  monthly_score: number;
  previous_month_score: number;
  growth: number;
  rank: number;
}

export interface NajmLeague {
  id: string;
  title: string;
  color: string;
  icon_key: string;
  class_id: number;
  term: NajmTerm;
  academic_year: string;
  created_by_role: "admin" | "teacher";
  published_at: string;
  archived_at: string | null;
  members: NajmLeagueMember[];
}

export interface LeagueStudentOption {
  id: number;
  name: string;
  avatar_url: string | null;
  status: string | null;
}

export interface LeaguePosterSetting {
  id: string;
  class_id: number | null;
  background_path: string | null;
  layout: LeaguePosterLayout | null;
  display_limit: number | null;
}

export interface LeaguePosterElement {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  backgroundColor?: string;
  borderRadius?: number;
  opacity?: number;
  lineHeight?: number;
  rotation?: number;
  align?: "right" | "center" | "left";
  zIndex?: number;
  locked?: boolean;
  hidden?: boolean;
}

export interface LeaguePosterLayout {
  version: number;
  canvasWidth: number;
  canvasHeight: number;
  printWidthMm?: number;
  printHeightMm?: number;
  backgroundSize?: string;
  backgroundPosition?: string;
  elements: Record<string, LeaguePosterElement>;
  labels?: Record<string, string>;
}

export type LeagueMembershipHistoryEventType =
  | "joined"
  | "left"
  | "transferred"
  | "scheduled_join"
  | "scheduled_leave"
  | "schedule_cancelled";

export interface LeagueMembershipHistoryEvent {
  transaction_id: number;
  student_id: number;
  student_name: string;
  event_type: LeagueMembershipHistoryEventType;
  effective_month: string;
  occurred_at: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_role: LeagueRole | "system";
  from_league_id: string | null;
  from_league_title: string | null;
  to_league_id: string | null;
  to_league_title: string | null;
}

export interface LeagueMembershipHistoryData {
  role: LeagueRole;
  class_id: number;
  term: NajmTerm;
  academic_year: string;
  can_view_class_history: boolean;
  students: Array<{ id: number; name: string }>;
  leagues: Array<{ id: string; title: string }>;
  events: LeagueMembershipHistoryEvent[];
}

export interface NajmLeagueWorkspaceData {
  class_id: number;
  class_name: string;
  month_key: string;
  term: NajmTerm;
  academic_year: string;
  role: LeagueRole;
  can_create: boolean;
  can_manage: boolean;
  month_finalized: boolean;
  students: LeagueStudentOption[];
  poster_setting: LeaguePosterSetting | null;
  leagues: NajmLeague[];
}
