import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { changeAssessmentDate, changeDate, findVisibleNotificationsBell, NotificationBell, NotificationItem } from "./NotificationBell";
import { application } from "../test/assessmentFixtures";
import type { ReminderNotification } from "../lib/reminders";
const notice: ReminderNotification = {
  application, applicationId: application.id, interviewId: "interview", id: "notice",
  body: "", title: "Interview", group: "interviews", type: "interview", severity: "upcoming", sortAt: 0,
  dueAt: "2026-10-30T04:00:00Z",
};
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("rejects an impossible notification date without saving", () => {
  const alert = vi.fn(), update = vi.fn();
  vi.stubGlobal("window", { prompt: () => "2026-99-99T99:99", alert });
  changeDate(notice, update, update, "interview");
  expect(alert).toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
});
it("displays a local deadline and leaves a no-op edit unchanged", () => {
  vi.stubEnv("TZ", "Asia/Singapore");
  const prompt = vi.fn((_message: string, current: string) => current), update = vi.fn();
  vi.stubGlobal("window", { prompt, alert: vi.fn() });
  changeDate(notice, update, update, "offer_deadline");
  expect(prompt).toHaveBeenCalledWith(expect.any(String), "2026-10-30T12:00"); expect(update).not.toHaveBeenCalled();
});
it("saves a valid edited instant to the intended interview", () => {
  vi.stubEnv("TZ", "Asia/Singapore");
  const update = vi.fn(); vi.stubGlobal("window", { prompt: () => "2026-10-30T13:00", alert: vi.fn() });
  changeDate(notice, vi.fn(), update, "interview");
  expect(update).toHaveBeenCalledWith("interview", { dateTime: "2026-10-30T05:00:00.000Z" });
});


it("rejects rolled-over assessment dates and preserves unchanged assessment instants", () => {
  const update = vi.fn();
  vi.stubGlobal("window", { prompt: () => "2026-02-31T12:00", alert: vi.fn() });
  const assessment = { ...notice, assessmentId: "assessment", type: "assessment_deadline" as const };
  changeAssessmentDate(assessment, update); expect(update).not.toHaveBeenCalled();
  vi.stubGlobal("window", { prompt: (_message: string, current: string) => current, alert: vi.fn() });
  changeAssessmentDate(assessment, update); expect(update).not.toHaveBeenCalled();
});

it("marks the bell and finds the visible one after the phone panel closes at 768-1023px (#217)", () => {
  const html = renderToStaticMarkup(createElement(NotificationBell, {
    grouped: false, notifications: [], onDismiss: vi.fn(), onMarkOpened: vi.fn(), onOpenApplication: vi.fn(),
    onUpdateApplication: vi.fn(), onUpdateAssessment: vi.fn(), onUpdateInterview: vi.fn(),
  }));
  expect(html).toMatch(/<button[^>]*data-notifications-bell="true"[^>]*title="Notifications"/);
  const headerBell = { getClientRects: () => [] }, navigationBell = { getClientRects: () => [{}] };
  const querySelectorAll = vi.fn(() => [headerBell, navigationBell]);
  vi.stubGlobal("document", { querySelectorAll });
  expect(findVisibleNotificationsBell()).toBe(navigationBell);
  expect(querySelectorAll).toHaveBeenCalledWith("[data-notifications-bell]");
});

// #360: repeated card buttons say which reminder they act on; tooltips stay short.
it("adds the reminder title to each card action's screen-reader name (#360)", () => {
  const handlers = {
    onDismiss: vi.fn(), onOpenApplication: vi.fn(), onUpdateApplication: vi.fn(),
    onUpdateAssessment: vi.fn(), onUpdateInterview: vi.fn(),
  };
  const render = (notification: ReminderNotification) =>
    renderToStaticMarkup(createElement(NotificationItem, { notification, ...handlers }));
  const interview = render({ ...notice, title: "Scheduled stage 1 for ML Intern" });
  expect(interview).toContain('aria-label="Open application, Scheduled stage 1 for ML Intern"');
  expect(interview).toContain('aria-label="Change scheduled date and time, Scheduled stage 1 for ML Intern"');
  expect(interview).toContain('title="Open application"');
  // The spoken name keeps the visible word ("Time") so voice control can press it.
  const start = render({ ...notice, assessmentId: "assessment", title: "OA scheduled for ML Intern", type: "assessment_start" });
  expect(start).toMatch(/aria-label="Change assessment start time, OA scheduled for ML Intern"[^>]*>[\s\S]*?Time<\/button>/);
});
