# 03. Business Modules And Workflows

## 1. Procurement Business Lifecycle

ProcureDesk follows this procurement lifecycle:

1. PR/Scheme received.
2. Procurement case created.
3. Entity, department, tender owner, tender type, and priority assigned.
4. NIT initiated.
5. NIT approved.
6. NIT published.
7. Bid received.
8. Technical/commercial evaluation completed.
9. NFA submitted.
10. NFA approved.
11. LOI issued if applicable.
12. RC/PO awarded.
13. RC/PO validity monitored.
14. Case completed or delayed state tracked.

Chronology rule:

`NIT Initiation <= NIT Approval <= NIT Publish <= Bid Receipt`

Further date rules:

- Evaluation dates should occur after bid receipt.
- NFA approval should not precede NFA submission.
- RC/PO award should not precede LOI award date where LOI exists.
- RC/PO validity must be after RC/PO award date.

## 2. Dashboard

Purpose:

- Give users a premium, fast executive view of procurement health.

Features:

- Summary KPIs.
- Recent cases.
- Delayed running cases.
- Priority cases.
- My assigned cases.
- RC/PO expiry preview.

Primary APIs:

- `GET /dashboard/summary`
- `GET /cases`
- `GET /planning/rc-po-expiry`

UI behavior:

- Keep concise and high-signal.
- Avoid dumping all operational tables.
- Link users into focused modules for deeper work.

Edge cases:

- No cases yet.
- User has no entity scope.
- Worker/report projection lag.

## 3. Cases

Purpose:

- Track procurement cases from PR intake to RC/PO award and completion.

Features:

- Active case table.
- Recovery/deleted cases.
- Create case.
- Preview drawer.
- Edit details, owner, delay, and milestones.
- Awards panel.
- Export selected cases.

Permissions:

- `cases.read`
- `cases.create`
- `cases.update`
- `cases.delete`
- `awards.manage`

Primary APIs:

- `GET /cases`
- `POST /cases`
- `GET /cases/:caseId`
- `PATCH /cases/:caseId`
- `PATCH /cases/:caseId/assignment`
- `PATCH /cases/:caseId/milestones`
- `PATCH /cases/:caseId/delay`
- `DELETE /cases/:caseId`
- `POST /cases/:caseId/restore`
- `GET/POST/PATCH/DELETE /cases/:caseId/awards`

Validation rules:

- Entity must be active and accessible.
- Owner must be assignable for selected entity.
- Tender type must be active.
- Tender chronology must be valid.
- Qualified bidder count cannot exceed participated bidder count.
- Award dates must follow approval milestones.

UI rules:

- Tables should support search, filters, selection, pagination, and row preview.
- Preview drawer should be readable and not cramped.
- Edit drawer should group sections vertically with responsive fields.
- Milestone timeline should be scannable, not clipped or horizontally broken.

## 4. Planning

Purpose:

- Manage forward-looking tender plans and RC/PO expiry risk.

Features:

- Tender plans.
- RC/PO plans.
- RC/PO expiry tracking.
- Filters by entity, department, owner, status, and date.

Permissions:

- `planning.read`
- `planning.manage`

Primary APIs:

- `GET /planning/tender-plans`
- `POST /planning/tender-plans`
- `PATCH /planning/tender-plans/:planId`
- `GET /planning/rc-po-plans`
- `POST /planning/rc-po-plans`
- `PATCH /planning/rc-po-plans/:planId`
- `GET /planning/rc-po-expiry`

UI rules:

- Use horizontal sub-navigation.
- Filters must follow the shared enterprise filter style.
- Tables should match the cases/reports table design.

Edge cases:

- Expired contracts without complete legacy data.
- Department names migrated from old systems.
- Large expiry lists.

## 5. Reports

Purpose:

- Provide procurement analytics, tabular report views, saved views, and exports.

Report sections:

- Analytics.
- Tender Details.
- Running.
- Completed.
- Vendor Awards.
- Stage Time.
- RC/PO Expiry.
- Saved Views.
- Export Jobs.

Permissions:

- `reports.read`
- `reports.export`

Primary APIs:

- `GET /reports/analytics`
- `GET /reports/tender-details`
- `GET /reports/running`
- `GET /reports/completed`
- `GET /reports/vendor-awards`
- `GET /reports/stage-time`
- `GET /reports/rc-po-expiry`
- `GET /reports/filter-metadata`
- `GET/POST /reports/saved-views`
- `POST /reports/export-jobs`
- `GET /reports/export-jobs/:jobId`
- `GET /reports/export-jobs/:jobId/download`

UI rules:

- Analytics should be a dedicated section, not duplicated on every report.
- Tabular reports should focus on table, filters, saved views, and export.
- Export status should be a clear section, not a confusing side card.
- Filters should be compact, with advanced filters progressively disclosed.

## 6. Imports

Purpose:

- Provide controlled Excel-based enterprise migration and onboarding.

Supported imports:

- Tender cases.
- Entity - Portal User Mapping.
- Entity - User Department Mapping.
- Bulk Upload - Old Contract.

Workflow:

1. Select import type.
2. Download official template.
3. Upload Excel file.
4. Parse into staging.
5. Validate rows.
6. Preview impact.
7. Download problem rows if needed.
8. Commit valid rows.

UI rules:

- Do not expose technical JSON.
- Do not use confusing “dry run” wording for business users.
- Use “Validate & Preview” or “Preview Import”.
- Show errors, warnings, duplicates, and new/updated rows clearly.

## 7. Operations

Purpose:

- Give operators access to audit, notifications, dead letters, queues, and diagnostic views.

Sections:

- Audit Logs.
- Notifications.
- Queue Jobs.
- Dead Letters.
- Monitoring.
- Export Jobs.
- System Events.

Permissions:

- `audit.read`
- `operations.read`
- `notifications.manage`

Primary APIs:

- `GET /audit/events`
- `GET /audit/filter-metadata`
- `GET /audit/events/:eventId`
- `GET /operations/dead-letter-events`
- `GET /notifications/rules`
- `PUT /notifications/rules/:notificationType`
- `GET /notifications/preview`
- `POST /notifications/jobs`

UI rules:

- Use focused sub-tabs.
- Do not mix notification forms, audit events, queue jobs, and dead letters on one long page.
- Dropdowns must render above tables.

## 8. Admin

Purpose:

- Configure tenant users, roles, entities, departments, catalog choice lists, tender rules, and security policy.

Sections:

- Overview.
- Users.
- Roles.
- Entities.
- Departments.
- Choice Lists.
- Tender Rules.
- Security.
- Audit.

Key rules:

- System roles are protected.
- Tenant-created roles are editable.
- Last active tenant admin is protected.
- System choice categories are protected.
- Tenant choice categories can be created, edited, disabled, and deleted when empty.
- Used choice values should be deactivated instead of deleted.

Permissions:

- `admin.users.manage`
- `admin.roles.manage`
- `admin.entities.manage`
- `catalog.manage`
- `security.manage`
- `audit.read`

## 9. Role Matrix

Representative roles:

| Role | Typical Capability |
| --- | --- |
| Tenant Admin | Manage tenant configuration, users, roles, catalog, security |
| Entity Manager | Manage entity-scoped procurement activity |
| Tender Owner | Create and maintain assigned cases |
| Group Viewer | Read cases/reports for allowed scope |
| Custom Role | Tenant-defined permission set |

## 10. Business Edge Cases

- Legacy imported records may have missing dates or old naming.
- Deactivated catalog values may still appear on historical records.
- Entity-scoped users need correct entity assignment or pages may appear empty.
- Report counts can differ from table rows if filters differ.
- Worker downtime can delay exports/imports/projections but should not break normal API reads.

