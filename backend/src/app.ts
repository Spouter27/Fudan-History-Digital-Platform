import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { submissionInputSchema, searchCatalog } from './model.ts';
import { Store, hashToken, publicUser, serializeSubmission, verifyPassword, hashPassword, type UserRow, type SubmissionRow } from './db.ts';

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const cookieName = 'fudan_session';
const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(120), password: z.string().min(1).max(128) });
function ok(res: Response, data: unknown) { res.json({ code: 0, message: 'ok', data }); }
function sessionCookie(req: Request) {
  return req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
}
function who(req: Request, store: Store) {
  const user = store.session(sessionCookie(req));
  if (!user) throw new HttpError(401, '请先登录。');
  return user;
}
export function createApp(store: Store, options: { origins: string[]; loginLimit?: number } ) {
  const app = express(); app.disable('x-powered-by'); app.use(helmet());
  const origins = new Set(options.origins);
  const loginAttempts = new Map<string, { count: number; expires: number }>();
  const writeAttempts = new Map<string, { count: number; expires: number }>();
  const dummyHash = hashPassword(randomBytes(24).toString('hex'));
  function limit(map: Map<string,{count:number;expires:number}>, key: string, max: number) {
    const now = Date.now();
    for (const [k,v] of map) if (v.expires <= now) map.delete(k);
    const value = map.get(key) || { count: 0, expires: now + 60000 };
    value.count++; map.set(key,value);
    if (value.count > max) throw new HttpError(429, '操作过于频繁，请一分钟后重试。');
  }
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return next(new HttpError(403, '请求来源不被允许。'));
    if (origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Credentials','true'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods','GET,POST,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Content-Type,X-App-Request');
      res.status(204).end(); return;
    }
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      // Non-simple custom header + exact Origin validation. No wildcard CORS.
      if (!origin || req.headers['x-app-request'] !== 'fudan-history') return next(new HttpError(403, '缺少受信任来源或请求标记。'));
      if (req.method !== 'DELETE' && !req.is('application/json')) return next(new HttpError(415, '请使用JSON请求。'));
      try { limit(writeAttempts, req.ip || 'local', 120); } catch (e) { return next(e); }
    }
    next();
  });
  app.use(express.json({ limit: '24kb' }));
  app.get('/api/health', async (_req, res) => ok(res,{ status:'ok', database:'sqlite', auth:'local-password', llmConfigured:false }));
  app.get('/api/catalog', async (_req, res) => ok(res,await store.catalog()));
  app.get('/api/timeline', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const catalog = await store.catalog();
    let items = catalog.events;
    const start = req.query.start ? parseInt(String(req.query.start), 10) : null;
    const end = req.query.end ? parseInt(String(req.query.end), 10) : null;
    const category = String(req.query.category ?? '');
    const keyword = String(req.query.keyword ?? '');
    if (start !== null && !Number.isNaN(start)) items = items.filter(e => e.year >= start);
    if (end !== null && !Number.isNaN(end)) items = items.filter(e => e.year <= end);
    if (category) items = items.filter(e => e.category === category);
    if (keyword) {
      const k = keyword.toLowerCase();
      items = items.filter(e => (e.title + e.summary).toLowerCase().includes(k));
    }
    items = [...items].sort((a, b) => a.year - b.year);
    const total = items.length;
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
    ok(res, { total, page, pageSize, items: pageItems });
  });

  app.get('/api/timeline/:id', async (req, res) => {
    const event = (await store.catalog()).events.find(e => e.id === req.params.id);
    if (!event) throw new HttpError(404, '事件不存在。');
    ok(res, event);
  });

  app.get('/api/relations/graph', async (req, res) => {
    const catalog = await store.catalog();
    const centerId = String(req.query.centerId ?? '').trim();
    const depthRaw = req.query.depth ? parseInt(String(req.query.depth), 10) : null;
    const depth = depthRaw !== null && !Number.isNaN(depthRaw) ? Math.max(1, Math.min(5, depthRaw)) : null;

    let people = catalog.people;
    let relations = catalog.relations;

    if (centerId) {
      const center = catalog.people.find(p => p.id === centerId);
      if (!center) throw new HttpError(404, '人物不存在。');
      const maxDepth = depth ?? 1;
      const visited = new Set<string>([centerId]);
      let frontier = new Set<string>([centerId]);
      for (let d = 0; d < maxDepth; d++) {
        const next = new Set<string>();
        for (const r of catalog.relations) {
          if (frontier.has(r.from) && !visited.has(r.to)) next.add(r.to);
          if (frontier.has(r.to) && !visited.has(r.from)) next.add(r.from);
        }
        for (const id of next) visited.add(id);
        frontier = next;
        if (next.size === 0) break;
      }
      people = catalog.people.filter(p => visited.has(p.id));
      relations = catalog.relations.filter(r => visited.has(r.from) && visited.has(r.to));
    }

    const nodes = people.map(p => ({
      id: p.id,
      name: p.name,
      category: p.role,
      colorKey: p.role,
    }));
    const links = relations.map(r => ({
      id: r.id,
      source: r.from,
      target: r.to,
      type: r.type,
      styleKey: r.type,
      sourceRef: (r.sourceIds ?? []).join(','),
    }));
    ok(res, { nodes, links });
  });
    app.get('/api/persons', async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '20'), 10) || 20));
    const keyword = String(req.query.keyword ?? '').toLowerCase();
    const role = String(req.query.role ?? '');

    let items = (await store.catalog()).people;
    if (role) items = items.filter(p => p.role === role);
    if (keyword) items = items.filter(p => (p.name + p.summary).toLowerCase().includes(keyword));
    items = [...items].sort((a, b) => a.id.localeCompare(b.id));

    const total = items.length;
    const pageItems = items.slice((page - 1) * pageSize, page * pageSize);
    ok(res, { total, page, pageSize, items: pageItems });
  });

  app.get('/api/persons/:id', async (req, res) => {
    const catalog = await store.catalog();
    const person = catalog.people.find(p => p.id === req.params.id);
    if (!person) throw new HttpError(404, '人物不存在。');

    const relatedEvents = catalog.events
      .filter(e => e.personIds.includes(person.id))
      .map(e => ({ id: e.id, year: e.year, title: e.title, category: e.category }));

    const relations = catalog.relations
      .filter(r => r.from === person.id || r.to === person.id)
      .map(r => ({
        id: r.id,
        type: r.type,
        from: r.from,
        to: r.to,
        otherId: r.from === person.id ? r.to : r.from,
        sourceRef: (r.sourceIds ?? []).join(','),
      }));

    ok(res, { ...person, relatedEvents, relations });
  });

  app.get('/api/search', async (req, res) => {
    const q=z.string().trim().max(100).parse(req.query.q || '');
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize ?? '10'), 10) || 10));
    const type = String(req.query.type ?? '').trim();
    let results = searchCatalog(await store.catalog(), q);
    if (type && type !== 'all') results = results.filter(r => r.type === type);
    const total = results.length;
    const qLower = q ? q.toLowerCase() : '';
    const pageItems = results.slice((page - 1) * pageSize, page * pageSize).map(r => {
      let highlight = r.title;
      if (qLower) {
        const ti = r.title.toLowerCase().indexOf(qLower);
        if (ti >= 0) {
          highlight = r.title.slice(0, ti) + '<em>' + r.title.slice(ti, ti + q.length) + '</em>' + r.title.slice(ti + q.length);
        } else {
          const si = r.summary.toLowerCase().indexOf(qLower);
          if (si >= 0) {
            highlight = r.summary.slice(0, si) + '<em>' + r.summary.slice(si, si + q.length) + '</em>' + r.summary.slice(si + q.length);
          }
        }
      }
      return {
        ...r,
        highlight,
        jumpType: r.type === 'person' ? 'person' : r.type === 'event' ? 'timeline' : 'source',
        jumpId: r.id,
      };
    });
    ok(res, { total, page, pageSize, items: pageItems });
  });

  app.post('/api/auth/login', async (req, res) => {
    limit(loginAttempts, req.ip || 'local', options.loginLimit ?? 10);
    const input=loginSchema.parse(req.body);
    const user=store.db.prepare('SELECT * FROM users WHERE email=?').get(input.email) as UserRow | undefined;
    const valid=verifyPassword(input.password,user?.password_hash || dummyHash);
    if (!user || !valid) throw new HttpError(401,'账号或密码不正确。');
    const oldToken=sessionCookie(req);
    if (oldToken) store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(oldToken));
    store.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    const token=randomBytes(32).toString('base64url');
    store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hashToken(token),user.id,Date.now()+8*60*60*1000);
    res.cookie(cookieName,token,{httpOnly:true,sameSite:'strict',secure:false,path:'/api',maxAge:8*60*60*1000});
    ok(res,publicUser(user));
  });
  app.get('/api/auth/me',async (req, res) => ok(res,publicUser(who(req,store))));
  app.post('/api/auth/logout',async (req, res) => {
    const token=sessionCookie(req); if (token) store.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
    res.clearCookie(cookieName,{httpOnly:true,sameSite:'strict',secure:false,path:'/api'});
    ok(res,null);
  });
  app.get('/api/submissions',async (req, res) => {
    const scope=z.enum(['mine','review','public']).parse(req.query.scope || 'mine');
    if (scope==='public') {
      const rows=store.db.prepare('SELECT * FROM submissions WHERE status=? ORDER BY created_at DESC,id DESC').all('approved') as SubmissionRow[];
      ok(res,rows.map(row=>serializeSubmission(row,true))); return;
    }
    const user=who(req,store);
    if(scope==='review' && user.role!=='reviewer') throw new HttpError(403,'只有审核员可以访问审核队列。');
    const rows=(scope==='mine' ? store.db.prepare('SELECT * FROM submissions WHERE owner_id=? ORDER BY created_at DESC,id DESC').all(user.id) : store.db.prepare('SELECT * FROM submissions ORDER BY created_at DESC,id DESC').all()) as SubmissionRow[];
    ok(res,rows.map(row=>serializeSubmission(row)));
  });
  app.post('/api/submissions',async (req, res) => {
    const user=who(req,store); const input=submissionInputSchema.parse(req.body);
    const id=randomUUID(), now=new Date().toISOString();
    store.db.prepare('INSERT INTO submissions VALUES (?,?,?,?,?,?,1,?,?,?,?)').run(id,user.id,input.title,input.year,input.body,input.author,'pending',now,now,'');
    ok(res,serializeSubmission(store.db.prepare('SELECT * FROM submissions WHERE id=?').get(id) as SubmissionRow));
  });
  app.post('/api/submissions/:id/:action',async (req, res) => {
    const user=who(req,store);
    const action=z.enum(['approve','reject','withdraw']).parse(req.params.action);
    const {note}=z.object({note:z.string().trim().max(500).default('')}).parse(req.body);
    if(action!=='withdraw' && user.role!=='reviewer') throw new HttpError(403,'只有审核员可以审核投稿。');
    if(action==='reject' && !note) throw new HttpError(422,'退回时必须填写原因。');
    store.transaction(()=>{
      const item=store.db.prepare('SELECT * FROM submissions WHERE id=?').get(String(req.params.id)) as SubmissionRow | undefined;
      if(!item || (action==='withdraw' && item.owner_id!==user.id)) throw new HttpError(404,'记录不存在。');
      if(action==='withdraw' ? item.status==='withdrawn' : item.status!=='pending') throw new HttpError(409,'记录状态已改变，请刷新。');
      const status=action==='approve'?'approved':action==='reject'?'rejected':'withdrawn', now=new Date().toISOString();
      const changed=store.db.prepare('UPDATE submissions SET status=?,review_note=?,updated_at=? WHERE id=? AND status=?').run(status,action==='withdraw'?item.review_note:note,now,item.id,item.status);
      if(!changed.changes) throw new HttpError(409,'记录状态已改变，请刷新。');
      store.db.prepare('INSERT INTO review_logs VALUES (?,?,?,?,?,?)').run(randomUUID(),item.id,user.id,action,action==='withdraw'?'':note,now);
    }); ok(res,null);
  });
  app.delete('/api/submissions/:id',(req,res)=>{
    const user=who(req,store);
    store.transaction(()=>{
      const item=store.db.prepare('SELECT * FROM submissions WHERE id=? AND owner_id=?').get(String(req.params.id),user.id) as SubmissionRow | undefined;
      if(!item) throw new HttpError(404,'记录不存在。');
      // Scrub potentially identifying notes and actor links; retain only action/time summaries.
      store.db.prepare('UPDATE review_logs SET submission_id=NULL,actor_id=NULL,note=? WHERE submission_id=?').run('',item.id);
      store.db.prepare('INSERT INTO review_logs VALUES (?,NULL,NULL,?,?,?)').run(randomUUID(),'delete','',new Date().toISOString());
      store.db.prepare('DELETE FROM submissions WHERE id=? AND owner_id=?').run(item.id,user.id);
    }); ok(res,null);
  });
  app.post('/api/qa/retrieve',async (req, res) =>{
    const {question}=z.object({question:z.string().trim().min(2).max(200)}).parse(req.body);
    const catalog=await store.catalog();
    const matches=searchCatalog(catalog,question).slice(0,8);
    const sourceIds=new Set<string>();
    for(const match of matches) {
      if(match.type==='source') sourceIds.add(match.id);
      const entity=match.type==='event'?catalog.events.find(e=>e.id===match.id):catalog.people.find(p=>p.id===match.id);
      entity?.sourceIds.forEach(id=>sourceIds.add(id));
    }
    const citations=catalog.sources.filter(s=>sourceIds.has(s.id)).slice(0,5).map((s,i)=>({id:'C'+(i+1),sourceId:s.id,title:s.title,quote:s.excerpt,locator:s.citation,demo:s.demo}));
    ok(res,{mode:'retrieval-only',question,answer:null,citations,matches,insufficientEvidence:true,
      message:citations.length?'仅返回关键词检索线索，未调用大模型，也未判断证据足以回答问题。':'现有资料未检索到匹配内容。'});
  });
  app.use((_req,_res,next)=>next(new HttpError(404,'接口不存在。')));
  app.use((error: unknown,_req:Request,res:Response,_next:NextFunction)=>{
    if(error instanceof z.ZodError) {res.status(422).json({code:422,message:error.issues[0]?.message || '字段无效',data:null});return;}
    const status=error instanceof HttpError?error.status:(error as {status?:number})?.status===413?413:error instanceof SyntaxError?400:500;
    const message=error instanceof HttpError?error.message:status===413?'请求内容过大。':status===400?'JSON格式错误。':'服务内部错误。';
    if(status===500) console.error('Request failed:',error instanceof Error?error.name:'UnknownError');
    res.status(status).json({code:status,message,data:null});
  });
  return app;
}
