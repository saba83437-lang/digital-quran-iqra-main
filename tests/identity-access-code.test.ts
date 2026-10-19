/// <reference types="node" />

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const identityApi = source("src/features/identity/api/secure-identity-api.ts");
const studentUtils = source("src/lib/student-utils.ts");
const teacherUtils = source("src/lib/teacher-utils.ts");
const adminUsers = source("src/routes/admin.users.tsx");
const teacherStudents = source("src/routes/teacher.students.tsx");
const teacherHome = source("src/routes/teacher.index.tsx");
const reportsApi = source("src/features/reports/api/reports-api.ts");
const studentLessons = source("src/routes/student.lessons.tsx");

assert.match(identityApi, /secure_current_student_profile/);
assert.match(identityApi, /secure_current_teacher_profile/);
assert.match(identityApi, /secure_admin_students/);
assert.match(identityApi, /secure_admin_teachers/);
assert.match(identityApi, /secure_teacher_students/);
assert.doesNotMatch(identityApi, /\.from\(["']students["']\)/);
assert.doesNotMatch(identityApi, /\.from\(["']teachers["']\)/);
assert.match(studentUtils, /loadSecureCurrentStudentProfile/);
assert.match(teacherUtils, /loadSecureCurrentTeacherProfile/);
assert.match(adminUsers, /loadSecureAdminStudents/);
assert.match(adminUsers, /loadSecureAdminTeachers/);
assert.match(teacherStudents, /loadSecureTeacherStudents/);
assert.match(teacherHome, /loadSecureTeacherStudents/);
assert.match(reportsApi, /loadSecureAdminStudents/);
assert.doesNotMatch(studentLessons, /\.from\("students"\)\s*\.select\("\*"/s);
assert.doesNotMatch(studentLessons, /\.from\("teachers"\)\s*\.select\("\*"/s);

console.log("identity-access-code: 16 assertions passed");
