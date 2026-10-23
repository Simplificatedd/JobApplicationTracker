import { describe, expect, it } from "vitest";




import { application } from "../../test/assessmentFixtures";
import { applicationDraftToUpdate } from "./ApplicationDetailPanel";

// Build the form's public draft shape from an unchanged submission, retaining
// display-only date conversions and upload fields independently of persisted data.
function draft() {
  return {
    ...application, company: application.company, jobTitle: application.jobTitle,
    location: "", source: "", applicationUrl: "", dateApplied: "", roleStartDate: "", roleEndDate: "",
    followUpDate: "", followUpAutoResetEnabled: false, followUpPromptDays: "",
    offerDeadline: "", resumeId: "", resumeUploadName: "", resumeUploadVersion: "",
    coverLetterId: "", coverLetterUploadName: "", coverLetterUploadVersion: "",
    coverLetterVersion: "", salary: "", notes: "",
  };
}

describe("application edit intent", () => {
  it("does not resubmit unchanged fields from an old draft", () => {
    expect(applicationDraftToUpdate(draft(), application)).toEqual({});
    expect(applicationDraftToUpdate({ ...draft(), notes: "New notes" }, application)).toEqual({ notes: "New notes" });
  });

  it("retains explicit clearing while preserving unchanged imported whitespace", () => {
    const original = { ...application, company: " Imported company ", notes: "Original notes" };
    expect(applicationDraftToUpdate({ ...draft(), company: original.company, notes: "" }, original)).toEqual({ notes: undefined });
  });

  it("compares local date input with the original displayed value, not the ISO timestamp", () => {
    const original = { ...application, status: "Offered" as const, offerDeadline: "2026-10-23T04:00:00.000Z" };
    const time = new Date(original.offerDeadline);
    const pad = (value: number) => String(value).padStart(2, "0");
    const local = `${time.getFullYear()}-${pad(time.getMonth()+1)}-${pad(time.getDate())}T${pad(time.getHours())}:${pad(time.getMinutes())}`;
    expect(applicationDraftToUpdate({ ...draft(), status: "Offered", offerDeadline: local }, original)).toEqual({});
  });

  it("includes document unassignment as explicit changed fields", () => {
    expect(applicationDraftToUpdate(draft(), { ...application, resumeId: "r", coverLetterId: "c" })).toEqual({ resumeId: undefined, coverLetterId: undefined });
  });
});
