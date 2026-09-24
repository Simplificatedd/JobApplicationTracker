import { describe, expect, it, vi } from "vitest";
import type { ResumeMetadata } from "../types/application";
import {
  downloadResumeFile,
  previewResumeFile,
  type ResumeActionBrowser,
} from "./resumeFileActions";

const pdfResume: ResumeMetadata = {
  id: "resume-1",
  displayName: "Main resume",
  originalFileName: "resume.pdf",
  downloadFileName: "resume.pdf",
  fileExtension: "pdf",
  mimeType: "application/pdf",
  fileSize: 4,
  storageKey: "resume-1.pdf",
  contentHash: "hash",
  uploadedAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function createBrowser() {
  const previewWindow = {
    close: vi.fn(),
    location: { href: "about:blank" },
    opener: {} as unknown,
  };
  const browser: ResumeActionBrowser = {
    clickDownload: vi.fn(),
    createObjectURL: vi.fn(() => "blob:resume"),
    openPreviewWindow: vi.fn(() => previewWindow),
    revokeObjectURL: vi.fn(),
    schedule: vi.fn((callback) => callback()),
  };

  return { browser, previewWindow };
}

describe("resume file actions", () => {
  it("opens a PDF preview and revokes its object URL", async () => {
    const { browser, previewWindow } = createBrowser();

    await expect(
      previewResumeFile(pdfResume, async () => new Blob(["pdf"]), browser),
    ).resolves.toBe("preview");
    expect(previewWindow.location.href).toBe("blob:resume");
    expect(browser.revokeObjectURL).toHaveBeenCalledWith("blob:resume");
  });

  it("downloads a DOCX instead of opening an unsupported preview", async () => {
    const { browser } = createBrowser();
    const docxResume = {
      ...pdfResume,
      downloadFileName: "resume.docx",
      fileExtension: "docx" as const,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const,
    };

    await expect(
      previewResumeFile(docxResume, async () => new Blob(["docx"]), browser),
    ).resolves.toBe("download");
    expect(browser.openPreviewWindow).not.toHaveBeenCalled();
    expect(browser.clickDownload).toHaveBeenCalledWith(
      "blob:resume",
      "resume.docx",
    );
  });

  it("closes a blank preview when retrieval fails", async () => {
    const { browser, previewWindow } = createBrowser();

    await expect(
      previewResumeFile(
        pdfResume,
        async () => {
          throw new Error("Resume unavailable");
        },
        browser,
      ),
    ).rejects.toThrow("Resume unavailable");
    expect(previewWindow.close).toHaveBeenCalled();
  });

  it("reports when the browser blocks the preview window", async () => {
    const { browser } = createBrowser();
    browser.openPreviewWindow = vi.fn(() => null);

    await expect(
      previewResumeFile(pdfResume, async () => new Blob(["pdf"]), browser),
    ).rejects.toThrow("PDF preview was blocked");
  });

  it("downloads directly with the configured filename", async () => {
    const { browser } = createBrowser();

    await downloadResumeFile(pdfResume, async () => new Blob(["pdf"]), browser);
    expect(browser.clickDownload).toHaveBeenCalledWith(
      "blob:resume",
      "resume.pdf",
    );
  });
});
