process.env.DB_DRIVER = 'sqlite';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { Store } from '../src/db.ts';
import { createApp } from '../src/app.ts';
import { catalogSchema } from '../src/model.ts';

const origin='http://127.0.0.1:5173';
const fixture=catalogSchema.parse(JSON.parse(readFileSync(new URL('../fixtures/catalog.json',import.meta.url),'utf8')));
const seed=[
 {email:'a@local.test',name:'A',role:'member' as const,password:'TestMemberA!'},
 {email:'b@local.test',name:'B',role:'member' as const,password:'TestMemberB!'},
 {email:'r@local.test',name:'R',role:'reviewer' as const,password:'TestReviewer!'},
];
const input={title:'服务器投稿测试',year:2026,body:'这是一段仅供自动化测试的虚构校史投稿，用于验证审核和所有权隔离。',author:'测试笔名',consent:true};
async function fixtureServer(path=':memory:',loginLimit=30){
 const store=new Store(path);store.seed(fixture,seed);
 const server=createApp(store,{origins:[origin],loginLimit}).listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+(server.address() as AddressInfo).port;
 async function req(path:string,method='GET',body?:unknown,cookie='',headers:Record<string,string>={}){
  const response=await fetch(base+'/api'+path,{method,headers:{Origin:origin,'X-App-Request':'fudan-history','Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0] || ''};
 }
 async function login(email:string,password:string){const result=await req('/auth/login','POST',{email,password});assert.equal(result.status,200);return result.cookie;}
 async function close(){await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));store.close();}
 return{store,req,login,close};
}
test('catalog and retrieval expose sources without pretending to generate an answer',async()=>{
 const f=await fixtureServer();try{
  const catalog=await f.req('/catalog');assert.equal(catalog.status,200);catalogSchema.parse(catalog.data.data);
  const qa=await f.req('/qa/retrieve','POST',{question:'校园'});
  assert.equal(qa.data.data.mode,'retrieval-only');assert.equal(qa.data.data.answer,null);assert.ok(qa.data.data.citations.length);
  const miss=await f.req('/qa/retrieve','POST',{question:'不存在的随机问题xyz'});
  assert.equal(miss.data.data.citations.length,0);
  f.store.db.prepare('UPDATE catalog_items SET published=0 WHERE kind=?').run('sources');
  assert.equal((await f.req('/catalog')).data.data.events.length,0);
  assert.equal((await f.req('/qa/retrieve','POST',{question:'校园'})).data.data.citations.length,0);
 }finally{await f.close();}
});
test('sessions, role checks, ownership, approval, withdrawal and delete',async()=>{
 const f=await fixtureServer();try{
  assert.equal((await f.req('/submissions','POST',input)).status,401);
  const a=await f.login(seed[0].email,seed[0].password),b=await f.login(seed[1].email,seed[1].password),r=await f.login(seed[2].email,seed[2].password);
  assert.equal((await f.req('/auth/me','GET',undefined,a)).data.data.name,'A');
  assert.equal((await f.req('/submissions?scope=review','GET',undefined,a)).status,403);
  const created=await f.req('/submissions','POST',{...input,ownerId:'B',status:'approved',role:'reviewer'},a);
  assert.equal(created.status,200);assert.equal(created.data.data.status,'pending');
  const id=created.data.data.id;
  assert.equal((await f.req('/submissions?scope=mine','GET',undefined,b)).data.data.length,0);
  assert.equal((await f.req('/submissions?scope=public')).data.data.length,0);
  assert.equal((await f.req('/submissions/'+id+'/approve','POST',{note:''},a)).status,403);
  assert.equal((await f.req('/submissions/'+id+'/withdraw','POST',{note:''},b)).status,404);
  assert.equal((await f.req('/submissions/'+id,'DELETE',undefined,b)).status,404);
  assert.equal((await f.req('/submissions/'+id+'/approve','POST',{note:'内部意见'},r)).status,200);
  const publicItem=(await f.req('/submissions?scope=public')).data.data[0];
  assert.equal(publicItem.reviewNote,'');assert.equal(publicItem.ownerId,undefined);assert.equal(publicItem.email,undefined);
  assert.equal((await f.req('/submissions/'+id+'/approve','POST',{note:''},r)).status,409);
  assert.equal((await f.req('/submissions/'+id+'/withdraw','POST',{note:''},a)).status,200);
  assert.equal((await f.req('/submissions?scope=public')).data.data.length,0);
  assert.equal((await f.req('/submissions/'+id+'/approve','POST',{note:''},r)).status,409);
  assert.equal((await f.req('/submissions/'+id,'DELETE',undefined,a)).status,200);
  assert.equal((await f.req('/submissions?scope=mine','GET',undefined,a)).data.data.length,0);
  for(const row of f.store.db.prepare('SELECT * FROM review_logs').all()){
   assert.equal(row.note,'');assert.equal(row.actor_id,null);assert.equal(row.submission_id,null);
  }
  await f.req('/auth/logout','POST',{},a);
  assert.equal((await f.req('/auth/me','GET',undefined,a)).status,401);
 }finally{await f.close();}
});
test('rejection requires note and records survive database reopen',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'fudan-api-')),path=join(dir,'test.sqlite');
 let f=await fixtureServer(path);try{
  const a=await f.login(seed[0].email,seed[0].password),r=await f.login(seed[2].email,seed[2].password);
  const id=(await f.req('/submissions','POST',input,a)).data.data.id;
  assert.equal((await f.req('/submissions/'+id+'/reject','POST',{note:'  '},r)).status,422);
  assert.equal((await f.req('/submissions/'+id+'/reject','POST',{note:'请补充出处'},r)).status,200);
  await f.close();f=await fixtureServer(path);
  const rows=(await f.req('/submissions?scope=mine','GET',undefined,a)).data.data;
  assert.equal(rows[0].reviewNote,'请补充出处');assert.equal(rows[0].status,'rejected');
  f.store.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await f.req('/auth/me','GET',undefined,a)).status,401);
 }finally{await f.close();assert.ok(relative(resolve(tmpdir()),resolve(dir)).startsWith('fudan-api-')); rmSync(dir,{recursive:true,force:true});}
});
test('cross-origin writes, missing request marker, invalid input and login abuse are rejected',async()=>{
 const f=await fixtureServer(':memory:',2);try{
  assert.equal((await f.req('/auth/login','POST',{email:seed[0].email,password:seed[0].password},'',{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.req('/auth/login','POST',{email:seed[0].email,password:seed[0].password},'',{'X-App-Request':''})).status,403);
  const a=await f.login(seed[0].email,seed[0].password);
  assert.equal((await f.req('/submissions','POST',{...input,consent:false},a)).status,422);
  assert.equal((await f.req('/auth/login','POST',{email:seed[0].email,password:'wrong'})).status,401);
  assert.equal((await f.req('/auth/login','POST',{email:seed[0].email,password:'wrong'})).status,429);
  assert.equal((await f.req('/submissions?scope=invalid','GET',undefined,a)).status,422);
 }finally{await f.close();}
});

test('C组只读展示API：timeline/persons/graph/search', async () => {
  const f = await fixtureServer();
  try {
    const tl = await f.req('/timeline?page=1&pageSize=5');
    assert.equal(tl.status, 200);
    assert.equal(tl.data.code, 0);
    assert.equal(tl.data.data.page, 1);
    assert.equal(tl.data.data.pageSize, 5);
    assert.ok(Array.isArray(tl.data.data.items));
    assert.ok(tl.data.data.items.length <= 5);

    const firstId = tl.data.data.items[0]?.id;
    if (firstId) {
      const detail = await f.req('/timeline/' + firstId);
      assert.equal(detail.status, 200);
      assert.equal(detail.data.data.id, firstId);
    }
    assert.equal((await f.req('/timeline/not-exist')).status, 404);

    const pl = await f.req('/persons?page=1&pageSize=5');
    assert.equal(pl.status, 200);
    assert.ok(Array.isArray(pl.data.data.items));
    const role = pl.data.data.items[0]?.role;
    if (role) {
      const filtered = await f.req('/persons?role=' + encodeURIComponent(role));
      assert.ok(filtered.data.data.items.every((p: any) => p.role === role));
    }

    const pid = pl.data.data.items[0]?.id;
    if (pid) {
      const pd = await f.req('/persons/' + pid);
      assert.equal(pd.status, 200);
      assert.ok(Array.isArray(pd.data.data.relatedEvents));
      assert.ok(Array.isArray(pd.data.data.relations));
    }
    assert.equal((await f.req('/persons/not-exist')).status, 404);

    const graph = await f.req('/relations/graph');
    assert.equal(graph.status, 200);
    assert.ok(Array.isArray(graph.data.data.nodes));
    assert.ok(Array.isArray(graph.data.data.links));

    const s = await f.req('/search?q=' + encodeURIComponent('校园') + '&page=1&pageSize=3');
    assert.equal(s.status, 200);
    assert.equal(s.data.data.page, 1);
    assert.equal(s.data.data.pageSize, 3);
    assert.ok(Array.isArray(s.data.data.items));
    for (const item of s.data.data.items) {
      assert.ok('highlight' in item);
      assert.ok('jumpType' in item);
      assert.ok('jumpId' in item);
    }

    const onlyPerson = await f.req('/search?q=' + encodeURIComponent('校园') + '&type=person');
    assert.ok(onlyPerson.data.data.items.every((r: any) => r.type === 'person'));
  } finally {
    await f.close();
  }
});

test('C组关系图中心子图与搜索摘要高亮', async () => {
  const f = await fixtureServer();
  try {
    const full = await f.req('/relations/graph');
    assert.equal(full.status, 200);
    const fullNodes = full.data.data.nodes.length;
    const fullLinks = full.data.data.links.length;
    assert.ok(fullNodes > 0);
    assert.ok(fullLinks > 0);

    const d1 = await f.req('/relations/graph?centerId=p1&depth=1');
    assert.equal(d1.status, 200);
    const d1Ids = d1.data.data.nodes.map((n: any) => n.id);
    assert.ok(d1Ids.includes('p1'));
    assert.ok(d1.data.data.nodes.length < fullNodes);

    const d2 = await f.req('/relations/graph?centerId=p1&depth=2');
    assert.equal(d2.status, 200);
    assert.ok(d2.data.data.nodes.length >= d1.data.data.nodes.length);
    assert.ok(d2.data.data.nodes.length <= fullNodes);

    const missing = await f.req('/relations/graph?centerId=not-exist');
    assert.equal(missing.status, 404);

    const s = await f.req('/search?q=' + encodeURIComponent('校园') + '&page=1&pageSize=3');
    assert.equal(s.status, 200);
    const hits = s.data.data.items.filter((it: any) => String(it.highlight).includes('<em>校园</em>'));
    assert.ok(hits.length > 0, '至少一条结果的 highlight 应包含 <em>校园</em>');
  } finally {
    await f.close();
  }
});

