import { randomUUID } from 'node:crypto';
import { approvedEnquiry, openRound } from './support/flows';
import { axe, button, choose, command, expect, field, OPERATIONS, open, PORTAL, recall, remember, signInAs, test, visible } from './support/walk';

/** FW.10 Console and administration: work queues, held messages, organizations and people, audit, platform health. */
test.describe.configure({ mode: 'serial' });

test('ops · sourcing takes, hands back and reassigns queue work', async ({ page }) => {
  await signInAs(page, 'sourcing');
  await open(page, `${OPERATIONS}/queues`);
  await axe(page, 'queues');
  for (const chip of ['Mine', 'Unassigned', 'Overdue', 'Due today', 'All']) await page.getByRole('radio', { name: new RegExp(`^${chip}`) }).click();
  await command(page, 'Take');
  await page.getByRole('radio', { name: /^Mine/ }).click();
  await command(page, 'Hand back');
  await page.getByRole('radio', { name: /^All/ }).click();
  await button(page, 'Reassign').click();
  // Whoever else works this row's queue (the first row may belong to any queue sourcing sees).
  await choose(page.getByLabel('Give it to', { exact: false }), /^(?!Nobody|Choose)(?!.*sourcing@).+/);
  await field(page, 'Why (kept with the change)').fill('Covering while I am at the supplier audit.');
  await command(page, /^Reassign .+/);
  const queue = page.getByLabel('Queue', { exact: true });
  await queue.selectOption({ index: 1 });
  await expect(page).toHaveURL(/queue=/);
  await axe(page, 'queues (filtered)');
});

test('ops · a message to the suppliers that names the customer is held for review', async ({ page }) => {
  const { rfqId } = await openRound(await approvedEnquiry('Walk held message'));
  await signInAs(page, 'sourcing');
  await open(page, `${OPERATIONS}/rfqs/${rfqId}`);
  // JobWork writing outward reaches a shielded party: naming the customer waits for a person.
  await field(page, 'Message').fill('Kovai Pumps needs the parts anodised; please include it.');
  await button(page, 'Send').click();
  const held = button(page, 'Send for review');
  await expect(held).toBeVisible();
  await axe(page, 'message held warning');
  await held.click();
  await expect(visible(page, /waiting|review/i)).toBeVisible();
});

test('ops · support releases an edited copy of the held message', async ({ page }) => {
  await signInAs(page, 'support');
  await open(page, `${OPERATIONS}/leakage-reviews`);
  await axe(page, 'held messages');
  await button(page, 'Review').click();
  await field(page, 'Why (kept with the decision)').fill('Phone number removed; the question stands.');
  await field(page, 'Edited copy').fill('Easier on the phone: please call us.');
  await command(page, 'Release edited copy');
  await page.getByLabel('Show', { exact: false }).selectOption({ label: 'Decided' });
  await expect(page.getByRole('button', { name: 'View' }).first()).toBeVisible();
});

test('ops · admin adds a customer, invites, suspends and reinstates people and the organization', async ({ page }) => {
  const name = `Walk Castings ${randomUUID().slice(0, 4)}`;
  await signInAs(page, 'admin');
  await open(page, `${OPERATIONS}/`);
  await axe(page, 'command center');
  await open(page, `${OPERATIONS}/organizations`);
  await page.getByLabel('Kind', { exact: false }).selectOption({ index: 1 });
  await page.getByLabel('Status', { exact: false }).selectOption({ index: 1 });
  await axe(page, 'organizations');
  await page.getByRole('link', { name: 'Add customer' }).click();
  await field(page, 'Registered legal name').fill(`${name} Private Limited`);
  await field(page, 'Name we call them').fill(name);
  await field(page, 'Email').fill(`owner@${name.toLowerCase().replace(/ /g, '')}.test`);
  await command(page, 'Add customer');
  await page.getByRole('link', { name: new RegExp(`Open ${name}`) }).click();
  await expect(page).toHaveURL(/\/organizations\/[0-9a-f-]{36}$/);
  remember('newCustomerOrgUrl', page.url());
  await field(page, 'Their work email').fill(`buyer@${name.toLowerCase().replace(/ /g, '')}.test`);
  await command(page, 'Send invitation');
  await command(page, 'Resend');
  await command(page, 'Revoke');
  await page.getByLabel(/^Reason(?! for)/).fill('Credit review pending for the new account.');
  await command(page, 'Suspend organization');
  await page.getByLabel(/^Reason(?! for)/).fill('Credit review cleared.');
  await command(page, 'Reinstate organization');
  await axe(page, 'organization detail');
});

test('ops · admin suspends and reinstates a member', async ({ page }) => {
  await signInAs(page, 'admin');
  await open(page, `${OPERATIONS}/organizations`);
  await page.getByRole('link', { name: 'Kovai Pumps' }).first().click();
  await field(page, 'Reason for suspending or reinstating').fill('Left the company; access paused pending handover.');
  const row = page.locator('tr, li').filter({ hasText: 'approver@kovai.test' }).first();
  await command(page, 'Suspend', row);
  await command(page, 'Reinstate', row);
  await expect(row.getByRole('button', { name: 'Suspend' })).toBeVisible();
});

test('ops · admin reads the audit trail and the platform health', async ({ page }) => {
  await signInAs(page, 'admin');
  await open(page, `${OPERATIONS}/audit`);
  await axe(page, 'audit explorer');
  await field(page, 'Action').fill('commercial.approval_decided');
  await button(page, 'Apply filters').click();
  await expect(page.getByText('commercial.approval_decided').first()).toBeVisible();
  const more = button(page, 'Load more');
  if (await more.isVisible()) await more.click();
  // A record's history: the subject filter the supplier 360 links to, then everything again.
  await open(page, `${OPERATIONS}/audit?subjectType=supplier_profile&subjectId=${recall<string>('newSupplierProfileUrl').split('/').pop()}`);
  await expect(page.getByText(/supplier\./).first()).toBeVisible();
  await page.getByRole('link', { name: 'Show everything' }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await open(page, `${OPERATIONS}/ops-health`);
  await button(page, 'Refresh').click();
  await axe(page, 'platform health');
  void recall;
});
