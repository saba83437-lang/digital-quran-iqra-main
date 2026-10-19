import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl text-foreground">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground max-w-2xl">{description}</p>
        )}
        <div className="ornament-divider mt-3 max-w-[180px]" />
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 [&>*]:max-sm:flex-1 sm:w-auto">
          {actions}
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon: ReactNode;
  tone?: "primary" | "gold" | "success" | "warning";
}

export function StatCard({ label, value, hint, icon, tone = "primary" }: StatCardProps) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    gold: "bg-gold/15 text-gold-foreground",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
  };
  return (
    <Card className="mobile-stat-card h-full border-border/70 p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-soft sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
          <p className="mt-2 text-2xl font-bold font-display text-foreground tracking-tight">
            {value}
          </p>
          {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        <div className={`shrink-0 h-11 w-11 rounded-xl flex items-center justify-center ${tones[tone]}`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}
