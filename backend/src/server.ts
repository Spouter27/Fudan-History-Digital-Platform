import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Store, type SeedUser } from './db.ts';
import { createApp } from './app.ts';
import { catalogSchema } from './model.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const env=resolve(root,'.env');
if(existsSync(env)) process.loadEnvFile(env);
if(process.env.NODE_ENV==='production') throw new Error('此版为本地开发后端。请完成正式身份验证、HTTPS、密钥管理及部署评审后再用于生产。');
const dbPath=resolve(root,process.env.DB_PATH || 'data/platform.sqlite');
const store=new Store(dbPath);
const firstRun=!(store.db.prepare('SELECT COUNT(*) AS n FROM users').get()!.n as number);
const accounts:SeedUser[]=firstRun?[
  {email:'student-a@local.test',name:'演示学生A',role:'member',password:randomBytes(15).toString('base64url')},
  {email:'student-b@local.test',name:'演示学生B',role:'member',password:randomBytes(15).toString('base64url')},
  {email:'reviewer@local.test',name:'演示审核员',role:'reviewer',password:randomBytes(15).toString('base64url')},
]:[];
const credentialsPath=resolve(dirname(dbPath),'dev-accounts.txt');
if(firstRun) writeFileSync(credentialsPath,accounts.map(a=>a.name+'\n邮箱: '+a.email+'\n密码: '+a.password+'\n').join('\n'),{encoding:'utf8',flag:'wx',mode:0o600});
store.seed(catalogSchema.parse(JSON.parse(readFileSync(resolve(root,'fixtures/catalog.json'),'utf8'))),accounts);
const origins=(process.env.ALLOWED_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173').split(',').map(x=>x.trim());
const port=Number(process.env.PORT || 3000);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('PORT无效');
const server=createApp(store,{origins}).listen(port,'127.0.0.1',()=>{
  console.log('Backend: http://127.0.0.1:'+port+'/api/health');
  console.log('SQLite: '+dbPath);
  console.log('本地测试账号（勿提交到Git）: '+credentialsPath);
});
server.on('error',e=>{console.error(e.message);store.close();process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>server.close(()=>{store.close();process.exit(0);}));
