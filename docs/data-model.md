# Data model decisions

How the tracker interprets follow-ups, statuses, deadlines, deletion, and resume
links. These rules are relied on by reminders, analytics, and backups.

## Follow-up semantics

- A follow-up is either **Optional** or **Compulsory**. Optional follow-ups may
  have no date and display as **No Follow-Up**; compulsory follow-ups require a
  real calendar date.
- Follow-up auto-reset is independent of the current requirement and date. When
  enabled, **Follow-up handled** schedules the next date from the handling date
  using the per-application prompt days. When disabled, handling clears the date
  and returns the requirement to Optional.
- Reminder dates are always explicit. Prompt days never create or advance a
  reminder merely because its previous date passed, so overdue items remain
  visible until the user handles or reschedules them.

## Status and deadline semantics

- New applications start at **Awaiting Response**. **Offered** means an offer is
  pending; **Accepted** is the final successful outcome. Records created before
  that distinction was introduced migrate their legacy `Offered` value to
  `Accepted` so an old final outcome is not reinterpreted as a pending offer.
- Interview records are the canonical one-to-many history for an application.
  The interview fields on an application are only a projection of the current
  interview for table and form compatibility.
- Each interview owns its scheduled date/time and optional deadline. Deadline
  timing can be exact or relative to a recorded received time; the calculated
  deadline remains editable. The former application-level deadline is no
  longer written or used for reminders.
- During loading or backup import, a legacy application deadline moves to an
  interview only when a matching or sole interview makes ownership
  unambiguous. Legacy fields remain readable for backup compatibility and are
  otherwise left untouched rather than guessed.
- `offerDeadline` belongs to the application because an offer is a single
  application status. It drives reminders only while status is **Offered** and
  remains stored after acceptance or rejection as historical context.
- Status activities store structured `statusFrom` and `statusTo` values.
  Pipeline analytics count current statuses; application-path analytics use
  the full history. For a rejected application, reaching **Offered** takes
  precedence over reaching **Interviewing**, which keeps
  `Offered → Rejected` distinct from `Interviewed → Rejected`.
- Outcome analytics are event-oriented: **Offers received** includes pending,
  accepted, and later-rejected offers, while **Rejected** includes every
  rejected path. One application can therefore contribute to both totals.

## Deletion, archive, and resume links

- Application deletion is a confirmed permanent removal intended for accidental
  or test entries. It removes the application and its activity timeline, so the
  app does not create an unreachable deletion activity first.
- Archive an application instead when its history should remain available.
- Each application stores only its current resume attachment through
  `resumeId`. Replacing a resume replaces that current link; the app does not
  create separate historical usage records or retain an `attachedAt` history.
- Full backups preserve the current `resumeId` link. Deleting an application
  removes that link with the application but keeps the reusable resume file in
  the private resume library.
- A separate `ResumeUsage` history collection is deferred. Adding one later
  requires an explicit storage and backup schema migration; it is not a hidden
  requirement of the current release.
