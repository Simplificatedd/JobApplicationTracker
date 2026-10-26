import { normalizeApplicationStatus } from "../lib/domain";
import { migrateStageSnapshot } from "../lib/assessments";
import { migrateLegacyFollowUpSchedule } from "../lib/followUps";
import { normalizeStatusActivities } from "../lib/statusHistory";
import { TRACKER_DATA_VERSION, type StorageSnapshot } from "./StorageAdapter";

export function normalizeSnapshot(snapshot: StorageSnapshot): StorageSnapshot {
  if ((snapshot.dataVersion ?? 1) > TRACKER_DATA_VERSION)
    throw new Error(
      "This workspace uses a newer data format. Update the tracker before opening it.",
    );
  const hasLegacyOfferSemantics = (snapshot.dataVersion ?? 1) < 2;
  const defaultFollowUpPromptDays = snapshot.settings.defaultFollowUpPromptDays;

  return migrateStageSnapshot({
    ...snapshot,
    activities: normalizeStatusActivities(
      snapshot.activities,
      hasLegacyOfferSemantics,
    ),
    dataVersion: TRACKER_DATA_VERSION,
    applications: snapshot.applications.map((application) => {
      const migratedApplication = migrateLegacyFollowUpSchedule(
        application,
        defaultFollowUpPromptDays,
      );

      return {
        ...migratedApplication,
        status:
          hasLegacyOfferSemantics && application.status === "Offered"
            ? "Accepted"
            : normalizeApplicationStatus(application.status),
      };
    }),
    coverLetters: snapshot.coverLetters ?? [],
  });
}
