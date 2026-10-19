import { createFileRoute } from "@tanstack/react-router";
import { AchievementHallPage } from "@/components/achievements/achievement-hall-page";

export const Route = createFileRoute("/admin/leaderboard")({
  head: () => ({
    meta: [
      { title: "تالار افتخارات — مدیریت" },
      {
        name: "description",
        content: "تالار رکوردداران، برگزیدگان افتخارات ترم و برگزیدگان سال",
      },
    ],
  }),
  component: AchievementHallPage,
});
