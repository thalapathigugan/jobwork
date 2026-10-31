# FW — Full portal walk (every screen and command, three portals, on video)

Scope source: the owner's request of 2026-10-31 to test every function and tool of the three portals — operations (`apps/operations-web`), customer and supplier (`apps/portal-web`) — and to attach a video of the run to the pull request's checks. Doc 13 test strategy, doc 21 §9 (axe and keyboard rules), doc 19 §10 scenarios as the storyline.

**Why a new pass.** The suites prove the API (900+ specs, pilot scenarios 1–12) but drive only 14 browser journeys over a handful of the 98 routes. TP.5 showed that defects survive green API suites and appear only when a screen is driven (D7–D9). No run has driven every screen, and none was recorded.

**Baseline.** `main` at ab435a2 plus the unpublished header-navigation commits (675d494, a495f22) this branch is cut from, so the walk covers the grouped navigation that is about to ship.

## FW.0 Harness

| File | Action | Contents |
|---|---|---|
| `e2e/scripts/prepare-db.mjs` | edit | Cast adds `admin@` (platform_admin, security_admin, auditor), `sourcing2@`, `finance2@`, `quality@`, `quality2@`, `logistics@`. They are needed for reviewer separation, finance second approval, quality review, logistics and administration. The existing journeys are unaffected. |
| `e2e/playwright.walk.config.ts` | new | Projects `walk-setup` (world) → `walk` (serial, one worker). `video: 'on'` at 1280×800, trace on failure. Web servers: API (prepared DB), **worker** (scan pipeline, outbox, notifications; readiness on its metrics port), portal 3002, operations 3001. |
| `e2e/walk/support/walk.ts` | new | `as(page, portal, email)` sign-in with TOTP from the world. Every page gets `guard(page)`, which fails the test on any uncaught page error, any `console.error`, any API response ≥ 500 or any error boundary text. Also `noSideways`, `axe`, and `chapter(page, title)`, an on-screen caption so the video says what is being tested. |
| `e2e/walk/*.spec.ts` | new | Specs below. They run in file order and share one storyline, so records made by earlier chapters feed later ones. |
| `e2e/scripts/stitch-videos.mjs` | new | ffmpeg concatenates each portal's webm clips, in run order, into `e2e/videos/{01-operations,02-customer,03-supplier,00-full-walk}.mp4`. It also writes `videos/index.md` mapping each chapter to its start time. |
| `.github/workflows/ci.yml` | edit | New job `portal-walk` on pull requests: build → migrate → walk → stitch → `upload-artifact` **portal-walk-videos** (mp4s, Playwright HTML report, traces). The job always uploads, so a failed check still carries its video. |
| `e2e/package.json` | edit | Scripts `walk` and `walk:videos`. |

## FW.1 Public and account (portal, anonymous)

`/welcome`, `/start`, `/explore`, `/about`, `/terms`, `/help`, `/offline`. Customer registration: the toggle, the password mismatch error and the terms gate, then verify through the dev `verifyUrl` on `/verify-email` and sign in. A bad verify token shows the refusal. Supplier application on `/register` (categories from `/public/categories`). Login failure message.

## FW.2 Supplier admission (operations ↔ supplier)

- Ops `/suppliers/applications` admits the FW.1 application through `/suppliers/new?application=`. A second application is declined with a reason.
- Invitation accepted on `/accept-invitation`.
- Supplier fills `/supplier/company`, the works address and `/supplier/compliance` (GST, PAN and bank, each with a certificate upload scanned by the worker), plus a certification. It publishes a capability, a machine and a capacity window on `/capabilities`, then sends for review on `/supplier`.
- Sourcing verifies the evidence on `/suppliers/verification`. A second reviewer approves and admits on `/suppliers/[id]`.
- Supplier pauses and resumes work. Ops suspends and reinstates the supplier.

## FW.3 Enquiry to award (customer → operations → supplier)

- Customer runs the `/enquiries/new` wizard through all three steps: parts, quantity breakpoints, a new delivery address in place, a drawing upload, requirements, then submit.
- Draft resume and discard. Withdraw and "Order this again" on a second enquiry.
- Engineering on `/intake/[id]`: start triage, then send a question. The customer answers on `/enquiries/[id]`. Engineering approves.
- Supplier copy: engineering uploads, a second person confirms.
- Thread messages both ways on the enquiry.
- Sourcing `/rfqs/new`: pick candidates, set the deadline and instructions, release.
- Supplier A on `/rfqs/[id]`: "Yes, we are looking", a draft bid, then submit. Supplier B submits, then sends a revised bid with a reason.
- A supplier question in the RFQ thread is answered and shared with every invited supplier.
- Sourcing closes the round, runs the comparison, proposes the award. `/evaluations/[id]` is read.

## FW.4 Approvals, cost sheet, quote, acceptance, payment

- Sales approves the award on `/approvals`.
- On `/awards/[id]`: cost sheet with components → request approval. Finance approves.
- Draft the Standard quotation. On `/quotes/[id]`: preview the document, request approval, sales2 approves, send.
- Customer on `/quotations/[id]`: download. Requests a revision on a second option, which sales replaces with version 2.
- Approver accepts on `/quotations/[id]/accept` (terms checkbox gate).
- Customer pays the advance: `/orders/[id]` "Pay" → `/pay/[intent]` simulated success. The declined path runs on a second invoice.
- `/invoices`, `/invoices/[id]` and `/payments` show the receipt.
- Finance on `/finance`: reconciliation, record a bank credit, propose an allocation. Approve credit terms, then place and release a credit hold on `/sales-orders/[id]`.

## FW.5 Purchase order to production

- Sourcing issues the purchase orders on `/sales-orders/[id]`. Supplier acknowledges on `/supplier/orders/[id]`.
- Engineering on `/sales-orders/[id]/production`: assemble and release the baseline, transmit, plan the work package with standard checkpoints, release to production.
- Supplier acknowledges the drawing pack, starts a checkpoint, uploads photo evidence, submits it, and reports a delay.
- Quality verifies one checkpoint and rejects another's evidence on the production page; `/production` shows the queue.

## FW.6 Quality

- Quality writes the plan from a template on `/quality/plans/[id]`: stages, a measured and an attribute characteristic, save, approve, plan the FAI inspection.
- Ops registers and calibrates an instrument. Supplier registers and calibrates its gauge on `/supplier/quality`.
- Supplier on `/supplier/inspections/[id]`: start, fill the grid, submit, then save a correction.
- quality2 reviews on `/quality/inspections/[id]`: start review, fail with a note, open an NCR.
- Ops NCR on `/quality/ncrs/[id]`: containment → disposition → approve rework.
- Supplier NCR on `/supplier/ncrs/[id]`: containment, rework done, corrective action.
- Quality plans and passes the reinspection, reviews and verifies the corrective action, closes the NCR.
- A second NCR goes to a use-as-is deviation. The customer approver decides it on `/orders/[id]` ("Quality decisions").
- Quality release on `/quality/releases/[wp]`: check → authorize.

## FW.7 Logistics, both legs

- Supplier `/supplier/shipments/new`: packages and lots → save → submit for release.
- Logistics on `/logistics/shipments/[id]`: release. Supplier marks it picked up. Logistics records a carrier update, then receives it (seal, counts, photo).
- Customer material: record and receive on `/sales-orders/[id]`, then issue to the supplier, who acknowledges receipt.
- `/logistics/work-packages/[id]` read.
- Dispatch to the customer on `/logistics/dispatch/new`: lots, packing checklist, deliver-to, tax invoice → plan → address confirmation → submit → release → picked up → carrier update → POD with photo.
- Customer on `/orders/[id]/deliveries/[shipment]`: confirm the address, accept the delivery, and download the delivery note, the conformance certificate and the POD. A second delivery is reported with a problem and resolved by logistics.
- `/orders/[id]/documents` open.

## FW.8 Changes

- Engineering proposes a change on the production page. The customer requests one on `/orders/[id]`.
- `/changes/[id]`: triage → ask for information → customer answers → classify → impact editor (areas, money, PO lines, WIP line, candidate baseline) → interim decision issued and lifted → complete impact.
- Approve on `/approvals`. The customer approver approves on the order. Supplier sends the impact estimate and acknowledges the amendment.
- Release, verify and close the change.
- A second change is withdrawn.

## FW.9 Settlement and support

- Finance issues the balance invoice and the customer pays it.
- Supplier submits a bill on `/supplier/bills`.
- Finance on `/finance/bills`: run the match → schedule → mark paid.
- A mismatched bill takes the exception route, and finance2 approves it.
- `/finance/margin` read.
- Customer raises a case on `/support`, adds information, and withdraws a second one.
- Support on `/support/[id]`: triage → investigate → propose a credit note. Finance approves, carries it out against the invoice, and verifies it. Support closes the case with a customer note.

## FW.10 Console, administration and accounts

- `/queues`: filters, take, hand back, reassign with a reason. `/notifications` on all three portals: mark all read.
- `/leakage-reviews`: a customer message carrying a phone number is held, and a second person releases an edited copy.
- `/audit`: filter by correlation id, load more.
- `/ops-health`: refresh. Dead letters are listed for the admin.
- `/organizations`: add a customer, invite a member, suspend and reinstate a member and the organization, resend and revoke an invitation.
- Customer `/team` and supplier `/supplier/team` invitations.
- `/account/addresses`: add, edit and archive.
- `/profile/edit`.
- `/account/security` on all three portals: enrol MFA with a code, revoke another session, sign out everywhere.
- `/documents` upload and download.
- Logout.

## FW.11 Route sweep and access matrix

Every one of the 98 routes, opened as its owning role at 1280 and at 390, using the storyline's record ids. Each must show its h1 and no error, pass `guard`, not scroll sideways, and have no serious or critical axe finding. Every navigation link and every nav group of all three shells must resolve.

The access checks:

- A customer gets refusal states, not data, on the supplier routes, and the reverse.
- An anonymous visitor to a signed-in route is sent to sign in.
- A JobWork user without the role sees the "not your authority" state rather than a 500.
- No customer-facing screen in the walk contains a supplier name, and no supplier screen contains the customer's name (`BR` identity shielding, checked on every page the storyline opened).

## Candidate defects found while reading the screens for this plan

| # | Where | Suspected defect |
|---|---|---|
| W1 | Portal `/supplier` home | Loads the internal-only `GET /rfqs`. The refusal is swallowed, so "Open RFQs" and "Bids sent" always read 0. "Purchase orders" and "Settlements due" are hard-coded to 0. |
| W2 | Ops `/quotes/[id]` | The "Cost sheet lineage" link goes to `/awards`, which has no index page (404). |
| W3 | Portal `/team` invitation | The dev `acceptUrl` is dropped, so a local tester cannot accept without reading the API. Recorded only; the dev mailer file has the link. |

Each confirmed defect becomes a failing walk step first and is fixed on its own `fix/` branch, as in TP.

## Exit

- The walk is green locally and on the pull request.
- The `portal-walk-videos` artifact is attached to the pull request's check: one mp4 per portal plus the whole run, with a chapter index.
- Defects are listed in the Deviations section below with their fixes.
- Servers are stopped after every local run.

## Deviations

_None yet._
