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
