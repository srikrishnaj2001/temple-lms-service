#!/usr/bin/env bash
# Seeds a realistic demo course via the admin API — mimics the LMS admin flow:
# admin creates a course, then adds chapters one by one, each with text + optional video.
#
# Usage: bash scripts/seed-demo.sh
# Requires the API running on 127.0.0.1:3000 and ADMIN_TOKEN either unset (dev)
# or exported to match .env.

set -euo pipefail

API="${API:-http://127.0.0.1:3000}"
COURSE_ID="temple-treasury-101"
AUTH_HEADER=""
if [ -n "${ADMIN_TOKEN:-}" ]; then
  AUTH_HEADER="-H Authorization: Bearer ${ADMIN_TOKEN}"
fi

json() { printf '%s' "$1"; }

echo "=== Course ==="
curl -s -X POST "$API/admin/courses" \
  -H "content-type: application/json" $AUTH_HEADER \
  -d "$(json '{
    "id":"'"$COURSE_ID"'",
    "title":"Temple Treasury 101",
    "description":"How a Hindu temple manages funds, banking, and donor stewardship. Three chapters with an introductory video."
  }')" && echo

echo "=== Chapter 1 ==="
curl -s -X POST "$API/admin/courses/$COURSE_ID/chapters" \
  -H "content-type: application/json" $AUTH_HEADER \
  -d '{"title":"Introduction to Treasury Management","ordinal":1}' && echo

CH1="${COURSE_ID}:ch-01"

echo "--- Ch1 text ---"
curl -s -X PUT "$API/admin/chapters/$CH1/text" \
  -H "content-type: application/json" $AUTH_HEADER \
  --data @- <<'JSON' && echo
{
  "text": "# Introduction to Treasury Management\n\nThe Treasury and Fund Management function is one of the core governance departments of the temple trust. It holds accountability for every rupee that enters or leaves the temple, from morning donations to vendor payments to festival mahaprasad ingredient purchases.\n\n## Why treasury matters\n\nTemples handle three streams of money simultaneously: daily devotee donations (small cash amounts adding up to significant sums), scheduled institutional gifts (corporate CSR, government grants, foundation partnerships), and festival-driven spikes (Purnima, Ekadashi, and major annual festivals). Each stream has different documentation, tax, and audit requirements. Treasury is the department that keeps all of this legible to the board, to auditors, and to the tax authorities.\n\n## Reporting to the board\n\nTreasury reports to the trust board on a monthly cadence. The standard report includes cash position, month-over-month donation trends, bank reconciliation status, and any exceptions flagged during the month. On festival months an additional report covers the specific festival's inflow and cost.\n\n## Coordination with other functions\n\nTreasury is not an island. It works alongside Finance and Accounts for the monthly close, GST filings, and internal financial controls compliance. It coordinates with Fund Raising and Donations for donor stewardship and campaign reconciliation. And it works with Legal and Compliance to keep 12A and 80G certifications current."
}
JSON

echo "--- Ch1 video ---"
curl -s -X PUT "$API/admin/chapters/$CH1/video" \
  -H "content-type: application/json" $AUTH_HEADER \
  --data @- <<'JSON' && echo
{
  "videoId": "treasury-intro",
  "title": "Treasury Management — Overview & Governance",
  "playbackUrl": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "vtt": "WEBVTT\n\nc1\n00:00:00.000 --> 00:00:09.000\nWelcome to Treasury Management 101. This introductory session covers why treasury exists as a distinct temple function and how it reports to the board.\n\nc2\n00:00:09.500 --> 00:00:20.000\nTemples handle three simultaneous money streams: daily devotee donations, scheduled institutional gifts, and festival spikes during Purnima, Ekadashi, and major annual events.\n\nc3\n00:00:20.500 --> 00:00:32.000\nEach stream has different documentation, tax, and audit requirements. Treasury keeps all of this legible to the board, to auditors, and to the tax authorities.\n\nc4\n00:00:32.500 --> 00:00:44.000\nTreasury reports to the trust board monthly. The standard report covers cash position, donation trends, bank reconciliation status, and exceptions flagged during the month.\n\nc5\n00:00:44.500 --> 00:00:56.000\nTreasury coordinates with Finance and Accounts for the monthly close, with Fund Raising for donor stewardship, and with Legal and Compliance for 12A and 80G certifications.",
  "skipCorrection": true
}
JSON

echo ""
echo "=== Chapter 2 ==="
curl -s -X POST "$API/admin/courses/$COURSE_ID/chapters" \
  -H "content-type: application/json" $AUTH_HEADER \
  -d '{"title":"The Three Sub-departments","ordinal":2}' && echo

CH2="${COURSE_ID}:ch-02"

echo "--- Ch2 text ---"
curl -s -X PUT "$API/admin/chapters/$CH2/text" \
  -H "content-type: application/json" $AUTH_HEADER \
  --data @- <<'JSON' && echo
{
  "text": "# The Three Sub-departments of Treasury\n\nTreasury and Fund Management is organized into three sub-departments, each with distinct responsibilities:\n\n## 1. Banking\n\nThe Banking sub-department is the interface between the temple and its bankers. It handles daily deposits, bank reconciliations, cash handling procedures, and monitors fraud risks across all treasury accounts. Bank reconciliations are performed monthly at minimum; during festival months they are performed weekly to catch discrepancies while donation drives are still ongoing.\n\nBanking staff maintain the register of active bank accounts, signatory authorities, and mandate letters. Any change to signatories requires board resolution.\n\n## 2. Fund Utilization\n\nFund Utilization ensures money is disbursed to each department according to the approved monthly budget. At the start of each month, budget-approved amounts are transferred to department-specific accounts. Departments then draw against their allocation with supporting documentation. Any request above a defined threshold requires additional approval from the Treasurer.\n\nAt month-end, Fund Utilization reconciles actual spending against budget and flags any over- or under-spend for board review.\n\n## 3. Investments and Corpus Management\n\nInvestments and Corpus Management preserves and grows the temple's endowed capital. The corpus is invested in a mix of fixed deposits, government bonds, and (with board approval) a small allocation to equity mutual funds. All investments must be aligned with the trust's stated investment policy — no speculative or high-risk instruments.\n\nThis sub-department also maintains documentation for 12A and 80G certifications, which allow donors to claim tax deductions. It separately tracks foreign contributions per FCRA requirements, ensuring foreign funds never commingle with domestic donations."
}
JSON

echo ""
echo "=== Chapter 3 ==="
curl -s -X POST "$API/admin/courses/$COURSE_ID/chapters" \
  -H "content-type: application/json" $AUTH_HEADER \
  -d '{"title":"Donor Documentation and Compliance","ordinal":3}' && echo

CH3="${COURSE_ID}:ch-03"

echo "--- Ch3 text ---"
curl -s -X PUT "$API/admin/chapters/$CH3/text" \
  -H "content-type: application/json" $AUTH_HEADER \
  --data @- <<'JSON' && echo
{
  "text": "# Donor Documentation and Compliance\n\nEvery donation that enters the temple has a paper trail. That paper trail is what lets the trust claim tax exemptions, lets donors claim their deductions, and lets auditors and regulators verify the flow of funds.\n\n## 12A registration\n\nThe 12A registration under the Income Tax Act certifies that the trust is a genuine charitable organization and grants tax exemption on its income. Once granted, 12A is generally valid indefinitely, but the trust must maintain proper books of account and file annual returns. Loss of 12A means the trust's income becomes taxable.\n\n## 80G registration\n\nThe 80G registration allows donors to claim a deduction on their donations to the temple. This registration is renewed every five years. Before renewal, the trust must demonstrate continued charitable activity and clean books. Without 80G, donations still legally reach the trust but donors cannot claim the tax benefit — which affects both individual giving and corporate CSR eligibility.\n\n## Foreign contributions (FCRA)\n\nContributions from foreign sources are governed by the Foreign Contribution Regulation Act (FCRA). Foreign funds must land in a designated FCRA bank account, must be tracked separately from domestic donations, and reported quarterly and annually. Commingling foreign and domestic funds is a serious violation and can trigger cancellation of the FCRA registration.\n\n## Donation receipts\n\nEvery donation above a small threshold receives an official receipt indicating the donor's PAN, the amount, and the 80G reference. Cash donations above the threshold defined by the Income Tax Act cannot be accepted without KYC. The receipt system is integrated with the donor CRM so annual giving summaries can be generated on request."
}
JSON

echo ""
echo "=== Done ==="
curl -s "$API/admin/courses/$COURSE_ID/chapters" && echo
