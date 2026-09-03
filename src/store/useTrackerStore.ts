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
import {
  mockActivities,
  mockApplications,
  mockContacts,
  mockInterviews,
  mockResumes,
} from "../lib/mockData";

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
  applications: Application[];
  contacts: ApplicationContact[];
  activities: Activity[];
  interviews: Interview[];
  resumes: ResumeMetadata[];
  settings: UserSettings;
  analyticsSettings: AnalyticsSettings;
  notificationState: NotificationState;
  createApplication: (input: ApplicationInput) => Application;
  updateApplication: (id: string, input: ApplicationUpdate) => void;
  archiveApplication: (id: string) => void;
  restoreApplication: (id: string) => void;
  deleteApplication: (id: string) => void;
  addContact: (input: ContactInput) => ApplicationContact;
  updateContact: (id: string, input: Partial<ContactInput>) => void;
  deleteContact: (id: string) => void;
  appendActivity: (
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) => void;
  updateSettings: (input: Partial<UserSettings>) => void;
  resetSettings: () => void;
}

export function useTrackerStore(): TrackerStore {
  const [applications, setApplications] = useState<Application[]>(() =>
    mockApplications.map((application) => ({
      ...application,
      contactsCount: mockContacts.filter(
        (contact) => contact.applicationId === application.id,
      ).length,
    })),
  );
  const [contacts, setContacts] =
    useState<ApplicationContact[]>(mockContacts);
  const [activities, setActivities] = useState<Activity[]>(mockActivities);
  const [interviews, setInterviews] = useState<Interview[]>(mockInterviews);
  const [settings, setSettings] =
    useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [analyticsSettings] = useState<AnalyticsSettings>(
    DEFAULT_ANALYTICS_SETTINGS,
  );
  const [notificationState] = useState<NotificationState>(
    DEFAULT_NOTIFICATION_STATE,
  );

  useEffect(() => {
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

    setApplications((current) =>
      current.map((application) =>
        transitionedApplications.some(
          (transitioned) => transitioned.id === application.id,
        )
          ? {
              ...application,
              status: "Awaiting Response",
              updatedAt,
            }
          : application,
      ),
    );
    setActivities((current) => [
      ...transitionedApplications.map((application) => ({
        id: createId("activity"),
        applicationId: application.id,
        type: "status_changed" as const,
        message:
          "Status changed to Awaiting Response after the follow-up window elapsed.",
        createdAt: updatedAt,
      })),
      ...current,
    ]);
  }, [applications, settings.defaultFollowUpPromptDays]);

  function appendActivity(
    applicationId: string,
    type: Activity["type"],
    message: string,
  ) {
    setActivities((current) => [
      {
        id: createId("activity"),
        applicationId,
        type,
        message,
        createdAt: createTimestamp(),
      },
      ...current,
    ]);
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

    setApplications((current) => [application, ...current]);
    appendActivity(
      application.id,
      "created",
      `Created application for ${application.jobTitle}.`,
    );

    if (application.interviewDateTime) {
      setInterviews((current) => [
        {
          id: createId("interview"),
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
          createdAt,
          updatedAt: createdAt,
        },
        ...current,
      ]);
    }

    return application;
  }

  function updateApplication(id: string, input: ApplicationUpdate) {
    const updatedAt = createTimestamp();
    let previousStatus: ApplicationStatus | undefined;
    let nextStatus: ApplicationStatus | undefined;

    setApplications((current) =>
      current.map((application) => {
        if (application.id !== id) {
          return application;
        }

        previousStatus = application.status;
        nextStatus = input.status ?? application.status;

        return {
          ...application,
          ...input,
          updatedAt,
        };
      }),
    );

    if (
      "interviewDateTime" in input ||
      "interviewRound" in input ||
      "interviewType" in input
    ) {
      setInterviews((current) => {
        const existing = current.find(
          (interview) => interview.applicationId === id,
        );

        if (!input.interviewDateTime) {
          return current.filter((interview) => interview.applicationId !== id);
        }

        if (!existing) {
          return [
            {
              id: createId("interview"),
              applicationId: id,
              dateTime: input.interviewDateTime,
              round: input.interviewRound,
              type: input.interviewType ?? "unknown",
              mode: input.interviewMode ?? "other",
              location: input.interviewLocation,
              meetingUrl: input.interviewMeetingUrl,
              platform: input.interviewPlatform,
              proctored: input.interviewProctored ?? false,
              deadline: input.interviewDeadline,
              createdAt: updatedAt,
              updatedAt,
            },
            ...current,
          ];
        }

        return current.map((interview) =>
          interview.applicationId === id
            ? {
                ...interview,
                dateTime: input.interviewDateTime,
                round: input.interviewRound ?? interview.round,
                type: input.interviewType ?? interview.type,
                mode: input.interviewMode ?? interview.mode,
                location: input.interviewLocation,
                meetingUrl: input.interviewMeetingUrl,
                platform: input.interviewPlatform,
                proctored: input.interviewProctored ?? interview.proctored,
                deadline: input.interviewDeadline,
                updatedAt,
              }
            : interview,
        );
      });
    }

    if (nextStatus && previousStatus && nextStatus !== previousStatus) {
      appendActivity(id, "status_changed", `Status changed to ${nextStatus}.`);
    }
  }

  function archiveApplication(id: string) {
    updateApplication(id, {
      archivedAt: createTimestamp(),
    });
    appendActivity(id, "archived", "Archived application.");
  }

  function restoreApplication(id: string) {
    updateApplication(id, {
      archivedAt: undefined,
    });
    appendActivity(id, "restored", "Restored application.");
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
  }

  function addContact(input: ContactInput) {
    const createdAt = createTimestamp();
    const contact: ApplicationContact = {
      ...input,
      id: createId("contact"),
      createdAt,
      updatedAt: createdAt,
    };

    setContacts((current) => [contact, ...current]);
    setApplications((current) =>
      current.map((application) =>
        application.id === input.applicationId
          ? {
              ...application,
              contactsCount: application.contactsCount + 1,
              updatedAt: createdAt,
            }
          : application,
      ),
    );
    appendActivity(
      input.applicationId,
      "contact_created",
      `Added contact ${contact.name}.`,
    );

    return contact;
  }

  function updateContact(id: string, input: Partial<ContactInput>) {
    const updatedAt = createTimestamp();
    let applicationId: string | undefined;
    let contactName: string | undefined;

    setContacts((current) =>
      current.map((contact) => {
        if (contact.id !== id) {
          return contact;
        }

        applicationId = contact.applicationId;
        contactName = input.name ?? contact.name;

        return {
          ...contact,
          ...input,
          updatedAt,
        };
      }),
    );

    if (applicationId && contactName) {
      appendActivity(
        applicationId,
        "contact_updated",
        `Updated contact ${contactName}.`,
      );
    }
  }

  function deleteContact(id: string) {
    const contact = contacts.find((candidate) => candidate.id === id);

    if (!contact) {
      return;
    }

    const updatedAt = createTimestamp();

    setContacts((current) => current.filter((candidate) => candidate.id !== id));
    setApplications((current) =>
      current.map((application) =>
        application.id === contact.applicationId
          ? {
              ...application,
              contactsCount: Math.max(0, application.contactsCount - 1),
              updatedAt,
            }
          : application,
      ),
    );
    appendActivity(
      contact.applicationId,
      "contact_deleted",
      `Deleted contact ${contact.name}.`,
    );
  }

  function updateSettings(input: Partial<UserSettings>) {
    setSettings((current) => ({
      ...current,
      ...input,
    }));
  }

  function resetSettings() {
    setSettings(DEFAULT_USER_SETTINGS);
  }

  return {
    applications,
    contacts,
    activities,
    interviews,
    resumes: mockResumes,
    settings,
    analyticsSettings,
    notificationState,
    createApplication,
    updateApplication,
    archiveApplication,
    restoreApplication,
    deleteApplication,
    addContact,
    updateContact,
    deleteContact,
    appendActivity,
    updateSettings,
    resetSettings,
  };
}

function daysSince(dateStamp: string, now: Date) {
  const date = new Date(dateStamp);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;

  return Math.floor((now.getTime() - date.getTime()) / millisecondsPerDay);
}
