export type HasanatRole = "admin" | "teacher" | "parent" | "student";

export type CharityCategory = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  status: "active" | "inactive" | "archived";
};

export type CharityProject = {
  id: string;
  title: string;
  description: string | null;
  image_path: string | null;
  target_amount: number | string;
  collected_amount: number | string;
  deadline: string | null;
  status: string;
  execution_status: "collecting" | "funded" | "fulfilled" | "cancelled";
  category_id: string | null;
  category_title: string | null;
  category_icon: string | null;
  category_color: string | null;
  scope_type: "global" | "class";
  class_id: number | null;
  class_name: string | null;
  sort_order: number;
  outcome_title: string | null;
  outcome_summary: string | null;
  outcome_metrics: Array<{
    label?: string;
    value?: string | number;
    icon?: string;
  }> | null;
  outcome_image_path: string | null;
  executed_at: string | null;
  created_at: string;
};

export type WaqfPledge = {
  id: string;
  student_id: number;
  percent: number | string;
  category_id: string | null;
  is_active: boolean;
};

export type FundPool = {
  id: string;
  category_id: string | null;
  category_title: string;
  balance: number | string;
  total_contributed: number | string;
  total_allocated: number | string;
};

export type GivingHistoryRow = {
  id: string;
  student_id: number;
  student_name?: string;
  class_id?: number | null;
  class_name?: string | null;
  amount: number | string;
  created_at: string;
  source_kind?: "waqf_once" | "waqf_auto";
  campaign_id?: string;
  campaign_title_snapshot?: string;
  category_id?: string | null;
  category_title?: string | null;
};

export type GivingImpact = {
  today_amount: number | string;
  period_id: string | null;
  period_title: string | null;
  period_amount: number | string;
  target_amount: number | string | null;
  progress_percent: number | string | null;
  funded_projects: number;
  fulfilled_projects: number;
};

export type GivingHub = {
  period: { term: string; year_key: string };
  categories: CharityCategory[];
  classes: Array<{ id: number; name: string }>;
  projects: CharityProject[];
  pledge: WaqfPledge | null;
  my_contributions: GivingHistoryRow[];
  my_donations: GivingHistoryRow[];
  pools: FundPool[];
  impact: GivingImpact;
};
