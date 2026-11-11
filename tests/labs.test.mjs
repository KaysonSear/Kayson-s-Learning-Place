import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/labs.js', import.meta.url), 'utf8');
const context = {window: {}};
vm.runInNewContext(source, context);
const {catalog, models} = context.window.CLabLabs;
const start = id => ({model: models[id], state: models[id].initial()});
const act = (lab, action, value) => lab.model.act(lab.state, action, value === undefined ? undefined : String(value));

test('16 finite-state laboratories cover all 19 chapters without runtime network or eval', () => {
  assert.equal(catalog.length, 16);
  assert.deepEqual([...new Set(catalog.flatMap(x => Array.from(x.chapters)))].sort((a, b) => a - b), Array.from({length: 19}, (_, i) => i + 1));
  assert.doesNotMatch(source, /\beval\s*\(|new\s+Function|\bfetch\s*\(|https?:\/\//);
  for (const {id} of catalog) {
    const lab = start(id);
    assert.ok(lab.model.view(lab.state).length > 100, id);
    assert.ok(lab.model.goal.length > 10, id);
    assert.ok(lab.model.assumptions.length > 10, id);
  }
});

test('build stages reject wrong transitions; unresolved definition is a link issue', () => {
  const lab = start('build');
  assert.equal(act(lab, 'stage', 3).success, false);
  assert.equal(lab.state.stage, 0);
  for (let i = 0; i < 4; i++) act(lab, 'stage', i);
  assert.equal(act(lab, 'diagnose', 0).success, false);
  assert.equal(act(lab, 'diagnose', 1).success, true);
});

test('sizeof ratio is model-independent and unsigned conversion wraps only after promotion', () => {
  const lab = start('types');
  act(lab, 'model', 2);
  act(lab, 'answer', 3);
  assert.equal(act(lab, 'answer', 12).success, false);
  assert.equal(lab.state.stage, 1);
  act(lab, 'answer', 6);
  assert.equal(act(lab, 'answer', 0).success, true);
});

test('short-circuit and unsequenced modification have distinct boundaries', () => {
  const lab = start('expressions');
  act(lab, 'answer', 1);
  assert.match(act(lab, 'answer', 0).message, /不求值|除零/);
  assert.equal(lab.state.stage, 1);
  act(lab, 'answer', 1);
  assert.equal(act(lab, 'answer', 1).success, true);
});

test('continue still reaches the for increment and terminates with sum 4', () => {
  const lab = start('control');
  let guard = 0;
  while (!lab.state.done && guard++ < 30) act(lab, 'step');
  assert.equal(lab.state.i, 4);
  assert.equal(lab.state.sum, 4);
  assert.ok(lab.state.trace.includes('i=2：continue'));
  assert.equal(act(lab, 'answer', 4).success, true);
});

test('recursive stack reaches a base case before unwinding and returning 6', () => {
  const lab = start('calls');
  let guard = 0;
  while (!lab.state.done && guard++ < 20) act(lab, 'step');
  assert.equal(lab.state.returned, 6);
  assert.equal(lab.state.stack.length, 0);
  assert.equal(act(lab, 'answer', 6).success, true);
});

test('strict second maximum excludes duplicated maximum and handles negative initialization', () => {
  const lab = start('arrays');
  act(lab, 'update', 'max');
  assert.equal(lab.state.max, -3);
  assert.equal(lab.state.second, null);
  act(lab, 'update', 'max');
  assert.equal(act(lab, 'update', 'second').success, false);
  assert.equal(lab.state.index, 2);
  act(lab, 'update', 'skip');
  assert.equal(act(lab, 'update', 'second').success, true);
  assert.equal(lab.state.second, 1);
});

test('pointer formation, tail dereference, const writes and multidimensional stride are separate', () => {
  const lab = start('pointers');
  act(lab, 'const');
  act(lab, 'write');
  assert.equal(lab.state.data[0], 10);
  act(lab, 'move', 1);
  act(lab, 'move', 1);
  assert.match(act(lab, 'read').message, /30/);
  act(lab, 'move', 1);
  assert.equal(act(lab, 'read').success, true);
  assert.match(act(lab, 'read').message, /未定义行为/);
  act(lab, 'move', 1);
  assert.equal(lab.state.index, 3);
  assert.match(act(lab, 'inspect', 1).message, /12 字节/);
});

test('strlen does not invent a result before NUL; capacity remains five', () => {
  const lab = start('strings');
  assert.match(act(lab, 'measure').message, /未定义行为/);
  assert.equal(lab.state.stage, 0);
  act(lab, 'nul', 3);
  act(lab, 'measure');
  assert.equal(act(lab, 'answer', 1).success, true);
});

test('scanf width leaves a terminator and subsequent integer mismatch leaves l unread', () => {
  const lab = start('formats');
  act(lab, 'width', 4);
  assert.equal(lab.state.stage, 0);
  act(lab, 'width', 3);
  for (let i = 0; i < 3; i++) act(lab, 'step');
  assert.equal(Array.from(lab.state.buffer).join(''), 'hel\0');
  assert.equal(lab.state.position, 3);
  assert.equal(act(lab, 'answer', 0).success, true);
  assert.equal(lab.state.position, 3);
});

test('strtol diagnostics cover leftover, complete, range and no conversion', () => {
  const lab = start('parse');
  for (const answer of ['tail', 'valid', 'range']) assert.equal(act(lab, 'classify', answer).success, false);
  assert.equal(act(lab, 'classify', 'none').success, true);
  assert.equal(lab.state.solved, 4);
});

test('bit mask clears bit 5 and sets bit 0 without changing other bits', () => {
  const lab = start('bits');
  act(lab, 'mask', 5);
  act(lab, 'apply', 'clear');
  assert.equal(lab.state.value, 140);
  act(lab, 'zero');
  act(lab, 'mask', 0);
  assert.equal(act(lab, 'apply', 'or').success, true);
  assert.equal(lab.state.value, 141);
});

test('stable bubble sort preserves equal-element identity; lower bound finds first duplicate', () => {
  const lab = start('sort');
  let guard = 0;
  while (!lab.state.done && guard++ < 20) {
    const s = lab.state;
    act(lab, 'compare', s.data[s.index].n > s.data[s.index + 1].n ? 'swap' : 'keep');
  }
  assert.equal(Array.from(lab.state.data, x => `${x.n}${x.tag}`).join(','), '0D,1B,2A,2C');
  act(lab, 'mode', 'search');
  act(lab, 'search', 'left');
  act(lab, 'search', 'left');
  assert.equal(act(lab, 'search', 'right').success, true);
  assert.equal(lab.state.lo, 1);
});

test('structure exercises distinguish ABI padding, member equality and pointer shallow copy', () => {
  const lab = start('struct');
  act(lab, 'answer', 8);
  act(lab, 'answer', 1);
  assert.equal(act(lab, 'answer', 9).success, true);
});

test('realloc failure keeps old block; free invalidates all aliases and clear order may vary', () => {
  const lab = start('resources');
  act(lab, 'realloc', 'safe');
  assert.equal(lab.state.live, true);
  assert.equal(lab.state.p, 'block');
  assert.equal(lab.state.q, 'block');
  act(lab, 'free');
  assert.equal(lab.state.live, false);
  assert.match(act(lab, 'readq').message, /未定义行为/);
  act(lab, 'qnull');
  assert.equal(act(lab, 'pnull').success, true);
  assert.match(act(lab, 'free').message, /free\(NULL\)/);
});

test('lost p can only be recovered while q is still a valid alias; list deletion preserves next before free', () => {
  const lab = start('resources');
  act(lab, 'realloc', 'direct');
  assert.equal(lab.state.p, 'null');
  assert.equal(lab.state.live, true);
  act(lab, 'restore');
  assert.equal(lab.state.p, 'block');
  act(lab, 'mode', 'list');
  act(lab, 'list', 2);
  assert.equal(lab.state.listPhase, 0);
  act(lab, 'list', 0);
  act(lab, 'list', 1);
  assert.equal(act(lab, 'list', 2).success, true);
});

test('last character does not set EOF; clearerr does not move position; rewind does', () => {
  const lab = start('streams');
  act(lab, 'read');
  act(lab, 'read');
  assert.equal(lab.state.position, 2);
  assert.equal(lab.state.eof, false);
  act(lab, 'read');
  assert.equal(lab.state.eof, true);
  act(lab, 'clear');
  assert.equal(lab.state.eof, false);
  assert.equal(lab.state.position, 2);
  act(lab, 'read');
  assert.equal(lab.state.eof, true);
  act(lab, 'rewind');
  assert.equal(lab.state.position, 0);
  assert.equal(act(lab, 'read').success, true);
});

test('rejection sampling balances source preimages; negative floor differs from truncation', () => {
  const lab = start('math');
  for (let i = 0; i < 8; i++) act(lab, 'step');
  assert.equal(Array.from(lab.state.counts).join(','), '3,3,2');
  act(lab, 'reject');
  for (let i = 0; i < 8; i++) act(lab, 'step');
  assert.equal(Array.from(lab.state.counts).join(','), '2,2,2');
  assert.equal(act(lab, 'finish').success, true);
  act(lab, 'mode', 'round');
  act(lab, 'round', 1);
  assert.equal(act(lab, 'time', 1).success, true);
});
