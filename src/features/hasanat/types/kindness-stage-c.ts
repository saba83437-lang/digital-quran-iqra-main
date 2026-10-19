export type KindnessRole = "admin" | "teacher" | "parent" | "student";
export interface KindnessChain {
  id: string;
  title: string;
  scope_type: "class" | "global";
  class_id: number | null;
  class_name: string | null;
  ring_count: number;
  target_rings: number | null;
  progress_percent: number | null;
}
export interface HeroAnnouncement {
  publish_at: string;
  ends_at: string;
}
export interface PrivateHero extends HeroAnnouncement {
  private_message: string;
}
export interface HeroAdmin extends HeroAnnouncement {
  id: string;
  student_id: number;
  student_name: string;
  class_name: string | null;
  private_message: string;
  status: "scheduled" | "archived";
}
export interface ChainConfig {
  id: string;
  round_id: string;
  mission_id: string;
  round_title: string;
  mission_title: string;
  scope_type: "class" | "global";
  public_title: string;
  target_rings: number | null;
  status: "active" | "archived";
  created_at: string;
}
export interface ChainRoundOption {
  round_id: string;
  round_title: string;
  starts_at: string;
  ends_at: string;
  assignment_type: string;
  class_name: string | null;
  missions: Array<{ id: string; title: string; mode: string }>;
}
export interface KindnessHub {
  role: KindnessRole;
  next_hero_at: string | null;
  hero: HeroAnnouncement | null;
  my_private_hero: PrivateHero | null;
  chains: KindnessChain[];
  announcements: HeroAdmin[];
  students: Array<{ id: number; name: string; class_name: string | null }>;
  round_options: ChainRoundOption[];
  configs: ChainConfig[];
  ring_events: Array<{
    id: string;
    config_id: string;
    student_id: number;
    student_name: string;
    class_name: string;
    action: "add" | "remove";
    mission_title_snapshot: string;
    created_at: string;
  }>;
}
