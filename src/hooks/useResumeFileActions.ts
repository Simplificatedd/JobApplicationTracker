import { useState } from "react";
import {
  downloadResumeFile,
  previewResumeFile,
} from "../lib/resumeFileActions";
import type { ResumeMetadata } from "../types/application";

export function useResumeFileActions(
  getResumeFile: (id: string) => Promise<Blob>,
  documentLabel = "Resume",
) {
  const [actionError, setActionError] = useState("");
  const [workingResumeId, setWorkingResumeId] = useState<string | null>(null);

  async function downloadResume(resume: ResumeMetadata) {
    setActionError("");
    setWorkingResumeId(resume.id);

    try {
      await downloadResumeFile(resume, getResumeFile);
    } catch (error) {
      setActionError(getErrorMessage(error, documentLabel));
    } finally {
      setWorkingResumeId(null);
    }
  }

  async function previewResume(resume: ResumeMetadata) {
    setActionError("");
    setWorkingResumeId(resume.id);

    try {
      await previewResumeFile(resume, getResumeFile);
    } catch (error) {
      setActionError(getErrorMessage(error, documentLabel));
    } finally {
      setWorkingResumeId(null);
    }
  }

  return {
    actionError,
    clearActionError: () => setActionError(""),
    downloadResume,
    previewResume,
    workingResumeId,
  };
}

function getErrorMessage(error: unknown, documentLabel: string) {
  return error instanceof Error ? error.message : `${documentLabel} action failed.`;
}
