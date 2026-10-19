import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const api = source("src/features/messages/api/messages-api.ts");
const picker = source("src/features/messages/components/message-attachment-picker.tsx");
const attachments = source("src/features/messages/components/secure-message-attachments.tsx");
const admin = source("src/routes/admin.messages.tsx");
const teacher = source("src/routes/teacher.messages.tsx");
const student = source("src/routes/student.messages.tsx");
const parent = source("src/routes/parent.messages.tsx");

assert.match(api, /secure_send_message_v2/);
assert.match(api, /message-attachments/);
assert.match(api, /MAX_MESSAGE_FILES = 5/);
assert.match(api, /MAX_MESSAGE_FILE_SIZE = 10 \* 1024 \* 1024/);
assert.match(api, /secure_cancel_scheduled_message/);
assert.match(api, /createMessageAttachmentSignedUrl/);
assert.match(picker, /validateMessageFiles/);
assert.match(attachments, /createMessageAttachmentSignedUrl/);
assert.match(admin, /scheduleEnabled/);
assert.match(admin, /MessageAttachmentPicker/);
assert.match(admin, /cancelScheduledMessage/);
assert.match(teacher, /MessageAttachmentPicker/);
assert.match(student, /MessageAttachmentPicker/);
assert.match(parent, /MessageAttachmentPicker/);
assert.match(teacher, /SecureMessageAttachments/);
assert.match(student, /SecureMessageAttachments/);
assert.match(parent, /SecureMessageAttachments/);

console.log("message-features-code: 17 assertions passed");
