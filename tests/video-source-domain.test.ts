import assert from "node:assert/strict";
import {
  aparatEmbedUrl,
  extractAparatHash,
  isDirectMediaUrl,
  youtubeEmbedUrl,
} from "../src/features/videos/progress/video-source.js";

assert.equal(extractAparatHash("https://www.aparat.com/v/AbC12"), "AbC12");
assert.equal(extractAparatHash("https://www.aparat.com/embed/XyZ90"), "XyZ90");
assert.equal(
  extractAparatHash("https://www.aparat.com/video/video/embed/videohash/QwE77/vt/frame"),
  "QwE77",
);
assert.equal(extractAparatHash("https://example.com/video.mp4"), null);
assert.equal(
  aparatEmbedUrl("https://www.aparat.com/v/AbC12"),
  "https://www.aparat.com/video/video/embed/videohash/AbC12/vt/frame",
);
assert.equal(
  youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ"),
  "https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1",
);
assert.equal(isDirectMediaUrl("https://cdn.example/video.mp4?token=x"), true);
assert.equal(isDirectMediaUrl("https://cdn.example/embed/12"), false);

console.log("video-source-domain: 8 assertions passed");
