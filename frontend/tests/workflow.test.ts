import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogSchema, searchCatalog, submissionInputSchema, transitionSubmission, type SubmissionInput } from '../src/model';
import { demoCatalog } from '../src/data';
import { decodeSubmissions, HttpRepository, LocalRepository } from '../src/repository';
function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const input: SubmissionInput = { title: '图书馆的一次相遇', year: 2026, author: '测试同学', body: '这是一条完全虚构的测试记忆，用来验证投稿审核和撤回流程是否正常。', consent: true };
test('all catalog references resolve and all fixtures carry demo flags', () => {
  const catalog = catalogSchema.parse(demoCatalog);
  const sources = new Set(catalog.sources.map(s => s.id)), people = new Set(catalog.people.map(p => p.id));
  for (const entity of [...catalog.events, ...catalog.people, ...catalog.relations]) {
    assert.equal(entity.demo, true); assert.ok(entity.sourceIds.length);
    entity.sourceIds.forEach(id => assert.ok(sources.has(id), id));
  }
  catalog.events.forEach(e => e.personIds.forEach(id => assert.ok(people.has(id))));
  catalog.relations.forEach(r => { assert.ok(people.has(r.from)); assert.ok(people.has(r.to)); });
});
test('submission approval persistence withdrawal and deletion form a complete workflow', async () => {
  const storage = memoryStorage(), repo = new LocalRepository(storage);
  const item = await repo.submit(input);
  assert.equal((await repo.submissions('public')).length, 0);
  await repo.update(item.id, 'approve', '已核对演示内容');
  assert.equal((await new LocalRepository(storage).submissions('public')).length, 1);
  await repo.update(item.id, 'withdraw');
  assert.equal((await repo.submissions('public')).length, 0);
  assert.equal((await repo.submissions('mine'))[0].status, 'withdrawn');
  await repo.remove(item.id);
  assert.equal((await repo.submissions('mine')).length, 0);
});
test('rejection needs a reason and handled records cannot be reviewed twice', async () => {
  const repo = new LocalRepository(memoryStorage()), item = await repo.submit(input);
  assert.throws(() => transitionSubmission(item, 'reject', '  '), /原因/);
  await repo.update(item.id, 'reject', '请补充资料出处');
  assert.equal((await repo.submissions('public')).length, 0);
  await assert.rejects(repo.update(item.id, 'approve'), /只能审核/);
});
test('invalid consent, blank text, future and pre-1905 years are rejected', () => {
  for (const invalid of [{ consent: false }, { body: ' '.repeat(30) }, { year: 1900 }, { year: 9999 }])
    assert.equal(submissionInputSchema.safeParse({ ...input, ...invalid }).success, false);
});
test('corrupt local data is never silently replaced', () => {
  assert.throws(() => decodeSubmissions('{bad json'), /未被覆盖/);
  assert.throws(() => decodeSubmissions('[{"id":3}]'), /未被覆盖/);
  assert.deepEqual(decodeSubmissions(null), []);
});
test('storage failure cannot report successful submission', async () => {
  const repo = new LocalRepository({ getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); } });
  await assert.rejects(repo.submit(input), /保存失败/);
});
test('search supports Chinese multiword queries and treats special characters as text', () => {
  assert.equal(searchCatalog(demoCatalog, '  ').length, 0);
  assert.ok(searchCatalog(demoCatalog, '江知远').some(r => r.type === 'person'));
  assert.ok(searchCatalog(demoCatalog, '校园 刊物').length > 0);
  assert.equal(searchCatalog(demoCatalog, '<script>[').length, 0);
});
test('HTTP adapter validates JSON contracts and reports denied access', async () => {
  const original = globalThis.fetch, repo = new HttpRepository('/api');
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, message: 'ok', data: demoCatalog }), { status: 200 });
    assert.equal((await repo.catalog()).people.length, 8);
    globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, message: 'ok', data: { people: [] } }), { status: 200 });
    await assert.rejects(repo.catalog(), /接口数据/);
    globalThis.fetch = async () => new Response(null, { status: 403 });
    await assert.rejects(repo.update('x', 'approve'), /权限/);
  } finally { globalThis.fetch = original; }
});
