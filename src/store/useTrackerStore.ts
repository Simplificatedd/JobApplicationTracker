import { useEffect, useState } from "react";
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Application,
  ApplicationContact,
  ApplicationStatus,
  Interview,
  ResumeMetadata,
} from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import {
  createDateStamp,
  createId,
  createTimestamp,
  DEFAULT_ANALYTICS_SETTINGS,
  DEFAULT_NOTIFICATION_STATE,
  DEFAULT_USER_SETTINGS,
} from "../lib/domain";
import { indexedDbStorageAdapter } from "../storage/indexedDbAdapter";

export type ApplicationInput = Omit<
  Application,
  "id" | "contactsCount" | "createdAt" | "updatedAt" | "archivedAt"
>;

export type ApplicationUpdate = Partial<
  Omit<Application, "id" | "contactsCount" | "createdAt" | "updatedAt">
>;

export type ContactInput = Omit<
  ApplicationContact,
  "id" | "createdAt" | "updatedAt"
>;

export interface TrackerStore {
  activities: Activity[];
  analyticsSettings: AnalyticsSettings;
  applications: Application[];
  contacts: ApplicationContact[];
  interviews: Interview[];
  isStorageLoading: boolean;
  notificationState: NotificationState;
  resumes: ResumeMetadata[];
  retryStorage: () => void;
  settings: UserSettings;
  storageError: string | null;
  addContact: (input: ContactInput) => ApplicationContact;
  appendActivity: (
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) => void;
  archiveApplication: (id: string) => void;
  createApplication: (input: ApplicationInput) => Application;
  deleteApplication: (id: string) => void;
  deleteContact: (id: string) => void;
  resetSettings: () => void;
  restoreApplication: (id: string) => void;
  updateApplication: (id: string, input: ApplicationUpdate) => void;
  updateContact: (id: string, input: Partial<ContactInput>) => void;
  updateSettings: (input: Partial<UserSettings>) => void;
}

export function useTrackerStore(): TrackerStore {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<ApplicationContact[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [isStorageLoading, setIsStorageLoading] = useState(true);
  const [resumes, setResumes] = useState<ResumeMetadata[]>([]);
  const [settings, setSettings] =
    useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [analyticsSettings, setAnalyticsSettings] = useState<AnalyticsSettings>(
    DEFAULT_ANALYTICS_SETTINGS,
  );
  const [notificationState, setNotificationState] = useState<NotificationState>(
    DEFAULT_NOTIFICATION_STATE,
  );
  const [storageError, setStorageError] = useState<string | null>(null);
  const [storageRetryKey, setStorageRetryKey] = useState(0);

  useEffect(() => {
    let isActive = true;

    setIsStorageLoading(true);
    setStorageError(null);

    indexedDbStorageAdapter
      .initialize()
      .then((snapshot) => {
        if (!isActive) {
          return;
        }

        setActivities(sortActivities(snapshot.activities));
        setAnalyticsSettings(snapshot.analyticsSettings);
        setApplications(
          withContactCounts(snapshot.applications, snapshot.contacts),
        );
        setContacts(snapshot.contacts);
        setInterviews(snapshot.interviews);
        setNotificationState(snapshot.notificationState);
        setResumes(snapshot.resumes);
        setSettings(snapshot.settings);
        setIsStorageLoading(false);
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setStorageError(getStorageErrorMessage(error));
        setIsStorageLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [storageRetryKey]);

  useEffect(() => {
    if (isStorageLoading || storageError) {
      return;
    }

    const now = new Date();
    const transitionedApplications = applications.filter(
      (application) =>
        application.status === "Just Applied" &&
        application.dateApplied &&
        daysSince(application.dateApplied, now) >=
          (application.followUpPromptDays ?? settings.defaultFollowUpPromptDays),
    );

    if (transitionedApplications.length === 0) {
      return;
    }

    const updatedAt = createTimestamp(now);
    const transitionedIds = new Set(
      transitionedApplications.map((application) => application.id),
    );
    const updatedApplications = applications.map((application) =>
      transitionedIds.has(application.id)
        ? {
            ...application,
            status: "Awaiting Response" as ApplicationStatus,
            updatedAt,
          }
        : application,
    );
    const newActivities = transitionedApplications.map((application) =>
      createActivity(
        application.id,
        "status_changed",
        "Status changed to Awaiting Response after the follow-up window elapsed.",
        updatedAt,
      ),
    );

    setApplications(updatedApplications);
    setActivities((current) => sortActivities([...newActivities, ...current]));
    persistAll([
      ...updatedApplications
        .filter((application) => transitionedIds.has(application.id))
        .map((application) =>
          indexedDbStorageAdapter.updateApplication(application),
        ),
      ...newActivities.map((activity) =>
        indexedDbStorageAdapter.appendActivity(activity),
      ),
    ]);
  }, [
    applications,
    isStorageLoading,
    settings.defaultFollowUpPromptDays,
    storageError,
  ]);

  function retryStorage() {
    setStorageRetryKey((current) => current + 1);
  }

  function appendActivity(
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) {
    const activity = createActivity(applicationId, type, message);

    setActivities((current) => sortActivities([activity, ...current]));
    persist(indexedDbStorageAdapter.appendActivity(activity));
  }

  function createApplication(input: ApplicationInput) {
    const createdAt = createTimestamp();
    const application: Application = {
      ...input,
      id: createId("app"),
      dateApplied: input.dateApplied || createDateStamp(),
      status: input.status || "Just Applied",
      contactsCount: 0,
      createdAt,
      updatedAt: createdAt,
    };
    const createdActivity = createActivity(
      application.id,
      "created",
      `Created application for ${application.jobTitle}.`,
      createdAt,
    );
    const interview = toInterviewRecord(application, undefined, createdAt);

    setApplications((current) => [application, ...current]);
    setActivities((current) => sortActivities([createdActivity, ...current]));

    if (interview) {
      setInterviews((current) => [interview, ...current]);
    }

    persistAll([
      indexedDbStorageAdapter.createApplication(application),
      indexedDbStorageAdapter.appendActivity(createdActivity),
      ...(interview ? [indexedDbStorageAdapter.saveInterview(interview)] : []),
    ]);

    return application;
  }

  function updateApplication(id: string, input: ApplicationUpdate) {
    const currentApplication = applications.find(
      (application) => application.id === id,
    );

    if (!currentApplication) {
      return;
    }

    const updatedAt = createTimestamp();
    const updatedApplication: Application = {
      ...currentApplication,
      ...input,
      updatedAt,
    };
    const storageWrites: Promise<void>[] = [
      indexedDbStorageAdapter.updateApplication(updatedApplication),
    ];
    const newActivities = buildApplicationUpdateActivities(
      currentApplication,
      updatedApplication,
      input,
      updatedAt,
    );

    setApplications((current) =>
      current.map((application) =>
        application.id === id ? updatedApplication : application,
      ),
    );

    if (hasInterviewChange(input)) {
      const existingInterview = interviews.find(
        (interview) => interview.applicationId === id,
      );
      const updatedInterview = toInterviewRecord(
        updatedApplication,
        existingInterview,
        updatedAt,
      );

      if (updatedInterview) {
        setInterviews((current) => [
          updatedInterview,
          ...current.filter((interview) => interview.applicationId !== id),
        ]);
        storageWrites.push(indexedDbStorageAdapter.saveInterview(updatedInterview));
      } else if (existingInterview) {
        setInterviews((current) =>
          current.filter((interview) => interview.applicationId !== id),
        );
        storageWrites.push(
          indexedDbStorageAdapter.deleteInterview(existingInterview.id),
        );
      }
    }

    if (newActivities.length > 0) {
      setActivities((current) => sortActivities([...newActivities, ...current]));
      storageWrites.push(
        ...newActivities.map((activity) =>
          indexedDbStorageAdapter.appendActivity(activity),
        ),
      );
    }

    persistAll(storageWrites);
  }

  function archiveApplication(id: string) {
    const application = applications.find((candidate) => candidate.id === id);

    if (!application) {
      return;
    }

    const updatedAt = createTimestamp();
    const archivedApplication = {
      ...application,
      archivedAt: updatedAt,
      updatedAt,
    };
    const activity = createActivity(id, "archived", "Archived application.", updatedAt);

    setApplications((current) =>
      current.map((candidate) =>
        candidate.id === id ? archivedApplication : candidate,
      ),
    );
    setActivities((current) => sortActivities([activity, ...current]));
    persistAll([
      indexedDbStorageAdapter.archiveApplication(archivedApplication),
      indexedDbStorageAdapter.appendActivity(activity),
    ]);
  }

  function restoreApplication(id: string) {
    const application = applications.find((candidate) => candidate.id === id);

    if (!application) {
      return;
    }

    const updatedAt = createTimestamp();
    const restoredApplication = {
      ...application,
      archivedAt: undefined,
      updatedAt,
    };
    const activity = createActivity(id, "restored", "Restored application.", updatedAt);

    setApplications((current) =>
      current.map((candidate) =>
        candidate.id === id ? restoredApplication : candidate,
      ),
    );
    setActivities((current) => sortActivities([activity, ...current]));
    persistAll([
      indexedDbStorageAdapter.restoreApplication(restoredApplication),
      indexedDbStorageAdapter.appendActivity(activity),
    ]);
  }

  function deleteApplication(id: string) {
    setApplications((current) =>
      current.filter((application) => application.id !== id),
    );
    setContacts((current) =>
      current.filter((contact) => contact.applicationId !== id),
    );
    setActivities((current) =>
      current.filter((activity) => activity.applicationId !== id),
    );
    setInterviews((current) =>
      current.filter((interview) => interview.applicationId !== id),
    );
    persist(indexedDbStorageAdapter.deleteApplication(id));
  }

  function addContact(input: ContactInput) {
    const createdAt = createTimestamp();
    const contact: ApplicationContact = {
      ...input,
      id: createId("contact"),
      createdAt,
      updatedAt: createdAt,
    };
    const activity = createActivity(
      input.applicationId,
      "contact_created",
      `Added contact ${contact.name}.`,
      createdAt,
    );
    const updatedApplications = applications.map((application) =>
      application.id === input.applicationId
        ? {
            ...application,
            contactsCount: application.contactsCount + 1,
            updatedAt: createdAt,
          }
        : application,
    );
    const updatedApplication = updatedApplications.find(
      (application) => application.id === input.applicationId,
    );

    setContacts((current) => [contact, ...current]);
    setApplications(updatedApplications);
    setActivities((current) => sortActivities([activity, ...current]));
    persistAll([
      indexedDbStorageAdapter.createContact(contact),
      indexedDbStorageAdapter.appendActivity(activity),
      ...(updatedApplication
        ? [indexedDbStorageAdapter.updateApplication(updatedApplication)]
        : []),
    ]);

    return contact;
  }

  function updateContact(id: string, input: Partial<ContactInput>) {
    const contact = contacts.find((candidate) => candidate.id === id);

    if (!contact) {
      return;
    }

    const updatedAt = createTimestamp();
    const updatedContact = {
      ...contact,
      ...input,
      updatedAt,
    };
    const activity = createActivity(
      contact.applicationId,
      "contact_updated",
      `Updated contact ${updatedContact.name}.`,
      updatedAt,
    );

    setContacts((current) =>
      current.map((candidate) => (candidate.id === id ? updatedContact : candidate)),
    );
    setActivities((current) => sortActivities([activity, ...current]));
    persistAll([
      indexedDbStorageAdapter.updateContact(updatedContact),
      indexedDbStorageAdapter.appendActivity(activity),
    ]);
  }

  function deleteContact(id: string) {
    const contact = contacts.find((candidate) => candidate.id === id);

    if (!contact) {
      return;
    }

    const updatedAt = createTimestamp();
    const activity = createActivity(
      contact.applicationId,
      "contact_deleted",
      `Deleted contact ${contact.name}.`,
      updatedAt,
    );
    const updatedApplications = applications.map((application) =>
      application.id === contact.applicationId
        ? {
            ...application,
            contactsCount: Math.max(0, application.contactsCount - 1),
            updatedAt,
          }
        : application,
    );
    const updatedApplication = updatedApplications.find(
      (application) => application.id === contact.applicationId,
    );

    setContacts((current) => current.filter((candidate) => candidate.id !== id));
    setApplications(updatedApplications);
    setActivities((current) => sortActivities([activity, ...current]));
    persistAll([
      indexedDbStorageAdapter.deleteContact(id),
      indexedDbStorageAdapter.appendActivity(activity),
      ...(updatedApplication
        ? [indexedDbStorageAdapter.updateApplication(updatedApplication)]
        : []),
    ]);
  }

  function updateSettings(input: Partial<UserSettings>) {
    const updatedSettings = {
      ...settings,
      ...input,
    };

    setSettings(updatedSettings);
    persist(indexedDbStorageAdapter.saveSettings(updatedSettings));
  }

  function resetSettings() {
    setSettings(DEFAULT_USER_SETTINGS);
    persist(indexedDbStorageAdapter.resetSettings());
  }

  function persist(promise: Promise<unknown>) {
    void promise.catch((error: unknown) => {
      setStorageError(getStorageErrorMessage(error));
    });
  }

  function persistAll(promises: Promise<unknown>[]) {
    persist(Promise.all(promises));
  }

  return {
    activities,
    analyticsSettings,
    applications,
    contacts,
    interviews,
    isStorageLoading,
    notificationState,
    resumes,
    retryStorage,
    settings,
    storageError,
    addContact,
    appendActivity,
    archiveApplication,
    createApplication,
    deleteApplication,
    deleteContact,
    resetSettings,
    restoreApplication,
    updateApplication,
    updateContact,
    updateSettings,
  };
}

function createActivity(
  applicationId: string,
  type: Activity["type"],
  message: string,
  createdAt = createTimestamp(),
): Activity {
  return {
    id: createId("activity"),
    applicationId,
    type,
    message,
    createdAt,
  };
}

function sortActivities(activities: Activity[]) {
  return [...activities].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

function withContactCounts(
  applications: Application[],
  contacts: ApplicationContact[],
) {
  return applications.map((application) => ({
    ...application,
    contactsCount: contacts.filter(
      (contact) => contact.applicationId === application.id,
    ).length,
  }));
}

function buildApplicationUpdateActivities(
  previous: Application,
  next: Application,
  input: ApplicationUpdate,
  createdAt: string,
) {
  const activities: Activity[] = [];

  if (previous.status !== next.status) {
    activities.push(
      createActivity(
        next.id,
        "status_changed",
        `Status changed to ${next.status}.`,
        createdAt,
      ),
    );
  }

  if (
    previous.followUpDate !== next.followUpDate ||
    previous.followUpNeeded !== next.followUpNeeded ||
    previous.followUpPromptDays !== next.followUpPromptDays
  ) {
    activities.push(
      createActivity(next.id, "updated", "Updated follow-up details.", createdAt),
    );
  }

  if (hasInterviewChange(input)) {
    activities.push(
      createActivity(next.id, "updated", "Updated interview details.", createdAt),
    );
  }

  return activities;
}

function hasInterviewChange(input: ApplicationUpdate) {
  return [
    "interviewDateTime",
    "interviewDeadline",
    "interviewLocation",
    "interviewMeetingUrl",
    "interviewMode",
    "interviewPlatform",
    "interviewProctored",
    "interviewRound",
    "interviewType",
  ].some((key) => key in input);
}

function toInterviewRecord(
  application: Application,
  existing: Interview | undefined,
  timestamp: string,
) {
  if (!application.interviewDateTime) {
    return null;
  }

  return {
    id: existing?.id ?? createId("interview"),
    applicationId: application.id,
    dateTime: application.interviewDateTime,
    round: application.interviewRound,
    type: application.interviewType ?? "unknown",
    mode: application.interviewMode ?? "other",
    location: application.interviewLocation,
    meetingUrl: application.interviewMeetingUrl,
    platform: application.interviewPlatform,
    proctored: application.interviewProctored,
    deadline: application.interviewDeadline,
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies Interview;
}

function getStorageErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Local storage is unavailable right now.";
}

function daysSince(dateStamp: string, now: Date) {
  const date = new Date(dateStamp);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((now.getTime() - date.getTime()) / millisecondsPerDay);
}
