import assert from "node:assert/strict";

import { storageObjectPath } from "../src/features/storage/storage-reference.js";

assert.equal(storageObjectPath("videos", "lesson/file.mp4"), "lesson/file.mp4");
assert.equal(storageObjectPath("videos", "/lesson/file.mp4"), "lesson/file.mp4");
assert.equal(
  storageObjectPath(
    "videos",
    "https://example.supabase.co/storage/v1/object/public/videos/lesson/file.mp4",
  ),
  "lesson/file.mp4",
);
assert.equal(
  storageObjectPath(
    "videos",
    "https://example.supabase.co/storage/v1/object/sign/videos/a%20b.mp4?token=x",
  ),
  "a b.mp4",
);
assert.equal(storageObjectPath("videos", "https://youtube.com/watch?v=1"), null);
assert.equal(storageObjectPath("videos", null), null);
assert.equal(storageObjectPath("najm-posters", "terms/a.png"), "terms/a.png");
assert.equal(
  storageObjectPath(
    "najm-posters",
    "https://example.supabase.co/storage/v1/object/public/najm-posters/terms/a.png",
  ),
  "terms/a.png",
);
assert.equal(
  storageObjectPath("achievement-hall-posters", "https://external.example/poster.png"),
  null,
);
assert.equal(storageObjectPath("videos", ""), null);

console.log("private-storage-reference: 10 assertions passed");
