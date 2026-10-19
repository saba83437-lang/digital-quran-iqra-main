// ============================================================================
// Smart Recitation — Microphone Recorder (فاز 21C)
// ----------------------------------------------------------------------------
// ضبط صدای میکروفون با MediaRecorder + سطح‌سنج زنده (برای نمایش به کاربر)
// خروجی: Blob آماده برای تحلیل + متوقف‌سازی امن منابع
// ============================================================================

export interface MicRecorderStart {
  recorder: MediaRecorder;
  stream: MediaStream;
  audioCtx: AudioContext | null;
  analyser: AnalyserNode | null;
}

export class MicBusyError extends Error {
  constructor() {
    super("میکروفون در حال استفاده است یا در دسترس نیست");
    this.name = "MicBusyError";
  }
}

export class MicPermissionError extends Error {
  constructor() {
    super(
      "اجازه دسترسی به میکروفون داده نشد. لطفاً در تنظیمات مرورگر (کنار آدرس سایت) اجازه میکروفون را فعال کن.",
    );
    this.name = "MicPermissionError";
  }
}

/** انتخاب بهترین فرمت پشتیبانی‌شده توسط مرورگر */
function pickMimeType(): string | undefined {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      // نادیده بگیر و بعدی را امتحان کن
    }
  }
  return undefined;
}

/**
 * شروع ضبط میکروفون
 * @returns ابزارهای ضبط — حتماً بعد از پایان stopMic را صدا بزن
 */
export async function startMic(): Promise<MicRecorderStart> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicBusyError();
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (e) {
    const err = e as DOMException;
    if (err?.name === "NotAllowedError" || err?.name === "SecurityError") {
      throw new MicPermissionError();
    }
    throw new MicBusyError();
  }

  const mimeType = pickMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);

  // سطح‌سنج زنده (اختیاری — اگر AudioContext ساخته نشد، بدون آن ادامه می‌دهیم)
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      audioCtx = new Ctx();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      // 4096 نمونه (~۹۳ میلی‌ثانیه) — برای تشخیص دقیق نت با YIN، مخصوصاً صداهای بمِ تلاوت
      analyser.fftSize = 4096;
      src.connect(analyser);
    }
  } catch {
    audioCtx = null;
    analyser = null;
  }

  return { recorder, stream, audioCtx, analyser };
}

/** سطح لحظه‌ای صدا (۰..۱) از روی analyser — برای نوار نمایش */
export function readMicLevel(analyser: AnalyserNode | null, buffer: Uint8Array): number {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    const v = (buffer[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / buffer.length);
  // تقویت نمایش برای حس بهتر
  return Math.min(1, rms * 3.2);
}

/** توقف ضبط و دریافت فایل صوتی */
export function stopMic(handle: MicRecorderStart): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { recorder, stream, audioCtx } = handle;
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => {
      cleanup();
      reject(new Error("خطا در ضبط صدا"));
    };
    recorder.onstop = () => {
      const type = recorder.mimeType || "audio/webm";
      cleanup();
      resolve(new Blob(chunks, { type }));
    };

    const cleanup = () => {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      try {
        if (audioCtx && audioCtx.state !== "closed") void audioCtx.close();
      } catch {
        /* ignore */
      }
    };

    try {
      if (recorder.state === "recording") {
        recorder.stop();
      } else {
        // ضبط فعال نیست — فایل خالی برگردان (caller آن را نادیده می‌گیرد)
        cleanup();
        resolve(new Blob([], { type: recorder.mimeType || "audio/webm" }));
      }
    } catch {
      cleanup();
      reject(new Error("توقف ضبط ناموفق بود"));
    }
  });
}

/** لغو ضبط بدون تحویل فایل */
export function cancelMic(handle: MicRecorderStart): void {
  try {
    handle.recorder.ondataavailable = null;
    handle.recorder.onstop = null;
    handle.recorder.onerror = null;
    if (handle.recorder.state === "recording") handle.recorder.stop();
  } catch {
    /* ignore */
  }
  try {
    handle.stream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  try {
    if (handle.audioCtx && handle.audioCtx.state !== "closed") void handle.audioCtx.close();
  } catch {
    /* ignore */
  }
}
