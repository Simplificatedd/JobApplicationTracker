import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deriveReminderNotifications } from "../lib/reminders";
import { snapshot, application } from "../test/assessmentFixtures";
const host = vi.hoisted(() => ({ value: undefined as Date | undefined, cleanup: undefined as (() => void) | undefined }));
vi.mock("react", () => ({
  useState(initial: () => Date) {
    host.value ??= initial();
    return [host.value, (value: Date) => { host.value = value; }];
  },
  useEffect(effect: () => () => void) { host.cleanup ??= effect(); },
}));
import { useReminderClock } from "./useReminderClock";
let page: EventTarget & { visibilityState: string };
let browser: EventTarget;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-30T03:59:00Z")); host.value = undefined; host.cleanup = undefined;
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  browser = Object.assign(new EventTarget(), { setInterval, clearInterval });
  vi.stubGlobal("document", page); vi.stubGlobal("window", browser);
});
afterEach(() => { host.cleanup?.(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("updates mounted reminder severity across a deadline without storage calls", () => {
  vi.setSystemTime(new Date(2026, 9, 30, 23, 59));
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  const data = snapshot({ applications: [{ ...application, status: "Offered", offerDeadline: new Date(2026, 9, 30, 12).toISOString() }] });
  const RenderNotices = () => deriveReminderNotifications({ ...data, now: useReminderClock() });
  expect(RenderNotices().find(n => n.type === "offer_deadline")?.severity).toBe("due_today");
  vi.advanceTimersByTime(120_000);
  expect(RenderNotices().find(n => n.type === "offer_deadline")?.severity).toBe("overdue"); expect(network).not.toHaveBeenCalled();
});
it("catches up on visibility/focus and removes timers/listeners on unmount", () => {
  const first = useReminderClock(); page.visibilityState = "hidden";
  vi.advanceTimersByTime(180_000); expect(host.value).toBe(first);
  page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange")); expect(host.value!.getTime()).toBe(Date.now());
  vi.setSystemTime(new Date("2026-10-31T00:00:00Z")); browser.dispatchEvent(new Event("focus")); expect(host.value!.getTime()).toBe(Date.now());
  host.cleanup!(); const last = host.value;
  vi.advanceTimersByTime(120_000); browser.dispatchEvent(new Event("focus")); page.dispatchEvent(new Event("visibilitychange"));
  expect(host.value).toBe(last); expect(vi.getTimerCount()).toBe(0);
});
