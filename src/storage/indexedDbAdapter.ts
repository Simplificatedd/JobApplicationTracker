import {
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
import type { AnalyticsSettings } from "../types/analytics";
import type {
  Activity,
  Application,
  ApplicationContact,
  Interview,
  ResumeMetadata,
} from "../types/application";
import type { NotificationState, UserSettings } from "../types/settings";
import type { TablePreferences } from "../types/tablePreferences";
import type {
  ResumeBlobRecord,
  StorageAdapter,
  StorageSnapshot,
} from "./StorageAdapter";

export const TRACKER_DB_NAME = "job-application-tracker";
export const TRACKER_DB_VERSION = 2;

type StoreName =
  | "activities"
  | "analyticsSettings"
  | "applications"
  | "contacts"
  | "interviews"
  | "notificationState"
  | "resumeMetadata"
  | "resumeFiles"
  | "settings";

interface StoredValue<T> {
  key: string;
  value: T;
}

interface StorageMeta {
  schemaVersion: number;
  seededAt: string;
}

const SETTINGS_KEY = "userSettings";
const TABLE_PREFERENCES_KEY = "tablePreferences";
const STORAGE_META_KEY = "storageMeta";
const ANALYTICS_SETTINGS_KEY = "analyticsSettings";
const NOTIFICATION_STATE_KEY = "notificationState";

export function createIndexedDbStorageAdapter(): StorageAdapter {
  let databasePromise: Promise<IDBDatabase> | null = null;

  function getDatabase() {
    if (!databasePromise) {
      databasePromise = openDatabase();
    }

    return databasePromise;
  }

  async function initialize(): Promise<StorageSnapshot> {
    const database = await getDatabase();
    const meta = await getStoredValue<StorageMeta>(
      database,
      "settings",
      STORAGE_META_KEY,
    );

    if (!meta) {
      await seedInitialData(database);
    }

    return exportSnapshot();
  }

  async function listApplications() {
    const applications = await getAll<Application>(
      await getDatabase(),
      "applications",
    );

    return applications.map(normalizeApplication);
  }

  async function getApplication(id: string) {
    const application = await getByKey<Application>(
      await getDatabase(),
      "applications",
      id,
    );

    return application ? normalizeApplication(application) : undefined;
  }

  async function createApplication(application: Application) {
    await putRecord(await getDatabase(), "applications", application);
  }

  async function updateApplication(application: Application) {
    await putRecord(await getDatabase(), "applications", application);
  }

  async function archiveApplication(application: Application) {
    await updateApplication(application);
  }

  async function restoreApplication(application: Application) {
    await updateApplication(application);
  }

  async function deleteApplication(id: string) {
    const database = await getDatabase();
    const transaction = database.transaction(
      [
        "activities",
        "applications",
        "contacts",
        "interviews",
        "notificationState",
      ],
      "readwrite",
    );

    transaction.objectStore("applications").delete(id);
    deleteByApplicationId(transaction.objectStore("contacts"), id);
    deleteByApplicationId(transaction.objectStore("activities"), id);
    deleteByApplicationId(transaction.objectStore("interviews"), id);
    deleteByApplicationId(transaction.objectStore("notificationState"), id);

    await transactionDone(transaction);
  }

  async function listContacts(applicationId?: string) {
    return getMaybeByApplicationId<ApplicationContact>(
      await getDatabase(),
      "contacts",
      applicationId,
    );
  }

  async function saveContacts(contacts: ApplicationContact[]) {
    const database = await getDatabase();
    const transaction = database.transaction("contacts", "readwrite");
    const store = transaction.objectStore("contacts");

    for (const contact of contacts) {
      store.put(contact);
    }

    await transactionDone(transaction);
  }

  async function createContact(contact: ApplicationContact) {
    await putRecord(await getDatabase(), "contacts", contact);
  }

  async function updateContact(contact: ApplicationContact) {
    await putRecord(await getDatabase(), "contacts", contact);
  }

  async function deleteContact(id: string) {
    await deleteRecord(await getDatabase(), "contacts", id);
  }

  async function listActivities(applicationId?: string) {
    return getMaybeByApplicationId<Activity>(
      await getDatabase(),
      "activities",
      applicationId,
    );
  }

  async function appendActivity(activity: Activity) {
    await putRecord(await getDatabase(), "activities", activity);
  }

  async function deleteActivitiesForApplication(applicationId: string) {
    await deleteRecordsByApplicationId(
      await getDatabase(),
      "activities",
      applicationId,
    );
  }

  async function listInterviews(applicationId?: string) {
    return getMaybeByApplicationId<Interview>(
      await getDatabase(),
      "interviews",
      applicationId,
    );
  }

  async function saveInterview(interview: Interview) {
    await putRecord(await getDatabase(), "interviews", interview);
  }

  async function deleteInterview(id: string) {
    await deleteRecord(await getDatabase(), "interviews", id);
  }

  async function deleteInterviewsForApplication(applicationId: string) {
    await deleteRecordsByApplicationId(
      await getDatabase(),
      "interviews",
      applicationId,
    );
  }

  async function listResumeMetadata() {
    const resumes = await getAll<Partial<ResumeMetadata>>(
      await getDatabase(),
      "resumeMetadata",
    );

    return resumes.map(normalizeResumeMetadata);
  }

  async function createResumeMetadata(resume: ResumeMetadata) {
    await putRecord(await getDatabase(), "resumeMetadata", resume);
  }

  async function updateResumeMetadata(resume: ResumeMetadata) {
    await putRecord(await getDatabase(), "resumeMetadata", resume);
  }

  async function deleteResumeMetadata(id: string) {
    await deleteRecord(await getDatabase(), "resumeMetadata", id);
  }

  async function listResumeFiles() {
    return getAll<ResumeBlobRecord>(await getDatabase(), "resumeFiles");
  }

  async function saveResumeFile(storageKey: string, file: Blob) {
    await putRecord(await getDatabase(), "resumeFiles", { storageKey, file });
  }

  async function getResumeFile(storageKey: string) {
    const record = await getByKey<ResumeBlobRecord>(
      await getDatabase(),
      "resumeFiles",
      storageKey,
    );

    return record?.file;
  }

  async function deleteResumeFile(storageKey: string) {
    await deleteRecord(await getDatabase(), "resumeFiles", storageKey);
  }

  async function clearResumeFiles() {
    const database = await getDatabase();
    const transaction = database.transaction("resumeFiles", "readwrite");

    transaction.objectStore("resumeFiles").clear();

    await transactionDone(transaction);
  }

  async function getSettings() {
    return normalizeSettings(
      await getStoredValue<UserSettings>(
        await getDatabase(),
        "settings",
        SETTINGS_KEY,
      ),
    );
  }

  async function saveSettings(settings: UserSettings) {
    await putStoredValue(await getDatabase(), "settings", SETTINGS_KEY, settings);
  }

  async function resetSettings() {
    await saveSettings(DEFAULT_USER_SETTINGS);
    return DEFAULT_USER_SETTINGS;
  }

  async function getNotificationState() {
    return normalizeNotificationState(
      await getStoredValue<NotificationState>(
        await getDatabase(),
        "notificationState",
        NOTIFICATION_STATE_KEY,
      ),
    );
  }

  async function saveNotificationState(state: NotificationState) {
    await putStoredValue(
      await getDatabase(),
      "notificationState",
      NOTIFICATION_STATE_KEY,
      state,
    );
  }

  async function getAnalyticsSettings() {
    return normalizeAnalyticsSettings(
      await getStoredValue<AnalyticsSettings>(
        await getDatabase(),
        "analyticsSettings",
        ANALYTICS_SETTINGS_KEY,
      ),
    );
  }

  async function saveAnalyticsSettings(settings: AnalyticsSettings) {
    await putStoredValue(
      await getDatabase(),
      "analyticsSettings",
      ANALYTICS_SETTINGS_KEY,
      settings,
    );
  }

  async function getTablePreferences() {
    return (
      (await getStoredValue<TablePreferences>(
        await getDatabase(),
        "settings",
        TABLE_PREFERENCES_KEY,
      )) ?? null
    );
  }

  async function saveTablePreferences(preferences: TablePreferences) {
    await putStoredValue(
      await getDatabase(),
      "settings",
      TABLE_PREFERENCES_KEY,
      preferences,
    );
  }

  async function resetTablePreferences() {
    await deleteRecord(await getDatabase(), "settings", TABLE_PREFERENCES_KEY);
  }

  async function exportSnapshot(): Promise<StorageSnapshot> {
    return {
      activities: await listActivities(),
      analyticsSettings: await getAnalyticsSettings(),
      applications: await listApplications(),
      contacts: await listContacts(),
      interviews: await listInterviews(),
      notificationState: await getNotificationState(),
      resumes: await listResumeMetadata(),
      settings: await getSettings(),
      tablePreferences: await getTablePreferences(),
    };
  }

  async function importSnapshot(snapshot: StorageSnapshot) {
    const database = await getDatabase();
    const transaction = database.transaction(
      [
        "activities",
        "analyticsSettings",
        "applications",
        "contacts",
        "interviews",
        "notificationState",
        "resumeMetadata",
        "resumeFiles",
        "settings",
      ],
      "readwrite",
    );

    for (const storeName of transaction.objectStoreNames) {
      transaction.objectStore(storeName).clear();
    }

    putMany(transaction.objectStore("activities"), snapshot.activities);
    putMany(transaction.objectStore("applications"), snapshot.applications);
    putMany(transaction.objectStore("contacts"), snapshot.contacts);
    putMany(transaction.objectStore("interviews"), snapshot.interviews);
    putMany(transaction.objectStore("resumeMetadata"), snapshot.resumes);

    transaction.objectStore("analyticsSettings").put({
      key: ANALYTICS_SETTINGS_KEY,
      value: snapshot.analyticsSettings,
    });
    transaction.objectStore("notificationState").put({
      key: NOTIFICATION_STATE_KEY,
      value: snapshot.notificationState,
    });
    transaction.objectStore("settings").put({
      key: SETTINGS_KEY,
      value: snapshot.settings,
    });

    if (snapshot.tablePreferences) {
      transaction.objectStore("settings").put({
        key: TABLE_PREFERENCES_KEY,
        value: snapshot.tablePreferences,
      });
    }

    transaction.objectStore("settings").put({
      key: STORAGE_META_KEY,
      value: {
        schemaVersion: TRACKER_DB_VERSION,
        seededAt: new Date().toISOString(),
      } satisfies StorageMeta,
    });

    await transactionDone(transaction);
  }

  return {
    initialize,
    listApplications,
    getApplication,
    createApplication,
    updateApplication,
    archiveApplication,
    restoreApplication,
    deleteApplication,
    listContacts,
    saveContacts,
    createContact,
    updateContact,
    deleteContact,
    listActivities,
    appendActivity,
    deleteActivitiesForApplication,
    listInterviews,
    saveInterview,
    deleteInterview,
    deleteInterviewsForApplication,
    listResumeMetadata,
    createResumeMetadata,
    updateResumeMetadata,
    deleteResumeMetadata,
    listResumeFiles,
    saveResumeFile,
    getResumeFile,
    deleteResumeFile,
    clearResumeFiles,
    getSettings,
    saveSettings,
    resetSettings,
    getNotificationState,
    saveNotificationState,
    getAnalyticsSettings,
    saveAnalyticsSettings,
    getTablePreferences,
    saveTablePreferences,
    resetTablePreferences,
    exportSnapshot,
    importSnapshot,
  };
}

export const indexedDbStorageAdapter = createIndexedDbStorageAdapter();

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }

    const request = indexedDB.open(TRACKER_DB_NAME, TRACKER_DB_VERSION);

    request.onerror = () => {
      reject(
        request.error ??
          new Error("The local tracker database could not be opened."),
      );
    };

    request.onblocked = () => {
      reject(
        new Error(
          "The local tracker database is blocked by another open tracker tab.",
        ),
      );
    };

    request.onupgradeneeded = (event) => {
      upgradeDatabase(request.result, event.oldVersion);
    };

    request.onsuccess = () => {
      const database = request.result;

      database.onversionchange = () => {
        database.close();
      };

      resolve(database);
    };
  });
}

function upgradeDatabase(database: IDBDatabase, oldVersion: number) {
  if (!database.objectStoreNames.contains("applications")) {
    const store = database.createObjectStore("applications", { keyPath: "id" });
    store.createIndex("status", "status", { unique: false });
    store.createIndex("archivedAt", "archivedAt", { unique: false });
    store.createIndex("dateApplied", "dateApplied", { unique: false });
    store.createIndex("updatedAt", "updatedAt", { unique: false });
  }

  if (!database.objectStoreNames.contains("contacts")) {
    const store = database.createObjectStore("contacts", { keyPath: "id" });
    store.createIndex("applicationId", "applicationId", { unique: false });
  }

  if (!database.objectStoreNames.contains("activities")) {
    const store = database.createObjectStore("activities", { keyPath: "id" });
    store.createIndex("applicationId", "applicationId", { unique: false });
    store.createIndex("createdAt", "createdAt", { unique: false });
  }

  if (!database.objectStoreNames.contains("interviews")) {
    const store = database.createObjectStore("interviews", { keyPath: "id" });
    store.createIndex("applicationId", "applicationId", { unique: false });
  }

  if (!database.objectStoreNames.contains("resumeMetadata")) {
    database.createObjectStore("resumeMetadata", { keyPath: "id" });
  }

  if (!database.objectStoreNames.contains("resumeFiles")) {
    database.createObjectStore("resumeFiles", { keyPath: "storageKey" });
  }

  if (!database.objectStoreNames.contains("settings")) {
    database.createObjectStore("settings", { keyPath: "key" });
  }

  if (!database.objectStoreNames.contains("notificationState")) {
    const store = database.createObjectStore("notificationState", {
      keyPath: "key",
    });
    store.createIndex("applicationId", "value.applicationId", {
      unique: false,
    });
  }

  if (!database.objectStoreNames.contains("analyticsSettings")) {
    database.createObjectStore("analyticsSettings", { keyPath: "key" });
  }

  runMigrations(database, oldVersion);
}

function runMigrations(database: IDBDatabase, oldVersion: number) {
  void database;

  if (oldVersion < TRACKER_DB_VERSION) {
    // Future schema migrations should be additive and guarded by oldVersion.
  }
}

async function seedInitialData(database: IDBDatabase) {
  const transaction = database.transaction(
    [
      "activities",
      "analyticsSettings",
      "applications",
      "contacts",
      "interviews",
      "notificationState",
      "resumeMetadata",
      "resumeFiles",
      "settings",
    ],
    "readwrite",
  );

  putMany(transaction.objectStore("activities"), mockActivities);
  putMany(transaction.objectStore("applications"), mockApplications);
  putMany(transaction.objectStore("contacts"), mockContacts);
  putMany(transaction.objectStore("interviews"), mockInterviews);
  putMany(transaction.objectStore("resumeMetadata"), mockResumes);

  transaction.objectStore("settings").put({
    key: SETTINGS_KEY,
    value: DEFAULT_USER_SETTINGS,
  });
  transaction.objectStore("settings").put({
    key: STORAGE_META_KEY,
    value: {
      schemaVersion: TRACKER_DB_VERSION,
      seededAt: new Date().toISOString(),
    } satisfies StorageMeta,
  });
  transaction.objectStore("notificationState").put({
    key: NOTIFICATION_STATE_KEY,
    value: DEFAULT_NOTIFICATION_STATE,
  });
  transaction.objectStore("analyticsSettings").put({
    key: ANALYTICS_SETTINGS_KEY,
    value: DEFAULT_ANALYTICS_SETTINGS,
  });

  await transactionDone(transaction);
}

function getAll<T>(database: IDBDatabase, storeName: StoreName) {
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).getAll();

  return requestToPromise<T[]>(request);
}

function getByKey<T>(database: IDBDatabase, storeName: StoreName, key: string) {
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).get(key);

  return requestToPromise<T | undefined>(request);
}

async function getMaybeByApplicationId<T>(
  database: IDBDatabase,
  storeName: StoreName,
  applicationId?: string,
) {
  if (!applicationId) {
    return getAll<T>(database, storeName);
  }

  const transaction = database.transaction(storeName, "readonly");
  const request = transaction
    .objectStore(storeName)
    .index("applicationId")
    .getAll(applicationId);

  return requestToPromise<T[]>(request);
}

function putRecord<T>(database: IDBDatabase, storeName: StoreName, record: T) {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(record);

  return transactionDone(transaction);
}

function deleteRecord(database: IDBDatabase, storeName: StoreName, key: string) {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(key);

  return transactionDone(transaction);
}

async function getStoredValue<T>(
  database: IDBDatabase,
  storeName: StoreName,
  key: string,
) {
  const record = await getByKey<StoredValue<T>>(database, storeName, key);

  return record?.value;
}

function putStoredValue<T>(
  database: IDBDatabase,
  storeName: StoreName,
  key: string,
  value: T,
) {
  return putRecord(database, storeName, { key, value });
}

function putMany<T>(store: IDBObjectStore, records: T[]) {
  for (const record of records) {
    store.put(record);
  }
}

function normalizeApplication(application: Partial<Application>): Application {
  const timestamp =
    application.updatedAt ?? application.createdAt ?? new Date().toISOString();

  return {
    ...application,
    company: application.company ?? "",
    contactsCount: application.contactsCount ?? 0,
    createdAt: application.createdAt ?? timestamp,
    deadlineEntryMode: application.deadlineEntryMode ?? "exact",
    followUpNeeded: application.followUpNeeded ?? false,
    id: application.id ?? `app-${timestamp}`,
    interviewProctored: application.interviewProctored ?? false,
    jobDescription: application.jobDescription ?? "",
    jobTitle: application.jobTitle ?? "Untitled application",
    jobType: application.jobType ?? "internship",
    priority: application.priority ?? "medium",
    status: application.status ?? "Just Applied",
    updatedAt: timestamp,
    workMode: application.workMode ?? "unknown",
  };
}

function normalizeResumeMetadata(resume: Partial<ResumeMetadata>): ResumeMetadata {
  const originalFileName = resume.originalFileName ?? "resume.pdf";
  const fileExtension =
    resume.fileExtension ??
    (originalFileName.toLowerCase().endsWith(".docx") ? "docx" : "pdf");
  const timestamp =
    resume.updatedAt ?? resume.uploadedAt ?? new Date().toISOString();

  return {
    id: resume.id ?? `resume-${timestamp}`,
    displayName: resume.displayName ?? originalFileName,
    originalFileName,
    downloadFileName: resume.downloadFileName ?? originalFileName,
    fileExtension,
    mimeType:
      resume.mimeType ??
      (fileExtension === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    fileSize: resume.fileSize ?? 0,
    storageKey: resume.storageKey ?? `resume-file-${resume.id ?? timestamp}`,
    contentHash: resume.contentHash ?? `legacy-${resume.id ?? originalFileName}`,
    versionLabel: resume.versionLabel,
    notes: resume.notes,
    uploadedAt: resume.uploadedAt ?? timestamp,
    updatedAt: timestamp,
    lastUsedAt: resume.lastUsedAt,
  };
}

function normalizeSettings(settings?: Partial<UserSettings>): UserSettings {
  return {
    ...DEFAULT_USER_SETTINGS,
    ...settings,
    visibleApplicationColumns:
      settings?.visibleApplicationColumns ??
      DEFAULT_USER_SETTINGS.visibleApplicationColumns,
  };
}

function normalizeNotificationState(
  state?: Partial<NotificationState>,
): NotificationState {
  return {
    ...DEFAULT_NOTIFICATION_STATE,
    ...state,
    dismissedNotificationIds: state?.dismissedNotificationIds ?? [],
  };
}

function normalizeAnalyticsSettings(
  settings?: Partial<AnalyticsSettings>,
): AnalyticsSettings {
  return {
    ...DEFAULT_ANALYTICS_SETTINGS,
    ...settings,
    visibleCharts:
      settings?.visibleCharts ?? DEFAULT_ANALYTICS_SETTINGS.visibleCharts,
  };
}

function deleteRecordsByApplicationId(
  database: IDBDatabase,
  storeName: StoreName,
  applicationId: string,
) {
  const transaction = database.transaction(storeName, "readwrite");
  deleteByApplicationId(transaction.objectStore(storeName), applicationId);

  return transactionDone(transaction);
}

function deleteByApplicationId(store: IDBObjectStore, applicationId: string) {
  const index = store.index("applicationId");
  const request = index.openKeyCursor(IDBKeyRange.only(applicationId));

  request.onsuccess = () => {
    const cursor = request.result;

    if (!cursor) {
      return;
    }

    store.delete(cursor.primaryKey);
    cursor.continue();
  };
}

function requestToPromise<T>(request: IDBRequest) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed."));
    };

    request.onsuccess = () => {
      resolve(request.result as T);
    };
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    };
  });
}
