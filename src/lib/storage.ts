import { uploadPrivateAssignmentFile } from "@/features/assignments/storage/assignment-storage";

export interface UploadedFile {
  /** مسیر خصوصی؛ برای سازگاری نام url حفظ شده ولی Public URL نیست. */
  url: string;
  path: string;
  name: string;
}

/** آپلود خصوصی فایل تکلیف؛ مقدار ذخیره‌شده در DB فقط path است. */
export async function uploadAssignmentFile(
  file: File,
  folder: string,
): Promise<UploadedFile | null> {
  try {
    const path = await uploadPrivateAssignmentFile(file, folder, file.name);
    return { url: path, path, name: file.name };
  } catch (error) {
    console.error("uploadAssignmentFile error:", error);
    return null;
  }
}

/** آپلود خصوصی صدای تکلیف؛ مقدار ذخیره‌شده در DB فقط path است. */
export async function uploadAssignmentAudio(
  blob: Blob,
  folder: string,
): Promise<UploadedFile | null> {
  try {
    const path = await uploadPrivateAssignmentFile(blob, folder, "recording.webm");
    return { url: path, path, name: "recording.webm" };
  } catch (error) {
    console.error("uploadAssignmentAudio error:", error);
    return null;
  }
}
