import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(existsSync(resolve(root,'.env'))) process.loadEnvFile(resolve(root,'.env'));
const source=resolve(root,process.env.DB_PATH || 'data/platform.sqlite');
if(!existsSync(source)) throw new Error('数据库不存在，请先启动后端。');
const folder=resolve(root,'data/backups');mkdirSync(folder,{recursive:true});
const path=resolve(folder,'platform-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
const db=new DatabaseSync(source);
try {await backup(db,path);console.log('数据库备份已保存: '+path);}finally{db.close();}
