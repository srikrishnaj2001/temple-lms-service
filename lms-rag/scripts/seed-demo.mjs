#!/usr/bin/env node
/**
 * Seeds a realistic demo dataset via the admin API — 5 courses, ~18 chapters,
 * 5 introductory videos. Mimics the LMS admin flow: create course, add chapters,
 * put text/video on each chapter.
 *
 * Usage:
 *   node scripts/seed-demo.mjs
 * Requires the API running (pnpm dev:api) and optionally ADMIN_TOKEN in env.
 */

const API = process.env.API ?? 'http://127.0.0.1:3000'
const TOKEN = process.env.ADMIN_TOKEN
const AUTH_HEADERS = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}

// Extend fetch timeout so the seed survives long API-side embed backoffs during
// Gemini free-tier per-minute quota resets. Default undici headersTimeout is 5m;
// bump to 15m so the API can honor multiple 60s retries without our client
// bailing.
try {
  const undici = await import('undici')
  undici.setGlobalDispatcher(new undici.Agent({ headersTimeout: 900_000, bodyTimeout: 900_000 }))
} catch {
  // undici not available — fall back to defaults
}

// Public playable MP4s (Google's demo bucket) — one per course.
const V = (name) =>
  `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/${name}.mp4`

// --- Content --------------------------------------------------------------
// Each course has a stable id, title, subtitle, description, chapters[].
// Chapters have title + text + optional video { videoId, title, playbackUrl, vtt }.

const COURSES = [
  {
    id: 'temple-treasury-101',
    title: 'Temple Treasury 101',
    description:
      'How a Hindu temple manages funds, banking, and donor stewardship. Written for treasury staff, trustees, and audit committee members.',
    chapters: [
      {
        title: 'Introduction to Treasury Management',
        text: `# Introduction to Treasury Management

The Treasury and Fund Management function is one of the core governance departments of the temple trust. It holds accountability for every rupee that enters or leaves the temple, from morning donations to vendor payments to festival mahaprasad ingredient purchases.

## Why treasury matters

Temples handle three streams of money simultaneously: daily devotee donations (small cash amounts adding up to significant sums), scheduled institutional gifts (corporate CSR, government grants, foundation partnerships), and festival-driven spikes (Purnima, Ekadashi, and major annual festivals). Each stream has different documentation, tax, and audit requirements. Treasury is the department that keeps all of this legible to the board, to auditors, and to the tax authorities.

## Reporting to the board

Treasury reports to the trust board on a monthly cadence. The standard report includes cash position, month-over-month donation trends, bank reconciliation status, and any exceptions flagged during the month. On festival months an additional report covers the specific festival's inflow and cost.

## Coordination with other functions

Treasury is not an island. It works alongside Finance and Accounts for the monthly close, GST filings, and internal financial controls compliance. It coordinates with Fund Raising and Donations for donor stewardship and campaign reconciliation. And it works with Legal and Compliance to keep 12A and 80G certifications current.`,
        video: {
          videoId: 'treasury-intro',
          title: 'Treasury Management — Overview & Governance',
          playbackUrl: V('BigBuckBunny'),
          vtt: `WEBVTT

c1
00:00:00.000 --> 00:00:09.000
Welcome to Treasury Management 101. This introductory session covers why treasury exists as a distinct temple function and how it reports to the board.

c2
00:00:09.500 --> 00:00:20.000
Temples handle three simultaneous money streams: daily devotee donations, scheduled institutional gifts, and festival spikes during Purnima, Ekadashi, and major annual events.

c3
00:00:20.500 --> 00:00:32.000
Each stream has different documentation, tax, and audit requirements. Treasury keeps all of this legible to the board, to auditors, and to the tax authorities.

c4
00:00:32.500 --> 00:00:44.000
Treasury reports to the trust board monthly. The standard report covers cash position, donation trends, bank reconciliation status, and exceptions flagged during the month.

c5
00:00:44.500 --> 00:00:56.000
Treasury coordinates with Finance and Accounts for the monthly close, with Fund Raising for donor stewardship, and with Legal and Compliance for 12A and 80G certifications.`,
        },
      },
      {
        title: 'The Three Sub-departments',
        text: `# The Three Sub-departments of Treasury

Treasury and Fund Management is organized into three sub-departments, each with distinct responsibilities.

## 1. Banking

The Banking sub-department is the interface between the temple and its bankers. It handles daily deposits, bank reconciliations, cash handling procedures, and monitors fraud risks across all treasury accounts. Bank reconciliations are performed monthly at minimum; during festival months they are performed weekly to catch discrepancies while donation drives are still ongoing.

Banking staff maintain the register of active bank accounts, signatory authorities, and mandate letters. Any change to signatories requires a board resolution.

## 2. Fund Utilization

Fund Utilization ensures money is disbursed to each department according to the approved monthly budget. At the start of each month, budget-approved amounts are transferred to department-specific accounts. Departments then draw against their allocation with supporting documentation. Any request above a defined threshold requires additional approval from the Treasurer.

At month-end, Fund Utilization reconciles actual spending against budget and flags any over- or under-spend for board review.

## 3. Investments and Corpus Management

Investments and Corpus Management preserves and grows the temple's endowed capital. The corpus is invested in a mix of fixed deposits, government bonds, and (with board approval) a small allocation to equity mutual funds. All investments must align with the trust's stated investment policy — no speculative or high-risk instruments.

This sub-department also maintains documentation for 12A and 80G certifications, which allow donors to claim tax deductions. It separately tracks foreign contributions per FCRA requirements, ensuring foreign funds never commingle with domestic donations.`,
      },
      {
        title: 'Donor Documentation and Compliance',
        text: `# Donor Documentation and Compliance

Every donation that enters the temple has a paper trail. That paper trail is what lets the trust claim tax exemptions, lets donors claim their deductions, and lets auditors and regulators verify the flow of funds.

## 12A registration

The 12A registration under the Income Tax Act certifies that the trust is a genuine charitable organization and grants tax exemption on its income. Once granted, 12A is generally valid indefinitely, but the trust must maintain proper books of account and file annual returns. Loss of 12A means the trust's income becomes taxable.

## 80G registration

The 80G registration allows donors to claim a deduction on their donations to the temple. This registration is renewed every five years. Before renewal, the trust must demonstrate continued charitable activity and clean books. Without 80G, donations still legally reach the trust but donors cannot claim the tax benefit — which affects both individual giving and corporate CSR eligibility.

## Foreign contributions (FCRA)

Contributions from foreign sources are governed by the Foreign Contribution Regulation Act (FCRA). Foreign funds must land in a designated FCRA bank account, must be tracked separately from domestic donations, and reported quarterly and annually. Commingling foreign and domestic funds is a serious violation and can trigger cancellation of the FCRA registration.

## Donation receipts

Every donation above a small threshold receives an official receipt indicating the donor's PAN, the amount, and the 80G reference. Cash donations above the threshold defined by the Income Tax Act cannot be accepted without KYC. The receipt system is integrated with the donor CRM so annual giving summaries can be generated on request.`,
      },
    ],
  },

  {
    id: 'governance-essentials',
    title: 'Governance & Compliance Essentials',
    description:
      'For trustees, senior staff, and audit committee members. Covers board duties, legal framework, risk management, and audit reporting.',
    chapters: [
      {
        title: 'Role of the Trust Board',
        text: `# Role of the Trust Board

The trust board is the highest governing body of the temple. It carries fiduciary responsibility for every asset, every rupee, and every decision that affects the trust's mission.

## Composition

The board typically comprises seven to eleven trustees, drawn from the founding lineage, the senior priesthood, and independent representatives with financial, legal, or operational expertise. Terms are staggered so continuity is preserved across handovers.

## Standing responsibilities

The board approves the annual budget, reviews audit findings, appoints senior staff, and sets policy on risk appetite, investments, and major capital expenditure. It meets quarterly at minimum, and monthly during festival preparation cycles.

## Independence and conflicts of interest

Trustees must declare any conflicts of interest — vendor relationships, family members employed by the trust, or personal business dealings that touch the temple. Declared conflicts require recusal from the relevant decision.

## Delegation

Day-to-day operations are delegated to a management committee reporting to the board. The board sets the policy; the management committee executes. Escalation from committee to board follows a defined threshold — anything above a monetary limit, or anything with regulatory or reputational risk, comes to the board.`,
        video: {
          videoId: 'governance-intro',
          title: 'Governance Essentials — Board, Compliance, and Risk',
          playbackUrl: V('ElephantsDream'),
          vtt: `WEBVTT

c1
00:00:00.000 --> 00:00:09.000
Welcome to Governance Essentials. This session covers the role of the trust board, the legal framework the temple operates under, and how risk is managed.

c2
00:00:09.500 --> 00:00:20.000
The trust board is the highest governing body. It approves budgets, reviews audits, appoints senior staff, and sets policy on risk, investments, and major expenditure.

c3
00:00:20.500 --> 00:00:32.000
The board meets quarterly at minimum, more often during festival cycles. Trustees must declare conflicts of interest and recuse from related decisions.

c4
00:00:32.500 --> 00:00:44.000
Legally the trust operates under the Indian Trusts Act, with tax exemption under Section 12A and donor deductions under Section 80G. GST and FCRA also apply.

c5
00:00:44.500 --> 00:00:57.000
Risk is grouped into financial, operational, reputational, and regulatory categories. Each has a designated owner and a defined escalation path to the board.`,
        },
      },
      {
        title: 'Legal Framework — Trusts Act, FCRA, GST',
        text: `# Legal Framework

The temple trust operates under a stack of laws and rules. Ignorance of any one of them can trigger fines, tax exposure, or loss of registration.

## Indian Trusts Act

The trust deed, filed at inception under the Indian Trusts Act, is the constitution of the temple. It names the founding trustees, defines the objects of the trust, and sets out how successors are appointed. Any material change to the deed requires a board resolution followed by filing.

## Income Tax — 12A and 80G

Section 12A grants the trust income-tax exemption. Section 80G grants donors tax deduction on gifts. Both require the trust to file annual returns and maintain audited financial statements. Loss of either affects donations and the trust's financial position.

## Goods and Services Tax

GST applies where the temple provides taxable supplies — commercial rentals, publications sold, prasad sold above a stated MRP. Purely religious activities and free prasad distribution are generally outside GST. The GST filing calendar is monthly or quarterly depending on turnover.

## Foreign Contribution Regulation Act

Any donation from a foreign source — an NRI, a foreign national, or a foreign entity — is regulated by FCRA. The trust must hold a valid FCRA registration, receive foreign funds only into a designated FCRA account, and file quarterly and annual reports. FCRA violations carry heavy penalties and can trigger cancellation.`,
      },
      {
        title: 'Risk Management and Internal Controls',
        text: `# Risk Management and Internal Controls

Risk management at the temple is deliberately unglamorous — checklists, sign-offs, reconciliations. It is what keeps the trust out of the news for the wrong reasons.

## Risk categories

Risks are grouped into four buckets: financial (fraud, misallocation, cash losses), operational (crowd safety, kitchen accidents, IT downtime), reputational (adverse media, donor complaints, vendor disputes), and regulatory (tax non-compliance, FCRA violations, employment law).

## Control framework

Every risk has a designated owner — usually a department head — and a defined review cadence. Financial controls include segregation of duties (the person handling cash is not the person recording it), dual signatories on payments above a threshold, and monthly bank reconciliations. Operational controls include daily walkthroughs by facility management, food safety inspections, and periodic evacuation drills.

## Escalation

When a risk materializes — a suspected fraud, a compliance violation, a serious accident — escalation is immediate. The management committee is informed within the day; the board within the week for material issues. Trivial issues are logged in the monthly report; material ones warrant a special board session.

## Whistleblower policy

Any staff member or volunteer can report concerns in confidence via a designated channel. Retaliation against a good-faith whistleblower is grounds for termination.`,
      },
      {
        title: 'Audit and Transparency Reporting',
        text: `# Audit and Transparency Reporting

Audits are what convince donors, regulators, and the trust's own board that the numbers are real.

## Statutory audit

An independent chartered accountant conducts the statutory audit each financial year. The audit covers financial statements, adherence to the trust deed, and specific compliance areas — 12A, 80G, FCRA. The audit report goes to the board and is filed with the Income Tax department alongside the annual return.

## Internal audit

In addition to the statutory audit, an internal audit function reviews controls on a rolling basis. Focus areas rotate: cash handling one quarter, procurement the next, vendor payments the next. Internal audit reports directly to the audit committee of the board, not to management.

## Transparency reporting

The trust publishes an annual report summarizing financial performance, major activities, and material risks. Donor-facing summaries — total funds raised, how they were deployed, impact metrics — are published on the temple website and shared with major donors.

## Access to records

Records are retained per statutory requirements: seven years for tax records, longer for property and trust deed records. Access to records is restricted; requests for review by donors, regulators, or trustees follow a documented process.`,
      },
    ],
  },

  {
    id: 'kitchen-operations',
    title: 'Kitchen Operations & Annadaan',
    description:
      'For kitchen staff and volunteer sevayats. Covers daily operations, menu planning, hygiene, and festival mahaprasad.',
    chapters: [
      {
        title: 'Daily Kitchen Operations',
        text: `# Daily Kitchen Operations

The temple kitchen serves two outputs every day: ritual prasad for distribution during darshan hours, and free community meals (annadaan) served to any visitor between 11:30 AM and 1:30 PM.

## Opening the kitchen

The kitchen opens at 5:00 AM. Volunteers performing seva sign in by that time. The head sevayat performs a stock check at 5:30 AM, confirming ingredients delivered the previous evening match the manifest and that perishables are still within shelf life.

## Prasad preparation

Prasad preparation begins immediately after stock check. Rice, dal, and any sweet items are cooked in dedicated vessels, kept separate from annadaan cooking. Prasad is consecrated before distribution — never handled with left hand, never tasted mid-preparation.

## Annadaan cooking

Annadaan cooking starts at 7:00 AM. The base menu — steamed rice, one dal, one sabzi, roti or puri — is fixed. Quantities are set based on expected footfall, tracked from the previous week's counts. Overcooking is worse than undercooking: leftover prasad or annadaan cannot be stored.

## Closing the kitchen

The kitchen closes at 9:30 PM after evening prasad distribution. Closing includes deep cleaning of surfaces, safe storage of remaining ingredients, and stock reset for the next day. Any prasad or annadaan left after the final serving is either finished by staff or respectfully composted.`,
        video: {
          videoId: 'kitchen-intro',
          title: 'Kitchen Operations — Daily Flow and Standards',
          playbackUrl: V('ForBiggerBlazes'),
          vtt: `WEBVTT

c1
00:00:00.000 --> 00:00:09.000
Welcome to Kitchen Operations. This session walks through the daily flow of a temple kitchen, from opening to closing.

c2
00:00:09.500 --> 00:00:20.000
The kitchen opens at 5 AM. Volunteers performing seva sign in by then. The head sevayat performs a stock check at 5:30 AM to confirm ingredients match the manifest.

c3
00:00:20.500 --> 00:00:32.000
Prasad preparation begins after stock check. Prasad and annadaan cooking are kept in separate vessels. Prasad is consecrated before distribution.

c4
00:00:32.500 --> 00:00:44.000
Annadaan cooking starts at 7 AM. Base menu is rice, dal, sabzi, and roti or puri. Quantities are set based on expected footfall from the previous week.

c5
00:00:44.500 --> 00:00:56.000
The kitchen closes at 9:30 PM after evening prasad distribution. Deep cleaning, safe storage, and stock reset for the next day.`,
        },
      },
      {
        title: 'Menu Planning and Ingredient Sourcing',
        text: `# Menu Planning and Ingredient Sourcing

Menu decisions balance devotee expectations, ingredient availability, and cost.

## Base menu

The base menu changes daily by dal (yellow dal Mondays, black gram Wednesdays, mixed Fridays, and so on) and sabzi (seasonal vegetables). Rice and roti are constants. This variety keeps the annadaan interesting for regular visitors while keeping the kitchen's workflow predictable.

## Festival menu (mahaprasad)

On days marked in the panchang as festivals — Ekadashi, Purnima, Amavasya, Krishna Janmashtami, Diwali — the annadaan is upgraded to mahaprasad. The mahaprasad adds one or two sweet items, an additional sabzi, and often a special rice preparation like khichdi or tehri. Ingredient quantities are doubled or tripled based on expected festival footfall.

## Ingredient sourcing

Ingredients come from three sources: daily donations from devotees (fresh vegetables, fruits, grains), scheduled deliveries from approved vendors (rice, dal, oil, spices), and festival-day contributions (dairy, sweets, dry fruits from specific donor families). All incoming ingredients are logged in the register.

## Quality and shelf life

Every ingredient is checked before use. Anything past its shelf life is discarded, never used. Perishables — dairy, cooked vegetables, sweets — are inspected daily.`,
      },
      {
        title: 'Hygiene, Safety, and Food Handling',
        text: `# Hygiene, Safety, and Food Handling

Hygiene rules in the kitchen are non-negotiable and posted at the entrance.

## Personal hygiene

Kitchen staff and volunteers wash hands and feet before entering. Cooking is done barefoot after ritual purification. Leather items — belts, wallets, shoes — are not permitted inside the kitchen. Long hair is tied back. Aprons and head coverings are worn while cooking.

## Cleanliness

Cooking vessels are washed after every use, not stacked dirty for later. Cutting surfaces are wiped down between ingredients. The floor is mopped after every major cooking session — twice minimum per day.

## Food safety

Ingredients are inspected for spoilage before use. Cooked food is served hot. Leftover food is not stored across days — it is either consumed by staff or respectfully composted. Water for drinking and cooking is filtered.

## Fire safety

Gas cylinders are stored outside the kitchen in a ventilated cage. Fire extinguishers are placed at defined stations and inspected quarterly. All staff and volunteers complete a fire safety induction covering evacuation routes and extinguisher use.

## Reporting incidents

Any injury, burn, or spoilage incident is reported to the head sevayat and logged. Serious incidents — major burns, food poisoning suspicion — trigger a written report to the trust board within twenty-four hours.`,
      },
      {
        title: 'Managing Festival Mahaprasad',
        text: `# Managing Festival Mahaprasad

Festival days multiply the kitchen's output and the coordination required.

## Advance planning

The festival calendar is issued annually. Two weeks before each major festival the head sevayat convenes a planning session covering expected footfall, mahaprasad menu, ingredient orders, volunteer roster, and coordination with security and crowd management.

## Volunteer roster

Festival kitchens need double or triple the usual volunteers. A rotating roster is published a week in advance; volunteers sign up online or in person. First-time festival volunteers pair with an experienced sevayat for orientation.

## Ingredient orders

Bulk ingredients are ordered from approved festival vendors. Payment terms are negotiated in advance so the treasury sub-department can budget cash outflows. Delivery is scheduled for two days before the festival to allow inspection and prep time.

## Serving flow

On festival days a serving flow is set up: entry queue, seating rows, serving lanes, exit. Crowd management volunteers direct devotees to prevent bottlenecks. Serving proceeds in waves; the kitchen produces in batches to keep food hot.

## Post-festival wrap

After the festival, the kitchen conducts a hot wash: what worked, what did not, ingredient wastage, volunteer feedback. Findings feed into the next festival's plan.`,
      },
    ],
  },

  {
    id: 'volunteer-onboarding',
    title: 'Volunteer Onboarding',
    description:
      'General orientation for new volunteers. Covers temple values, departments, and what to expect in the first week.',
    chapters: [
      {
        title: 'Welcome — Temple Values and Culture',
        text: `# Welcome — Temple Values and Culture

The temple is a living institution. What you do as a volunteer contributes to something older and larger than any of us.

## Seva

Seva is the Sanskrit word for selfless service. Every task in the temple, from cleaning the floor to serving prasad, is seva when done with the right intention. There are no small jobs; there is only the work itself, done with care.

## Devotees, not customers

The people who visit the temple are devotees. They come for darshan, for peace, for community. Treat every interaction with the respect and warmth you would want your own family to receive.

## Punctuality

Temple activities run on a schedule set by tradition and by the panchang. Aartis, darshan hours, prasad distribution — none of these wait for a late volunteer. If you commit to a shift, arrive fifteen minutes early. If you cannot make it, call ahead and find a substitute.

## Dress and conduct

Volunteers wear the assigned uniform or, if none is issued, clean modest clothing appropriate for a place of worship. Cell phones on silent inside the temple. No eating on the temple floor. No political or commercial conversation with devotees while on duty.

## Confidentiality

Volunteers may become aware of internal matters — donor information, staff issues, financial figures. This information stays inside the temple. Sharing it externally is a breach of trust and grounds for termination of your volunteer role.`,
        video: {
          videoId: 'volunteer-welcome',
          title: 'Welcome to the Temple — Values and Culture',
          playbackUrl: V('ForBiggerEscapes'),
          vtt: `WEBVTT

c1
00:00:00.000 --> 00:00:09.000
Welcome to the temple. This orientation covers our values, our culture, and what we expect from every volunteer.

c2
00:00:09.500 --> 00:00:20.000
Seva is selfless service. Every task in the temple, from cleaning to serving prasad, is seva when done with the right intention. There are no small jobs.

c3
00:00:20.500 --> 00:00:32.000
The people who visit are devotees, not customers. Treat every interaction with warmth and respect. They come for darshan, peace, and community.

c4
00:00:32.500 --> 00:00:44.000
Temple activities run on a strict schedule set by tradition. Aartis, darshan hours, and prasad distribution do not wait for late volunteers. Arrive fifteen minutes early.

c5
00:00:44.500 --> 00:00:57.000
Volunteers may learn internal matters. Donor information, staff issues, financial figures — this stays inside the temple. Sharing externally is a breach of trust.`,
        },
      },
      {
        title: 'How Temple Departments Work',
        text: `# How Temple Departments Work

The temple is organized into functional departments. Knowing who does what helps you route requests, escalate issues, and understand where your work fits.

## Priesthood

The priesthood, led by the senior priest, is responsible for all rituals: abhishekam, aartis, festival ceremonies, and personal pujas requested by devotees. The priesthood does not report to management — it reports to the trust board directly on ritual matters.

## Kitchen

The kitchen produces prasad and annadaan. Led by the head sevayat, staffed by paid cooks and rotating volunteers. This is where most volunteer time is spent.

## Facility management

Facility management maintains buildings, grounds, utilities, and physical assets. This includes cleaning, minor repairs, gardening, and safety walkthroughs. Reports operational status to the management committee weekly.

## Treasury and Finance

Treasury manages banking, disbursements, and investments. Finance and Accounts handles bookkeeping, GST, and audit prep. These functions are behind the scenes but critical.

## Communications and Fund Raising

Communications handles donor communications, media, and social channels. Fund Raising runs donation campaigns and manages relationships with major donors and corporate partners.

## Health, Safety, and Security

Covers visitor safety, crowd management, fire and food safety, and coordination with local police for major events.

## Where you fit

Every volunteer is assigned to a department for their shift. Your department head is your first point of contact for any question, request, or issue.`,
      },
      {
        title: 'Your First Week — What to Expect',
        text: `# Your First Week — What to Expect

Your first week sets the tone. Here is what to expect and how to prepare.

## Day 1 — Orientation

You will attend an orientation session covering temple values, safety, dress code, and a walk-through of the premises. You will meet your department head, receive your volunteer badge, and be added to the department's roster and communication group.

## Day 2 through 4 — Shadow shifts

For the first three shifts you shadow an experienced volunteer. Ask questions freely. Take notes. Do not attempt tasks you have not been trained on — especially anything involving fire, cash, or food preparation.

## Day 5 — First solo tasks

By the end of the first week you will be given specific tasks to do on your own — assisting devotees, distributing prasad, minor cleaning, greeting at the entrance. Your department head is available if anything is unclear.

## Support and questions

If you are uncertain about anything — a procedure, a devotee request, a safety concern — ask your department head first. If unavailable, ask the volunteer coordinator. Do not guess.

## Feedback

At the end of the first week the volunteer coordinator schedules a brief check-in. Bring questions, observations, and any suggestions. First-week feedback often drives operational improvements.`,
      },
      {
        title: 'Escalation and Support',
        text: `# Escalation and Support

Most volunteer shifts are routine. Occasionally something happens that needs to be escalated. Knowing the path prevents confusion.

## Routine questions

Routine operational questions — "where do I put this?", "who signs this?", "when is my next shift?" — go to your department head first. If they are unavailable, the volunteer coordinator can help.

## Devotee complaints

If a devotee expresses dissatisfaction, listen fully. Acknowledge the concern. If it can be resolved on the spot, resolve it. If not, tell the devotee it will be raised with the responsible department head, and follow through the same day.

## Safety incidents

Any injury, spill, fire, or medical emergency: alert the health and safety officer immediately. Do not try to handle a serious incident alone. Basic first-aid kits and fire extinguishers are located at marked stations.

## Suspected fraud or misconduct

If you suspect theft, fraud, harassment, or serious policy violation, report it to the volunteer coordinator or, for more serious matters, directly to the trust board via the confidential whistleblower channel. Retaliation against a good-faith reporter is prohibited.

## Personal difficulties

If personal circumstances affect your availability, tell your department head as early as possible so shifts can be rearranged. The temple values reliability more than heroics — better to inform in advance than to no-show.`,
      },
    ],
  },

  {
    id: 'fundraising-donor-stewardship',
    title: 'Fund Raising and Donor Stewardship',
    description:
      'For the fund raising team. Types of donors, running campaigns, receipts, and FCRA-compliant handling of foreign donations.',
    chapters: [
      {
        title: 'Types of Donors and Donation Streams',
        text: `# Types of Donors and Donation Streams

Fund raising begins with knowing who gives, why, and how.

## Individual devotees

The largest donor group by count. Individual devotees give small amounts frequently — the coins and notes in the collection box, online micro-donations, and small annual contributions. Retention is high; per-donor value is low; aggregate value is significant.

## Recurring donors and patrons

A smaller group of committed donors who give monthly or annually at defined tiers. They receive named acknowledgement, invitations to special events, and periodic in-person updates from the head of fund raising.

## Major donors and named endowments

A handful of donors give sums large enough to warrant a named endowment or dedicated project — a hall, a scholarship, a kitchen wing. These relationships are managed personally by the head of fund raising with occasional involvement from trustees.

## Corporate and CSR donors

Companies fulfilling CSR obligations. Corporate donations require formal proposals, MOUs, and compliance documentation. Reporting to the corporate donor is more formal — periodic impact reports, financial statements, sometimes site visits.

## Foreign donors

NRI devotees and international foundations. These fall under FCRA and must be routed through the designated FCRA bank account with the corresponding reporting.`,
        video: {
          videoId: 'fundraising-intro',
          title: 'Fund Raising Overview — Donors, Campaigns, Compliance',
          playbackUrl: V('ForBiggerFun'),
          vtt: `WEBVTT

c1
00:00:00.000 --> 00:00:09.000
Welcome to Fund Raising. This session introduces the donor landscape and how the temple runs its fund raising function.

c2
00:00:09.500 --> 00:00:20.000
Donors fall into five groups: individual devotees, recurring patrons, major donors with named endowments, corporate CSR donors, and foreign donors under FCRA.

c3
00:00:20.500 --> 00:00:32.000
Individual devotees are the largest group by count. Recurring patrons give monthly or annually. Major donors fund specific named projects.

c4
00:00:32.500 --> 00:00:44.000
Corporate CSR donations require formal proposals and MOUs. Reporting is more structured, often with impact reports and site visits.

c5
00:00:44.500 --> 00:00:56.000
Foreign donations fall under FCRA. They must land in a designated FCRA bank account, be tracked separately, and reported quarterly and annually.`,
        },
      },
      {
        title: 'Running a Fund Raising Campaign',
        text: `# Running a Fund Raising Campaign

A campaign is a time-boxed effort with a specific target, audience, and message.

## Campaign definition

Before launch, define the target amount, the specific project or initiative the funds will support, the audience segments to reach, the launch and close dates, and the metrics for success. Campaigns without a clear "what and why" underperform.

## Approvals

Campaigns above a defined size require board approval — for scope, message, and channels. Legal and Compliance reviews the messaging for accuracy, particularly on tax-benefit claims.

## Channels

Common channels include email newsletters to existing donors, social media posts, WhatsApp broadcasts to committed patrons, and in-person appeals during festival gatherings. Each channel has its own compliance rules — email and WhatsApp require opt-in consent.

## Tracking

Every donation received during a campaign is tagged to that campaign in the donor CRM. This lets fund raising measure per-channel ROI, plan next year's campaigns, and give donors accurate reports on what their gift funded.

## Post-campaign

After close, fund raising publishes a summary: amount raised, donor count, projects funded. Major donors receive personal thank-you communication. Learnings from the campaign go into the next planning cycle.`,
      },
      {
        title: 'Donor Communication and Receipts',
        text: `# Donor Communication and Receipts

The donor relationship extends beyond the moment of giving.

## Acknowledgement

Every donation receives an acknowledgement within 48 hours of receipt. For most donors this is an automated email with the receipt. For patrons and major donors it also includes a personal note from the head of fund raising or, for the largest donors, from a trustee.

## Official receipts

Every donation above the threshold defined by the Income Tax Act generates an official 80G receipt. The receipt includes the donor's PAN, the date, the amount, and the 80G reference number. Receipts are sent by email; a physical copy is provided on request.

## Ongoing communication

Donors receive a quarterly newsletter covering major activities and how funds have been used. Patrons receive additional periodic updates — a call before major festivals, invitations to events, and an annual in-person or video interaction with the fund raising team.

## Handling complaints and questions

Any donor question about the amount received, the tax benefit, or how funds were used is answered within 72 hours. Serious complaints — questioning integrity or misuse — are escalated to the head of fund raising and, if warranted, to a trustee.

## Data protection

Donor information is confidential. Access to the donor CRM is role-based. Donor lists are not shared with third parties. Requests to unsubscribe or delete data are honoured promptly.`,
      },
      {
        title: 'Foreign Contributions (FCRA)',
        text: `# Foreign Contributions (FCRA)

Foreign donations open doors — NRI communities, international foundations, diaspora networks — but come with strict rules.

## What counts as a foreign contribution

A foreign contribution is any donation from a foreign national, an NRI, a foreign entity, or a foreign source, regardless of currency. Domestic donations from an Indian citizen in India are not foreign contributions, even if made in foreign currency.

## FCRA registration

The trust must hold a valid FCRA registration. Registration is renewed every five years. Loss of registration cuts off all foreign donation flow until re-registration completes.

## Designated bank account

All foreign donations must land in the FCRA-designated bank account. Deposits into any other account are a violation. The designated account is held at a specific bank branch as filed with the Ministry of Home Affairs.

## Separation from domestic funds

Foreign funds must never commingle with domestic funds. Separate ledgers, separate reporting, separate utilization tracking. Transfers between the FCRA account and other accounts follow strict rules.

## Reporting

Quarterly reports are filed with the Ministry of Home Affairs. An annual return is filed by December 31 for the previous financial year. Utilization certificates are prepared each year attesting how foreign funds were spent.

## Penalties

FCRA violations carry heavy penalties, including fines and cancellation of registration. The Compliance department reviews FCRA operations monthly to catch issues early.`,
      },
    ],
  },
]

// --- HTTP helpers ---------------------------------------------------------

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`POST ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

async function put(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...AUTH_HEADERS },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PUT ${path} → ${res.status}: ${text}`)
  }
  return res.json()
}

// --- Main -----------------------------------------------------------------

async function main() {
  const totals = { courses: 0, chapters: 0, chunks: 0, videos: 0, cues: 0 }
  for (const course of COURSES) {
    console.log(`\n=== Course: ${course.title} ===`)
    await post('/admin/courses', {
      id: course.id,
      title: course.title,
      description: course.description,
    })
    totals.courses++

    let ordinal = 0
    for (const chapter of course.chapters) {
      ordinal++
      const chapterId = `${course.id}:ch-${String(ordinal).padStart(2, '0')}`
      console.log(`  Ch${ordinal}: ${chapter.title}`)
      await post(`/admin/courses/${course.id}/chapters`, {
        title: chapter.title,
        ordinal,
      })
      totals.chapters++

      const textResult = await put(`/admin/chapters/${chapterId}/text`, {
        text: chapter.text,
      })
      totals.chunks += textResult.chunkCount ?? 0
      console.log(`     text: ${textResult.chunkCount} chunks`)

      if (chapter.video) {
        const videoResult = await put(`/admin/chapters/${chapterId}/video`, {
          videoId: chapter.video.videoId,
          title: chapter.video.title,
          playbackUrl: chapter.video.playbackUrl,
          vtt: chapter.video.vtt,
          skipCorrection: true,
        })
        totals.videos++
        totals.cues += videoResult.cuesIngested ?? 0
        console.log(`     video: ${videoResult.cuesIngested} cues`)
      }
    }
  }
  console.log('\n=== Totals ===')
  console.log(totals)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
