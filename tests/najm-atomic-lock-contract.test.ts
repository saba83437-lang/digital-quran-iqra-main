/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const najm = source("src/lib/najm.ts");
const migration = source("supabase/migrations/20260902190000_najm_atomic_6hour_lock.sql");
const saveFunction = najm.slice(
  najm.indexOf("export async function saveNajmSession("),
  najm.indexOf(
    "/** بارگذاری جلسه‌ی ثبت‌شده",
    najm.indexOf("export async function saveNajmSession("),
  ),
);

assert.match(saveFunction, /supabase\.rpc\(\s*"secure_save_najm_session"/);
assert.match(saveFunction, /p_existing_session_id: existingSessionId \?\? null/);
assert.match(saveFunction, /p_records: recordRows/);
assert.doesNotMatch(saveFunction, /\.from\("najm_sessions"\)\s*\.update/);
assert.doesNotMatch(saveFunction, /\.from\("najm_session_records"\)\s*\.delete/);
assert.match(saveFunction, /secureError\.includes\("NAJM_EDIT_WINDOW_EXPIRED"\)/);
assert.match(migration, /create or replace function public\.secure_save_najm_session/i);
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path to 'public', 'pg_temp'/i);
assert.match(migration, /for update/i);
assert.match(migration, /NAJM_EDIT_WINDOW_EXPIRED/);
assert.match(migration, /created_at > now\(\) - interval '6 hours'/i);
assert.match(migration, /before insert or update or delete on public\.najm_session_records/i);
assert.match(migration, /before update or delete on public\.najm_sessions/i);
assert.match(migration, /delete from public\.najm_session_records/i);
assert.match(migration, /insert into public\.najm_session_records/i);
assert.match(migration, /jsonb_array_length\(p_records\)/i);
assert.match(migration, /teacher_can_access_student/i);
assert.match(migration, /student_row\.class_id = resolved_class_id/i);
assert.match(
  migration,
  /revoke all on function public\.secure_save_najm_session[\s\S]*from public, anon/i,
);
assert.match(
  migration,
  /grant execute on function public\.secure_save_najm_session[\s\S]*to authenticated/i,
);

console.log("najm-atomic-lock-contract: 21 assertions passed");
