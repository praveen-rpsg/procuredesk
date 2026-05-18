<!--
ProcureDesk Platform — End User Manual
Document version: 1.0
Audience: Business users, first-time users, employees, clients, admins, managers
Export note: This document is structured for clean PDF / Word export.
-->

# ProcureDesk Platform – End User Manual

> **Document Version:** 1.0
> **Last Updated:** 18 May 2026
> **Audience:** Procurement teams, business users, managers, administrators, and clients
> **Status:** Official Product Documentation

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Getting Started](#2-getting-started)
3. [Roles & Permissions](#3-roles--permissions)
4. [Dashboard Overview](#4-dashboard-overview)
5. [Procurement Cases](#5-procurement-cases)
6. [Awards](#6-awards)
7. [Planning](#7-planning)
8. [Reports & Analytics](#8-reports--analytics)
9. [Imports & Exports](#9-imports--exports)
10. [Email Notifications (Operations)](#10-email-notifications-operations)
11. [Administration](#11-administration)
12. [My Profile](#12-my-profile)
13. [Approval Workflows](#13-approval-workflows)
14. [Notifications & Alerts](#14-notifications--alerts)
15. [File Uploads & Attachments](#15-file-uploads--attachments)
16. [Search & Filters](#16-search--filters)
17. [Mobile Usage](#17-mobile-usage)
18. [Security Best Practices](#18-security-best-practices)
19. [Frequently Asked Questions (FAQs)](#19-frequently-asked-questions-faqs)
20. [Glossary](#20-glossary)

---

# 1. Introduction

## 1.1 What Is ProcureDesk?

**ProcureDesk** is an enterprise procurement management platform — a single, organised "command center" for running and tracking the entire procurement lifecycle. It replaces scattered spreadsheets and manual trackers with one reliable system where every procurement case, tender, award, and contract is recorded, monitored, and reported.

In simple terms: **ProcureDesk is where your procurement team plans tenders, runs them step by step, awards contracts to vendors, and keeps an eye on contracts that are about to expire — all in one place, with a full history of who did what and when.**

## 1.2 Main Purpose

ProcureDesk is built around the **procurement case** — a single record that follows a purchase requirement from the moment it is received until the contract or purchase order is awarded and monitored. The platform helps you:

- Capture every new procurement requirement (PR / Scheme) as a structured case.
- Move each case through clearly defined stages (notice, bidding, evaluation, approval, award).
- Record vendor awards, contract values, and savings.
- Track contracts and purchase orders that are nearing expiry so renewals are never missed.
- Produce management reports and analytics for leadership.

## 1.3 Key Benefits

| Benefit | What It Means for You |
|---|---|
| **Single source of truth** | One trusted place for all procurement records — no conflicting spreadsheets. |
| **End-to-end visibility** | See exactly where every tender stands, what is delayed, and what needs attention. |
| **Proactive expiry tracking** | Get early visibility of contracts/POs expiring soon so renewals are planned ahead. |
| **Strong governance** | Role-based access ensures users only see and do what they are authorised for. |
| **Audit-ready** | Key actions are recorded, giving you a reliable history for compliance. |
| **Less manual effort** | Bulk import tools onboard large volumes of data quickly and safely. |
| **Better decisions** | Built-in analytics and reports turn raw data into actionable insight. |

## 1.4 Who Should Use ProcureDesk?

ProcureDesk is designed for everyone involved in procurement operations:

- **Procurement / Tender Owners** — create and progress procurement cases day to day.
- **Entity Managers** — oversee procurement for one or more legal entities.
- **Group Managers** — oversee procurement across the whole organisation.
- **Viewers (Entity / Group)** — leadership and stakeholders who need read-only visibility and reports.
- **Administrators** — set up users, roles, entities, departments, and reference data.
- **Super Administrators** — platform-level oversight (used sparingly).

## 1.5 High-Level Overview

ProcureDesk is organised into a small number of easy-to-navigate workspaces:

| Workspace | What You Do There |
|---|---|
| **Dashboard** | Quick health check of your procurement portfolio. |
| **Cases** | Create and progress procurement cases; manage awards. |
| **Planning** | Plan upcoming tenders and watch contract expiry. |
| **Reports** | Analytics, detailed reports, saved views, and exports. |
| **Imports** | Bulk-upload tenders, users, departments, and old contracts. |
| **Admin** | Manage users, roles, entities, reference data, and email rules. |

> **Note:** Your organisation is set up as a **tenant**. All your data is private to your organisation and is never shared with other organisations using the platform. Within your organisation, work is grouped by **Entities** (legal companies) and **Departments**.

---

# 2. Getting Started

## 2.1 Logging In

1. Open the ProcureDesk web address provided by your administrator in any modern web browser (Chrome, Edge, Firefox, or Safari).
2. The **Sign in** screen appears with the heading **"Sign in to continue."**
3. Fill in the login form:
   - **Tenant code** — enter your organisation code (for example, `RPSG`). Leave this blank only if you are a platform administrator who has been told to do so.
   - **Username or email** — enter your registered username or email address.
   - **Password** — enter your password.
4. Click **Sign in**. The button briefly shows **"Signing in…"** while it checks your details.
5. On success, you are taken to your **Dashboard** (or to the page you were trying to open).

[Insert Screenshot – Sign In Page]

### Login Form Fields

| Field Name | Description | Required | Example |
|---|---|---|---|
| Tenant code | Your organisation's short code | Optional (required for tenant users) | `RPSG` |
| Username or email | Your account identifier | Yes | `rohan.mehta` or `rohan.mehta@company.com` |
| Password | Your secret password | Yes | (hidden) |

## 2.2 First-Time Users

If this is your first time:

1. Your administrator will create your account and, in most cases, send you a **secure setup link by email** instead of a password.
2. Open that email and follow the link to set your own password.
3. Choose a strong password that meets your organisation's password policy (typically **at least 12 characters with an uppercase letter, a lowercase letter, a number, and a special character**).
4. Return to the Sign in page and log in with your new password.

> **Tip for first-time users:** If you do not see any data after logging in (empty lists everywhere), it usually means your account has not yet been mapped to an entity. Contact your administrator and ask them to map you to the correct entity.

## 2.3 Resetting a Forgotten Password

1. On the Sign in screen, click **Forgot password**.
2. The form switches to password-reset mode (the password box disappears).
3. Enter your **Tenant code** (if applicable) and your **Username or email**.
4. Click **Send reset link**.
5. You will see the message: *"If an account exists, a reset link has been emailed."*
6. Open the email and click the reset link. It opens the **Password Reset** page.
7. Enter your **New password** and **Confirm password** (they must match), then click **Update password**.
8. When you see *"Password updated. You can sign in now,"* click **Back to sign in** and log in.

> **Note:** For your security, the system always shows the same confirmation message whether or not the account exists. This prevents others from discovering valid usernames.

## 2.4 Common Login Issues

| Problem | Likely Cause | What to Do |
|---|---|---|
| "Login failed." | Wrong username, password, or tenant code | Re-check all three fields. Confirm your tenant code with your admin. |
| Account locked | Too many failed attempts (10 failed tries within 15 minutes) | Wait **15 minutes**, then try again, or contact your administrator. |
| Logged out unexpectedly | Session expired (after 2 hours) or 30 minutes of inactivity | Simply sign in again. |
| Empty pages after login | Your account is not mapped to an entity | Ask your administrator to assign your entity scope. |
| Reset link not working | Link expired or already used | Request a new reset link. |

## 2.5 Navigating the Application

After login you see the **authenticated workspace**, which has three main parts:

1. **Left Sidebar (main menu)** — your primary navigation. It lists only the areas you are allowed to use:
   - **Cases**
   - **Planning**
   - **Reports**
   - **Imports**
   - **Admin**
   - (The **Dashboard** is opened by clicking the **ProcureDesk** logo at the top of the sidebar.)
2. **Sub-navigation** — when you open a main area, a set of related sub-pages appears (for example, opening **Cases** reveals **Active Cases** and **Recovery**).
3. **User footer (bottom of sidebar)** — your name, email, a **pencil icon** to edit your profile, and a **Log out** button.

[Insert Screenshot – Main Navigation Sidebar]

### Collapsing the Sidebar

- Click the **collapse/expand** button at the bottom of the sidebar to make it narrow (icons only) or wide (icons + labels).
- The platform remembers your choice for next time.
- When collapsed, hover over a menu icon to see its sub-pages as a pop-out menu.

### Workspace Titles

The header of each area shows where you are: *Dashboard, Procurement Cases, Planning, Reports, Imports And Exports, Operations,* or *Administration*. If you open a page you do not have access to, you will see an **"Access Denied"** message; an unknown address shows **"Page Not Found."**

## 2.6 Dashboard Overview (Quick Look)

The **Dashboard** is your landing page. It gives a personalised greeting, headline numbers about your procurement portfolio, quick action buttons, a focus list of priority/delayed cases, and a watchlist of contracts expiring soon. (See **Section 4** for full detail.)

## 2.7 User Profile Settings

Click the **pencil icon** next to your name in the sidebar footer to open the **My Profile** drawer, where you can update your display name and change your password. (See **Section 12** for full detail.)

---

# 3. Roles & Permissions

## 3.1 How Access Works

ProcureDesk controls what you can see and do using four connected ideas:

1. **Role** — your job profile in the system (for example, *Tender Owner*). A role grants a bundle of permissions.
2. **Access Level** — how wide your data visibility is:
   - **USER** — you see mainly the cases assigned to you.
   - **ENTITY** — you see cases for the entities you are mapped to.
   - **GROUP** — you see cases across the entire organisation.
3. **Entity Scope** — the specific legal entities you are mapped to (used for ENTITY-level access).
4. **Permissions** — the individual actions your role allows (create a case, export a report, manage users, and so on).

> **Note:** A **Super Admin** can do everything and bypasses normal permission checks. This role is reserved for a very small number of platform administrators.

## 3.2 Standard Roles

| Role | Primary Responsibility | Typical Access Level |
|---|---|---|
| **Super Admin** | Full platform authority across all modules and tenants. Used only for exceptional support/administration. | Platform-wide |
| **Administration Manager** | Manages the Admin console: users, roles, entities, reference data, security, notifications, and audit. | Group (administration) |
| **Group Manager** | Manages procurement operations across the whole organisation: all cases, planning, awards, imports, reports, and delays. | Group (operations) |
| **Entity Manager** | Manages procurement for assigned entities: entity cases, planning, awards, imports, and reports. | Entity |
| **Tender Owner** | Creates and progresses the procurement cases assigned to them; manages their awards; runs/export reports for their work. | User |
| **Entity Viewer** | Read-only access to cases and reports for assigned entities. | Entity (view) |
| **Group Viewer** | Read-only access to all organisation cases and reports; can export reports. | Group (view) |
| **Custom Tenant Role** | A tailored role your administrator builds from approved permissions for a specific team need. | Based on chosen permissions |

## 3.3 Permission Comparison Table

| Capability | Super Admin | Admin Manager | Group Manager | Entity Manager | Tender Owner | Entity Viewer | Group Viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Admin Console | ✓ | ✓ | – | – | – | – | – |
| User & Role Management | ✓ | ✓ | View | View (entity) | – | – | – |
| Entity & Department Setup | ✓ | ✓ | View | View | View | View | View |
| Reference Data / Choice Lists | ✓ | Manage | View | View | View | View | View |
| Create Cases | ✓ | – | ✓ | ✓ | ✓ | – | – |
| Case Visibility | All | – | All | Assigned entities | Assigned cases | Assigned entities | All |
| Update Cases | ✓ | – | All | Assigned entities | Assigned cases | – | – |
| Delete / Restore Cases | ✓ | – | – | – | – | – | – |
| Delay Management | ✓ | – | ✓ | – | – | – | – |
| Awards | ✓ | – | ✓ | ✓ | ✓ | – | – |
| Planning | ✓ | – | ✓ | ✓ | – | – | – |
| Imports | ✓ | – | ✓ | ✓ | – | – | – |
| Reports — View | ✓ | – | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reports — Export | ✓ | – | ✓ | ✓ | ✓ | – | ✓ |
| Audit Logs | ✓ | ✓ | – | – | – | – | – |
| Email Notification Rules | ✓ | ✓ | – | – | – | – | – |

> **Key points to remember:**
> - **Deleting and restoring cases** is restricted to **Super Admin** only.
> - **Delay management** (recording uncontrollable delay days/reasons) is restricted to **Super Admin** (and, for visibility, Group-level oversight).
> - **Group Viewer** can see all cases and export reports but cannot create or change anything.
> - **Entity Viewer** can view reports but **cannot export** them.
> - **Administration Manager** handles configuration only — not day-to-day procurement cases.

## 3.4 Governance Rules You Should Know

- Every user must have at least one valid role.
- Entity-level users **must** be mapped to at least one entity, or their pages will appear empty.
- System roles are protected — they cannot be edited or deleted. To customise, an admin **clones** a system role into a custom role.
- The system will not allow the **last active administrator** of an organisation to be removed or deactivated.
- Key access and business changes are recorded in the **Audit Logs**.

---

# 4. Dashboard Overview

## Purpose

The Dashboard is your **procurement command center**. It gives you, at a glance, the health of your portfolio, the cases that need attention, and contracts that are expiring soon — so you know exactly where to focus before opening any detailed module.

## Who Can Access

All logged-in users. The exact numbers and lists you see depend on your access level and entity scope.

## How to Access

Click the **ProcureDesk logo** at the top of the sidebar, or open the application root. The header reads **"Dashboard."**

[Insert Screenshot – Dashboard Overview]

## Dashboard Sections Explained

### 1. Hero / Greeting

- A time-aware greeting: **"Good morning / Good afternoon / Good evening, [Your Name]."**
- Today's date, the number of **active cases**, and the number of **open risk signals**.
- **Why it matters:** an instant sense of workload and risk for the day.

### 2. KPI Metric Cards

Cards are grouped into three sets. **Each card is clickable** and opens the Cases list already filtered for that metric.

| Group | Card | Meaning | Use It To… |
|---|---|---|---|
| **Case Volume** | **Total Cases** | All procurement records you can see | Open the full case list |
| | **Running** | Cases still in progress (and % of portfolio) | Focus on live work |
| | **Completed** | Closed cases (and completion rate) | Review finished work |
| **Exception Queue** | **Delayed** | Cases breaching delay rules — *needs intervention* | Tackle problem cases |
| | **Off Track** | Cases whose target/form date has passed | Catch slipping cases early |
| | **Priority** | High-attention running cases | Prioritise critical tenders |
| **Delivery Health** | **On Track** | Cases still within their target date | Confirm healthy progress |

Each card also shows **per-entity chips** (entity code + count). Clicking a chip drills into that entity's filtered case list.

> **Tip:** The fastest way to start your day is to click **Delayed** and **Off Track**, clear those, then review **Priority**.

### 3. Procurement Health Summary

A right-side card showing **Portfolio completion %** with a progress bar, plus **Active workload**, **Open risk signals**, and **Risk density (%)**.

### 4. Dashboard Actions (Quick Buttons)

| Button | What It Does |
|---|---|
| **Add New Case** | Opens the Cases workspace with the Create Case form ready. |
| **Update / View Existing Case** | Opens the case list to update milestones, allocations, or awards. |
| **Tender Planning** | Opens the Planning workspace. |
| **Reports** | Opens the Reports workspace. |

(You only see buttons for actions your role allows.)

### 5. Priority / Delayed Cases Panel

A focus table with a toggle between **Priority Cases** (default) and **Delayed Cases**.

**Columns:** Entity, PR Description, Tender Type, Running Tender Age, Current Stage Aging, Current Tender Stage, Normative Tender Stage, % Time Elapsed, Tender Owner, Flags.

**Flags badge colours:** Delayed = red, Off Track = amber, On Track = green, Priority = amber, Normal = neutral.

- Each column header offers quick filter options built from the visible data.
- Page size is 10 (selectable 10 / 25 / 50).
- **Click any row** to open the **Stage Wise Aging** pop-up, which shows how long the case has spent in each stage, with **Open Case** to jump to the full case.

### 6. Expiring Within 90 Days Panel

A watchlist of RC/PO contracts expiring within 90 days (shown if you have expiry access).

**Columns:** Entity, Contract Description (clickable to the source case), Source (TenderDB / Bulk Upload / Manual Entry), User Department, Vendor Name, Days Remaining for Expiry, Award Date, Validity Date, Contract Amount, Urgency.

**Urgency badge colours:** Critical / Expired = red, Warning = amber, Normal = green.

Click **View Report** to open the full **RC/PO Expiry** report.

## Best Practices

- Start every day on the Dashboard before diving into details.
- Clear the **Exception Queue** (Delayed, Off Track) first.
- Use the **Expiring Within 90 Days** panel weekly to plan renewals early.

## Common Mistakes

- **Ignoring the expiry panel** until contracts have already lapsed.
- Assuming an empty Dashboard means "no work" — it may mean **no entity mapping** (contact your admin).

## Troubleshooting

| Issue | Solution |
|---|---|
| "Could not load dashboard" | Refresh the page; if it persists, contact your administrator. |
| Numbers look outdated | Reporting data can briefly lag while background processing catches up — wait a minute and refresh. |
| Empty Dashboard | Your account may have no entity scope — contact your administrator. |

---

# 5. Procurement Cases

## Purpose

A **procurement case** is the central record in ProcureDesk. It tracks one procurement requirement from the moment a **PR (Purchase Requisition) or Scheme** is received, through tendering, evaluation, and approvals, all the way to the **RC/PO (Rate Contract / Purchase Order) award** and validity monitoring.

**Business value:** every tender is structured, trackable, auditable, and reportable — no detail is lost.

## Who Can Access

- **Create:** Group Manager, Entity Manager, Tender Owner (and Super Admin).
- **View:** all operational roles (scope depends on access level).
- **Update:** Group Manager (all), Entity Manager (their entities), Tender Owner (their cases).
- **Delete / Restore:** Super Admin only.

## Key Capabilities

- Browse, search, and filter all procurement cases.
- Create a new case from a PR/Scheme.
- Preview a case quickly in a side drawer.
- Update case details, ownership, milestones, and delay information.
- Manage vendor awards (after completion).
- Export selected cases.
- Restore recently deleted cases (admins with restore permission).

## How to Access

```
Sidebar → Cases → Active Cases
```

The header reads **"Cases"** with the description *"Create, track, and update procurement cases from PR intake to RC/PO award."*

[Insert Screenshot – Cases List]

## 5.1 The Cases List

### Toolbar

- **Search box** — search by Case ID or tender name (placeholder *"Search Case ID, tender name…"*). It searches as you type (after a short pause).
- **Filters** button — opens the filter panel; shows a number badge with how many filters are active.
- **Columns** button — opens a drawer to show/hide table columns.

### Active Filter Chips

When filters are applied, a chip row appears (e.g. *"Status: running," "Entity: …," "Priority"*). Click the **X** on a chip to clear that filter, or **Clear all** to reset everything.

### Filter Panel — Field Reference

| Filter | Description | Example |
|---|---|---|
| Entity | One or more legal entities (resets Department & Owner when changed) | "RPSG Power" |
| Department | Requesting department (enabled when exactly one entity is selected) | "Civil" |
| Tender Type | The tender type classification | "Open" |
| Nature of Work | Work category | "Maintenance" |
| Budget Type | Budget classification | "Capex" |
| PR Receipt Month | Month the PR was received (last 18 months) | "2026-04" |
| Completion FY | Financial year of completion | "2025-2026" |
| Value Slab | Budget band | "Rs. 10 Lakhs - < Rs. 25 Lakhs" |
| Status | Running / Completed | Running |
| Delay Indicator | Delayed / Off Track / On Track | Delayed |
| Routed Through CPC | Yes / No | Yes |
| LOI Awarded? | Yes / No | No |
| Priority | Priority cases only | (checkbox) |
| Assigned to me | Only your cases | (checkbox) |
| PR Date From / To | PR receipt date range | 01-04-2026 to 30-04-2026 |

**Value Slab options:** Below Rs. 2 Lakhs · Rs. 2–<5 Lakhs · Rs. 5–<10 Lakhs · Rs. 10–<25 Lakhs · Rs. 25–<50 Lakhs · Rs. 50–<100 Lakhs · Rs. 100–<200 Lakhs · ≥ Rs. 200 Lakhs.

**Buttons:** **Clear** resets all filters; **Apply** closes the panel and applies them.

### Saved Views

- **Saved View** dropdown — apply a previously saved filter + column setup.
- **View Name** box + **Save** button — save your current filters and visible columns for reuse later.

### Columns Drawer

Tick or untick columns to control what the table shows. *Case ID* and *Actions* are always visible. Available columns include: Description, Entity, Type, Dept, Tender Owner, PR Value / Approved Budget, NFA Approved Amount, Savings vs PR, Savings vs Estimate/Benchmark, Tender Stage, Normative Stage, % Time Elapsed, Run Age, Cycle Time, Status, Comp. FY, Updated.

### Reading the Table

- **Status badge:** Completed = green, Running = amber.
- **% Time Elapsed** shows "-" for completed cases; **Cycle Time** shows only for completed cases.
- Click the **preview icon** in the Actions column to open the **Case Preview** drawer.
- Click anywhere on a row to open the **full case page**.
- **Pagination:** 25 cases per page, with **Previous** / **Next** buttons.

## 5.2 Creating a Case

### How to Access

Click **New Case** (top right of the Cases list), or use **Add New Case** on the Dashboard.

[Insert Screenshot – Create Case Form]

### Step-by-Step Instructions

1. **Select the Entity.** Choose the legal entity this case belongs to. (If you are mapped to only one entity, it is selected automatically.) This resets Department and Owner.
2. **Select the Department.** Choose the requesting department.
3. **Select the Tender Owner.** Choose the person responsible for the case.
4. **Confirm the Case ID.** This is auto-generated (format: `RPSG_EntityCode_DDMMYYYY_HHMMSS`) — you do not type it.
5. **Enter the PR Receipt Date.** The date the PR/Scheme was received (cannot be in the future).
6. **Enter the PR Value / Approved Budget.** The all-inclusive INR amount (commas are added automatically).
7. **Enter the PR Description.** A clear description of what is being procured.
8. **Select the Tender Type.** Type to search. The completion rule (e.g., "PR date + N days") is shown for each type.
9. **Confirm the Tentative Completion Date.** Auto-calculated as PR date + tender type days. Entity-level users may override it; others cannot.
10. **Select the Budget Type** and **Nature Of Work.**
11. Tick **CPC Involved?** and/or **Priority Case** if applicable.
12. Click **Create Case.** On success you see *"Case created."* and land on the new case page.

### Field Explanations

| Field Name | Description | Required | Example |
|---|---|---|---|
| Entity | Legal entity for the case | Yes | "RPSG Power" |
| Department | Requesting department | Yes | "Civil" |
| Tender Owner | Person responsible | Yes | "Rohan Mehta" |
| Case ID | Auto-generated unique ID | Yes (auto) | `RPSG_PWR_18052026_103045` |
| PR Receipt Date | Date PR/Scheme received | Yes | 18-05-2026 |
| PR Value / Approved Budget | All-inclusive INR amount | Yes | 25,00,000.00 |
| PR Description | What is being procured | Yes | "Annual civil maintenance contract" |
| Tender Type | Tender classification | Yes | "Open" |
| Tentative Completion Date | Target completion date | Yes | 17-08-2026 |
| Budget Type | Budget classification | Yes | "Opex" |
| Nature Of Work | Work category | Yes | "Maintenance" |
| CPC Involved? | Routed through CPC | Optional | (checkbox) |
| Priority Case | Flag as high priority | Optional | (checkbox) |

### Common Validation Messages

- *"Entity is required." / "Department is required." / "Tender Owner is required."*
- *"PR receipt date cannot be in the future."*
- *"Enter a valid non-negative INR amount."*
- *"Completion date cannot be before PR receipt date."*

## 5.3 The Case Detail Page

Opened by clicking a case row. Route: `/cases/<id>`.

**Top bar:** back button, PR ID, case title, and status badges (Completed/Running, Delayed/Off Track/On Track, Priority, CPC). A **Delete** button appears for users who can delete.

**KPI strip:** Running Age, Time Elapsed %, Target Date, Current Stage, Normative Stage, Completion FY, and (on non-overview tabs) financial figures.

### Tabs

| Tab | Purpose |
|---|---|
| **Overview** | Key case info, PR details, milestone details, financial summary, remarks. |
| **Update** | Edit case details, milestone dates, delay info, and ownership. |
| **Timeline** | Visual milestone timeline and delay tracking. |
| **Awards** | Manage vendor awards (enabled only after the case is completed). |
| **Activity** | Audit history of the case (requires audit access). |

[Insert Screenshot – Case Detail Page]

### Procurement Stage Labels

| Stage | Meaning |
|---|---|
| Stage 0 | PR under review by Buyer |
| Stage 1 | NIT Approval Awaited |
| Stage 2 | NIT Approved, Tender to be published |
| Stage 3 | NIT published, Bids awaited |
| Stage 4 | Bids under evaluation |
| Stage 5 | Evaluation completed, in Negotiation stage |
| Stage 6 | NFA Note under approval |
| Stage 7 | NFA Note Approved, RC/PO to be issued |
| Stage 8 | RC/PO issued |

## 5.4 Updating a Case (Update Tab)

The Update form is divided into sections that appear according to your permissions.

### Basic Details
- **Tender Name** (max 500 characters)
- **Tender No** (max 200 characters)
- **Tender Owner's Remarks** (max 5000 characters)
- **Priority Case** (checkbox)

### Ownership And Target (entity-level users only)
- **Tender Owner** — reassign the owner (only users mapped to the case entity appear).
- **Tentative Completion Date** — adjust the target date.

### Delay (delay-management users only)
- **External Delay Days** — whole number ≥ 0.
- **Delay Reason** — explanation (max 5000 characters).

### Milestones / Procurement Timeline
Enter the milestone dates **in chronological order**:

1. **NIT Initiation**
2. **NIT Approval**
3. **NIT Publish**
4. **Bid Receipt**
5. **Bidder Participated Count**
6. **Technical Evaluation** / **Commercial Evaluation**
7. **Qualified Bidders Count**
8. **Estimate / Benchmark amount**
9. **NFA Submission** / **NFA Approval**
10. **NFA Approved Amount**
11. **LOI Issued** (+ LOI Issued Date if ticked)
12. **RC/PO Award**
13. **RC/PO Validity**

> **Important — date order rules:** Each milestone date must come on or after the previous one. For example, *"NIT Approval cannot be before NIT Initiation,"* *"Bid Receipt cannot be before NIT Publish,"* and *"RC/PO Validity cannot be before RC/PO Award."* The system will block the save and highlight the fields if dates are out of order.

> **Rule:** The **NFA Approved Amount** is required before NFA approval, LOI, or RC/PO award milestones can be saved. Also, **Qualified bidders cannot exceed bidders participated.**

**Saving:** the save bar shows *"Unsaved changes"* / *"No unsaved changes."* Click **Save Case**. On success you see *"Case saved."* The system saves details, milestones, ownership, and delay together.

## 5.5 Buttons & Actions Summary

| Button / Icon | What It Does | When to Use |
|---|---|---|
| **New Case** | Opens the Create Case form | Starting a new procurement |
| **Preview** (panel icon) | Opens the quick-view drawer | Fast look without leaving the list |
| **Edit** (pencil) | Opens the edit drawer | Quick edits |
| **Award** (trophy) | Opens Awards (only after completion) | Recording vendor awards |
| **Open** (external link) | Opens the full case page | Detailed work |
| **Save Case** | Saves all changes | After editing |
| **Delete** (trash, red) | Soft-deletes the case (recoverable) | Removing an erroneous case (Super Admin) |
| **Restore** | Recovers a deleted case | Recovery section |
| **Export** | Exports selected cases | Sharing data offline |

## 5.6 Deleting & Restoring Cases

- **Delete:** opens a confirmation dialog *"Delete Case"* with a **Reason for deletion** box. Deletion is a **soft delete** — the case can be recovered.
- **Restore:** open **Cases → Recovery**, find the case, and click **Restore**. You will see *"Case restored."*

> **Warning:** Only **Super Admin** can delete or restore cases. Always enter a clear deletion reason for the audit trail.

## Example Workflow

> **Scenario:** A new PR for "Annual Civil Maintenance" worth Rs. 25 Lakhs arrives.
> 1. Tender Owner clicks **New Case**, selects entity/department/self as owner, enters PR date, value, description, tender type "Open," and saves.
> 2. Over the following weeks the owner opens the case → **Update** tab and records each milestone as it happens (NIT Initiation → Approval → Publish → Bid Receipt → Evaluation → NFA Submission → NFA Approval).
> 3. Once the contract is awarded, the case becomes **Completed**; the owner opens the **Awards** tab and records the winning vendor and RC/PO value.
> 4. The case now appears in **Completed** reports and, as validity nears, on the **RC/PO Expiry** watchlist.

## Best Practices

- Update milestones **as they happen**, not in bulk later — this keeps stage aging accurate.
- Always fill the **NFA Approved Amount** before recording NFA approval.
- Use **Priority Case** sparingly so it remains meaningful.
- Save **Saved Views** for filter combinations you use daily.

## Common Mistakes

- Entering milestone dates out of order (the system will block this).
- Forgetting to record awards after completion (the case will not show savings correctly).
- Not selecting the correct entity first (it resets Department and Owner).

## Troubleshooting

| Issue | Solution |
|---|---|
| "Fix the highlighted milestone fields before saving." | Correct the date order; each milestone must follow the previous one. |
| Cannot open the Awards tab | Awards are enabled only after the case is **Completed**. |
| Cannot see the Update tab | Your role may be view-only for this entity. |
| Case missing from the list | Check active filters and your entity scope. |

---

# 6. Awards

## Purpose

The **Awards** feature records which vendor(s) won a procurement case, the RC/PO number and value, and the contract validity. This drives savings calculations and feeds the contract-expiry watchlist.

## Who Can Access

Group Manager, Entity Manager, Tender Owner (and Super Admin). Other roles see awards as **read-only**.

## How to Access

Open a **completed** case → **Awards** tab, or use the **Award** button in the case preview drawer.

> **Note:** The Awards tab is **disabled until the case is completed.** The tooltip explains: *"Awards are enabled after the case is completed."*

[Insert Screenshot – Awards Panel]

## Award Summary Strip

Shows **Tender Name**, **PR Description**, **NFA Approved Amount**, and **Total RC/PO Awarded**. If the total awarded exceeds the approved amount, the total turns red with the caption *"Exceeds approved amount."*

## Step-by-Step: Adding an Award

1. On the Awards tab, click **Add Award**.
2. Fill in the form (see field table below).
3. Click **Add Award** to save. You will see *"Award added."*

### Field Explanations

| Field Name | Description | Required | Example |
|---|---|---|---|
| Vendor Name | The awarded vendor | Yes | "ABC Infra Pvt Ltd" |
| Vendor Code | Internal vendor code | Optional | "V-10293" |
| RC/PO No. | Rate contract / PO number | Optional | "PO-2026-0457" |
| RC/PO Value (Rs.) [All Inclusive] | Awarded amount | Optional | 2400000.00 |
| RC/PO Award Date | Date of award | Optional | 15-05-2026 |
| RC/PO Validity Date | Contract validity end | Optional | 14-05-2027 |
| Notes | Free-text notes | Optional | "Two-year option" |

## Buttons & Actions

| Button | What It Does |
|---|---|
| **Add Award** | Opens the add-award form |
| **Edit** (pencil) | Edit an existing award |
| **Delete** (trash, red) | Remove an award (confirmation required) |
| **Save Award** | Saves changes to an award |
| **Cancel** | Closes the form without saving |

## Notifications & Statuses

- Toasts confirm actions: *"Award added," "Award saved," "Award removed."*
- The **earliest validity date** among all awards becomes the case's RC/PO Validity. If no awards are entered, the manual RC/PO Validity field on the Update form stays editable.

## Best Practices

- Record awards immediately after the case completes.
- Enter the **RC/PO Validity Date** accurately — it powers expiry alerts.
- Use **Notes** to capture special terms (renewal options, conditions).

## Common Mistakes

- Total awarded exceeding the NFA approved amount (flagged in red — review before proceeding).
- Validity date set before the award date (blocked: *"RC/PO Validity Date cannot be before RC/PO Award Date."*).

## Troubleshooting

| Issue | Solution |
|---|---|
| "Awards can be managed after the case is completed." | Complete the case milestones first. |
| "Awards are read-only for your role." | You do not have award-management permission. |
| Total shows red | Awarded total exceeds approved amount — verify the figures. |

---

# 7. Planning

## Purpose

The **Planning** module helps you look ahead. It maintains a pipeline of **upcoming tenders** so procurement work is planned proactively, and it links to the **RC/PO Expiry** report so renewals are never missed.

## Who Can Access

Group Manager and Entity Manager can manage planning; Super Admin has full access. Other roles' visibility depends on permissions.

## How to Access

```
Sidebar → Planning → Tender Plans
```

Header: **"Tender Planning"** — *"Plan upcoming tenders and export the tender planning pipeline."*

[Insert Screenshot – Tender Planning]

## Key Capabilities

- View the upcoming tender pipeline.
- Create, edit, and delete tender plans.
- Convert a tender plan directly into a procurement case.
- Export the pipeline to CSV.
- Jump to the RC/PO Expiry report.

## The Upcoming Tender Plans Panel

**Inline filters:** Entity, Nature of Work, CPC Involved?, plus a **Clear** button.

**Columns:** Entity, User Department, Nature of Work, Tender Description, Value (Rs.) [All Inclusive], Planned Date, CPC Involved?, and (for managers) an Actions column.

## Step-by-Step: Creating a Tender Plan

1. Click **Create Tender Plan**.
2. Select the **Entity** (changing it clears Department).
3. Select the **Department**.
4. Choose the **Nature of Work**.
5. Enter the **Tender Description**.
6. Enter the **Value (Rs.) [All Inclusive]**.
7. Choose the **Planned Date**.
8. Tick **CPC involved** if applicable.
9. Click **Add Tender Plan**. You will see *"Tender plan added."*

### Field Explanations

| Field Name | Description | Required | Example |
|---|---|---|---|
| Entity | Legal entity | Yes | "RPSG Power" |
| Department | Requesting department | Optional ("All") | "Stores" |
| Nature of Work | Work category | Yes | "Supply" |
| Tender Description | What will be tendered | Yes | "Annual stationery supply" |
| Value (Rs.) [All Inclusive] | Estimated value | Yes | 500000 |
| Planned Date | Target tender date | Yes | 01-07-2026 |
| CPC involved | Routed through CPC | Optional | (checkbox) |

## Buttons & Actions

| Button | What It Does |
|---|---|
| **Create Tender Plan** | Opens the new-plan form |
| **Export** | Downloads the visible plans as a CSV file |
| **Create Case** (row) | Converts the plan into a procurement case (pre-filled) |
| **Edit** (row) | Edit the plan |
| **Delete** (row) | Removes the plan from the pipeline |
| **Clear** | Resets the inline filters |

> **Note:** When you convert a tender plan into a case using **Create Case**, the original plan is archived automatically and you are taken to the new case.

## Example Workflow

> A contract for "Annual Stationery Supply" expires in three months. The Entity Manager opens **Planning**, clicks **Create Tender Plan**, records the entity, department, value, and a planned tender date one month before expiry. When it's time to act, they click **Create Case** on that row — the case is created pre-filled and the plan is archived.

## Best Practices

- Create tender plans for **every contract approaching expiry** in the next 1–2 quarters.
- Set the **Planned Date** with enough lead time for the full tender cycle.
- Export the pipeline before planning reviews with leadership.

## Common Mistakes

- Planning the tender date too close to contract expiry, leaving no buffer.
- Forgetting to convert a plan to a case when work actually starts (the pipeline then looks busier than reality).

## Troubleshooting

| Issue | Solution |
|---|---|
| "No tender plans found." | Adjust filters or create a new plan. |
| Cannot click Create Tender Plan | You may lack an entity or planning permission. |

---

# 8. Reports & Analytics

## Purpose

The **Reports** workspace turns procurement data into insight: KPI dashboards, detailed tabular reports, saved views, and exportable files for offline analysis and management reporting.

## Who Can Access

Anyone with report-read permission can view reports. **Exporting** requires export permission (Entity Viewer can view but not export).

## How to Access

```
Sidebar → Reports
```

Opens on the **Analytics** tab by default.

[Insert Screenshot – Reports Analytics]

## 8.1 Report Types

| Report | What It Shows |
|---|---|
| **Analytics** | KPIs, trends, charts, and exception summaries. |
| **Tender Details** | All attributes of every tender case. |
| **Running Tender** | Open cases and their stage progress. |
| **Completed Tender** | Closed cases and cycle outcomes. |
| **Vendor Awards** | Vendor award values and savings. |
| **Stage-Time Lapsed** | Time spent (ageing) in each stage. |
| **Technical Evaluation Pendency** | Running tenders pending technical evaluation. |
| **Technical Evaluation Time** | Technical evaluation duration for completed tenders. |
| **RC/PO Expiry** | Contracts nearing validity end. |
| **Export Jobs** | Generated CSV/XLSX files to download. |

## 8.2 The Analytics Dashboard

- **Procurement command center tiles:** Case Volume (Total, Running, Completed), Exception Queue (Delayed, Off Track, Priority), Delivery Health (On Track). Each tile is clickable and drills into a filtered case list.
- **Overview KPIs:** Tenders Count, Tender Value, NFA Approved Amount, Savings (vs PR and vs Estimate), Avg Bidder Participation, Avg Qualified Bidders, Avg Cycle Time, Avg Running Tender Age.
- **Charts:** Entity-wise PR value distribution, Cases by entity, Department case count by nature of work, Tender Track Analysis, Stage distribution. Charts are clickable to drill into filtered cases.

### KPI Definitions

| KPI | Meaning |
|---|---|
| **Total** | Count of rows after filters |
| **Running** | Running cases after filters |
| **Completed** | Completed cases after filters |
| **Delayed** | Cases exceeding target/delay rules |
| **Awarded** | Sum of awarded amount |
| **Savings WRT PR** | PR / approved budget minus awarded amount |
| **Avg Bidders** | Average participated bidder count |
| **Avg Qualified** | Average qualified bidder count |

> **Note:** All KPIs always respect the **current filters**. A "-" instead of "0" means there is no meaningful value (zero would mislead).

## 8.3 Filters, Search & Saved Views

- **Search box** — search by Case ID, tender, or vendor.
- **Status select** — All / Running / Completed (on relevant reports).
- **More Filters** — opens the advanced filter panel (Completion FY, Completion Month, Entity, Department, Tender Type, Stage, Owner, PR Receipt Month, LOI Awarded?, Nature of Work, Budget Type, Value Slab, Delay Indicator, CPC, Priority, Show deleted, Currency Unit).
- **Refresh Report Data** — recomputes report figures; shows *"Report data refreshed."*
- **Views** — toggle the saved-views row to apply or save a named preset.
- **Reset** — clears all filters.

> **Tip:** Use **Saved Views** for recurring reports (e.g., "Monthly Running Tenders for Entity X"). Select a saved view and the report opens pre-filtered.

## 8.4 Exporting Reports

1. Open a data report tab and apply your filters.
2. Choose the export format in the filter panel: **XLSX** or **CSV**.
3. Click **Export XLSX** / **Export CSV** in the header.
4. You'll see *"Export queued: [id]"* and be taken to **Export Jobs**.
5. The job processes in the background (the page auto-refreshes every few seconds).
6. When the status reaches **Completed**, click **Download**.

### Export Job Statuses

| Status | Meaning |
|---|---|
| **Queued** | Waiting to start |
| **Running / Processing** | File being generated |
| **Completed** | Ready to download |
| **Failed** | Generation failed — re-run after resolving |
| **Expired** | File past its retention period — re-run the export |

> **Note:** The **Schedule** button (scheduled report delivery) is currently disabled — *"Scheduled report delivery is coming soon."*

## 8.5 RC/PO Expiry Report (Special)

This report lists contracts/POs nearing expiry. Columns include Source (Bulk Upload / TenderDB), Tender Description, Entity, Department, Nature of Work, RC/PO Amount, Award Date, Validity Date, Owner, Awarded Vendors, Tentative Tendering Date, Tender Floated?, and Actions.

- Managers with planning permission can edit **Tentative Tendering Date** and **Tender Floated?** inline and click **Save**.
- **Create Case** converts an expiring contract row into a new procurement case (and marks Tender Floated = true).
- Filters include a **Horizon (Days)** option and toggles to include expired contracts.

## Best Practices

- Apply filters **before** exporting so the file contains only what you need.
- Use **Currency Unit** (Rupees vs Rs. Lakhs) consistently in management reports.
- Re-run exports promptly if they show **Expired**.

## Common Mistakes

- Expecting report counts to exactly match a different screen — counts always reflect the **current filters**.
- Downloading before the job reaches **Completed** (the button only appears when ready).

## Troubleshooting

| Issue | Solution |
|---|---|
| Export stuck on Queued/Running | Wait — the page refreshes automatically; large files take longer. |
| "Export failed." | Re-run the export; if it keeps failing, contact your administrator. |
| Numbers differ from the Dashboard | Filters differ, or background processing is briefly catching up. |

---

# 9. Imports & Exports

## Purpose

The **Imports** module is a controlled, enterprise-grade way to bring large volumes of data into ProcureDesk safely — onboarding current tenders, users, departments, and historical contracts using official Excel templates with validation and preview before anything is committed.

## Who Can Access

Users with import-management permission (typically Group Manager, Entity Manager, and Super Admin).

## How to Access

```
Sidebar → Imports → Upload
```

Header: **"Imports And Exports."**

[Insert Screenshot – Import Upload]

## 9.1 Supported Import Types

| Import Type | What It Loads |
|---|---|
| **Tender Bulk Import** | Procurement case data with milestones, budgets, departments, owners. |
| **Portal Users** | Creates/updates portal users, roles, and entity access. |
| **Departments** | Creates entities/department mappings without duplicates. |
| **Old Contracts** | Legacy RC/PO contract records for renewal and expiry tracking. |

## 9.2 Step-by-Step: Importing Data

1. Open **Imports → Upload**.
2. Select the **Import Type** card that matches your data.
3. Click **Download Template** and fill your data into that exact Excel template. **Do not change the column headings.**
4. Save the file as **`.xlsx` or `.csv`** (these are the only accepted formats).
5. Drag the file into the **Import File** area (or click to choose it).
6. Click **Upload And Queue.** You'll see *"Import job created: [id]"* and be taken to **Import Jobs**.
7. The system parses and validates the rows in the background.
8. When parsing is done, click **Preview** to review every row (accepted / rejected / staged) and any issues.
9. If there are rejected rows, click **Problem Rows** to download them, fix the errors, and re-upload.
10. When **all rows are accepted**, click **Commit** to finalise. You'll see *"Import committed."*

> **Important:** An import can only be committed when **every row is accepted**. This protects your live data from partial or invalid imports.

## 9.3 Import Jobs Screen

**Filters:** Type, Status (Queued / Parsing / Parsed / Committed / Failed), Clear Filters.

**Columns:** Type, Status, Progress, Rows, Accepted, Rejected, plus Actions: **Preview**, **Problem Rows** (download), **Credentials** (download — for user imports), **Commit**.

## 9.4 Validation & Error Handling

Each issue is reported with a **row number, column label, severity, and a human-readable message**.

| Severity | Meaning |
|---|---|
| **Error** | Blocks the commit — must be fixed |
| **Warning** | Allows commit, but review first |
| **Info** | Advisory only |

Common validation rules: the entity must be active and accessible; the tender owner must belong to the selected entity; PR/Scheme numbers must be unique within an entity; dates must be in correct chronological order; qualified bidders cannot exceed participated bidders; RC/PO validity must be after the award date. **Maximum 10,000 rows per file.**

## 9.5 Exports

Exports are produced from the **Reports** module (see Section 8.4). Files are generated in the background and downloaded once **Completed**. Supported formats: **XLSX** and **CSV**. Exports are private to your organisation and require you to be logged in to download.

## Best Practices

- Always start from the **latest downloaded template**.
- Validate and **Preview** before committing — never skip this step.
- Fix and re-upload **Problem Rows** rather than forcing a partial import.
- Import in reasonable batches; keep within the 10,000-row limit.

## Common Mistakes

- Editing or reordering template column headings.
- Uploading the wrong file type (only `.xlsx` / `.csv` are accepted).
- Trying to commit while rejected rows still exist.

## Troubleshooting

| Message | Meaning / Solution |
|---|---|
| "One or more rows use an entity code that does not exist or is outside your access." | Correct the entity code or check your entity scope. |
| "Import failed before row validation finished…" | Check the file format against the template and re-upload. |
| "Import was not committed. Review the staged rows and try again." | Some rows are not accepted — fix Problem Rows first. |

---

# 10. Email Notifications (Operations)

## Purpose

The **Email Notifications** area (under Admin → Operations) lets administrators choose which business emails go out, preview recipients, review delivery history, and investigate delivery issues.

## Who Can Access

**Super Admin** and **Administration Manager** (notification management). The **Delivery Issues** view also requires audit access.

## How to Access

```
Sidebar → Admin → Operations
```

Header: **"Email Notifications."**

[Insert Screenshot – Email Notification Rules]

## 10.1 Sections

| Section | Purpose |
|---|---|
| **Email Rules** | Choose which business emails are enabled and how often. |
| **Recipients Preview** | Check who would receive each email before it is sent. |
| **Email History** | Review queued, sent, and failed emails. |
| **Delivery Issues** | Investigate delivery failures. |

## 10.2 Email Rules

Configure a rule and click **Save Rule** (*"Notification rule saved."*).

| Field | Description | Options / Example |
|---|---|---|
| Email Rule | Which email this rule controls | Manager Daily Snapshot, Delayed Case Reminder, Off Track Case Reminder, RC/PO Expiry Reminder, Entity Monthly Digest, No Recent Update Reminder |
| Schedule | How often it runs | Daily, Weekly, Monthly, Manual |
| Threshold Days | Day threshold for the rule | e.g., 14 |
| Enabled | Turns the rule on/off | (checkbox) |

## 10.3 Recipients Preview

Shows, per rule, the exact emails that are eligible to be sent (Subject, Recipient, Summary).

> **Note:** If Microsoft Graph email delivery is **not configured**, the banner reads *"Stub mode — previews are available, but no email leaves the system until Microsoft Graph is configured."* In this mode you can still preview, but no emails are actually sent. Email delivery must be configured during deployment.

## 10.4 Email History

Filter by **History Type** and **Status** (Queued / Sending / Sent / Failed / Cancelled). For failed or cancelled jobs you can **Retry**; for queued or failed jobs you can **Cancel**.

## 10.5 Delivery Issues

Lists delivery failures (Time, Event, Attempts, Error) for administrator review.

## Best Practices

- Use **Recipients Preview** before enabling a new scheduled rule.
- Keep **Threshold Days** aligned with your organisation's SLA expectations.
- Periodically review **Delivery Issues** to catch email problems early.

## Common Mistakes

- Enabling a rule without previewing recipients (unexpected emails).
- Assuming emails are sent when the system is in **Stub mode**.

---

# 11. Administration

## Purpose

The **Admin** workspace is where the platform is configured: users, roles, entities, departments, reference data (choice lists), tender rules, audit logs, and email operations.

## Who Can Access

Users with admin-console access — typically **Administration Manager** and **Super Admin**. Each section is permission-gated; you only see the sections you are allowed to use.

## How to Access

```
Sidebar → Admin → Overview
```

[Insert Screenshot – Admin Overview]

## 11.1 Admin Sections

| Section | Purpose |
|---|---|
| **Overview** | Setup-health summary at a glance. |
| **Users & Security** | Manage users, access levels, mapped entities, roles, and password policy. |
| **Roles** | Create and manage tenant roles and permission bundles. |
| **Entities & Departments** | Manage legal entities and their departments. |
| **Choice Lists** | Manage dropdown categories and values used across forms. |
| **Tender Types** | Manage tender types, completion days, and milestone rules. |
| **Audit Logs** | Review who did what, when, and from where. |
| **Operations** | Email notification rules and delivery (see Section 10). |

## 11.2 Admin Overview

Clickable metric cards: **Users**, **Entities**, **Choice Values**, **Tender Rules** — each shows a count and opens the related section.

## 11.3 Users & Security

### User Directory

Columns: Username, Full Name, Email, Access Level, Entities, Admin Role, Status (Active / Inactive / Locked / Pending), Actions.

**Actions:** **Edit user** (pencil) and a status toggle (**Deactivate** / **Activate**).

### Creating / Editing a User

1. Click **New User**.
2. Enter **Username**, **Full Name**, **Email**.
3. Set a **Password**, or keep **Send setup email** ticked (recommended — the user sets their own password via a secure link).
4. In **Role & Access**, pick a **Primary Role** (this auto-sets the appropriate access level).
5. In **Visibility**, choose what the user can see: **Mapped entities**, **Assigned tenders**, or **All entities** (locked options are controlled by the role).
6. In **Mapped Entities**, tick the entities the user belongs to (required for ENTITY access).
7. Review the **Final Preview** (roles, scope, admin rights, and any high-risk signals).
8. Click **Create User** / **Save User**.

| Field | Description | Required | Example |
|---|---|---|---|
| Username | Login identifier | Yes | "rohan.mehta" |
| Full Name | Display name | Yes | "Rohan Mehta" |
| Email | Contact / login email | Yes | "rohan.mehta@company.com" |
| Password | Initial password | Yes (if not sending setup email) | (hidden) |
| Send setup email | Email a secure setup link instead | Optional (recommended) | (checkbox) |
| Primary Role | The user's role | Yes | "Tender Owner" |
| Visibility | Access level | Yes | "Mapped entities" |
| Mapped Entities | Entities the user belongs to | Required for ENTITY access | "RPSG Power" |

### Password Policy

| Field | Description | Default |
|---|---|---|
| Minimum Length | Minimum password length | 12 |
| History Count | Past passwords blocked from reuse | 5 |
| Lockout Attempts | Failed attempts before lockout | 5 |
| Lockout Minutes | Lockout duration | 15 |
| Uppercase / Lowercase / Number / Special Character | Required character types | All on |
| Periodic Expiry / Expiry Days | Force periodic password change | Off |

Click **Save Policy** (*"Password policy saved."*).

## 11.4 Roles & Permissions

The **Role Directory** shows cards for each role (System or Tenant), with permission counts and user counts.

- **Clone** a role to create a customised copy (system roles cannot be edited directly).
- **Edit** a tenant role's name, description, and permissions.
- **Delete** a tenant role (only if no users are assigned and it is not a system role).

When creating a role: enter a **Role Code** (lowercase, permanent), **Role Name**, **Description**, then select permissions (grouped by area: Cases, Awards, Reports, Imports, etc.).

> **Warning:** System roles cannot be edited or deleted. Always **clone** a system role to customise it.

## 11.5 Entities & Departments

- Summary cards: **Entities**, **Active**, **Departments**, **Linked Tenders**.
- An expandable tree: click a row to reveal that entity's departments.
- **New Entity** — enter **Code** (uppercase), **Name**, and optionally seed departments (paste one per line, or use suggested chips like Commercial, Civil, Stores, Finance, HR & Admin, IT, Mechanical, Electrical).
- **Add / Edit / Delete Department** within each entity.

> **Note:** An entity or department **with linked tenders cannot be deleted**. Deactivate it instead.

## 11.6 Choice Lists (Reference Data)

Choice Lists are the dropdown categories and values used across forms (e.g., Budget Type, Nature of Work).

- **System categories** cannot be renamed (forms and reports depend on them).
- **Tenant categories** can be created, edited, and deleted **only when no values are mapped to tenders**.
- A value used by tenders cannot be deleted — **deactivate** it instead (it remains visible on historical records).

To add a value: choose the **Category**, type the **Value**, click **Add Value**.

## 11.7 Tender Types

Manage tender types and their completion rules.

| Field | Description | Example |
|---|---|---|
| Tender Type Name | Name of the tender type | "Open" |
| Completion Days | Days added to PR date for the target date | 90 |
| Require full milestone workflow | Whether the full bid workflow applies | (checkbox) |
| Active | Whether it can be selected on forms | (checkbox) |

> **Note:** The Tentative Completion Date on a case = **PR Receipt Date + Completion Days** for the chosen tender type.

## 11.8 Audit Logs

Search and review security-sensitive and business-critical activity.

- **Filters:** Action, Object Type, Search Summary.
- **Columns:** Timestamp (UTC), User, Action, Type, ID, Summary, IP, Event.
- Click **View details** (eye icon) to see the full event, including the actor, IP, user agent, summary, and detailed change data.
- Action badges are colour-coded (deletions in red, updates in amber, creations in green).

## Best Practices

- Prefer **Send setup email** over sharing passwords.
- Review **Final Preview → Risk Signals** before saving any high-privilege user.
- **Deactivate** rather than delete reference values and entities that have history.
- Review roles and entity scopes quarterly.

## Common Mistakes

- Trying to edit a system role (clone it instead).
- Deleting a choice value still in use (deactivate it).
- Forgetting to map an entity-level user to an entity (their pages stay empty).

## Troubleshooting

| Issue | Solution |
|---|---|
| "Access Denied" in Admin | You lack that section's permission. |
| Cannot delete an entity/role/value | It is still in use — deactivate it instead. |
| New user sees empty pages | Map them to at least one entity. |

---

# 12. My Profile

## Purpose

The **My Profile** drawer lets every user update their display name and change their own password.

## How to Access

Click the **pencil icon** next to your name at the bottom of the sidebar. The drawer **"My Profile"** opens.

[Insert Screenshot – My Profile Drawer]

## Personal Details

| Field | Description | Editable |
|---|---|---|
| Full name | Your display name | Yes |
| Email | Your email | No (managed by an administrator) |
| Username | Your login name | No (managed by an administrator) |

Change your name and click **Save Profile** (*"Profile updated."*).

## Change Password

1. Enter your **Current password**.
2. Enter a **New password** (at least 12 characters, with uppercase, lowercase, number, and special character).
3. Re-enter it in **Confirm new password**.
4. Click **Change Password** (*"Password changed."*).

### Validation Messages

- *"Password must be at least 12 characters."*
- *"New password and confirmation must match."*
- *"Current password is required."*

## Best Practices

- Change your password immediately if you suspect it is known by anyone else.
- Use a unique password not used on any other system.

---

# 13. Approval Workflows

## 13.1 The Procurement Case Lifecycle

Every procurement case follows this end-to-end flow:

1. **PR / Scheme received**
2. **Procurement case created**
3. **Entity, department, tender owner, tender type, and priority assigned**
4. **NIT initiated** (Notice Inviting Tender)
5. **NIT approved**
6. **NIT published**
7. **Bid received**
8. **Technical / commercial evaluation completed**
9. **NFA submitted** (Note for Approval)
10. **NFA approved**
11. **LOI issued** (Letter of Intent — if applicable)
12. **RC/PO awarded**
13. **RC/PO validity monitored**
14. **Case completed or delayed state tracked**

## 13.2 How Approvals Work

ProcureDesk records approvals as **milestone updates** by authorised users (rather than a separate approver inbox). The two key approval gates are:

- **NIT Approval** — internal sign-off before a tender is published.
- **NFA Approval** — sign-off of the Note for Approval before award.

A user with case-update permission records the approval by entering the relevant approval date on the **Update** tab. The case cannot progress past a gate until that approval date is recorded.

## 13.3 Order Rules (Enforced Automatically)

```
NIT Initiation ≤ NIT Approval ≤ NIT Publish ≤ Bid Receipt
```

Additional rules:
- Evaluation dates must be **after** bid receipt.
- NFA Approval must **not** precede NFA Submission.
- RC/PO Award must **not** precede the LOI date (where an LOI exists).
- RC/PO Validity must be **after** the RC/PO Award date.
- **NFA Approved Amount** must be entered before NFA approval, LOI, or RC/PO award.

## 13.4 Rejections, Delays & Escalations

- **Rejection / not approved:** there is no separate "Rejected" status. If an NIT or NFA is not approved, the case simply does not progress past that gate until the issue is resolved and the approval is recorded.
- **Delays:** a case is flagged **Delayed** when it breaches target/delay rules. Delay tracking and uncontrollable-delay reasons are managed at the **Super Admin / Group** level. Delayed cases surface on the Dashboard and in reports.
- **Escalation:** today, escalation is visibility-driven — priority and delayed cases are highlighted on the Dashboard and in reports, and email reminders (Delayed / Off Track / No Recent Update) can be enabled by administrators.
- **Soft delete / restore:** cases are never permanently lost on deletion — they are soft-deleted and can be restored by Super Admin from **Cases → Recovery**.

[Insert Screenshot – Milestone Timeline]

---

# 14. Notifications & Alerts

## 14.1 In-App Confirmations (Toasts)

Short pop-up messages confirm your actions, for example: *"Case created," "Case saved," "Case deleted," "Case restored," "Award added," "Tender plan added," "Report data refreshed," "Import committed,"* and *"Profile updated."*

## 14.2 Status Badges & Colours

| Colour | Meaning | Examples |
|---|---|---|
| Green | Positive / done | Completed, On Track, Active, Sent |
| Amber | Caution / attention | Running, Priority, Off Track, Warning, Pending |
| Red | Problem / urgent | Delayed, Critical, Expired, Failed |
| Grey | Neutral | Inactive, Pending stage |
| Blue | Informational | Queued, info |

## 14.3 Email Notifications

ProcureDesk sends business emails based on rules configured by administrators (see Section 10). Available email types include:

- **Manager Daily Snapshot** — daily workload summary for managers.
- **Delayed Case Reminder** — running cases already marked delayed.
- **Off Track Case Reminder** — running cases whose target date has passed.
- **No Recent Update Reminder** — running cases not updated recently.
- **Entity Monthly Digest** — monthly summary for entity users.
- **RC/PO Expiry Reminder** — contracts inside the configured expiry window.
- **New User Setup** and **Forgot Password** — account emails.

> **Note:** Email delivery depends on Microsoft Graph being configured during deployment. If it is not configured, the system runs in **Stub mode** and no emails are sent (previews still work).

## 14.4 Reminder System

Reminder rules run on a **Daily**, **Weekly**, **Monthly**, or **Manual** schedule, with a configurable **Threshold Days** value to control when a case qualifies for a reminder.

---

# 15. File Uploads & Attachments

ProcureDesk uses file uploads primarily in the **Imports** module.

## 15.1 Supported Formats

- **`.xlsx`** (Excel) and **`.csv`** — these are the only accepted file types for imports.

## 15.2 File Size / Row Limits

- Maximum **10,000 rows** per import file. Split larger datasets into multiple files.

## 15.3 Upload Process

1. Download the correct **template** for the import type.
2. Fill in your data **without changing the column headings**.
3. Save as `.xlsx` or `.csv`.
4. Drag the file into the **Import File** area (or click to select).
5. Click **Upload And Queue**, then **Preview**, then **Commit** (see Section 9).

## 15.4 Common Upload Failures

| Problem | Cause | Solution |
|---|---|---|
| File rejected | Wrong format | Save as `.xlsx` or `.csv` |
| "Import failed before row validation finished…" | File doesn't match the template | Re-download the template and re-enter data |
| Many rejected rows | Invalid data (entities, dates, duplicates) | Download **Problem Rows**, fix, re-upload |
| Cannot commit | Rejected rows remain | All rows must be accepted before commit |
| Row-limit error | More than 10,000 rows | Split into smaller files |

## 15.5 Exported Files

Reports can be exported as **XLSX** or **CSV**. Files are generated in the background, are private to your organisation, require login to download, and **expire** after a retention period (re-run the export if it shows *Expired*).

---

# 16. Search & Filters

## 16.1 Global Behaviour

- **Search boxes** are available on the Cases list and every data report. They search as you type (after a brief pause) across IDs, tender names, and vendors.
- **Filter panels** open from a **Filters / More Filters** button and show a badge with the number of active filters.
- **Active filter chips** display each applied filter; click a chip's **X** to remove it, or **Clear all** to reset.

## 16.2 Multi-Select Filters

Many filters (Entity, Department, Tender Type, etc.) let you select multiple values. They include **Select all** / **Clear** options and a search box when there are many choices.

## 16.3 Sorting

Data report tables support **column sorting** and per-column dropdown filters built from the visible data.

## 16.4 Saved Filters (Saved Views)

Both the Cases list and Reports support **Saved Views** — name and save your current filters (and, for cases, visible columns) and re-apply them in one click later. This is the recommended way to handle recurring reports.

> **Tip:** Create saved views like *"My Running Cases," "Entity X Delayed,"* or *"This FY Completed"* to save time every day.

## 16.5 URL-Driven Filters

Dashboard cards and analytics tiles open the Cases list **pre-filtered** (for example, clicking **Delayed** opens running cases filtered to delayed). This makes drilling from a summary to the underlying records instant.

---

# 17. Mobile Usage

## 17.1 Responsive Design

ProcureDesk is a responsive web application and works in mobile browsers.

- On smaller screens, the sidebar collapses into a **top bar** with a **hamburger menu** (*"Open navigation"*) and the current workspace title.
- Tapping the hamburger opens a **Navigation** drawer mirroring the desktop menu, including your profile and **Log out**.

## 17.2 Best Practices on Mobile

- Use mobile for **quick checks** — the Dashboard, case lookups, previews, and approvals/milestone updates.
- Use a **desktop/laptop** for heavy work — bulk imports, large report exports, and complex filtering — where the wider layout and file handling are easier.
- Rotate to **landscape** for wide tables and reports.
- Ensure a stable connection before committing imports or exporting large reports.

---

# 18. Security Best Practices

## 18.1 Password Safety

- Use a **strong, unique password** (at least 12 characters with uppercase, lowercase, number, and special character).
- Never share your password or reuse it on other systems.
- Change it immediately if you suspect it is compromised (My Profile → Change Password).
- After **10 failed login attempts within 15 minutes**, the account is **locked for 15 minutes** — wait or contact your admin.

## 18.2 Session Timeout

- Your session lasts up to **2 hours** and ends after **30 minutes of inactivity**.
- Always **Log out** on shared or public computers.
- Save your work regularly so an idle timeout never costs you data.

## 18.3 Access Sharing Restrictions

- Never share your login. Every action is recorded against your account in the **Audit Logs**.
- Request access changes through your administrator — do not work around permission limits.
- Administrators should apply **least privilege**: give users only the access they need and review roles/scopes quarterly.

## 18.4 Secure Usage Recommendations

- Access ProcureDesk only over trusted networks and an up-to-date browser.
- Be cautious with exported files — they contain organisational data; store and share them responsibly.
- Treat password-reset and setup emails as confidential; never forward them.
- Report anything unexpected (unfamiliar audit entries, unexpected access) to your administrator immediately.

---

# 19. Frequently Asked Questions (FAQs)

**1. What is a "procurement case"?**
It is the central record that tracks one procurement requirement from PR/Scheme receipt to RC/PO award and validity monitoring.

**2. I logged in but every page is empty. Why?**
Your account is most likely not mapped to an entity. Contact your administrator to set your entity scope.

**3. How do I reset my password?**
On the Sign in page, click **Forgot password**, enter your details, click **Send reset link**, then follow the emailed link.

**4. Why was my account locked?**
Too many failed login attempts (10 within 15 minutes). It unlocks automatically after 15 minutes, or your admin can help.

**5. How long before I'm logged out for inactivity?**
After 30 minutes of inactivity, or 2 hours total session time.

**6. Who can create a procurement case?**
Group Managers, Entity Managers, and Tender Owners (and Super Admin).

**7. Why can't I open the Awards tab?**
Awards are enabled only after the case is **Completed**.

**8. The system won't let me save milestone dates. Why?**
Milestone dates must be in chronological order (e.g., NIT Approval cannot be before NIT Initiation). Fix the highlighted fields.

**9. Why must I enter the NFA Approved Amount?**
It is mandatory before NFA approval, LOI, or RC/PO award milestones can be saved, and it drives savings calculations.

**10. Can a deleted case be recovered?**
Yes. Deletion is a soft delete. A Super Admin can restore it from **Cases → Recovery**.

**11. Why do report numbers differ from the Dashboard?**
Reports always reflect the **current filters**. Also, background processing can briefly lag live data.

**12. How do I export a report?**
Open a data report, set filters, choose XLSX/CSV, click **Export**, wait for the job to reach **Completed**, then **Download**.

**13. My export says "Expired." What now?**
Exported files expire after a retention period. Simply run the export again.

**14. What file formats can I import?**
Only `.xlsx` and `.csv`, using the official template for that import type.

**15. Why can't I commit my import?**
Every row must be accepted. Download **Problem Rows**, fix the errors, re-upload, and try again.

**16. What is the difference between Entity, Group, and User access?**
USER sees mainly assigned cases; ENTITY sees mapped entities' cases; GROUP sees all organisation cases.

**17. Why can't I edit a system role?**
System roles are protected. Clone the role to create an editable custom version.

**18. Why can't I delete an entity, department, or choice value?**
It is still linked to tenders/records. Deactivate it instead.

**19. Will I get email reminders for delayed contracts?**
Yes, if your administrator has enabled the relevant email rules and email delivery is configured.

**20. What does "Off Track" mean versus "Delayed"?**
**Off Track** means the target/form date has passed; **Delayed** means the case breaches delay rules and needs intervention.

**21. Can I save a set of filters I use every day?**
Yes — use **Saved Views** on the Cases list and on Reports.

**22. Can I use ProcureDesk on my phone?**
Yes — it is responsive. Use mobile for quick checks and a computer for heavy import/export work.

**23. How do I change my display name?**
Open **My Profile** (pencil icon by your name) → update **Full name** → **Save Profile**.

**24. Who do I contact for access changes?**
Your organisation's ProcureDesk administrator. Access is always granted through proper role/scope assignment.

---

# 20. Glossary

| Term | Meaning |
|---|---|
| **PR** | Purchase Requisition — a request that triggers a procurement case. |
| **Scheme** | An alternative procurement trigger ("PR/Scheme"). |
| **NIT** | Notice Inviting Tender — the formal tender notice. |
| **NFA** | Note for Approval — internal approval note before award. |
| **LOI** | Letter of Intent — issued to the selected vendor before formal contract. |
| **RC** | Rate Contract. |
| **PO** | Purchase Order. Often paired as **RC/PO**. |
| **Tenant** | Your organisation — a private, isolated data boundary. |
| **Entity** | A legal company within your organisation. |
| **Department** | A sub-unit of an entity that requests procurement. |
| **Tender Owner** | The user responsible for a procurement case. |
| **Entity Scope** | The set of entities a user is mapped to. |
| **Access Level** | The breadth of data visibility: USER, ENTITY, or GROUP. |
| **Role** | A bundle of permissions defining what a user can do. |
| **Permission** | A single allowed action (e.g., create a case, export a report). |
| **Procurement Case** | The central record tracking one requirement end to end. |
| **Milestone** | A dated step in the case lifecycle (NIT, Bid, NFA, Award, etc.). |
| **Stage** | The current position of a case in the lifecycle (Stage 0–8). |
| **Normative Stage** | The stage a case is expected to be in by now. |
| **Running Tender Age** | Days the case has been running. |
| **Current Stage Aging** | Days the case has spent in its current stage. |
| **% Time Elapsed** | Portion of the target timeline already used. |
| **Cycle Time** | Total time taken by a completed case. |
| **Delayed** | A case breaching target/delay rules. |
| **Off Track** | A case whose target/form date has passed. |
| **On Track** | A case still within its target date. |
| **Priority Case** | A case flagged for high attention. |
| **CPC** | Indicates the case was routed through CPC. |
| **Choice List** | Configurable dropdown categories and values used on forms. |
| **Saved View** | A saved, reusable set of filters (and columns). |
| **Export Job** | A background task that generates a downloadable file. |
| **Import Job** | A background task that parses and validates an uploaded file. |
| **Soft Delete** | Deletion that can be reversed via Restore. |
| **Audit Log** | The recorded history of key actions in the system. |
| **Stub Mode** | A state where email previews work but no emails are actually sent (Microsoft Graph not configured). |

---

> **End of Document — ProcureDesk Platform End User Manual v1.0**
> For access requests or issues not covered here, contact your organisation's ProcureDesk administrator.
