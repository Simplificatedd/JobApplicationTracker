import { describe, expect, it } from "vitest";
import { createApplicationsCsv, createFullBackupFile, parseBackupFile } from "./backups";
import { normalizeUserSettings, DEFAULT_USER_SETTINGS } from "./domain";
import { populatedBackup } from "../test/backupFixtures";
import { application } from "../test/assessmentFixtures";

it("normalizes day settings into values that round-trip through the full backup contract", async () => {
  const backup = populatedBackup();
  backup.snapshot.settings = normalizeUserSettings({ defaultFollowUpPromptDays: 1.5, dueSoonDays: 2.9 });
  const parsed = await parseBackupFile(await createFullBackupFile(backup));
  expect(parsed.snapshot.settings).toMatchObject({ defaultFollowUpPromptDays: 1, dueSoonDays: 2 });
  expect(parsed.resumeFiles).toEqual(backup.resumeFiles);
});
it.each([NaN, Infinity, -Infinity, Number.MAX_VALUE])("falls back for an unsafe day value %s", value => {
  expect(normalizeUserSettings({ dueSoonDays: value }).dueSoonDays).toBe(DEFAULT_USER_SETTINGS.dueSoonDays);
});
it("clamps negative/zero days while preserving valid whole days", () => {
  expect(normalizeUserSettings({ dueSoonDays: -1, defaultFollowUpPromptDays: 0 })).toMatchObject({ dueSoonDays: 1, defaultFollowUpPromptDays: 1 });
  expect(normalizeUserSettings({ dueSoonDays: 14 }).dueSoonDays).toBe(14);
});

describe("spreadsheet-view CSV text", () => {
  it.each(["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "＝1+1", "\u200B=1+1"])("quotes and prefixes formula-like text %j", async company => {
    const record = { ...application, company };
    const csv = await createApplicationsCsv({ applications: [record], resumes: [] }).text();
    expect(csv).toContain(`\n"\t${company.replace(/"/g, '""')}",`);
    expect(record.company).toBe(company);
  });
  it("keeps quotes, delimiters, newlines, numeric/date columns and benign text intact", async () => {
    const csv = await createApplicationsCsv({ applications: [{ ...application, company: 'ACME, "Labs"\nOffice', followUpPromptDays: 7, dateApplied: "2026-10-31" }], resumes: [] }).text();
    expect(csv).toContain('"ACME, ""Labs""\nOffice"'); expect(csv).toContain(",2026-10-31,"); expect(csv).toContain(",7,");
  });
  it("leaves formula-like source text lossless in JSON backups", async () => {
    const backup = populatedBackup(); backup.snapshot.applications[0].company = "=1+1";
    const parsed = await parseBackupFile(await createFullBackupFile(backup)); expect(parsed.snapshot.applications[0].company).toBe("=1+1");
  });
});
