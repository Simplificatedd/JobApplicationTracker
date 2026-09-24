import type { ResumeMetadata } from "../types/application";

interface PreviewWindow {
  close: () => void;
  location: { href: string };
  opener: unknown;
}

export interface ResumeActionBrowser {
  clickDownload: (url: string, fileName: string) => void;
  createObjectURL: (file: Blob) => string;
  openPreviewWindow: () => PreviewWindow | null;
  revokeObjectURL: (url: string) => void;
  schedule: (callback: () => void, delay: number) => void;
}

export async function downloadResumeFile(
  resume: ResumeMetadata,
  getResumeFile: (id: string) => Promise<Blob>,
  browser = defaultBrowser,
) {
  const file = await getResumeFile(resume.id);
  const url = browser.createObjectURL(file);

  browser.clickDownload(url, resume.downloadFileName);
  browser.schedule(() => browser.revokeObjectURL(url), 0);
}

export async function previewResumeFile(
  resume: ResumeMetadata,
  getResumeFile: (id: string) => Promise<Blob>,
  browser = defaultBrowser,
) {
  if (resume.fileExtension !== "pdf") {
    await downloadResumeFile(resume, getResumeFile, browser);
    return "download" as const;
  }

  const previewWindow = browser.openPreviewWindow();

  if (!previewWindow) {
    throw new Error("PDF preview was blocked. Use download instead.");
  }

  previewWindow.opener = null;

  try {
    const file = await getResumeFile(resume.id);
    const url = browser.createObjectURL(file);

    previewWindow.location.href = url;
    browser.schedule(() => browser.revokeObjectURL(url), 30_000);
    return "preview" as const;
  } catch (error) {
    previewWindow.close();
    throw error;
  }
}

const defaultBrowser: ResumeActionBrowser = {
  clickDownload(url, fileName) {
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  },
  createObjectURL: (file) => URL.createObjectURL(file),
  openPreviewWindow: () => window.open("about:blank", "_blank"),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  schedule(callback, delay) {
    window.setTimeout(callback, delay);
  },
};
