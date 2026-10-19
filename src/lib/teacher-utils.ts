import { getSession } from "./auth";
import { loadSecureCurrentTeacherProfile } from "@/features/identity/api/secure-identity-api";

export interface CurrentTeacher {
  id: string;
  name: string;
  specialty: string;
  phone: string;
}

export async function getCurrentTeacher(): Promise<CurrentTeacher | null> {
  const session = getSession();
  if (!session || session.role !== "teacher") return null;

  try {
    // شناسه و نقش سمت سرور از auth.uid تعیین می‌شوند؛ client نمی‌تواند
    // پروفایل استاد دیگری را به RPC تحمیل کند.
    const data = await loadSecureCurrentTeacherProfile(session.entityId);
    if (!data || String(data.id) !== String(session.entityId)) return null;
    return {
      id: String(data.id),
      name: String(data.name ?? ""),
      specialty: String(data.specialty ?? ""),
      phone: String(data.phone ?? ""),
    };
  } catch (error) {
    console.warn("[teacher-utils] خطا در دریافت پروفایل امن استاد", error);
    return null;
  }
}
