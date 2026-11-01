import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(resolve(root,'.env'))) process.loadEnvFile(resolve(root,'.env'));
const isPg=process.env.DB_DRIVER!=='sqlite';
const source=resolve(root,process.env.DB_PATH || 'data/platform.sqlite');
const folder=resolve(root,'data/backups');mkdirSync(folder,{recursive:true});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
if(existsSync(source)){
  const path=resolve(folder,'platform-'+stamp+'.sqlite');
  const db=new DatabaseSync(source);
  try {await backup(db,path);console.log('SQLite 备份已保存: '+path);}finally{db.close();}
} else {
  console.log('SQLite 文件不存在，跳过（PG 模式可接受）');
}
if(isPg){
  const pgPath=resolve(folder,'platform-pg-'+stamp+'.sql');
  console.log('');
  console.log('当前为 PostgreSQL 模式，SQLite 仅作回滚备份。');
  console.log('PG 真实数据备份请执行：');
  console.log('  pg_dump -U postgres -d fudan_history -f "'+pgPath+'"');
  console.log('（需 PGPASSWORD 环境变量或 .pgpass 免密）');
}
