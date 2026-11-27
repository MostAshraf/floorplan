// A map that shows an outside service must still lay out. ELK refuses a node whose layer
// constraint is LAST when one of its edges does not go to a LAST_SEPARATE node, and an outside
// service always has edges, so the viewer has to give them a layer of their own.
//
// This test builds a map with two outside services - one the app talks to, one that talks to the
// other - and runs the layout engine the way the viewer does: the constraint comes from the
// viewer's own source, so a change back to LAST fails here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { makeProject, run, readGraph, cleanup, SKILL } from './helpers.mjs';

const require = createRequire(import.meta.url);
const ELK = require(path.join(SKILL, 'assets', 'vendor', 'elk.bundled.js'));

let root;

/** The layer constraint the viewer gives an outside service, read from its own source. */
function viewerExternalConstraint() {
  const viewer = fs.readFileSync(path.join(SKILL, 'assets', 'viewer.html'), 'utf8');
  const m = /kind === 'external'[\s\S]{0,600}?layerConstraint': '([A-Z_]+)'/.exec(viewer);
  assert.ok(m, 'the viewer must give outside services a layer constraint');
  return m[1];
}

before(() => {
  const files = {
    'api/server.js': 'export const app = 1;\n',
    'api/package.json': JSON.stringify({ name: 'api', type: 'module' }),
  };
  const arch = {
    project: { name: 'Thing', summary: 'A thing with a database.' },
    nodes: [
      { id: 'api', label: 'Server', kind: 'service', summary: 'The server.', paths: ['api/**'] },
      { id: 'pg', label: 'Postgres', kind: 'external', summary: 'The database.' },
      { id: 'zip', label: 'Zip tool', kind: 'external', summary: 'The tool that packs the files.' },
    ],
    edges: [
      { from: 'api', to: 'pg', kind: 'data', label: 'reads and writes' },
      { from: 'zip', to: 'pg', kind: 'data', label: 'writes into' },
    ],
  };
  root = makeProject(files, { repos: ['api'], arch });
  run('scan.mjs', root);
  run('build.mjs', root, '--no-claude-md');
});
after(() => cleanup(root));

test('the build keeps the outside services and their edges', () => {
  const g = readGraph(root);
  const externals = g.nodes.filter((n) => n.kind === 'external').map((n) => n.id);
  assert.deepEqual(externals.sort(), ['pg', 'zip']);
  const edges = g.links.filter((l) => l.a?.startsWith('n:') && l.b?.startsWith('n:'));
  assert.ok(edges.some((l) => l.a === 'n:api' && l.b === 'n:pg'), 'the app talks to the database');
  assert.ok(edges.some((l) => l.a === 'n:zip' && l.b === 'n:pg'), 'the tool writes into the database');
});

test('the board lays out: outside services with edges do not break the layout', async () => {
  const g = readGraph(root);
  const constraint = viewerExternalConstraint();
  const visible = g.nodes.filter((n) => !n.parent).map((n) => 'n:' + n.id);
  const isExternal = new Set(g.nodes.filter((n) => n.kind === 'external').map((n) => 'n:' + n.id));
  const edges = g.links.filter((l) => l.a?.startsWith('n:') && l.b?.startsWith('n:') && l.a !== l.b);

  const children = visible.map((id) => ({
    id, width: 300, height: 128,
    ...(isExternal.has(id) ? { layoutOptions: { 'elk.layered.layering.layerConstraint': constraint } } : {}),
  }));
  const elk = new ELK();
  const res = await elk.layout({
    id: 'g', children,
    edges: edges.map((l, i) => ({ id: 'e' + i, sources: [l.a], targets: [l.b] })),
    layoutOptions: {
      'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.spacing.nodeNodeBetweenLayers': '130', 'elk.spacing.nodeNode': '32',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '8', 'elk.spacing.edgeEdge': '8', 'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', 'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.thoroughness': '12', 'elk.separateConnectedComponents': 'true', 'elk.spacing.componentComponent': '80',
      'elk.padding': '[top=40,left=40,bottom=40,right=40]',
    },
  });
  assert.ok(res.children?.length, 'the board has laid-out cards');
});
