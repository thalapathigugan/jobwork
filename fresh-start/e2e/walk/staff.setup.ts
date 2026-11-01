import { writeFileSync } from 'node:fs';
import { test as setup } from '@playwright/test';
import { ApiSession } from '../support/api';
import { STAFF_FILE } from './support/walk';

/** FW.0: enrols MFA for the JobWork people the launch journeys' world does not (TOTP secrets are test-only). */
setup('enrol the walk staff', async () => {
  const secrets: Record<string, string> = {};
  for (const who of ['sourcing2', 'finance2', 'quality', 'quality2', 'logistics', 'admin']) {
    const email = `${who}@jobwork.test`;
    secrets[email] = (await ApiSession.signInEnrolled(email)).secret;
  }
  writeFileSync(STAFF_FILE, JSON.stringify(secrets, null, 2), { mode: 0o600 });
});
