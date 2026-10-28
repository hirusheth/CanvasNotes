// Server-side account tools (there's no email service, so password resets happen here).
//   node server/admin.mjs list
//   node server/admin.mjs reset-password <email> <new password>
// Uses the same DATA_DIR as the server; run it on the server machine.
import path from 'node:path';
import { openStore } from './store.mjs';
import { createAccounts, MIN_PASSWORD } from './accounts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const store = openStore(path.join(DATA_DIR, 'canvasnotes.db'));
const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'list') {
    const n = store.userCount();
    console.log(`${n} account(s) in ${DATA_DIR}`);
    for (const u of store.listUsers()) console.log(`  ${u.email}${u.name ? ` (${u.name})` : ''}  created ${new Date(u.created_at).toISOString().slice(0, 10)}`);
  } else if (command === 'reset-password' && args.length === 2) {
    const [email, password] = args;
    if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
    const ok = await createAccounts(store).resetPassword(email, password);
    if (!ok) throw new Error(`No account for ${email}`);
    console.log(`Password changed for ${email}; every browser signed into it is signed out.`);
  } else {
    console.log('Usage:\n  node server/admin.mjs list\n  node server/admin.mjs reset-password <email> <new password>');
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  store.close();
}
