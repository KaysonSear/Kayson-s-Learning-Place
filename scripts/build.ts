import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { data } from './generate-library.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = (file: string) => fs.readFileSync(path.join(root, 'src', file), 'utf8');
const json = JSON.stringify(data);

await build({root});
fs.writeFileSync(path.join(root, 'dist-cloud/library.json'), json);

const result = await build({
  configFile: false,
  root,
  plugins: [react()],
  define: {'process.env.NODE_ENV': JSON.stringify('production')},
  build: {
    target: ['chrome111', 'safari16.4'],
    write: false,
    lib: {entry: path.join(root, 'src/main.tsx'), name: 'CLab', formats: ['iife']},
    minify: true
  }
});
const outputs = Array.isArray(result) ? result.flatMap(item => item.output) : 'output' in result ? result.output : [];
const bundle = outputs[0];
if (outputs.length !== 1 || bundle.type !== 'chunk' || bundle.imports.length || bundle.dynamicImports.length) {
  throw Error('The offline build must produce one script with no external assets');
}
const script = bundle.code.replace(/<\/script/gi, '<\\/script');
const html = source('shell.html')
  .replace('<!-- STYLE -->', () => '<style>' + source('style.css') + '</style>')
  .replace('<!-- DATA -->', () => '<script type="application/json" id="library-data">' + json.replaceAll('<', '\\u003c') + '</script>')
  .replace('<!-- SCRIPT -->', () => '<script>' + script + '</script>');
fs.mkdirSync(path.join(root, 'dist'), {recursive:true});
fs.writeFileSync(path.join(root, 'dist/C-Lab.html'), html);
console.log(JSON.stringify({...data.counts, bytes:Buffer.byteLength(html), sourceHash:data.sourceHash}, null, 2));
