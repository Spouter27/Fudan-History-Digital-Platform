import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { isDemo } from './repository';
import { Empty } from './ui';

const userSchema=z.object({id:z.string(),email:z.string(),name:z.string(),role:z.enum(['member','reviewer'])});
type User=z.infer<typeof userSchema>;
type Session={user:User|null;loading:boolean;error:string;refresh:()=>Promise<void>;logout:()=>Promise<void>};
const Context=createContext<Session>({user:null,loading:true,error:'',refresh:async()=>{},logout:async()=>{}});
const base=(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/,'');
async function authRequest(path:string,body?:unknown) {
  const response=await fetch(base+'/auth/'+path,{
    method:body===undefined?'GET':'POST',credentials:'include',signal:AbortSignal.timeout(15000),
    headers:{'Content-Type':'application/json','X-App-Request':'fudan-history'},
    body:body===undefined?undefined:JSON.stringify(body),
  });
  const data=await response.json();
  if(!response.ok) throw new Error(data.message || '登录服务请求失败');
  return data.data;
}
export function SessionProvider({children}:{children:ReactNode}) {
  const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(!isDemo),[error,setError]=useState('');
  async function refresh(){
    if(isDemo){setLoading(false);return;}
    try {
      const response=await fetch(base+'/auth/me',{credentials:'include',signal:AbortSignal.timeout(15000)});
      if(response.status===401) {setUser(null);setError('');return;}
      if(!response.ok) throw new Error('无法获取登录状态');
      const value=await response.json();setUser(userSchema.parse(value.data));setError('');
    } catch(e){setError(e instanceof Error?e.message:'后端连接失败');setUser(null);}
    finally{setLoading(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function logout(){await authRequest('logout',{});setUser(null);}
  return <Context.Provider value={{user,loading,error,refresh,logout}}>{children}</Context.Provider>;
}
export function useSession(){return useContext(Context);}
export function SessionBar(){
  const session=useSession();const navigate=useNavigate();const [error,setError]=useState('');
  if(isDemo) return null;
  return <div className="session-bar"><span>本地后端已接入 · 资料仍为虚构演示</span><div className="row">{session.loading?<span>读取登录状态…</span>:session.user?<><span>{session.user.name} · {session.user.role==='reviewer'?'审核员':'成员'}</span><button className="text-button" onClick={async()=>{try{await session.logout();navigate('/');}catch(e){setError(e instanceof Error?e.message:'退出失败');}}}>退出登录</button></>:<Link to="/login">登录开发账号 →</Link>}{error&&<span role="alert" className="danger">{error}</span>}</div></div>;
}
export function AuthGate({children,reviewer=false}:{children:ReactNode;reviewer?:boolean}){
  const session=useSession();
  if(isDemo) return <>{children}</>;
  if(session.loading) return <Empty>正在检查登录状态…</Empty>;
  if(session.error) return <div className="error-box" role="alert">{session.error}<button className="button secondary" onClick={()=>void session.refresh()}>重新连接</button></div>;
  if(!session.user) return <Empty>请先登录再进入{reviewer?'审核工作台':'记忆共创'}。<Link to={'/login?next='+encodeURIComponent(reviewer?'/review':'/memories')}>登录开发账号</Link></Empty>;
  if(reviewer&&session.user.role!=='reviewer') return <Empty>当前账号没有审核权限，请使用审核员账号登录。<Link to="/login?next=%2Freview">切换账号</Link></Empty>;
  return <>{children}</>;
}
export function LoginPage(){
  const [email,setEmail]=useState('student-a@local.test'),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const session=useSession(),navigate=useNavigate();const [params]=useSearchParams();
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{
      await authRequest('login',{email,password});await session.refresh();setPassword('');
      const next=params.get('next');navigate(next==='/review'?'/review':'/memories');
    }catch(e){setError(e instanceof Error?e.message:'登录失败');}
    finally{setBusy(false);}
  }
  if(isDemo) return <Empty>当前为浏览器本地演示模式，不需要登录。</Empty>;
  return <section className="panel login-panel"><div className="eyebrow">LOCAL DEVELOPMENT ACCOUNT</div><h1>登录开发账号</h1><p className="muted">这是本地联调账号，不是复旦统一身份认证。</p><form onSubmit={submit}><label>账号邮箱<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} /></label><label>密码<input type="password" required autoComplete="current-password" maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} /></label><p className="small muted">首次启动后，账号密码保存在 backend/data/dev-accounts.txt。学生A、学生B用于验证数据隔离，审核员用于审核流程。</p>{error&&<p className="danger" role="alert">{error}</p>}<button className="button primary full" disabled={busy}>{busy?'正在登录…':'登录'}</button></form></section>;
}
