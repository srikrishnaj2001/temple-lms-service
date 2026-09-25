# CLUG Platform — Multi-Tenant + Cohort/Course Refactor

**Status:** Design document. No code has been changed yet.
**Companion documents:** `ANNOUNCEMENT_BOARD_REQUIREMENTS.md`, `ANNOUNCEMENT_BOARD_ARCHITECTURE.md`, `ANNOUNCEMENT_BOARD_CHANGES.md`.

### Revised decisions (supersede older text below where they conflict)

These decisions were locked after the initial draft. Prefer them over any older wording in this document.

1. **Keep the `enrollments` table name.** Do **not** rename it to `cohort_students`. After `courses` → `cohorts`, re-point the FK: `enrollments` becomes `(user_id, cohort_id)`. A student's accessible courses come from their enrolled cohorts' `course_id` values.
2. **Do not change the `users` table.** No `tenant_id`, no `is_super_admin` column on users. Users stay as they are today (name, email, phone, image_url, etc.).
3. **Tenant resolution from the frontend request.** The student/web app sends **both email and URL** (e.g. `iitpatna.clug.com`) on API calls. The backend derives `tenant_id` from the URL/subdomain, finds the user by email, and returns enrollments scoped to that tenant:

   ```
   email + url
     → tenant (from subdomain)
     → user (from email)
     → enrollments JOIN cohorts WHERE cohorts.tenant_id = tenant.id
   ```

4. **Cohort / course split.** Rename today's `courses` → `cohorts`. Introduce a new top-level `courses` (curriculum catalog). **A course is a bunch of cohorts** — each cohort has `course_id` (many cohorts → one course). **No `cohort_courses` join table.** **The cohort is the unit everything hangs off** (enrollments, modules, forms, tools, community links, managers, announcements). Course is the parent grouping / catalog identity only — it does not own content.
5. **`tenant_id` still lives on root content/org entities** (`tenants`, `cohorts`, `courses`, `announcements`, `tools`, etc.) — just not on `users`. Tenancy for a student request is request-scoped from the URL, not stored on the user row.
6. **Everything that today points at `courses` re-points to `cohort_id`.** After the rename:

   | Today | After |
   |---|---|
   | `enrollments.course_id` | `enrollments.cohort_id` |
   | `modules.course_id` | `modules.cohort_id` |
   | `forms.course_id` | `forms.cohort_id` |
   | `course_managers.course_id` | `cohort_managers.cohort_id` |
   | `course_tools.course_id` | `cohort_tools.cohort_id` |
   | `community_links.course_id` | `community_links.cohort_id` |
   | `announcement_courses.course_id` | `announcement_cohorts.cohort_id` |

   Clone / copy operates on a **cohort** (content tree), optionally creating/linking a course catalog row. Student learn routes should key off **cohort** (e.g. `/learn/[cohortId]`), not the catalog course id alone. Multi-subject students = multiple cohort enrollments.

---

## Table of Contents

1. [Background and Motivation](#1-background-and-motivation)
2. [What This Document Is](#2-what-this-document-is)
3. [The Two Business Scenarios We Must Support](#3-the-two-business-scenarios-we-must-support)
4. [Where the Current Architecture Breaks Down](#4-where-the-current-architecture-breaks-down)
5. [Core Design Decisions — a Walkthrough](#5-core-design-decisions--a-walkthrough)
6. [The Target Data Model](#6-the-target-data-model)
7. [Multi-Tenancy in Detail](#7-multi-tenancy-in-detail)
8. [Authentication and Access Control in Detail](#8-authentication-and-access-control-in-detail)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Data Model Changes with Impact](#10-data-model-changes-with-impact)
11. [Code Changes with Impact](#11-code-changes-with-impact)
12. [What This Refactor Does Not Change](#12-what-this-refactor-does-not-change)
13. [Impact on the Announcement Board Feature](#13-impact-on-the-announcement-board-feature)
14. [Open Items Requiring Decisions Before Coding](#14-open-items-requiring-decisions-before-coding)
15. [Suggested Rollout Plan](#15-suggested-rollout-plan)

---

## 1. Background and Motivation

CLUG is a Learning Management System that today serves a single customer, IIT Patna. It is composed of three applications running as separate deployments:

- **`clug-service`** — a Node.js/Express backend backed by PostgreSQL, exposing a REST API. It handles course and content management, enrollments, video streaming integration, and (recently) an announcement board.
- **`clug-admin`** — a Vite/React admin panel used by administrators to create courses, enroll students, upload content, and manage everything else. It runs at a single URL and any admin can manage anything.
- **`clug-web-app`** — a Next.js application for students to consume courses, watch videos, complete assignments, and interact with the platform.

The platform has been designed and built around the assumption of a single customer. Every course exists in a single organizational context; every user belongs implicitly to that same context; every URL points to the one deployment that serves that one customer. This has worked well as an MVP but two upcoming changes force us to rethink the foundations.

The **first change** is commercial: CLUG needs to serve more than one educational institution from a single platform. Instead of standing up separate deployments for IIT Kharagpur, IIT Madras, or any college that adopts CLUG in the future, we want one shared platform that presents itself as a distinct experience to each customer — a *white-label* deployment. Each institution gets its own subdomain (for example `iitpatna.clug.com`, `iitkgp.clug.com`) and its own visual identity, while under the hood the same code and database serve everyone. This kind of architecture is broadly called *multi-tenancy* — many customers ("tenants") on one platform, with strict isolation of their data.

The **second change** is a product evolution: the current data model conflates two very different concepts. What CLUG today calls a "course" is really two things fused together — a *cohort* (a group of students learning together, with start/end dates and community links) and a *course* (a curriculum, with modules and content). This fusion worked when every batch of students learned exactly one subject, but it breaks the moment a batch of students takes multiple subjects — a normal situation for a college where "CSE Year 1 Section A" is a cohort of students who together take Data Structures, Discrete Mathematics, Introduction to Programming, and so on. Without separating cohort from course, we would need to duplicate curriculum content for every combination of student group and subject.

These two changes are related. The multi-tenancy work needs to know where the "tenant" boundary sits in the data model, which depends on what the entities actually mean. Splitting cohort from course clarifies that model. So we're tackling both together in one architectural refactor.

## 2. What This Document Is

This document is a design record. It captures the architectural decisions the team has agreed to, explains the reasoning behind each one, and describes the concrete impact on the three codebases and their shared database. It is written for someone approaching the project without prior conversation context — either a new engineer joining the effort, a technical reviewer evaluating the plan, or a stakeholder who needs to understand what is about to change.

It is **not** a full requirements specification, and it is **not** a step-by-step migration script. The rollout plan at the end sketches phases, but a separate document will detail the exact migration steps, rollback strategy, and data-preservation approach.

Nothing in this document has been implemented. The current codebase is still on the single-tenant, fused-course model. This document describes the *target* state and the change vectors to get there.

## 3. The Two Business Scenarios We Must Support

To ground the design, we anchor everything against two concrete scenarios that the platform must handle.

### Scenario 1 — The current pattern, generalized

An institution (currently IIT Patna) offers standalone professional courses. Each course has a defined start and end date, a discrete set of students, and its own content. Examples: a Gen AI course, an LLM course, an MCP-building course. In this pattern, one group of students maps to one course. This is what the current data model supports today.

### Scenario 2 — The pattern we do not yet support

A college has structured academic programs. Consider CSE (Computer Science and Engineering) at some college. First-year CSE is a group of ~60 students. That group takes multiple subjects: C++, Data Structures, Discrete Mathematics, and so on — perhaps four to five subjects concurrently. The following academic year, second-year CSE takes a different set of subjects. Some subjects might be repeated across years (or across CSE and ECE branches). Some students might take an additional elective on top of the standard set.

Neither the group of students nor the subject list can be modeled as a single entity — they are related but distinct. This is the pattern that requires splitting the current "course" into two entities.

The refactor is designed to serve both scenarios cleanly. Scenario 1 becomes a special case of Scenario 2 (a cohort with exactly one course); Scenario 2 works naturally as a cohort with multiple courses.

## 4. Where the Current Architecture Breaks Down

Before describing the new design, it's worth being precise about what the current architecture cannot do.

**The `Course` entity in the database today holds fields that logically belong to two separate concepts.** A `courses` row has `title`, `description`, `start_date`, `end_date`, `calendar_url`, and `referral_url`. It also has associated `modules`, which contain `content` items (videos, assignments, resources, events). And it is the thing students *enroll into* via the `enrollments` table. Splitting these into "student group" and "content" would be neat, but they're all one row today.

**The `enrollments` table implicitly ties a student to a single course.** A row is `(user_id, course_id)`. There is no notion of "student is in a batch of students taking multiple courses together" — the closest we can do is create multiple enrollment rows for the same user across multiple courses, but nothing groups those together.

**Progress tracking is keyed on `enrollment_id`.** The `enrollment_content_progress` table links progress rows to a specific enrollment. If tomorrow you moved a student to a different batch or reorganized their courses, their progress state gets awkward — enrollments are the identity, so moving them means either fabricating enrollment rows or losing progress history.

**There is no notion of a tenant anywhere in the schema.** Every row is implicitly owned by the one deployment. Every query implicitly serves the one customer. There is no `tenant_id` column, no way to distinguish "IIT Patna's course" from "IIT Kharagpur's course", because only one exists.

**Authentication is single-context.** In the admin app, an admin logs in and sees everything. In the student app, Clerk manages authentication but there is no concept of which institution the student belongs to.

**The URL structure assumes a single deployment.** The student app runs at one hostname; the admin app runs at another. Moving to a per-customer subdomain scheme means every layer — DNS, TLS certificates, cookies, Clerk configuration, backend CORS, request routing — needs to handle wildcards.

These are the things that must change. What follows is how we're going to change them.

## 5. Core Design Decisions — a Walkthrough

We worked through these decisions one at a time, considered alternatives, and landed on positions. This section walks through each decision as a small design story: what the question was, what the options were, what we chose, and why. Reading this in order should give a reader everything they need to understand the target model.

### 5.1 Split cohort and course; cohort belongs to one course

The first and most foundational decision. The current `courses` table is going to be split. The entity that represents *a group of students with dates* will be called a **Cohort**. The entity that represents *a curriculum / subject identity* will be called a **Course**.

The relationship is **many-to-one**: each cohort has a `course_id` pointing at exactly one course. Many cohorts can share the same course (e.g. Section A and Section B of Data Structures). There is **no** `cohort_courses` join table.

Under this split, the current "single course per batch" pattern (Scenario 1) is the default: one cohort, one `course_id`. If a student group takes multiple subjects (Scenario 2), create multiple cohorts and enroll the student in each.

We chose this over a many-to-many join because it is simpler to query and migrate, and matches the "modules/forms are cohort-specific" rule. Splitting is still cleaner than the fused model, and tenant ownership stays unambiguous on both cohorts and courses.

### 5.2 Naming: rename the current `Course` to `Cohort` and introduce a new `Course`

Once we agreed on the split, we needed to decide what to call each of the resulting entities. Three options:

- Keep the name `Course` for the current entity and give the new entity a fresh name (like `Curriculum` or `Program`). Zero renaming cost, but semantically the current thing is closer to a cohort than a course.
- Rename the current `Course` to `Cohort` and use `Course` for the new entity. Semantically clean, but every FK, endpoint, and UI label that references "course" today needs updating.
- Invent entirely new names for both. Most disruptive, no obvious benefit.

We chose option two. Yes, it's more disruptive, but the migration will be substantial regardless and clean naming pays dividends every time an engineer reads the code afterward. "Cohort" for a group of students matches the word's actual meaning; "Course" for a syllabus matches its meaning too.

### 5.3 Enrollment attaches at the cohort level only, not per course

With two entities, we had to decide where "enrollment" lives. Three options considered:

- **Enrollment per course** — a student is enrolled in a course directly. Cohort becomes just a template or grouping construct with no direct membership.
- **Enrollment per cohort only** — a student joins a cohort. Their course participation is derived by joining through the cohort's course list.
- **Dual enrollment** — both a cohort membership and per-course enrollments exist, with the server synchronizing them.

We rejected per-course-only because it hollows out the cohort concept. Without direct membership, you cannot answer "who is in CSE Year 1?" without joining through course enrollments, and adding a student to a cohort but not yet to any of its courses becomes impossible to model. Announcements per cohort (which we later locked in) would also be ambiguous.

We explored dual enrollment at length but concluded it introduces significant complexity around cascade behavior. Consider a student in two cohorts that both include the "Data Structures" course; if the student is removed from one cohort, do we remove the course enrollment or keep it? Every write path needs to reason about this, and every read path has to trust that the two tables are consistent. That is a lot of surface area for a small gain.

We chose enrollment at the cohort level only. A student is a member of a cohort; their course is the cohort's `course_id`. If they need multiple subjects, they enroll in multiple cohorts.

This model handles exceptions elegantly. If a student takes an elective on top of their normal cohort's curriculum, we create a small elective cohort (with just that course) and enroll them in it alongside their main cohort. If some subset of a batch takes a bonus course, they get a second cohort. The mental model is "cohorts are compositional units of student-group-plus-course-set." A student can belong to multiple cohorts, and their effective course list is the union.

The one situation this model does not elegantly handle is a student who should be in a cohort *except for one of its courses* — an opt-out rather than an opt-in. Our position is that this case is rare and, when it comes up, should be handled by restructuring cohorts (splitting the batch into "with course X" and "without course X" cohorts) rather than by adding per-user exception rows. If it turns out to be common in practice, we can revisit later — the migration path from "cohort-only enrollment" to "dual enrollment" is cleaner than the reverse.

### 5.4 Progress is keyed on (user, course, content) — cohort does not appear

Progress tracking answers: "which content has this student completed, and where are they in their video watching?" Today this is stored per `(enrollment_id, content_id)`, which effectively means per `(user, course, content)` because enrollments today are per-course.

Under the new model, "enrollment" is per-cohort and a cohort has multiple courses. Keeping progress keyed on `enrollment_id` would mean either creating multiple progress rows for the same content (one per cohort a student took it in) or forcing progress to reset when a student moves between cohorts. Neither is desirable.

The right key is `(user_id, course_id, content_id)`. Because content belongs to exactly one course, this is essentially `(user_id, content_id)` with `course_id` denormalized for convenience. A student's progress on "Data Structures Module 1" is a single row regardless of which cohort brought them to that course, and it survives cohort changes without loss.

Cohort does not appear in the progress key at all. The two concepts are orthogonal.

### 5.5 Announcements attach to cohorts, not courses

The announcement board we recently shipped attaches announcements to `Course` (the current fused entity). Under the split, we needed to decide whether announcements attach to *cohorts* (the group of students) or *courses* (the syllabus).

We chose cohorts. Announcements are about telling a group of students something — exam schedules, community updates, welcome messages, corrections. They are audience-driven, and the audience is a cohort. Courses are content, not audiences.

If an admin ever wants to reach students across multiple cohorts (for example, "everyone taking Data Structures across all sections"), they can use the cross-posting feature we already built — announcements can attach to multiple cohorts explicitly. The mechanism for reaching multiple groups already exists; it just changes from "cross-post to multiple courses" to "cross-post to multiple cohorts."

### 5.6 Multi-tenancy uses a shared database with row-level tenant scoping

The core architectural question of multi-tenancy is: *how isolated are tenants from each other, physically?* Three broad options exist:

- **Database per tenant** — each customer gets a fully separate PostgreSQL database. Maximum isolation, but N databases to operate, N connection pools, N migration runs, N backup schedules.
- **Schema per tenant** — one database, but each tenant gets a Postgres schema (namespace) of its own. Less operational overhead than separate databases; still complex for queries that need to know which schema to use.
- **Shared database, row-level tenant column** — one database, one schema; every table has a `tenant_id` column and every query filters by it. Least operational overhead; requires discipline to make sure the filter is always applied.

For CLUG's scale (small number of tenants, small teams operating the platform), the shared database with row-level scoping is dramatically simpler and completely sufficient. Adding a tenant means inserting a row, not provisioning infrastructure. We chose this.

The other two options remain available if the platform grows to the point where isolation guarantees or per-tenant sizing become important, but for the foreseeable future the shared model is correct.

### 5.7 `tenant_id` sits only on root entities, not on every table

Given we're using row-level scoping, the natural question is: *which tables get the `tenant_id` column?*

The most cautious approach is to add `tenant_id` everywhere. Every join table, every derived table, every leaf table gets its own copy of the tenant identity. This makes every query a single-column filter and guarantees you cannot forget the scoping.

The most economical approach is to add `tenant_id` only to the entities where tenancy is a first-class attribute, and to derive it for everything else through foreign key relationships. Fewer redundant columns, less storage, no risk of the tenant_id on a leaf row drifting out of sync with its parent.

We chose the economical approach. `tenant_id` appears on the "root" entities that have an independent lifecycle — the ones that make sense to think of on their own. These are: `cohorts`, `courses`, `announcements`, and admin-level entities like `tools` and `forms`. **`users` does not get a `tenant_id`** — student tenancy is resolved per request from the URL (see revised decisions at the top).

For everything else — content items under modules, join tables, progress — the tenant is derived through the FK chain (content → module → cohort, which has a `tenant_id`) or is required by consistency (a join between a cohort and a course only makes sense if they share a tenant).

This choice has one important corollary: cross-tenant relationships must be prevented explicitly. We can't accidentally link IIT Patna's cohort to IIT Kharagpur's course. This is enforced at the application layer by validating same-tenant-ness at insert time on every join table, and can optionally be enforced at the database level by composite foreign keys `(id, tenant_id)`. For version 1, the application-layer check is sufficient.

### 5.8 Access control uses a simple `admin_tenants` join table plus a `is_super_admin` flag

Multi-tenancy requires answering "which admin can manage which tenant?" We modeled this with an `admin_tenants` join table containing just two columns — the admin's user id and the tenant id. If a row exists, that admin can manage that tenant.

We initially considered adding a `role` column (admin/viewer/etc.) but concluded that the current spec has no viewer or read-only case; every admin either can act on a tenant or cannot. If a role distinction becomes necessary in the future, adding a column is a cheap migration. Preemptively including it would carry a concept we don't yet use.

Separately, we introduced a `users.is_super_admin` boolean. A super-admin is a CLUG platform staff member who needs to see across all tenants for support, migrations, or onboarding a new institution. Super-admins bypass the `admin_tenants` lookup entirely; they can act as any tenant. This is a small number of people, expected to be seeded manually rather than granted through the admin UI.

### 5.9 Cross-tenant course sharing uses "clone with copy"

A recurring question is: if IIT Madras wants to use a course that already exists on IIT Patna's tenant, how do they get it?

The alternative to consider was some form of shared course library — one physical course row referenced by multiple tenants. This would save storage but couples tenants together in uncomfortable ways: if IIT Patna deletes their course, does IIT Madras lose it? If IIT Patna edits the course, does IIT Madras get the change even if they don't want it?

We chose the simpler model: **clone with copy**. When an admin at IIT Madras clones IIT Patna's course, the system creates fully independent new rows for the course, its modules, its content, and its content links, all owned by IIT Madras. The two tenants now have separate copies that can diverge without affecting each other.

Two important refinements to this rule:

- **Video assets are reference-shared, not duplicated.** Videos live on Gumlet (external video hosting) with an asset ID. On clone, the new content rows point to the same Gumlet asset ID as the source. This avoids uploading the same 500 MB video ten times when ten tenants clone the same course. The trade-off is a subtle coupling: if the source tenant deletes the Gumlet asset, the clones would fail to play the video. This can be prevented at the application layer by refusing to delete a Gumlet asset that any other tenant references.
- **Clone is one-shot, not a subscription.** If the source course gets updated after clone, the clone does not automatically receive the update. If a tenant wants the latest version, they clone again. This keeps the model simple and predictable.

We also decided to store a `cloned_from_course_id` column on the new course row so we can trace lineage later — useful for support, analytics, and figuring out "which of these courses originated from where."

Clone is a course-level operation only. Cohorts are always freshly created per term; announcements are time-bound. Only courses (the reusable content) get cloned.

### 5.10 Single deployment with wildcard subdomains

The multi-tenant story on the operational side had to answer: *do we deploy one app per tenant, or one shared app that handles all tenants?*

Per-tenant deployment is an anti-pattern for a small team. It multiplies operational surface: N deployment pipelines, N sets of environment variables, N versions to keep in sync, N places to look when something goes wrong. It provides no real benefit that a shared deployment can't match with proper request-level tenant scoping.

We chose one deployment for each of the three applications:

- `clug-web-app` is served under a wildcard subdomain: `*.clug.com`. Every institution gets its own subdomain (`iitpatna.clug.com`, `iitkgp.clug.com`), all pointing at the same origin. Adding a new tenant is a database row insert; DNS is already wildcarded.
- `clug-admin` runs at a single fixed hostname: `admin.clug.com`. There is no per-tenant subdomain for the admin app; all admins log in to the same URL and use an in-app tenant switcher to pick which one they're managing.
- `clug-service` runs at a single fixed hostname (`api.clug.com` or similar). It receives requests from both the student app and the admin app, and it resolves the tenant from either the `Host` header of the incoming request (for student-app calls) or from the admin's session (for admin-app calls).

This gives us the isolation benefits users see (visually distinct URLs per institution) with none of the operational cost of running separate stacks.

### 5.11 Cookies are subdomain-scoped

Because student sessions are per-tenant and per-subdomain, we set session cookies to be scoped to the specific subdomain rather than to the shared parent domain. A student logged in at `iitpatna.clug.com` who navigates to `iitkgp.clug.com` will not be automatically logged in there — which is correct, because they may not belong to that tenant at all. This is deliberate isolation, not a feature to work around.

The admin app runs at its own domain and manages its session there. There is no cross-app SSO in the initial design.

## 6. The Target Data Model

This section describes the entities and their relationships in the target state. It is written to be read top-down; each entity is introduced along with the ones related to it.

### 6.1 Overview

The core entities and their relationships:

```
Tenant
  ├── Courses          (curriculum catalog / subject identity; no modules under it)
  │     └── Cohorts (course_id FK — many cohorts per course)
  │           ├── (via enrollments: user_id + cohort_id) students
  │           ├── Modules → Content → Video / Assignment / Resource / Event
  │           ├── Forms
  │           ├── Tools / community links / cohort managers
  │           └── Announcements (via announcement_cohorts)
  └── …

Users — unchanged table; not tenant-scoped by column.
  Tenant for a student request comes from the request URL, not from the user row.

Progress (user, content) — scoped via content → module → cohort; tenant derived from cohort
```

### 6.2 The Tenant

A tenant is a single institution served by CLUG — for example, IIT Patna is a tenant, IIT Kharagpur is another. The `tenants` table stores one row per institution.

Each tenant has a `subdomain` string that maps directly to the DNS subdomain used to serve its student app (`iitpatna` → `iitpatna.clug.com`). This subdomain is the authoritative way the platform identifies which tenant a student-facing request belongs to.

Each tenant has a `name` (human-readable display name) and a `branding_config` JSON field where we store per-tenant customizations — logo URL, primary color, contact information, and so on. Using JSON here lets us grow the branding capabilities without database migrations.

Each tenant has an `is_active` boolean so we can pause or disable a tenant (for example, if their contract lapses) without deleting the row and all its associated data.

The primary key is a UUID, unlike the INTEGER primary keys used elsewhere in the schema. This is deliberate — tenant identifiers may appear in URLs or public logs, and UUIDs avoid leaking the count of tenants CLUG has.

### 6.3 Users

Users represent people who use the platform — both students and admins. **The `users` table is not changed for multi-tenancy.** It keeps its existing columns (name, email, phone, image_url, etc.). There is no `tenant_id` and no `is_super_admin` on the user row.

Tenancy for student traffic is request-scoped: the frontend sends email + URL; the backend resolves the tenant from the URL and scopes enrollments/data to that tenant. The same email can theoretically appear in enrollments under different tenants' cohorts; isolation is enforced by the tenant derived from the URL on each request, not by a column on `users`.

Admin access control (which admins manage which tenants) can still use a separate `admin_tenants` join table and/or operational conventions without altering the `users` schema — see §5.8 / §8. If a super-admin flag is needed later, prefer a separate table or ops process rather than adding columns to `users` in v1.

### 6.4 Admin Tenants (Access Control List)

This join table answers "which admins have access to which tenants."

Each row is a pair `(admin_user_id, tenant_id)`. Row existence means "this user can administer this tenant." When an admin logs in, we look up all rows for their user ID; the result is their accessible tenant list, which we present as options in the tenant switcher.

There is intentionally no `role` column. In the v1 spec, admin access is binary — either you can administer a tenant or you can't. If future versions introduce read-only auditors or per-feature permissions, we'll add a column then.

Super-admins bypass this table entirely. If a user's `is_super_admin` is true, they can act as any tenant regardless of what's in `admin_tenants`.

### 6.5 Cohorts

The cohort is a group of students who learn together, with a lifecycle (start date, end date), a name, and associated resources like a shared calendar URL and community links. This is what the current `courses` table represents; we're renaming it to `cohorts` and adding `tenant_id`.

A cohort is scoped to one tenant. IIT Patna's "Gen AI Batch 12" is a cohort belonging to IIT Patna; IIT Kharagpur's cohorts are entirely separate.

A cohort exists independently of any student membership or course mapping. You can create an empty cohort and populate it later. This is why cohorts (not memberships or course mappings) get the direct `tenant_id`.

The primary key is INTEGER — kept from the current `courses` table to minimize the migration blast radius on all the tables that currently reference `courses.id` as an integer.

### 6.6 Courses (new entity)

The course is a **curriculum / subject identity** — a named offering that one or more cohorts can belong to (e.g. "Data Structures"). Under the new model, courses are separate from cohorts.

**Important:** modules and forms do **not** hang off `courses`. They hang off **cohorts** because content and feedback are cohort-specific. The `courses` row is catalog metadata (title, description, tenant, clone lineage). Actual learning content lives under the cohort.

A course belongs to one tenant. Each course may have a `cloned_from_course_id` for lineage when copying curriculum identity across tenants or within a tenant.

The primary key is INTEGER — consistent with existing entities.

### 6.7 Cohorts reference a course (`cohorts.course_id`)

**No `cohort_courses` join table.** Each cohort has a single `course_id` foreign key. Many cohorts can point at the same course (e.g. Section A and Section B of Data Structures); each cohort belongs to exactly one course.

Same-tenant enforcement: reject insert/update if `cohort.tenant_id != course.tenant_id`.

If a student group takes multiple subjects, create **multiple cohorts** (one per subject) and enroll the student in each — do not put multiple courses on one cohort.

### 6.8 Enrollments (cohort membership — keep table name)

This remains the `enrollments` table. **Do not rename it to `cohort_students`.** After the courses→cohorts rename, its foreign key becomes `cohort_id` (was `course_id`), so each row is `(user_id, cohort_id)` meaning "this student is a member of this cohort." It keeps paranoid soft-delete so we retain a record of past memberships.

The unique constraint is on `(user_id, cohort_id) where deleted_at is null` — a live row per pair, but historical (soft-deleted) rows are allowed.

Adding a student to a cohort is a single insert into `enrollments`. Their course is whatever `cohorts.course_id` points at — no separate course-enrollment step.

**Enrollments do not reference the new `courses` table directly.** Course access is always via the enrolled cohort's `course_id`.

### 6.9 Progress

The progress table stores what each student has done — how far they've watched a video, whether they've completed an assignment, and so on. In the current model it's called `enrollment_content_progress` and it's keyed on `(enrollment_id, content_id)`.

Under the new model it becomes simply `progress` and it's keyed on `(user_id, course_id, content_id)`. The `enrollment_id` reference goes away entirely. `course_id` and `module_id` are stored explicitly for easy filtering by course or module without having to walk back through content associations.

The unique constraint is on `(user_id, content_id)` — a content item belongs to exactly one course and one module, so those are functionally redundant for identity, but useful for query performance.

The practical consequence of this key change is that a student's progress persists across cohort changes. If a student is moved from one cohort to another that also includes Data Structures, they don't restart their video watching — their progress is tied to the content, not to the cohort context. This is almost always what you want.

### 6.10 Content structure (modules → cohorts)

Modules and content and their variants (videos, assignments, resources, events) already exist. Structurally they stay the same, but **`modules.course_id` becomes `modules.cohort_id`** and points at `cohorts`. Content is cohort-specific.

During migration: rename `courses` → `cohorts` (preserve IDs), rename `modules.course_id` → `modules.cohort_id`, re-point FK at `cohorts`. No need to move module rows to a new parent ID if cohort IDs preserve the old course IDs.

### 6.11 Announcements (updated for tenancy and cohort naming)

The announcement board we shipped has three tables — `announcements`, `announcement_courses`, `announcement_reads`. Under the new model:

- `announcements` gets a `tenant_id` column added.
- `announcement_courses` is renamed to `announcement_cohorts` and its `course_id` column becomes `cohort_id`. The semantics are unchanged; the naming just catches up with the split.
- `announcement_reads` is structurally unchanged. Per-board per-user reads still work exactly as designed.

The two-layer architecture (global content in `announcements`, per-board relationship in the join table) is preserved. Cross-posting still works. The pin cap, read tracking, WhatsApp helper, and everything else we built carries over.

### 6.12 Other tables — forms, tools, community links, course managers

Several existing tables currently reference "course" and all re-point to **cohort**:

- **`forms`** — `course_id` → `cohort_id`. Forms are cohort-specific (feedback for that batch's experience / offering). `tenant_id` may still be added on `forms` for direct-listing queries.
- **`tools`** — `course_tools` → `cohort_tools`; `course_id` → `cohort_id`. `tools` gets a `tenant_id`.
- **`community_links`** — `course_id` → `cohort_id`.
- **`course_managers`** → **`cohort_managers`**; `course_id` → `cohort_id`.

## 7. Multi-Tenancy in Detail

This section describes how tenancy operates at runtime — how a request knows which tenant it belongs to, how queries stay scoped, and how we prevent accidental leakage.

### 7.1 How a request identifies its tenant

There are two paths depending on which application is making the request.

**Student app requests** identify the tenant from the **URL the frontend sends along with the user email**. When a student is on `iitpatna.clug.com`, the web app includes both `email` and the request URL/host (e.g. `iitpatna.clug.com`) on backend calls. The backend extracts the subdomain (`iitpatna`), looks it up in the `tenants` table to get the tenant UUID, finds the user by email, and scopes queries — especially enrollments — to that tenant:

```
enrollments
  JOIN cohorts ON cohorts.id = enrollments.cohort_id
WHERE enrollments.user_id = :userId
  AND cohorts.tenant_id = :tenantId
```

The client must send both values; the tenant is not stored on the user row. Prefer deriving the host from the server-side `Host` / forwarded host when available (BFF), and treating an explicit URL/host header from the client as the same contract for non-BFF paths.

**Admin app requests** identify the tenant from the session. An admin logs into `admin.clug.com`, and the session cookie carries their user identity along with the current tenant they're operating on (chosen via a switcher UI). On every request, the backend validates that the admin actually has access to that tenant by checking `admin_tenants` (or an equivalent ACL that does not require altering the `users` table).

In both cases, tenant identity for authorization should still be validated server-side (lookup by subdomain / session ACL), not trusted as a raw client-supplied UUID alone.

### 7.2 Row scoping in queries

Once the tenant is known for the request, every query that touches tenant-scoped data must filter by that tenant. This happens in the backend service layer.

The mechanism we're using is a combination of two things. First, a middleware sets `req.tenantId` early in the request lifecycle. Second, service functions accept a tenant ID as an explicit parameter, forcing the calling code to pass it through. This is preferable to relying entirely on implicit context (like a Sequelize hook) because it makes the tenant flow obvious in code review — a service call that omits the tenant argument is visibly wrong.

Sequelize's default scope feature can supplement this by adding a `WHERE tenant_id = ?` clause to every query on tenant-scoped models, using the request context. This is defense in depth; the primary contract is the explicit parameter.

For version 1, we deliberately do not use Postgres row-level security. RLS is powerful but adds operational complexity — every database connection needs to be set up with a session variable for the current tenant, debugging becomes harder because rows disappear invisibly, and Sequelize integration is awkward. Application-layer scoping is simpler and sufficient for our scale.

### 7.3 Guardrails against cross-tenant linking

The most subtle failure mode of shared-database multi-tenancy is accidentally linking a row from one tenant to a row from another. For example, an admin at IIT Madras might try to set a cohort's `course_id` to IIT Patna's course — either through a bug or through a malicious request.

We prevent this at the application layer by validating same-tenant-ness on every write that crosses entities. When setting `cohorts.course_id`, verify that `cohort.tenant_id == course.tenant_id`. When inserting into `enrollments`, verify that the target cohort belongs to the request's tenant (and that the user exists). When inserting into `announcement_cohorts`, verify announcement and cohort share a tenant.

For belt-and-suspenders safety, Postgres composite foreign keys can enforce this at the database level: add a unique index on `(id, tenant_id)` on root tables, then have join tables reference the composite. This is optional for version 1 but recommended if the platform grows.

## 8. Authentication and Access Control in Detail

### 8.1 Admin authentication

The current admin app uses a mock authentication system: hardcoded credentials in a Zustand store. This is fine for local development but obviously not acceptable for a production multi-tenant platform where different institutions have different admins.

Post-refactor, admin authentication becomes credential-backed against the `users` table. On login, the backend:

1. Verifies the credentials.
2. Loads the user's `is_super_admin` flag.
3. Loads all `admin_tenants` rows for this user, producing a list of accessible tenant IDs.
4. Creates a session cookie containing the user ID, super-admin flag, and accessible tenant list.

The admin app receives this session data and populates a tenant switcher in the header. The admin picks a tenant to work on; that tenant ID becomes the "current tenant" for the session and is included in every API call to the backend.

On every backend request, the server re-validates that the requested tenant is in the admin's accessible list (or that they're a super-admin). This prevents an admin from crafting a request with a tenant ID they shouldn't have access to.

Migrating the existing IIT Patna admin is straightforward: create a `users` row (or use the existing one), insert a `(user_id, iitpatna_tenant_id)` row into `admin_tenants`, and the admin logs in and lands on the IIT Patna context.

### 8.2 Student authentication

The student app uses Clerk for authentication. Clerk handles the login flow, session management, and identity federation with external providers like Google. This stays in place.

The change under multi-tenancy is that Clerk needs to know about all our subdomains. Clerk can either be:

- **A single instance** with `allowed_redirect_origins` set to a wildcard pattern like `*.clug.com`. All tenants share the same Clerk-managed user pool.
- **One instance per tenant**, providing stricter isolation of user data across institutions.

We recommend the single-instance approach for simplicity. It gives each tenant their own visual auth experience through Clerk's per-domain configuration while sharing the underlying identity infrastructure.

Once a student authenticates via Clerk, the backend looks up their user row by email. Tenant context comes from the URL/host sent with the request (or Host header via BFF), not from a column on `users`. The backend then returns only enrollments (and related data) for cohorts belonging to that tenant. If the user has no enrollments under that tenant, they see an empty tenant-scoped experience — they are not rejected solely because of a missing `users.tenant_id`.

If the user is new to the platform (Clerk knows them but no `users` row exists yet), an onboarding flow creates the user record as today (no tenant column). Membership in a tenant's learning experience is established by inserting an `enrollments` row for a cohort in that tenant.

### 8.3 Super-admin flow

A super-admin logs into the admin app like any other admin. On login, their `is_super_admin` flag is set to true and they see all tenants in the switcher (not just their explicitly assigned ones). They can act on any tenant.

Super-admins are seeded manually via a database script or a dedicated admin CLI. There is no UI flow to promote a regular admin to super-admin; that's an intentional operational safeguard.

## 9. Deployment Architecture

### 9.1 One instance per application, wildcard subdomains for students

Each of the three applications is deployed once and only once. The student app is served at a wildcard subdomain of `clug.com`, so all `*.clug.com` traffic hits the same instance. The DNS provider is configured with a wildcard `A` record (or CNAME) pointing at the origin. TLS is handled by a single wildcard certificate for `*.clug.com`.

Adding a new tenant is purely a database operation. The DNS is already wildcarded, so `newiit.clug.com` immediately resolves to the same origin. The TLS certificate already covers it. The application reads the Host header, sees `newiit`, looks it up in the `tenants` table (where a row was just inserted), and serves the appropriate experience. No deployment, no DNS change, no certificate renewal.

The admin app runs at a single fixed hostname `admin.clug.com`. There is no per-tenant subdomain here — all admins log in at the same URL. Which tenant they're managing is determined by the in-app tenant switcher, not the URL.

The backend runs at a single fixed hostname as well (`api.clug.com` or similar). It accepts requests from both the student and admin apps. CORS is configured to allow the wildcard student subdomain pattern plus the fixed admin hostname.

### 9.2 Cookie strategy

Student sessions use cookies scoped to their specific subdomain. A student logged in at `iitpatna.clug.com` has a cookie for that hostname only; if they navigate to `iitkgp.clug.com`, they arrive unauthenticated. This is intentional — it enforces at the cookie level that a student session cannot leak across tenants.

Admin sessions are cookies scoped to `admin.clug.com` alone. There is no cross-app SSO between admin and student surfaces in the initial design.

### 9.3 Local development

Local development needs to support tenant identification without wildcard DNS. Two approaches:

- Add `/etc/hosts` entries mapping `iitpatna.localhost`, `iitkgp.localhost`, etc. to `127.0.0.1`. Vite and Next.js both handle subdomains under `localhost` transparently.
- Provide a `?tenant=iitpatna` query parameter fallback that the application uses when the Host header doesn't yield a valid subdomain. This is a dev-only convenience.

Both are easy to set up; we'll document the recommended approach in the README once we get there.

## 10. Data Model Changes with Impact

This section enumerates the concrete database changes, with a note on the blast radius of each. It's organized by table.

### 10.1 New tables

**`tenants`** — the foundational new table. Contains one row per institution. Every other change in this refactor depends on this table existing and being populated. Seeded initially with one row for IIT Patna.

**`admin_tenants`** — new join table between users and tenants for the admin ACL. Seeded initially with one row mapping the existing IIT Patna admin to the IIT Patna tenant.

**`courses`** (new meaning) — a new table for the curriculum / subject catalog entity, distinct from the current "course = cohort" fusion. Every existing course row (which becomes a cohort) will also spawn one new course row during migration, and the cohort gets `course_id` set to that new row (1:1 backfill). **No `cohort_courses` join table** — the link is `cohorts.course_id`.

Impact: these tables are the foundation of both the tenancy and cohort/course changes. They need to be created and populated before any other table can be modified.

### 10.2 Renamed tables

**`courses` → `cohorts`** — the current `courses` table is renamed to `cohorts` and gets `tenant_id` plus **`course_id`** (FK to the new `courses` table). All its existing fields (title, description, start_date, end_date, calendar_url, referral_url) stay. This is a high-blast-radius rename because many other tables have foreign keys pointing at `courses.id`; every one of those needs to be re-pointed at `cohorts.id` (numerically the same values, but a different table).

**`enrollments` (kept name; FK retargeted)** — do **not** rename to `cohort_students`. Rename the column `course_id` → `cohort_id` and re-point the FK at `cohorts`. Values stay the same (an enrollment at former course 42 becomes an enrollment at cohort 42). Every service function that queries enrollments needs updating for the new column/target, but the table name and model name stay `enrollments` / `Enrollment`.

**`enrollment_content_progress` → `progress`** — significant restructure. The `enrollment_id` column is dropped and replaced with `user_id + course_id` (course_id being the new courses table). All progress rows need to be backfilled with the new columns.

**`announcement_courses` → `announcement_cohorts`** — the announcement board's per-board join table is renamed and its `course_id` column becomes `cohort_id`. All application code (models, services, routers, and admin UI components) that references this table needs updating.

**`course_managers` → `cohort_managers`** — cohort managers are people responsible for a batch of students; the semantic fits cohort better than course. Simple rename.

Impact: renames touch a lot of code but the data migration is straightforward.

### 10.3 Tables with `tenant_id` added

`cohorts` (the renamed table), `courses` (new entity), `announcements`, `tools`, `forms` — each gets a `tenant_id` column added. All existing rows are backfilled with the IIT Patna tenant UUID. New rows require the column to be populated by the service layer. **`users` does not get `tenant_id`.**

Impact: mechanical schema change; the interesting work is in the service and middleware layers that provide the tenant context from email + URL.

### 10.4 Tables restructured for the new model

`modules` — no structural change; the foreign key `course_id` continues to point at "courses," but the meaning changes from the old fused entity to the new Course entity. If we preserve numeric IDs during migration, this table needs no data update.

`content` and its type variants (`videos`, `assignments`, `resources`, `events`) — no structural change. They continue to point at modules; modules continue to point at courses; the semantic meaning of "course" simply changes underneath.

Impact: minor, assuming ID preservation during migration.

### 10.5 Tables re-pointed to their new owners

Several tables that currently reference the fused-entity `courses` are updated to point at either the new `courses` or `cohorts`:

- `forms.course_id` — column name stays, but the FK is re-pointed at the new `courses` table (syllabus). `tenant_id` added to `forms`.
- `course_tools` join table — renamed to `cohort_tools`. Its former `course_id` column becomes `cohort_id`. `tools` table gets `tenant_id`.
- `community_links.course_id` — column renamed to `cohort_id`, FK re-pointed at `cohorts`. `tenant_id` added to `community_links`.
- `content_links` — structurally tied to `content` items which belong to modules → the new courses. No column change needed; the meaning of "course" underneath just shifts.

Backfill for each is straightforward because during migration the numeric IDs of the old `courses` are preserved on the new `cohorts` table. Rows referencing "course 42" continue to reference the same numeric value, only the target table's meaning changes.

## 11. Code Changes with Impact

This section covers what changes in each of the three repositories. It's organized per repo, then by layer within the repo.

### 11.1 `clug-service` (backend) — most affected

**Models.** Every model that today references the `courses` table needs updating. The `course.js` model is renamed to `cohort.js` and gets a `tenant_id` field. A new `course.js` is created for the new syllabus entity. `enrollment.js` keeps its table/model name but renames the FK column from `course_id` to `cohort_id` and points at `cohorts`. `enrollmentContentProgress.js` is essentially rewritten as `progress.js` with a new key structure. The announcement board's `announcementCourse.js` becomes `announcementCohort.js` with the FK column renamed. New model files are added for `tenant.js`, `adminTenant.js`, and `cohortCourse.js`. The `users` model is left unchanged. The `associations.js` file — which centralizes model relationships — is substantially rewritten to reflect the new graph.

**Services.** The service layer is where the biggest code changes concentrate. The current `admin.js` service (roughly 2,600 lines) manages courses, modules, content, and everything else the admin app interacts with. Under the new model this file needs to be split conceptually: cohort management, course management (new entity), and everything else. It also needs a `tenantId` parameter threaded through every function so that queries are properly scoped. This is the single largest touch point in the refactor and probably justifies being split into multiple smaller service files (`cohorts.js`, `courses.js`, `content.js`, `enrollments.js`) rather than remaining as one megafile.

The `courses.js` service (student-facing) needs a rewrite. Its current queries assume "the student is enrolled in these courses"; the new model requires deriving courses from cohort membership through a join. The shape of the response data changes accordingly.

The announcement services we recently built (`announcements.js` and `studentAnnouncements.js`) need updating. Every function needs to accept `tenantId` and scope queries by it. Every reference to `course_id` becomes `cohort_id`. The student announcement feed switches from "student's course enrollments determine the feed" to "student's cohort memberships determine the feed."

New service files are needed: `tenants.js` for tenant CRUD (super-admin only), `adminAcl.js` for managing which admins access which tenants, and `clone.js` for the course-clone operation. The clone service is a v1 requirement (not deferred) — it transactionally copies a course row, all its modules, all its content items across the four typed variants (videos, assignments, resources, events), and its content links to a new set of rows owned by the target tenant. Video-content rows preserve the Gumlet asset ID reference so we don't re-upload media. The new course row records `cloned_from_course_id` pointing at the source for lineage. Clone can happen within the same tenant (an admin wants a duplicate to modify) or across tenants (an admin at IIT Madras clones from IIT Patna) — the code path is the same, only the target tenant differs.

**Routers.** Every router file changes. `adminRoutes.js` — currently the omnibus admin router — gets the same treatment as the admin service: probably split into multiple router files corresponding to the split service files. Every route handler needs the new tenant middleware, and every path that referenced courses now needs to distinguish between cohorts and courses (new entity). The `courses.js` router (student-facing) becomes cohort-oriented and returns cohorts with their courses expanded. The announcement routers get their column references updated and their tenant middleware added. New router files for tenants and admin ACL.

**Middleware.** The current `authMiddleware.js` extracts the user email from a header and attaches it to the request. Under the new model this needs to also accept the request URL/host (or `Host` / forwarded host), resolve `tenantId` from the subdomain, and attach both `req.userEmail` and `req.tenantId`. A dedicated `tenantMiddleware.js` can own the URL → tenant lookup. Do not load `tenant_id` from the user row — users are unchanged.

**Migrations.** Every schema change is a migration. A rough count is fifteen to twenty migration files, run in order. Each is transactional. The migration set includes: creating tenants table, creating admin_tenants table (without altering `users`), renaming courses to cohorts and adding tenant_id, creating the new courses table, adding `cohorts.course_id` and backfilling 1:1 from the spawned course rows, retargeting enrollments (`course_id` → `cohort_id` pointing at cohorts — **keep table name `enrollments`**), retargeting modules/forms/etc. to `cohort_id`, creating the new progress table and migrating data from enrollment_content_progress, adding tenant_id to announcements, renaming announcement_courses to announcement_cohorts, adding tenant_id to tools and forms, renaming course_managers to cohort_managers, and dropping obsolete columns at the end. Getting the order right and preserving referential integrity throughout is careful work.

**App wiring.** The `app.js` file wires the middleware and routers together. It needs updating to install the new tenant middleware ahead of the routers and to include the wildcard subdomain in the CORS allowlist.

### 11.2 `clug-admin` (admin frontend) — significantly affected

**Authentication.** The mock `authStore` (a Zustand store with hardcoded credentials) becomes a real login flow that hits the backend. On successful login it also fetches the admin's accessible tenants and super-admin status. This is a substantial rewrite of what today is a handful of lines of stub code.

**New tenant context.** A new `TenantContext` React context (or Zustand store) is added to hold the current tenant, the list of accessible tenants, and a switcher API. This context is consumed by essentially every page that displays tenant-scoped data.

**New tenant switcher UI.** A dropdown component is added to the header showing the current tenant and allowing the admin to switch. The switcher's options come from the admin's accessible tenant list. Selecting a tenant updates the context and triggers a re-fetch of tenant-scoped data.

**Pages that split.** The current `Courses.jsx` page manages what will become cohorts under the new model. It needs to split into two pages: one for cohort management (batches of students with dates and courses) and one for course management (syllabi with modules and content). The current page's form is a good starting point but its fields belong to both entities and need to be redistributed.

**Pages that need concept-swap.** `Modules.jsx`, `Contents.jsx`, `Videos.jsx`, `Resources.jsx` currently show content organized by course (fused entity). Under the new model they organize by Course (new entity). The API endpoints they call change accordingly, but the UX largely stays the same because content structure hasn't changed — only its container has.

**Pages that need cohort-orientation.** `Enrollments.jsx` currently enrolls students in courses; under the new model it enrolls them in cohorts. `Forms.jsx` (if forms attach to cohorts) similarly reorients. `Announcements.jsx` (the page we recently built) needs its course pickers changed to cohort pickers; the cross-post multi-select now lists cohorts; every reference to "course" in labels and copy becomes "cohort."

**Announcement components (recently built).** `AnnouncementForm.jsx`, `AnnouncementCard.jsx`, `PinBoardsModal.jsx`, `CourseMultiSelect.jsx` (which should be renamed `CohortMultiSelect.jsx`) all need their labels and semantics updated. Structurally they don't change much, but the vocabulary throughout switches from "course" to "cohort" and the underlying API calls target the renamed endpoints.

**API client.** The `apiClient.js` file needs every URL that changed on the backend updated. New methods are added for tenant management (super-admin only) and admin ACL management. All requests carry the current tenant via an `X-Tenant-Id` header or a query parameter; the backend cross-checks against the session.

**New pages.** A `Tenants.jsx` page for super-admins to create tenants, view existing ones, and manage the admin-to-tenant assignments. This is only visible to super-admins.

**Sidebar and layout.** The sidebar shows the current tenant name near the top; certain menu entries (like tenant management) are hidden unless the user is a super-admin.

**Cleanup opportunity.** The `src/features/*` directory contains an earlier attempt at a feature-based structure that partially overlaps with `src/pages/*`. During this refactor is a good time to consolidate. Similarly, three different API-related files (`services/api.js`, `services/api/apiClient.js`, `config/api.js`) have grown organically and should be unified.

### 11.3 `clug-web-app` (student frontend) — moderately affected

**Middleware.** The current `middleware.js` handles Clerk auth and role-based dashboard redirection. Under multi-tenancy it also needs to capture the current host/URL, validate that the matching tenant exists and is active, and ensure every BFF/API call forwards **email + URL/host** so the backend can resolve `tenantId`.

**A new tenant library.** A small `src/lib/tenant.js` (or similar) module provides helpers to extract subdomain / host from the current request — used by both server components and client components as appropriate.

**Auth extension.** The `getCurrentUser()` function in `src/lib/auth.js` continues to identify the user by email. Tenant is not stored on the user; it is resolved from the current URL and passed to the backend with each call.

**BFF layer.** The Backend-For-Frontend files in `src/lib/bff/` (courselib, dashboard, http, index, local, normalize) all need to pass **email + URL/host** (and/or a resolved tenant identifier the backend re-validates) on every fetch. This is a systematic change but each individual file's modification is small.

**Client API.** `src/lib/api/client.js` is used for client-side calls (like mark-read); it needs the same email + URL/host treatment as the BFF.

**Learn page.** `src/app/learn/[courseId]/page.js` needs to confirm that the student is actually enrolled in a cohort whose `course_id` matches (for the current tenant). This is a semantic check rather than a UX change.

**Dashboard.** The learner dashboard currently lists the student's courses. Under the new model it lists their cohorts (from tenant-scoped enrollments), each with its courses expanded. The manager dashboard has similar changes. This is a data-shape change more than a UI redesign.

**Onboarding.** The onboarding flow creates/updates the user as today. Access to a tenant's content requires an enrollment into one of that tenant's cohorts (admin/ops enrollment), not a `tenant_id` on the user.

**Session tasks and other student pages.** Small updates for cohort orientation.

**Navbar.** The navbar renders per-tenant branding — logo and name from the tenant's `branding_config` (looked up from the current URL's subdomain). This is also where the announcement icon and unread badge will land when we build the student-side announcement UI (Phase 5 of the original announcement plan).

**New announcement UI.** The student-side announcement UI has not yet been built; it will be built with tenant-awareness from day one, so it's not a refactor but a fresh implementation informed by this architecture.

### 11.4 Cross-cutting concerns

**Environment variables.** New variables for tenant defaults in dev, new CORS patterns for wildcard subdomains, updates to Clerk configuration for allowed origins.

**Testing.** Every unit and integration test now depends on a tenant fixture. Test setup needs a seed step that creates a test tenant and associates test users with it. Existing tests need updating to pass tenant context.

**Documentation.** README, session notes, and the announcement board documents all need updating to reflect the new model. The migration plan itself becomes a doc.

**CI/CD.** The build and deploy pipelines don't fundamentally change but they need to handle the new environment variables and wildcard configuration.

## 12. What This Refactor Does Not Change

It's worth being explicit about what stays the same, so nobody spends time worrying about it during the refactor.

**The video ingestion pipeline through Gumlet is unchanged.** Videos are uploaded, transcoded, and served the same way. The only new consideration is that Gumlet asset IDs are now referenced by multiple tenants (when courses are cloned), so deletion of an asset needs a safety check.

**The module → content → typed-content substructure is unchanged.** Modules still contain content items; content items are still typed as videos, assignments, resources, or events. This inner content model has served well and doesn't need touching.

**The student learning UX under `/learn/[courseId]` is unchanged.** A student loading a course sees the same video player, the same module navigation, the same assignment interface. What changes is only the tenant scoping around it.

**Form submission and processing is unchanged.** The FormBuilder, form questions, form responses — all continue to work as they do today. The only addition is tenant scoping.

**Groq (LLM) integration is unchanged.** The AI-assisted features continue to work; they just accept a tenant context for logging or metering.

**The AdminJS panel is preserved.** The auto-generated CRUD interface at `/admin` continues to work. It may need minor updates to register the new models but its structure is unchanged.

## 13. Impact on the Announcement Board Feature

The announcement board is the first substantial feature that gets refactored under this new architecture. We just shipped it in the previous iteration, so it's fresh in everyone's mind — and it's the concrete example of how existing features change.

The two-layer architectural principle we built into the announcement board — content lives in `announcements` (global to the announcement), while the per-board relationship lives in a join table — survives the refactor intact. The pin cap enforcement, read tracking, WhatsApp helper, and cross-posting mechanism all continue to work.

The changes are targeted:

The database table `announcement_courses` is renamed to `announcement_cohorts` and its `course_id` column becomes `cohort_id`. Because the two-layer model was designed around a per-board relationship rather than a per-course relationship, this rename is semantic more than architectural — the join table always represented "the relationship between an announcement and one of its target audiences" and that audience is now a cohort rather than a course.

The `announcements` table itself gets a new `tenant_id` column so that IIT Patna's announcements are strictly separated from IIT Kharagpur's. The service layer accepts a tenant ID on every function and includes it in every query. Cross-posting still works but only within a tenant — an IIT Patna announcement can be cross-posted to multiple IIT Patna cohorts but never to another tenant's cohort.

The admin UI components we built need their labels updated. The form's "Home course" field becomes "Home cohort." The "Cross-post to courses" multi-select becomes "Cross-post to cohorts." The `CourseMultiSelect` component gets renamed to `CohortMultiSelect`. The pin modal shows cohorts to pin to. Card course chips become cohort chips.

The WhatsApp helper link changes format. Currently it's `learn.iitpatna.com/announcements/{id}` (roughly). Under multi-tenancy it becomes `iitpatna.clug.com/announcements/{id}` (or whatever domain configuration is used) with the tenant subdomain baked in. Cross-tenant links don't make sense so they aren't a concern.

The student-side endpoints resolve the student's cohorts (not their syllabus courses alone) to determine which announcements to show. The unread count query and the mark-read logic follow the same shape but source their reachable-boards list from `enrollments` joined with `announcement_cohorts` (scoped by the request tenant).

None of the four documents we produced for the announcement board (`ANNOUNCEMENT_BOARD_REQUIREMENTS.md`, `_ARCHITECTURE.md`, `_CHECKLIST.md`, `_CHANGES.md`) are invalidated by this refactor — they'll need addendums or updated versions after the refactor lands, but the core design decisions carry over unchanged.

## 14. Decisions Resolved

All the open items from earlier design discussions have been locked. This section captures the final answers.

**Forms attach to Cohort, not to the new Course entity.** Forms are cohort-specific. `forms.course_id` → `forms.cohort_id`.

**Modules attach to Cohort.** `modules.course_id` → `modules.cohort_id`. Learning content is cohort-specific; the new `courses` table is catalog/subject identity referenced by `cohorts.course_id`.

**Tools attach to Cohort.** The `course_tools` join table is renamed to `cohort_tools`; the `tools` table gets a `tenant_id`.

**Community links attach to Cohort.** `community_links` gets `cohort_id` (and optionally `tenant_id`).

**Course managers become cohort managers.** The `course_managers` table is renamed to `cohort_managers`.

**Students are not tenant-bound on the user row.** For version 1, `users` stays unchanged. Tenant context comes from the request URL (+ email). A person who truly belongs to two institutions can be enrolled in cohorts under different tenants; each request only sees enrollments for the tenant derived from that URL.

**The existing IIT Patna admin is preserved through migration.** The current admin user row is retained; a new `admin_tenants` mapping is created linking them to the IIT Patna tenant; their login transitions from the mock credentials to real backend-backed credentials as part of the cutover.

**Clone ships in v1.** Cross-tenant (and same-tenant) course cloning is a v1 requirement, not deferred. This affects the rollout — the `clone.js` service and the corresponding UI in the admin app land during the initial refactor phases rather than being punted.

**Migration cutover approach is deferred to a separate discussion.** The choice between big-bang cutover with a short maintenance window and a dual-write transitional approach will be worked out in the migration plan document, based on data volume and downtime tolerance at the time of cutover. Not needed to lock the target-state design.

## 15. Suggested Rollout Plan

This is not a detailed migration plan — a separate document will detail the exact sequence of migration steps, verification checks, and rollback procedures. What follows is the phase-level shape.

**Phase 1 — Backend refactor.** Create the new tables, rename the changed ones, add the tenant columns, backfill data, update models and associations, refactor services and routers, add the tenant middleware. Roughly two to three weeks of focused work for a single engineer. The end state is a backend that runs on the new schema, with the existing IIT Patna data preserved as tenant `iitpatna`, and endpoints that scope by tenant.

**Phase 2 — Data migration script and rehearsal.** A repeatable script that takes a production snapshot and applies the schema and data changes. Rehearse against a staging environment to validate that the resulting data is correct and no rows are lost or misclassified. The specific cutover strategy (big-bang vs dual-write) is decided in the separate migration plan document.

**Phase 3 — Clone service (backend).** Build the course-clone endpoint and service — transactional deep copy of a course, its modules, its content, and its content links to a new tenant (or same tenant) target. Preserve Gumlet asset references. Record `cloned_from_course_id` lineage. Roughly three to five days on top of Phase 1's infrastructure. Ships in v1 per the resolved decisions.

**Phase 4 — Admin app refactor.** Add the tenant switcher, split the courses page into cohorts and courses, update the announcement UI, migrate the auth from mock credentials to real backend auth, add the tenant management page for super-admins, add the clone UI (button on a course, target-tenant picker, confirmation). Roughly two to two-and-a-half weeks.

**Phase 5 — Web app tenant scoping.** Add the middleware for tenant resolution, update the BFF layer to pass tenant context on every call, ensure the student's cohort determines their course list. Roughly a week. The student-side announcement UI can also be built during this phase since it needs tenant awareness from day one.

**Phase 6 — Migration cutover and verification.** A short maintenance window (probably an hour or two for the current data volume). Run the migration, verify data integrity, flip the DNS if needed, monitor.

**Phase 7 — Post-refactor cleanup.** Drop columns that are no longer needed (the old `enrollment_id` on progress, any transitional columns from the migration), delete dead code paths, update documentation, clean up the `features/*` directory in the admin app.

---

