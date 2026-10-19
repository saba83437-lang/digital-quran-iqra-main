import { createClient } from "@supabase/supabase-js";

const fallbackUrl = "https://htfgctazuosjrakkardp.supabase.co";
const fallbackPublishableKey = "sb_publishable_pdOrnZS7j3l-KPcc8Ax4pQ_ppTX_29j";

/**
 * کلید publishable ذاتاً برای استفاده در مرورگر است؛ امنیت واقعی توسط
 * Supabase Auth و سیاست‌های RLS برقرار می‌شود. کلید secret/service_role
 * هرگز نباید در فایل‌های VITE_* یا کد سمت مرورگر قرار بگیرد.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || fallbackUrl;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackPublishableKey;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
