import { describe, expect, it } from "vitest";
import {
  createResumeUploadResult,
  MAX_RESUME_FILE_BYTES,
  validateResumeFile,
} from "./resumeFiles";

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const DOCX_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("validateResumeFile", () => {
  it("accepts PDF and DOCX signatures", async () => {
    await expect(
      validateResumeFile(
        new File([PDF_HEADER], "resume.pdf", { type: "application/pdf" }),
      ),
    ).resolves.toMatchObject({ fileExtension: "pdf" });
    await expect(
      validateResumeFile(
        new File([DOCX_HEADER], "resume.docx", { type: DOCX_MIME_TYPE }),
      ),
    ).resolves.toMatchObject({ fileExtension: "docx" });
  });

  it("rejects content and MIME types that disagree with the extension", async () => {
    await expect(
      validateResumeFile(
        new File([DOCX_HEADER], "resume.pdf", { type: "application/pdf" }),
      ),
    ).rejects.toThrow("not a valid PDF or DOCX");
    await expect(
      validateResumeFile(
        new File([PDF_HEADER], "resume.docx", { type: "application/pdf" }),
      ),
    ).rejects.toThrow("does not match its extension");
  });

  it("rejects files above the upload limit", async () => {
    const oversizedFile = new File(
      [PDF_HEADER, new Uint8Array(MAX_RESUME_FILE_BYTES)],
      "large.pdf",
      { type: "application/pdf" },
    );

    await expect(validateResumeFile(oversizedFile)).rejects.toThrow(
      "10 MB or smaller",
    );
  });
});

describe("createResumeUploadResult", () => {
  it("removes path separators from the download filename", async () => {
    const result = await createResumeUploadResult({
      existingResumes: [],
      file: new File([PDF_HEADER], "resume.pdf", { type: "application/pdf" }),
      options: { downloadFileName: "../private/resume" },
    });

    expect(result.resume.downloadFileName).toBe(".._private_resume.pdf");
  });
});
