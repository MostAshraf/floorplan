// Stands in for `qwen` in tests: answers --version, and for `-p` logs its arguments and prompt to
// $FAKE_LOG, then prints the stream-json events a real run would. Qwen Code's events are shaped like
// Claude Code's, but the validated answer arrives in the result event's structured_result, and its
// tools are named run_shell_command and read_file. A prompt containing "SIGNED-OUT" fails the way
// Qwen Code does when nobody is signed in.
import fs from 'node:fs';

const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('0.28.4-test'); process.exit(0); }
let input = '';
process.stdin.on('data', (d) => { input += d; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, input }) + '\n');
  const out = (ev) => console.log(JSON.stringify(ev));
  out({ type: 'system', subtype: 'init', session_id: 'test-session' });
  // a change to a blueprint: answer with the next reply in $FAKE_CHANGES (a JSON array), one per run
  const schema = args[args.indexOf('--json-schema') + 1] || '';
  if (process.env.FAKE_CHANGES && schema.includes('"architecture"')) {
    const replies = JSON.parse(fs.readFileSync(process.env.FAKE_CHANGES, 'utf8'));
    const counter = process.env.FAKE_CHANGES + '.n';
    const n = fs.existsSync(counter) ? +fs.readFileSync(counter, 'utf8') : 0;
    fs.writeFileSync(counter, String(n + 1));
    out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'read_file', input: { file_path: 'floorplan/plan.json' } }] } });
    out({ type: 'result', subtype: 'success', is_error: false, session_id: 'test-session', structured_result: replies[Math.min(n, replies.length - 1)] });
    return;
  }
  if (input.includes('SIGNED-OUT')) {
    out({ type: 'result', subtype: 'error', is_error: true, session_id: 'test-session', result: 'You are not logged in. Start qwen in a terminal and sign in, then ask again.' });
    return;
  }
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'run_shell_command', input: { command: 'node floorplan/query.mjs overview' } }] } });
  out({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'read_file', input: { file_path: 'shop-api/routes/orders.js' } }] } });
  out({ type: 'result', subtype: 'success', is_error: false, session_id: 'test-session', structured_result: {
    title: 'Refunds', answer: 'Refunds go through [[f:shop-api/routes/orders.js]].',
    items: [{ id: 'f:shop-api/routes/orders.js', note: 'Holds the refund endpoint.' }], steps: [], followups: ['Who can ask for one?'],
  } });
});
