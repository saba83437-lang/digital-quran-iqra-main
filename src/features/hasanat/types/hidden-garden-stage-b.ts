export type GardenPeriodMode = "term" | "academic_year" | "lifetime";
export type HiddenGardenStage =
  "waiting" | "seed" | "sprout" | "leaf" | "tree" | "garden";
export type IkhlasMissionMode = "self_garden" | "self_only" | "display_only";
export type IkhlasAssignmentType = "random_individual" | "shared_class";

export interface IkhlasMission {
  id: string;
  title: string;
  description: string;
  mode: IkhlasMissionMode;
  status: "draft" | "active" | "archived";
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface StudentMission {
  assignment_id: string;
  round_id: string;
  mission_id: string;
  title: string;
  description: string;
  mode: IkhlasMissionMode;
  icon: string;
  color: string;
  starts_at: string;
  ends_at: string;
  assignment_type: IkhlasAssignmentType;
  is_completed: boolean | null;
}

export interface IkhlasRound {
  id: string;
  title: string;
  assignment_type: IkhlasAssignmentType;
  class_id: number | null;
  class_name: string | null;
  shared_mission_id: string | null;
  shared_mission_title: string | null;
  starts_at: string;
  ends_at: string;
  auto_assign: boolean;
  status: "draft" | "scheduled" | "active" | "ended" | "archived";
  assigned_at: string | null;
  assignment_count: number;
  pool_mission_ids: string[];
}

export interface IkhlasAssignmentAudit {
  id: string;
  student_id: number;
  student_name: string;
  class_name: string;
  mission_title: string;
  mode: IkhlasMissionMode;
  is_completed: boolean | null;
  starts_at: string;
  ends_at: string;
  last_changed_at: string | null;
}

export interface HiddenGardenHub {
  role: "admin" | "teacher" | "parent" | "student";
  period_mode: GardenPeriodMode;
  garden_stage: HiddenGardenStage | null;
  missions: Array<StudentMission | Record<string, unknown>>;
  settings: { period_mode: GardenPeriodMode; updated_at: string } | null;
  templates: IkhlasMission[];
  rounds: IkhlasRound[];
  classes: Array<{ id: number; name: string }>;
  assignments: IkhlasAssignmentAudit[];
  completion_changes: Array<{
    id: string;
    assignment_id: string;
    student_id: number;
    student_name: string;
    mission_title: string;
    old_completed: boolean | null;
    new_completed: boolean;
    changed_at: string;
  }>;
  student_gardens: Array<{
    student_id: number;
    student_name: string;
    stamp_count: number;
    garden_stage: HiddenGardenStage;
  }>;
}
