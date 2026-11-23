// Claude Code, Codex and Qwen Code: the skill notices which one is running it, and the map remembers, so
// its Ask bar and "Fix with …" prompts name the right one. Claude Code gets the CLAUDE.local.md note and
// Qwen Code the .qwen/QWEN.local.md one; Codex has no personal notes file, so it gets none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, shopApp, run, readGraph, readJson, cleanup } from './helpers.mjs';

const { detectAgent, cliLabel } = await lib('agent.mjs');

test('Codex is recognised by the variables it sets for every command', () => {
  assert.equal(detectAgent({}, { CODEX_THREAD_ID: 'abc' }), 'codex');
  assert.equal(detectAgent({}, { CODEX_SESSION_ID: 'abc' }), 'codex');
  assert.equal(detectAgent({}, {}), 'claude');
  assert.equal(detectAgent({}, { CLAUDECODE: '1' }), 'claude');
});

test('Qwen Code is recognised by the variables it sets for every command', () => {
  assert.equal(detectAgent({}, { QWEN_CODE_SESSION_ID: 'abc' }), 'qwen');
  assert.equal(detectAgent({}, { QWEN_CODE: '1' }), 'qwen');
  assert.equal(detectAgent({}, { QWEN_CODE_CLI: '/opt/qwen/cli-entry.js' }), 'qwen');
  assert.equal(detectAgent({}, { QWEN_CODE_MODEL: 'glm-5.3' }), 'claude', 'other QWEN_CODE_* variables alone say nothing');
});

test('--agent and FLOORPLAN_AGENT override the guess, and nonsense is ignored', () => {
  assert.equal(detectAgent({ agent: 'codex' }, {}), 'codex');
  assert.equal(detectAgent({ agent: 'qwen' }, {}), 'qwen');
  assert.equal(detectAgent({ agent: 'Claude' }, { CODEX_THREAD_ID: 'abc' }), 'claude');
  assert.equal(detectAgent({}, { FLOORPLAN_AGENT: 'codex' }), 'codex');
  assert.equal(detectAgent({}, { FLOORPLAN_AGENT: 'qwen' }), 'qwen');
  assert.equal(detectAgent({ agent: 'gpt' }, { CODEX_THREAD_ID: 'abc' }), 'codex');
});

test('a map built under Codex records it, and leaves the project notes alone', () => {
  const root = shopApp();
  try {
    run('scan.mjs', root);
    const out = run('build.mjs', root, '--agent', 'codex');
    assert.equal(readGraph(root).meta.agent, 'codex');
    assert.match(out, /AGENT {2}Codex/);
    assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.local.md')), 'no CLAUDE.local.md');
    assert.ok(!fs.existsSync(path.join(root, 'AGENTS.md')), 'no AGENTS.md');
  } finally { cleanup(root); }
});

test('a map built under Claude Code records it, and adds the CLAUDE.local.md note only when asked', () => {
  const root = shopApp();
  const notes = path.join(root, 'CLAUDE.local.md');
  try {
    run('scan.mjs', root);
    assert.match(run('build.mjs', root, '--agent', 'claude'), /CLAUDE\.LOCAL\.MD {2}not added/);
    assert.equal(readGraph(root).meta.agent, 'claude');
    assert.ok(!fs.existsSync(notes), 'no CLAUDE.local.md until the user says yes');
    run('build.mjs', root, '--agent', 'claude', '--claude-md');
    assert.match(fs.readFileSync(notes, 'utf8'), /floorplan\/query\.mjs/);
  } finally { cleanup(root); }
});

test('a CLAUDE.local.md note that already exists is kept current, and the opt-out marker still wins', () => {
  const root = shopApp();
  const notes = path.join(root, 'CLAUDE.local.md');
  try {
    run('scan.mjs', root);
    fs.writeFileSync(notes, 'my notes\n\n<!-- floorplan:start -->\nold\n<!-- floorplan:end -->\n');
    run('build.mjs', root, '--agent', 'claude');
    const text = fs.readFileSync(notes, 'utf8');
    assert.match(text, /^my notes/);
    assert.match(text, /floorplan\/query\.mjs/);
    assert.doesNotMatch(text, /\nold\n/);
    fs.writeFileSync(notes, 'my notes\n<!-- floorplan:off -->\n');
    assert.match(run('build.mjs', root, '--agent', 'claude', '--claude-md'), /CLAUDE\.LOCAL\.MD {2}skipped \(opted out\)/);
    assert.equal(fs.readFileSync(notes, 'utf8'), 'my notes\n<!-- floorplan:off -->\n');
  } finally { cleanup(root); }
});

test('the copy for the Claude app always says Claude, whoever built the map', () => {
  const root = shopApp();
  try {
    run('scan.mjs', root);
    run('build.mjs', root, '--agent', 'codex', '--artifact', '--no-claude-md');
    const html = fs.readFileSync(path.join(root, 'floorplan', 'artifact.html'), 'utf8');
    assert.match(html, /"agent":"claude"/);
    assert.equal(readJson(path.join(root, 'floorplan', 'graph.json')).meta.agent, 'codex');
  } finally { cleanup(root); }
});

test('a map built under Qwen Code records it, and writes its notes file only when asked', () => {
  const root = shopApp();
  const notes = path.join(root, '.qwen', 'QWEN.local.md');
  try {
    run('scan.mjs', root);
    const out = run('build.mjs', root, '--agent', 'qwen');
    assert.equal(readGraph(root).meta.agent, 'qwen');
    assert.match(out, /AGENT {2}Qwen Code/);
    assert.match(out, /QWEN\.LOCAL\.MD {2}not added/);
    assert.ok(!fs.existsSync(notes), 'no .qwen/QWEN.local.md until the user says yes');
    assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.local.md')), "a Qwen Code build doesn't touch Claude Code's notes either");
    run('build.mjs', root, '--agent', 'qwen', '--qwen-md');
    assert.match(fs.readFileSync(notes, 'utf8'), /floorplan\/query\.mjs/);
    assert.ok(!fs.existsSync(path.join(root, 'CLAUDE.local.md')), 'still no CLAUDE.local.md');
  } finally { cleanup(root); }
});

test('an existing QWEN.local.md note is kept current, and the opt-out marker still wins', () => {
  const root = shopApp();
  fs.mkdirSync(path.join(root, '.qwen'), { recursive: true });
  const notes = path.join(root, '.qwen', 'QWEN.local.md');
  try {
    run('scan.mjs', root);
    fs.writeFileSync(notes, 'my notes\n\n<!-- floorplan:start -->\nold\n<!-- floorplan:end -->\n');
    run('build.mjs', root, '--agent', 'qwen');
    const text = fs.readFileSync(notes, 'utf8');
    assert.match(text, /^my notes/);
    assert.match(text, /floorplan\/query\.mjs/);
    assert.doesNotMatch(text, /\nold\n/);
    fs.writeFileSync(notes, 'my notes\n<!-- floorplan:off -->\n');
    assert.match(run('build.mjs', root, '--agent', 'qwen', '--qwen-md'), /QWEN\.LOCAL\.MD {2}skipped \(opted out\)/);
    assert.equal(fs.readFileSync(notes, 'utf8'), 'my notes\n<!-- floorplan:off -->\n');
  } finally { cleanup(root); }
});

test("open.mjs names the program that answers questions, even when another one answers to the claude command (#95)", () => {
  assert.equal(cliLabel('claude', '2.0.14 (Claude Code)'), 'the Claude Code CLI');
  assert.equal(cliLabel('claude', ''), 'the Claude Code CLI');
  assert.equal(cliLabel('codex', 'codex-cli 0.46.0'), 'Codex');
  assert.equal(cliLabel('qwen', '0.28.4'), 'the Qwen Code CLI');
  assert.equal(cliLabel('qwen', 'qwen-code 0.28.4'), 'the Qwen Code CLI');
  // a wrapper installed as `claude` says what it is in its --version
  assert.equal(cliLabel('claude', 'devin 3000.11.238'), 'devin, found as the claude command');
  assert.equal(cliLabel('codex', 'othertool v1.2.0'), 'othertool, found as the codex command');
  assert.equal(cliLabel('qwen', 'othertool v1.2.0'), 'othertool, found as the qwen command');
  // text that isn't a program and its version leaves the usual name
  assert.equal(cliLabel('claude', 'unknown'), 'the Claude Code CLI');
});
