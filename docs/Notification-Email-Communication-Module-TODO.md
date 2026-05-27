# ProcureDesk Notification & Email Communication Module TODO

**Owner:** RPSG Procurement Technology  
**Architecture:** Current ProcureDesk architecture only - React/Vite web, NestJS API, raw pg SQL, BullMQ worker, Microsoft Graph mail service  
**Status:** In progress  
**Started:** 2026-05-25
**Last Updated:** 2026-05-25

## Guiding Principles

- Keep Microsoft Graph authentication and sender configuration as-is.
- Do not introduce Next.js or Prisma into this implementation track.
- Treat email notifications as governed enterprise records: rule, preference, template version, job, attempt, attachment, audit.
- Separate responsibilities:
  - Rules decide when a notification is allowed.
  - Schedules decide when it runs.
  - Preferences decide who receives it.
  - Templates decide how it renders.
  - Jobs track execution.
  - Attempts track provider delivery.
  - Audit proves what happened.
- Render HTML and plain-text bodies together.
- Use Outlook-safe, Gmail-safe, mobile-safe email HTML.
- Store the rendered template version and payload used for each delivery.
- Prevent duplicate emails for the same recipient and schedule window.

## Email Flows To Implement

### 1. Welcome Email

- [x] Trigger instantly on user creation.
- [x] Send to newly created user's email ID.
- [x] Subject based on business draft: "Welcome to Procurement KPI Tracking Portal - Complete Your Account Setup".
- [x] Include first name greeting.
- [x] Include account name.
- [x] Include set password CTA.
- [x] Include 24-hour link validity.
- [x] Include support contact card.
- [x] Include security disclaimer.
- [x] Support optional user manual PDF attachment.
- [x] Track job, delivery attempts, and audit events.
- [x] Render polished mobile and desktop email body.

### 2. Forgot Password Email

- [x] Trigger instantly on forgot-password request.
- [x] Send to requesting user's email ID.
- [x] Include secure reset CTA.
- [x] Include expiry warning.
- [x] Include "ignore if not requested" security note.
- [x] Include anti-phishing footer.
- [x] Support optional IP/device metadata when available.
- [x] Do not expose sensitive account details.
- [x] Track job, delivery attempts, and audit events.
- [x] Render polished mobile and desktop email body.

### 3. Procurement Snapshot Email

- [x] Trigger daily at 10:00 AM IST for Entity Manager and Entity Viewer.
- [x] Trigger every third day at 10:00 AM IST for Group Viewer.
- [x] Send only to users with appropriate entity/group visibility.
- [x] Include first name greeting.
- [x] Include entity scope text for entity-scoped recipients.
- [x] Include group-wide text for group recipients.
- [x] Include executive KPI cards.
- [x] Include running tenders count.
- [x] Include completed tenders count.
- [x] Include stage ageing summary.
- [x] Include evaluation pendency summary.
- [x] Include quick report links:
  - [x] Analytics.
  - [x] Running Tenders.
  - [x] Completed Tenders.
  - [x] Stage Wise Time Lapse.
  - [x] Bid Evaluation Pendency.
- [x] Attach Analytics PDF filtered by recipient scope.
- [x] Track attachment generation status.
- [x] Track job, delivery attempts, attachment metadata, and audit events.
- [x] Render executive-grade mobile and desktop email body.

### 4. Pending Tender Update Alert

- [x] Use existing notification type `stale_tender` or migrate to clearer alias without breaking existing data.
- [x] Trigger every 3 days at 11:00 AM IST.
- [x] Send only if running tender cases have not been updated for more than 10 days.
- [x] Send to Tender Owner.
- [x] Subject based on business draft: "Alert for Pending Tender Progress Updates".
- [x] Include tender owner first name greeting.
- [x] Include action-oriented alert banner.
- [x] Include responsive table columns:
  - [x] Entity.
  - [x] PR Number.
  - [x] PR Description.
  - [x] Tender Stage.
  - [x] Run Age (Days).
  - [x] Current Stage Ageing (Days).
  - [x] Days Since Last Update.
- [x] Include color-coded row-level ageing severity.
- [x] Include CTA to update running cases.
- [x] No attachment.
- [x] Track job, delivery attempts, and audit events.
- [x] Render polished mobile and desktop email body.

### 5. Monthly Pending Tender Report

- [x] Trigger on 1st day of every month at 11:00 AM IST.
- [x] Send only if running tender cases have not been updated for more than 10 days.
- [x] Send to Entity Manager and Entity Viewer.
- [x] Subject based on business draft: "Alert: Pending Tender Progress Updates".
- [x] Include first name greeting.
- [x] Include consolidated manager summary.
- [x] Group cases by entity/reporting scope.
- [x] Include responsive table columns:
  - [x] Entity.
  - [x] Tender Owner.
  - [x] PR Number.
  - [x] PR Description.
  - [x] Tender Stage.
  - [x] Run Age (Days).
  - [x] Current Stage Ageing (Days).
  - [x] Days Since Last Update.
- [x] Include manager escalation styling.
- [x] No attachment.
- [x] Track job, delivery attempts, and audit events.
- [x] Render polished mobile and desktop email body.

### 6. RC/PO Expiry Alert

- [x] Trigger on 1st day of every month at 09:30 AM IST.
- [x] Send only if RC/PO validity date is within the next 90 days.
- [x] Send to Entity Manager and Entity Viewer with entity-filtered data.
- [x] Send to Group Viewer with group-wide data.
- [x] Subject based on business draft: "Alert: RC/PO Expiring in next 90 days".
- [x] Include first name greeting.
- [x] Include expiry summary and severity visualization.
- [x] Include sorted expiry listing preview.
- [x] Sort by days remaining, low to high.
- [x] Attach Excel report with headers:
  - [x] Entity.
  - [x] Tender Name.
  - [x] PO/RC Value.
  - [x] PO/RC Award Date.
  - [x] PO/RC Validity Date.
  - [x] Tender Owner.
  - [x] Days remaining to expire.
- [x] Track attachment generation status.
- [x] Track job, delivery attempts, attachment metadata, and audit events.
- [x] Render polished mobile and desktop email body.

## Phase 1 - Database & Domain Foundation

- [x] Add SQL migration after `000019_fix_tentative_tendering_date_fallback.sql`.
- [x] Add `ops.notification_templates`.
- [x] Add `ops.notification_template_versions`.
- [x] Add `ops.notification_schedules`.
- [x] Add `ops.notification_events`.
- [x] Add `ops.notification_delivery_attempts`.
- [x] Add `ops.notification_preferences`.
- [x] Add `ops.email_attachments`.
- [x] Add tenant-configurable `ops.notification_settings` for support contact and welcome-manual behavior.
- [x] Expand `ops.notification_jobs` for template, payload, retry, provider, target, and schedule metadata.
- [x] Add constraints for notification types and statuses.
- [x] Add indexes for status, schedule, recipient, entity, target, and idempotency lookup.
- [x] Add RLS enablement and tenant isolation policies for new ops tables.
- [x] Seed default templates, template versions, and schedules.
- [x] Preserve backward compatibility with existing notification jobs and rules.

## Phase 2 - Template Engine

- [x] Create template domain types.
- [x] Create template registry.
- [x] Create renderer API returning subject, preheader, HTML body, text body, and metadata.
- [x] Create reusable email components:
  - [x] Layout.
  - [x] Header.
  - [x] Footer.
  - [x] CTA button.
  - [x] Alert banner.
  - [x] KPI cards.
  - [x] Summary block.
  - [x] Data table.
  - [x] Status badge.
  - [x] Report link card.
  - [x] Expiry indicator.
- [x] Add safe HTML escaping helpers.
- [x] Add safe URL handling.
- [x] Add plain-text fallback rendering.
- [x] Add preview fixture data for every template.
- [x] Add tests for escaping, required variables, and output shape.

## Phase 3 - API Service Layer

- [x] Add template listing API.
- [x] Add template detail API.
- [x] Add template preview API.
- [x] Add test-send API.
- [x] Add schedule listing API.
- [x] Add schedule update API.
- [x] Add dry-run schedule preview API.
- [x] Add run-now schedule API.
- [x] Add delivery log API.
- [x] Add delivery attempt API.
- [x] Add resend API.
- [x] Add preference API.
- [x] Add audit timeline API for notifications.
- [x] Add tenant notification settings API.

## Phase 4 - Worker, Queue, Retry, and Scheduler

- [x] Render template in worker from template version and payload.
- [x] Add delivery attempt rows before and after Microsoft Graph send.
- [x] Capture provider response safely.
- [x] Improve Graph attachment support.
- [x] Respect Graph `Retry-After`.
- [x] Add exponential backoff.
- [x] Add max-attempt dead-letter handling.
- [x] Add idempotency for scheduled event plus recipient.
- [x] Add scheduler loop for notification schedules.
- [x] Store `last_run_at`, `next_run_at`, `last_status`, and failure details.
- [x] Add manual run-now path.

## Phase 5 - Attachments

- [x] Generate role-scoped Procurement Snapshot Analytics PDF.
- [x] Include Analytics PDF sections for case portfolio tiles, procurement reporting health, workload status, entity distribution, department workload, tender type analysis, stage distribution, quick links, generated timestamp, and confidentiality footer.
- [x] Enforce Analytics PDF scope from scheduler payload: Group Viewer gets group-wide data; Entity Manager/Viewer gets assigned entity IDs only.
- [x] Generate RC/PO Expiry Excel.
- [x] Confirm Monthly Pending Tender Report has no attachment per final business draft.
- [x] Generate Welcome Email user manual PDF.
- [x] Store generated attachment metadata.
- [x] Store checksum, MIME type, size, and expiry.
- [x] Attach files through Microsoft Graph payload.
- [x] Audit attachment generation and delivery.
- [x] Add attachment failure behavior rules.

## Phase 6 - Admin Notification Center UX

- [x] Add Notification Center routes under admin/operations or admin/notifications.
- [x] Overview dashboard.
- [x] Template management list.
- [x] Template live preview.
- [x] Version history and compare view.
- [x] Test-send control.
- [x] Scheduler dashboard.
- [x] Schedule detail panel.
- [x] Delivery logs with filters.
- [x] Retry/resend/cancel controls.
- [x] Preference management view.
- [x] Tenant support and welcome-manual settings view.
- [x] Audit timeline.
- [x] Loading skeletons.
- [x] Empty states.
- [x] Mobile and tablet responsive layouts.
- [ ] Dark/light mode compatibility with current theme.

## Phase 7 - Testing & Acceptance

- [x] API unit tests.
- [ ] Repository tests.
- [ ] Worker retry tests.
- [x] Template render tests.
- [ ] Email snapshot tests for all six flows.
- [x] Scheduler next-run tests.
- [ ] Stale tender condition tests.
- [x] RC/PO expiry sorting tests.
- [ ] Graph payload tests.
- [x] Attachment metadata tests.
- [ ] Admin UI smoke checks.

## Verification Log

- [x] `pnpm --filter @procuredesk/web typecheck`
- [x] `pnpm --filter @procuredesk/api typecheck`
- [x] `pnpm --filter @procuredesk/worker typecheck`
- [x] `pnpm --filter @procuredesk/api test` - 50 tests passed.
- [x] `pnpm --filter @procuredesk/worker test` - 32 tests passed.
- [x] `pnpm --filter @procuredesk/web build`
- [x] `git diff --check`
- [x] Targeted ESLint on changed web/API/worker notification files has no errors, only existing style warnings. Lint including touched identity files still reports pre-existing complexity errors in `createPendingUser` and `login`.
- [x] Group Viewer Procurement Snapshot schedule validated: every third day at 10:00 AM IST, `recipient_mode = group_viewer`, group scope, Analytics PDF attachment enabled.
- [x] Group Viewer Procurement Snapshot sample delivered to `praveen.vishnoi@rpsg.in` through Microsoft Graph; job `4ef5c252-b846-4d1e-bb4a-02c2f85a64c1`, provider message `0b3b9ca2-3c18-478a-bc76-4a224cc12b8b`.
- [x] Group Viewer Procurement Snapshot rendered body validated against business copy: "Good Morning Mr. [First name]", group-wide snapshot copy, production quick links, Analytics PDF note, and "ProcureDesk Support Team" sign-off.
- [x] Procurement Snapshot UI improved for Entity and Group variants: dashboard KPI cards, full-card clickable quick report links, attachment callout, production report URLs, and mobile-safe card stacking.
- [x] Pending Tender Update Alert schedule validated: every third day at 11:00 AM IST, `recipient_mode = owner`, threshold 10 days, and no jobs created when no running tender case matches the stale-update condition.
- [x] Pending Tender Update Alert UI improved: owner greeting, exact business copy, no attachment block, severity-highlighted ageing table, requested column labels, action CTA, and "System Admin" sign-off.
- [x] RC/PO Expiry Alert schedule validated: 1st day monthly at 09:30 AM IST, threshold 90 days, `recipient_mode = entity_admin_and_group_viewer`, Entity Manager/Viewer entity-filtered recipients, and Group Viewer group-wide recipients.
- [x] RC/PO Expiry Alert UI improved: entity/group-specific greeting and body copy, exact business subject, Excel attachment callout with `XLSX` badge, expiry-risk summary, sorted preview table, severity-highlighted days remaining, and "System Admin" sign-off.
- [x] RC/PO Expiry Excel validated from generated attachment: worksheet `RC PO Expiry`, headers `Entity`, `Tender Name`, `PO/RC Value`, `PO/RC Award Date`, `PO/RC Validity Date`, `Tender Owner`, `Days remaining to expire`; rows sorted low-to-high by days remaining.
- [x] Procurement Snapshot Analytics PDF upgraded from text-only output to a role-scoped, multi-page PDF generated from reporting projections, not a browser screenshot.
- [x] Procurement Snapshot scheduler now carries `entityIds` into the attachment payload so Entity Manager/Viewer PDFs are generated from assigned entities only.

## Open Decisions

- [x] Confirm whether `stale_tender` should remain the internal type for pending tender update alerts or receive a new alias. Decision: keep `stale_tender` as the canonical internal key for backward compatibility; use `pending_tender_update_alert` as the business/template alias and UI label.
- [x] Confirm final support contact details and whether they are tenant-configurable. Decision: support contact is tenant-configurable via Notification Settings; defaults remain RPSG support (`Mr. Santanu Mukherjee`, `santanu.mukherjee@rpsg.in`, `6297445379`).
- [x] Confirm source file/path for Welcome Email user manual PDF. Decision: generate the onboarding PDF in the worker from versioned ProcureDesk onboarding content and store it as a private notification attachment per welcome job.
- [x] Confirm whether monthly pending tender report should remain email-body only or add downloadable Excel later. Decision: email-body only per final business draft; no attachment for the Monthly Pending Tender Report.
- [x] Confirm PDF generation approach for Procurement Snapshot. Decision: generate an access-scoped server-side PDF artifact in the worker and attach it through Graph; avoid browser screenshot dependency for scheduled jobs.

## Progress Log

- [x] Architecture confirmed: current ProcureDesk stack only.
- [x] Microsoft Graph service confirmed as existing and to be reused.
- [x] Business draft reviewed from `Mail Drafts.docx`.
- [x] Six required email flows identified and mapped.
- [x] Added `db/migrations/committed/000020_notification_enterprise_foundation.sql`.
- [x] Rebuilt enterprise email renderer and six business-specific template builders.
- [x] Added API template render coverage for all six required email flows.
- [x] Upgraded worker delivery attempt tracking and Microsoft Graph send metadata.
- [x] Added notification template, schedule, preview, and delivery-attempt API endpoints.
- [x] Added admin operations UI sections for template library and schedules.
- [x] Added worker notification scheduler with idempotent event/job generation for Procurement Snapshot, Pending Tender Update Alert, Monthly Pending Tender Report, and RC/PO Expiry Alert.
- [x] Added schedule update, dry-run, and run-now API hooks plus admin Run Now action.
- [x] Added notification attachment generation for Procurement Snapshot PDF and RC/PO Expiry Excel.
- [x] Added Graph delivery attachment loading from private storage.
- [x] Added template preview/test-send, delivery detail/resend, and user preference controls in the admin operations workspace.
- [x] Added worker template-version rendering, notification audit timeline, attachment audit events, overview dashboard, schedule detail panel, and template version compare.
- [x] Resolved open architecture decisions for `stale_tender` aliasing, support-contact configurability, Welcome Email manual PDF, Monthly Pending Tender Excel, and Procurement Snapshot PDF generation.
- [x] Added tenant Notification Settings API/UI for support contact, welcome manual title, and welcome manual attachment toggle.
- [x] Wired configurable support contact into Welcome, Forgot Password, Password Changed, template preview/test-send, and scheduled worker-rendered emails.
- [x] Added generated Welcome Email user manual PDF attachment with audit/metadata tracking.
- [x] Removed Monthly Pending Tender Report Excel attachment behavior per final business draft; monthly report now sends email body only.
- [x] Validated Group Viewer Procurement Snapshot flow end-to-end with schedule config, rendered text body, Microsoft Graph delivery attempt, and attached Analytics PDF metadata.
- [x] Sent updated clickable-card Procurement Snapshot samples for Entity and Group variants to `praveen.vishnoi@rpsg.in`; jobs `0a7b96d3-672c-4a46-873c-c06dd0c122e4` and `d9e0ce13-b166-43f8-98af-58cdd8614dad`.
- [x] Sent Pending Tender Update Alert sample to `praveen.vishnoi@rpsg.in`; job `2f262b8b-b1b1-4fd2-b199-fee1bf32cab7`, Microsoft Graph message `446880e7-73e4-4ca2-9c2a-1562692953da`, attachment count `0`.
- [x] Validated Monthly Pending Tender Report schedule and UI: 1st day monthly at 11:00 AM IST, Entity Manager/Viewer recipients, threshold 10 days, no attachment, consolidated owner table, and System Admin sign-off.
- [x] Sent Monthly Pending Tender Report sample to `praveen.vishnoi@rpsg.in`; job `136afb8d-ff0c-401b-8a8f-eab40edc59b1`, Microsoft Graph message `a798ed80-f1d5-4e66-a57b-570efa1354b5`, attachment count `0`.
- [x] Sent corrected RC/PO Expiry Alert Entity sample to `praveen.vishnoi@rpsg.in`; job `6407d5e1-3961-40c0-89f0-cc0db0749d99`, Microsoft Graph message `258659c3-ab7e-4f28-b6df-ea6c78384f29`, Excel attachment `rc-po-expiry-2026-05-25.xlsx`.
- [x] Sent corrected RC/PO Expiry Alert Group sample to `praveen.vishnoi@rpsg.in`; job `60a911fc-b503-418c-ac43-12c0ba722323`, Microsoft Graph message `757a65f9-90b1-4409-ae57-521eacad7015`, Excel attachment `rc-po-expiry-2026-05-25.xlsx`.
- [x] Validated corrected RC/PO sample rendered bodies: Entity copy says "under your entity"; Group Viewer copy says "Hello Mr. [First name]" and uses group-wide wording; both include the exact Excel-report note, `Excel report attached` card, `XLSX` badge, and no Analytics PDF wording.
- [x] Upgraded Procurement Snapshot Analytics PDF renderer to include executive KPIs, financial health metrics, running workload bars, entity analytics, department workload, tender track analysis, stage distribution, quick links, scope label, generated timestamp, and confidentiality footer.
- [ ] Add dedicated worker tests for notification delivery attempt success/failure paths.
