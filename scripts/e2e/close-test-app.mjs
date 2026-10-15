import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const vault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-vault');
const client = await connect();
try {
  assert.equal(path.resolve(await client.evaluate('app.vault.adapter.basePath')), vault);
  await client.evaluate(`app.plugins.plugins['html-frontmatter']?.flush()`);
  await client.send('Browser.close');
  console.log('Closed only the isolated test application.');
} finally { client.close(); }
