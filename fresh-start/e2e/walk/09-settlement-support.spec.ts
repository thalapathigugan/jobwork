import type { Page } from '@playwright/test';
import type { Body } from '../support/api';
import { atJobWork, salesOrder } from './support/flows';
import { axe, button, choose, command, daysFromNow, expect, field, OPERATIONS, open, PORTAL, recall, remember, signInAs, test, visible } from './support/walk';

/** FW.9 Settlement and support: balance invoice and payment, supplier bills, match, exception, schedule, pay; a case to a credit note. */
test.describe.configure({ mode: 'serial' });

async function approveRow(page: Page, href: string): Promise<void> {
  await open(page, `${OPERATIONS}/approvals`);
  const row = page.locator('tr').filter({ has: page.locator(`a[href*="${href}"]`) }).filter({ has: page.getByRole('button', { name: 'Decide…' }) }).first();
  await row.getByRole('button', { name: 'Decide…' }).click();
  await command(page, 'Approve');
}

test('ops · finance issues the balance invoice', async ({ page }) => {
  const { deal } = await atJobWork('Walk settlement plate', [{ lot: 'LOT-S', quantity: '100' }]);
  remember('stOrderId', deal.orderId);
  remember('stPurchaseOrderId', deal.purchaseOrderId);
  await signInAs(page, 'finance');
  await open(page, `${OPERATIONS}/sales-orders/${deal.orderId}`);
  if (await button(page, 'Issue invoice').isVisible()) await command(page, 'Issue invoice');
  await expect(visible(page, /INV-\d{4}-\d{4}/)).toBeVisible();
  await axe(page, 'sales order (invoiced)');
});

test('customer · pays the balance invoice', async ({ page }) => {
  const balance = ((await salesOrder(recall('stOrderId')))['invoices'] as Body[]).find((i) => i['kind'] === 'balance')!;
  remember('stInvoiceId', balance['invoiceId']);
  await signInAs(page, 'approver');
  await open(page, `${PORTAL}/invoices/${balance['invoiceId']}`);
  await command(page, /^Pay ₹/);
  await expect(page).toHaveURL(/\/pay\//);
  await command(page, /^Pay ₹/);
  await expect(visible(page, 'Payment received')).toBeVisible();
});

test('supplier · submits its bill, and a second one above the order', async ({ page }) => {
  await signInAs(page, 'supplierA');
  for (const [reference, taxable] of [
    [`AE/WALK-${Date.now() % 10000}`, '4850.00'],
    [`AE/WALK-X${Date.now() % 10000}`, '9999.00'],
  ] as const) {
    await open(page, `${PORTAL}/supplier/bills`);
    await choose(page.getByLabel('Purchase order', { exact: false }), new RegExp(String(((await salesOrder(recall('stOrderId')))['purchaseOrders'] as Body[] | undefined)?.[0]?.['number'] ?? 'PO-')));
    await field(page, 'Your invoice number').fill(reference);
    await field(page, 'Invoice date').fill(daysFromNow(0));
    await field(page, 'Quantity').fill('100');
    await field(page, 'Taxable value (₹)').fill(taxable);
    await field(page, 'GST (₹)').fill('873.00');
    await command(page, 'Submit bill');
    await expect(visible(page, reference)).toBeVisible();
  }
  await axe(page, 'supplier bills');
});

test('ops · finance matches the bill, schedules and pays it, and sends the other to a second member', async ({ page }) => {
  await signInAs(page, 'finance');
  await open(page, `${OPERATIONS}/finance/bills`);
  await page.getByRole('radio', { name: /To match/ }).click();
  const bills = page.getByRole('button', { name: /SB-\d{4}-\d{4}/ }).filter({ visible: true });
  const count = await bills.count();
  for (let i = 0; i < count; i++) {
    await bills.nth(0).click();
    await command(page, 'Run the match');
  }
  await page.getByRole('radio', { name: /Matched/ }).click();
  await bills.first().click();
  const recheck = button(page, 'Check again');
  if (await recheck.isVisible()) await command(page, 'Check again');
  await field(page, 'Pay on').fill(daysFromNow(1));
  await command(page, 'Schedule');
  await field(page, 'Bank reference (UTR)').fill(`UTR${Date.now() % 1000000}`);
  await command(page, 'Mark paid');
  await page.getByRole('radio', { name: /Exceptions/ }).click();
  await bills.first().click();
  await field(page, 'Why it should be paid anyway').fill('Supplier included the agreed rework charge of the previous lot.');
  await command(page, 'Ask a second finance member');
  remember('billExceptionAsked', true);
  await axe(page, 'supplier bills (finance)');
});

test('ops · finance2 approves the bill exception', async ({ page }) => {
  await signInAs(page, 'finance2');
  await approveRow(page, '/finance/bills');
});

test('customer · raises a case, adds information, and withdraws a second one', async ({ page }) => {
  await signInAs(page, 'buyer');
  for (const [title, keep] of [
    ['Two housings scratched', true],
    ['Paperwork missing', false],
  ] as const) {
    await open(page, `${PORTAL}/support`);
    await choose(page.getByLabel('Order', { exact: true }), /SO-/);
    await choose(page.getByLabel('What is it about', { exact: false }), /delivery/i);
    await field(page, 'In a few words').fill(title);
    await field(page, 'What happened').fill(keep ? 'Two parts arrived with deep scratches on the flange.' : 'No test certificate in the box.');
    await command(page, 'Raise case');
    await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}$/);
    if (keep) {
      remember('caseId', page.url().split('/').pop());
      await field(page, 'Add information').fill('Photos to follow by mail.');
      await command(page, 'Send');
      await expect(visible(page, 'Photos to follow by mail.')).toBeVisible();
      await axe(page, 'customer case');
    } else {
      await field(page, 'Why').fill('Certificate found in the second carton.');
      await command(page, 'Withdraw');
      await expect(visible(page, /withdrawn/i)).toBeVisible();
    }
  }
  await open(page, `${PORTAL}/support`);
  await axe(page, 'customer support');
});

test('ops · support triages, investigates and proposes a credit note', async ({ page }) => {
  await signInAs(page, 'support');
  await open(page, `${OPERATIONS}/support`);
  await axe(page, 'case center');
  await open(page, `${OPERATIONS}/support/${recall('caseId')}`);
  await command(page, 'Take and triage');
  await command(page, 'Start investigating');
  await field(page, 'Add a note').fill('Checked dispatch photos: scratches not visible at packing.');
  await command(page, 'Add note');
  await button(page, 'Add an action').click();
  await choose(page.getByLabel('Action', { exact: true }).last(), /Credit note/);
  await field(page, 'What exactly').fill('Credit two housings');
  await field(page, 'Amount incl. GST (₹)').fill('114.46');
  await command(page, 'Send for approval');
  await expect(visible(page, 'Credit two housings')).toBeVisible();
  await axe(page, 'case (proposed)');
});

test('ops · finance approves the resolution and issues the credit note', async ({ page }) => {
  await signInAs(page, 'finance');
  await approveRow(page, `/support/${recall('caseId')}`);
  await open(page, `${OPERATIONS}/support/${recall('caseId')}`);
  await page.getByLabel('Against invoice', { exact: false }).selectOption({ index: 1 });
  await command(page, 'Carry out');
  await expect(visible(page, /CN-\d{4}-\d{4}/)).toBeVisible();
});

test('ops · support verifies the credit note and closes the case', async ({ page }) => {
  await signInAs(page, 'support');
  await open(page, `${OPERATIONS}/support/${recall('caseId')}`);
  await field(page, 'Verification note').fill('Credit note seen against the invoice.');
  await command(page, 'Verify');
  await field(page, 'Closing note to the customer').fill('We credited the two scratched housings.');
  await command(page, 'Close the case');
  await expect(visible(page, /closed/i)).toBeVisible();
  await axe(page, 'case (closed)');
});

test('customer · sees the closed case and its credit', async ({ page }) => {
  await signInAs(page, 'buyer');
  await open(page, `${PORTAL}/support/${recall('caseId')}`);
  await expect(visible(page, 'We credited the two scratched housings.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Anand|PO-\d{4}/);
});
