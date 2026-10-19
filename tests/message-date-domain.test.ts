import assert from "node:assert/strict";
import {
  compareMessageDisplayTime,
  formatIranianMessageDate,
  formatIranianMessageDateTime,
  messageDisplayTimestamp,
} from "../src/features/messages/domain/message-date.js";

const delivered = {
  delivery_status: "delivered",
  created_at: "2026-07-31T01:00:00.000Z",
  delivered_at: "2026-07-31T02:00:00.000Z",
  date: "2026/07/31",
};
assert.equal(messageDisplayTimestamp(delivered), Date.parse("2026-07-31T02:00:00.000Z"));
assert.equal(
  messageDisplayTimestamp({
    delivery_status: "scheduled",
    created_at: "2026-07-31T01:00:00.000Z",
    scheduled_at: "2026-07-31T03:00:00.000Z",
  }),
  Date.parse("2026-07-31T03:00:00.000Z"),
);
assert.equal(
  messageDisplayTimestamp({
    delivery_status: "cancelled",
    created_at: "2026-07-31T01:00:00.000Z",
    cancelled_at: "2026-07-31T04:00:00.000Z",
  }),
  Date.parse("2026-07-31T04:00:00.000Z"),
);
const formatted = formatIranianMessageDateTime(delivered);
assert.match(formatted, /۱۴۰۵/);
assert.doesNotMatch(formatted, /2026/);
assert.match(formatIranianMessageDate(delivered), /۱۴۰۵/);
assert.equal(
  compareMessageDisplayTime(delivered, {
    delivery_status: "delivered",
    delivered_at: "2026-07-31T01:30:00.000Z",
  }) > 0,
  true,
);
assert.notEqual(messageDisplayTimestamp({ date: "2026/07/31" }), null);
assert.equal(formatIranianMessageDateTime({}), "—");

console.log("message-date-domain: 9 assertions passed");
