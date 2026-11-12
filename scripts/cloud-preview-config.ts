import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const config = JSON.parse(fs.readFileSync(new URL('wrangler.jsonc',root),'utf8'));
const id = process.env.C_LAB_PREVIEW_DB_ID;
if (!id || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id) || id === config.d1_databases[0].database_id) {
  throw Error('Set C_LAB_PREVIEW_DB_ID to a separate D1 database ID.');
}
config.name += '-preview';
config.d1_databases[0].database_id = id;
config.d1_databases[0].database_name = 'kayson-learning-progress-preview';
fs.writeFileSync(new URL('.wrangler.preview.json',root), JSON.stringify(config,null,2) + '\n');
console.log('Preview configuration ready: .wrangler.preview.json');
