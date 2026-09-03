import type { JobApplication, ResumeFile } from "../../types/application";
import {
  ContactsButton,
  DescriptionPreview,
  FollowUpCell,
  InterviewCell,
  ResumeCell,
  RowActionsMenu,
} from "./TableCells";
import { StatusBadge } from "./StatusBadge";
import { formatUpdatedAt } from "../../lib/format";

interface ApplicationsTableProps {
  applications: JobApplication[];
  resumes: ResumeFile[];
}

const columns = [
  "Job Title",
  "Company",
  "Status",
  "Follow-up",
  "Interview Date/Time",
  "Resume",
  "Contacts",
  "Last Updated",
  "Actions",
];

export function ApplicationsTable({
  applications,
  resumes,
}: ApplicationsTableProps) {
  const resumeById = new Map(resumes.map((resume) => [resume.id, resume]));

  return (
    <section className="surface-panel overflow-hidden rounded-lg">
      {applications.length === 0 ? (
        <div className="flex min-h-[280px] items-center justify-center px-6 py-12 text-center">
          <div className="max-w-sm">
            <h2 className="text-xl font-semibold text-foreground">
              No applications yet
            </h2>
            <p className="mt-2 text-sm text-muted">
              New entries will appear here once they are added.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] table-fixed border-collapse text-left">
            <colgroup>
              <col className="w-[260px]" />
              <col className="w-[150px]" />
              <col className="w-[180px]" />
              <col className="w-[150px]" />
              <col className="w-[185px]" />
              <col className="w-[170px]" />
              <col className="w-[120px]" />
              <col className="w-[155px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="border-b border-border bg-slate-50">
              <tr>
                {columns.map((column) => (
                  <th
                    className="px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted"
                    key={column}
                    scope="col"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {applications.map((application) => (
                <ApplicationRow
                  application={application}
                  key={application.id}
                  resume={
                    application.resumeId
                      ? resumeById.get(application.resumeId)
                      : undefined
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApplicationRow({
  application,
  resume,
}: {
  application: JobApplication;
  resume?: ResumeFile;
}) {
  return (
    <tr className="table-row-hover align-top">
      <td className="px-4 py-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {application.jobTitle}
          </p>
          <DescriptionPreview description={application.jobDescription} />
        </div>
      </td>
      <td className="px-4 py-4">
        <p className="truncate text-sm font-medium text-foreground">
          {application.company}
        </p>
        <p className="mt-1 truncate text-xs text-muted">
          {application.location ?? "Location blank"}
        </p>
      </td>
      <td className="px-4 py-4">
        <StatusBadge status={application.status} />
      </td>
      <td className="px-4 py-4">
        <FollowUpCell application={application} />
      </td>
      <td className="px-4 py-4">
        <InterviewCell application={application} />
      </td>
      <td className="px-4 py-4">
        <ResumeCell resume={resume} />
      </td>
      <td className="px-4 py-4">
        <ContactsButton count={application.contactsCount} />
      </td>
      <td className="px-4 py-4">
        <p className="text-sm text-foreground">
          {formatUpdatedAt(application.updatedAt)}
        </p>
      </td>
      <td className="px-4 py-4">
        <RowActionsMenu />
      </td>
    </tr>
  );
}
