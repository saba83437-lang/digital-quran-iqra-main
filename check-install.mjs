// ============================================================================
// بررسی نصب ماژول چالش تقلید — Phase 21A/21B
// ----------------------------------------------------------------------------
// نحوه اجرا (در پوشه اصلی پروژه):
//   node check-install.mjs
//
// این اسکریپت بررسی می‌کند کدام فایل‌های لازم در پروژه شما وجود دارند.
// اگر همه ✅ بود یعنی نصب کامل است. اگر ⚠️ دیدید، آن فایل را از بسته کپی کنید.
// ============================================================================

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  // ── مسیرها (Routes) ─────────────────────────────────────────────
  "src/routes/admin.recitation-studio.tsx",
  "src/routes/admin.recitation-studio.$passageId.tsx",
  "src/routes/teacher.recitation.tsx",
  "src/routes/student.imitation.tsx",
  "src/routes/student.imitation.$assignmentId.tsx",
  "src/routes/parent.imitation.tsx",

  // ── دامنه و API ────────────────────────────────────────────────
  "src/features/recitation/domain/recitation-types.ts",
  "src/features/recitation/domain/recitation-scoring.ts",
  "src/features/recitation/api/recitation-admin-api.ts",
  "src/features/recitation/api/recitation-teacher-api.ts",
  "src/features/recitation/api/recitation-student-api.ts",
  "src/features/recitation/api/recitation-parent-api.ts",

  // ── پردازش صوت (فاز 21B) ───────────────────────────────────────
  "src/features/recitation/dsp/pitch-yin.ts",
  "src/features/recitation/dsp/analysis-pipeline.ts",

  // ── سایدبار ────────────────────────────────────────────────────
  "src/components/app-sidebar.tsx",
];

// محتوای مورد انتظار در چند فایل کلیدی (تا مطمئن شویم نسخه قدیمی نیست)
const contentChecks = [
  {
    file: "src/routes/admin.recitation-studio.$passageId.tsx",
    mustContain: ["runBrowserAnalysis", "AnalyzeButton", "type=\"file\""],
    mustNotContain: ["smart-recitation", "faraz"],
  },
  {
    file: "src/components/app-sidebar.tsx",
    mustContain: ["/admin/recitation-studio", "/student/imitation", "/teacher/recitation", "/parent/imitation"],
    mustNotContain: ["/admin/smart-recitation", "/student/challenge"],
  },
  {
    file: "src/features/recitation/api/recitation-admin-api.ts",
    mustContain: ["runBrowserAnalysis", "recitation-audio"],
    mustNotContain: ["faraz", "smart-recitation"],
  },
];

console.log("══════════════════════════════════════════════════");
console.log("  بررسی نصب ماژول چالش تقلید (Phase 21A/21B)");
console.log("══════════════════════════════════════════════════\n");

let ok = 0;
let warn = 0;

for (const file of requiredFiles) {
  const full = join(process.cwd(), file);
  if (existsSync(full)) {
    console.log(`  ✅ ${file}`);
    ok++;
  } else {
    console.log(`  ❌ ${file}  ← پیدا نشد! از بسته کپی کنید`);
    warn++;
  }
}

console.log("\n── بررسی محتوای فایل‌های کلیدی ──\n");

for (const check of contentChecks) {
  const full = join(process.cwd(), check.file);
  if (!existsSync(full)) {
    console.log(`  ❌ ${check.file} وجود ندارد`);
    warn++;
    continue;
  }
  const src = readFileSync(full, "utf8");
  const missing = check.mustContain.filter((c) => !src.includes(c));
  const forbidden = check.mustNotContain.filter((c) => src.includes(c));
  if (missing.length === 0 && forbidden.length === 0) {
    console.log(`  ✅ ${check.file} — نسخه درست است`);
    ok++;
  } else {
    console.log(`  ⚠️  ${check.file}:`);
    if (missing.length) console.log(`      فاقد: ${missing.join(", ")}`);
    if (forbidden.length) console.log(`      حاوی نسخه قدیمی: ${forbidden.join(", ")} ← باید جایگزین شود`);
    warn++;
  }
}

console.log("\n══════════════════════════════════════════════════");
console.log(`  نتیجه: ${ok} مورد سالم | ${warn} مورد نیاز به توجه`);
console.log("══════════════════════════════════════════════════\n");

if (warn > 0) {
  console.log("👉 فایل‌های ❌/⚠️ را از بسته phase21a-package.zip کپی و جایگزین کنید،");
  console.log("   سپس ترمینال را ببندید و دوباره npm run dev بزنید.");
} else {
  console.log("🎉 همه فایل‌ها سر جای خودشان هستند. برنامه را ری‌استارت کنید:");
  console.log("   Ctrl+C  →  npm run dev  →  Ctrl+Shift+R در مرورگر");
}
