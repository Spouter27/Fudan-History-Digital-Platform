import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoCatalog } from '../src/data';
import { DemoCatalogRepository, HttpCatalogRepository, adaptGraph, graphSchema, personDetailSchema } from '../src/catalogRepository';
import { SafeHighlight } from '../src/BrowseUi';

test('demo browsing follows pagination, filtering, detail and bounded subgraph contracts', async () => {
  const repo = new DemoCatalogRepository();
  const first = await repo.timeline({ page: 1, pageSize: 5 });
  const second = await repo.timeline({ page: 2, pageSize: 5 });
  assert.equal(first.total, 12); assert.equal(first.items.length, 5);
  assert.ok(second.items.every(item => !first.items.some(a => a.id === item.id)));
  assert.ok((await repo.timeline({ start: 1930, end: 1949 })).items.every(e => e.year >= 1930 && e.year <= 1949));
  assert.ok((await repo.persons({ role: '学者' })).items.every(p => p.role === '学者'));
  personDetailSchema.parse(await repo.person('p1'));
  assert.equal((await repo.event(first.items[0].id)).title, first.items[0].title);
  const one = await repo.graph({ centerId: 'p1', depth: 1 }), two = await repo.graph({ centerId: 'p1', depth: 2 });
  assert.ok(one.nodes.length < two.nodes.length); graphSchema.parse(one);
  await assert.rejects(repo.person('missing'), /不存在/);
});

test('HTTP client encodes filters and IDs, validates each C-group response and preserves errors', async () => {
  const original = globalThis.fetch, repo = new HttpCatalogRepository('http://localhost/api');
  const demo = new DemoCatalogRepository();
  let requested = '';
  const respond = (data: unknown, status = 200) => { globalThis.fetch = async input => { requested = String(input); return new Response(JSON.stringify({ code: status === 200 ? 0 : status, message: status === 404 ? '人物不存在。' : status === 429 ? '请求过于频繁' : 'ok', data }), { status }); }; };
  try {
    respond(await demo.timeline({ page: 2, pageSize: 5 }));
    assert.equal((await repo.timeline({ page: 2, pageSize: 5, keyword: '校园 & 记忆', category: '校园生活' })).page, 2);
    const url = new URL(requested); assert.equal(url.searchParams.get('keyword'), '校园 & 记忆'); assert.equal(url.searchParams.get('category'), '校园生活');
    respond(await demo.person('p1')); await repo.person('p/1'); assert.ok(requested.endsWith('/persons/p%2F1'));
    respond(await demo.event('e1')); assert.equal((await repo.event('e1')).id, 'e1');
    respond(await demo.persons({})); assert.equal((await repo.persons({})).total, 8);
    respond(await demo.graph({ centerId: 'p1', depth: 2 })); await repo.graph({ centerId: 'p1', depth: 2 }); assert.equal(new URL(requested).searchParams.get('depth'), '2');
    respond(await demo.search({ q: '校园' })); assert.ok((await repo.search({ q: '校园' })).items.length);
    respond({ items: [] }); await assert.rejects(repo.search({ q: '校园' }), /接口数据/);
    respond(null, 404); await assert.rejects(repo.person('missing'), /人物不存在/);
    respond(null, 429); await assert.rejects(repo.timeline({}), /请求过于频繁/);
  } finally { globalThis.fetch = original; }
});

test('graph adapter uses API membership and directions, preserves metadata and handles new nodes', async () => {
  const graph = await new DemoCatalogRepository().graph({ centerId: 'p1' });
  graph.links[0].sourceRef = 's2, s3';
  graph.nodes.push({ id: 'new', name: '新人物', category: '学者', colorKey: '学者' });
  const adapted = adaptGraph(graph, demoCatalog);
  assert.equal(adapted.people.length, graph.nodes.length);
  assert.equal(adapted.people.find(p => p.id === 'p1')?.summary, demoCatalog.people.find(p => p.id === 'p1')?.summary);
  assert.ok(Number.isFinite(adapted.people.find(p => p.id === 'new')?.x));
  assert.deepEqual(adapted.relations[0].sourceIds, ['s2', 's3']);
  assert.equal(adapted.relations[0].from, graph.links[0].source);
  assert.equal(graphSchema.safeParse({ nodes: [], links: graph.links }).success, false);
});

test('search jump fields select the right entity and only bare em tags become markup', async () => {
  const items = (await new DemoCatalogRepository().search({ q: '校园' })).items;
  assert.ok(items.every(r => r.jumpId === r.id && r.jumpType === (r.type === 'event' ? 'timeline' : r.type)));
  const html = renderToStaticMarkup(createElement(SafeHighlight, { value: '<img src=x onerror=alert(1)><em>校园<script>alert(2)</script></em><em onclick=x>unsafe</em>' }));
  assert.ok(html.includes('<mark>校园&lt;script&gt;'));
  assert.ok(!html.includes('<img')); assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<em onclick'));
});
