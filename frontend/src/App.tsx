import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, ChevronRight, Clock3, Feather, FileSearch, Files, Filter, GitFork, MapPin, Search, ShieldCheck, X } from 'lucide-react';
import { isDemo, repository } from './repository';
import type { Catalog } from './model';
import { catalogRepository } from './catalogRepository';
import { useDebounced, useQuery } from './useQuery';
import { Pagination, QueryError } from './BrowseUi';
import SearchPage from './SearchPage';
import RecordDetail from './RecordDetail';
import Graph from './Graph';
import Detective from './Detective';
import Memory from './Memory';
import { AuthGate, LoginPage, SessionBar } from './Session';
import { Empty, SourceCard } from './ui';

const periods = [{ label: '全部时期', start: 1905, end: 2026 }, { label: '早期岁月', start: 1905, end: 1929 }, { label: '风雨求学', start: 1930, end: 1949 }, { label: '探索与发展', start: 1950, end: 1999 }, { label: '走向未来', start: 2000, end: 2026 }];
const categories = ['全部主题', '学校沿革', '学术教育', '校园生活'];
type OpenRecord = (type: string, id: string) => void;

function Timeline({ catalog, open }: { catalog: Catalog; open: OpenRecord }) {
  const [period, setPeriod] = useState(0); const [category, setCategory] = useState('全部主题'); const [keyword, setKeyword] = useState(''); const [group, setGroup] = useState('year');
  const [page, setPage] = useState(1);
  const settledKeyword = useDebounced(keyword);
  // 时期转为后端 start/end，主题“全部”不传 category；筛选变化由控件回调重置页码。
  const request = { page, pageSize: 8, start: periods[period].start, end: periods[period].end,
    category: category === '全部主题' ? undefined : category, keyword: settledKeyword.trim() };
  const result = useQuery(JSON.stringify(request), () => catalogRepository.timeline(request));
  const filtered = result.data?.items || [];
  // 年份/十年分组只组织当前服务端页，不再在浏览器对全量目录做筛选和分页。
  const groups = new Map<string, typeof filtered>();
  filtered.forEach(e => { const key = group === 'decade' ? `${Math.floor(e.year / 10) * 10}年代` : String(e.year); groups.set(key, [...(groups.get(key) || []), e]); });
  const activeFilters = period !== 0 || category !== '全部主题' || keyword !== '';
  return <>
    <section className="intro"><div><div className="eyebrow"><span className="line" />FUDAN MEMORY · DIGITAL ARCHIVE</div><h1>在时间里，<br />读懂我们的<span>复旦。</span></h1><p>循着事件与人物，走进校园的过去。<br />让有出处的历史，与有温度的记忆相遇。</p><a className="intro-link" href="#timeline-start" onClick={e => { e.preventDefault(); document.getElementById('timeline-start')?.scrollIntoView({ behavior: 'smooth' }); }}>开始探索 <ArrowDown size={16} /></a></div><div className="intro-right"><div className="year-line"><span>1905</span><i /><span>2026</span></div><div className="archive-word">记忆有迹<br /><span>来处可寻</span></div><div className="intro-stat"><div><b>{String(catalog.events.length).padStart(2, '0')}</b><span>事件条目</span></div><div><b>{String(catalog.people.length).padStart(2, '0')}</b><span>人物档案</span></div><div><b>{String(catalog.sources.length).padStart(2, '0')}</b><span>资料来源</span></div></div></div></section>
    <div className="timeline-heading" id="timeline-start"><div><span className="eyebrow">CHRONOLOGY</span><h2>校史时间轴</h2></div><div className="segmented" aria-label="时间粒度"><button className={group === 'year' ? 'active' : ''} onClick={() => setGroup('year')}>按年份</button><button className={group === 'decade' ? 'active' : ''} onClick={() => setGroup('decade')}>按十年</button></div></div>
    <div className="timeline-layout"><aside className="period-sidebar"><span className="eyebrow">浏览时期</span><nav aria-label="时期筛选">{periods.map((p, i) => <button className={period === i ? 'selected' : ''} key={p.label} onClick={() => { setPeriod(i); setPage(1); }}><span>{p.label}<small>{i === 0 ? '1905 — 至今' : `${p.start} — ${p.end}`}</small></span><ChevronRight size={16} /></button>)}</nav><div className="sidebar-note"><BookOpen size={23} strokeWidth={1.3} /><h3>每条记录，都有来处</h3><p>点击事件卡片，查看关联人物与资料出处。不同来源分别保留。</p><Link to="/sources">浏览资料目录 <ArrowUpRight size={14} /></Link></div></aside>
    <section className="timeline-main"><div className="filter-bar"><div className="row"><Filter size={16} /><select aria-label="筛选事件主题" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>{categories.map(c => <option key={c}>{c}</option>)}</select></div><label className="input-icon"><Search size={16} /><input placeholder="在时间轴中查找" aria-label="在时间轴中查找" value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }} maxLength={100} /></label></div><div className="results-meta" aria-live="polite"><span>共 {result.data?.total ?? 0} 条记录{isDemo && ' · 当前均为演示资料'}</span>{activeFilters && <button className="text-button" onClick={() => { setPeriod(0); setCategory('全部主题'); setKeyword(''); setPage(1); }}><X size={13} />清除筛选</button>}</div>
      {result.loading ? <Empty>正在读取时间轴…</Empty> : result.error ? <QueryError error={result.error} retry={result.reload} /> : !filtered.length ? <Empty>没有找到符合条件的事件，试试清除筛选。</Empty> : <div className="timeline">{[...groups].map(([label, events]) => <section className="timeline-group" key={label}><div className="year-marker"><span>{label}</span><i /></div><div className="event-stack">{events.map(e => <button className="event-card" key={e.id} onClick={() => open('event', e.id)}><div className="event-card-top"><span className={`category category-${categories.indexOf(e.category)}`}>{e.category}</span><span className="event-index">NO. {e.id.replace('e', '').padStart(3, '0')}</span></div><h3>{group === 'decade' && <span className="inline-year">{e.year} · </span>}{e.title}</h3><p>{e.summary}</p><div className="event-card-bottom"><span><MapPin size={14} />{e.place}</span><span><Files size={14} />{e.sourceIds.length} 份资料</span><ArrowUpRight className="card-arrow" size={20} /></div></button>)}</div></section>)}</div>}
      {result.data && <Pagination page={result.data.page} pageSize={result.data.pageSize} total={result.data.total} onPage={setPage} />}
      <div className="timeline-end"><span />{activeFilters ? '按当前筛选浏览记录' : '历史仍在继续，下一段记忆由你写下。'}<Link to="/memories">记录我的记忆 <ArrowRight size={14} /></Link></div>
    </section><aside className="discovery-sidebar"><div className="discovery-card"><span className="eyebrow">ANOTHER PERSPECTIVE</span><GitFork size={36} strokeWidth={1.1} /><h3>从人物出发<br />看见历史的连接</h3><p>师生、同窗、学术合作。沿着关系，发现新的线索。</p><Link className="button" to="/people">探索人物关系 <ArrowUpRight size={17} /></Link></div><div className="reading-note"><span className="eyebrow">阅读提示</span><h3>历史与记忆，<br />分别呈现。</h3><p>史料条目保留来源；个人讲述标注为记忆。它们可以相互参照，也可以保留不同的理解。</p><Link to="/memories">走进记忆共创 <ArrowRight size={15} /></Link></div></aside></div>
  </>;
}

export default function App() {
  // catalog 保留为资料目录、总体统计和图谱展示元数据；主列表及详情走 C 组新接口。
  const [catalog, setCatalog] = useState<Catalog | null>(null); const [error, setError] = useState(''); const [retry, setRetry] = useState(0); const [query, setQuery] = useState('');
  const [params, setParams] = useSearchParams(); const navigate = useNavigate(); const location = useLocation();
  useEffect(() => { let live = true; setError(''); repository.catalog().then(data => { if (live) setCatalog(data); }).catch(e => { if (live) setError(e instanceof Error ? e.message : '加载失败'); }); return () => { live = false; }; }, [retry]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);
  const open: OpenRecord = (type, id) => { const next = new URLSearchParams(params); next.set('record', `${type}:${id}`); setParams(next); };
  const close = () => { const next = new URLSearchParams(params); next.delete('record'); setParams(next, { replace: true }); };
  function globalSearch(e: FormEvent) { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(query.trim())}`); }
  return <><a href="#main-content" className="skip-link">跳转到主要内容</a><header className="site-header"><div className="header-inner"><Link className="brand" to="/"><span className="brand-symbol">复</span><span><b>复旦记忆</b><small>校史数字化共创平台</small></span></Link><nav className="main-nav" aria-label="主导航"><NavLink to="/" end><Clock3 size={16} />校史时间轴</NavLink><NavLink to="/people"><GitFork size={16} />人物关系</NavLink><NavLink to="/detectives"><FileSearch size={16} />档案侦探局</NavLink><NavLink to="/sources"><BookOpen size={16} />资料目录</NavLink><NavLink to="/memories"><Feather size={16} />记忆共创</NavLink></nav><form className="header-search" onSubmit={globalSearch}><input aria-label="搜索校史" placeholder="搜索校史…" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} /><button aria-label="提交全站搜索"><Search size={18} /></button></form></div></header><SessionBar />
    {isDemo && <div className="demo-banner"><span className="demo-pill">前端原型</span><span>学生共创项目 · 非校方官方网站 · 事件、人物与史料均为演示内容</span><Link to="/review"><ShieldCheck size={14} />审核演示<ChevronRight size={13} /></Link></div>}
    <main id="main-content" className="main-container">{error ? <div className="error-box" role="alert">{error}<button className="button secondary" onClick={() => setRetry(r => r + 1)}>重新加载</button></div> : !catalog ? <Empty>正在打开档案…</Empty> : <><Routes><Route path="/login" element={<LoginPage />} /><Route path="/" element={<Timeline catalog={catalog} open={open} />} /><Route path="/people" element={<Graph catalog={catalog} open={open} />} /><Route path="/detectives" element={<Detective catalog={catalog} open={open} />} /><Route path="/search" element={<SearchPage open={open} />} /><Route path="/sources" element={<><div className="page-heading"><div><div className="eyebrow">SOURCES & REFERENCES</div><h1>让每一条线索，都有出处<span>资料目录</span></h1><p>区分资料类型，保留摘录、登记信息与展示范围。</p></div><span className="count-label">{catalog.sources.length} 份资料</span></div><div className="sources-grid">{catalog.sources.map(s => <SourceCard source={s} key={s.id} />)}</div></>} /><Route path="/memories" element={<AuthGate><Memory key="memories" /></AuthGate>} /><Route path="/review" element={<AuthGate reviewer><Memory key="review" review /></AuthGate>} /><Route path="*" element={<Empty>没有这个页面。<Link to="/">返回时间轴</Link></Empty>} /></Routes>{params.get('record') && <RecordDetail catalog={catalog} value={params.get('record')!} open={open} close={close} />}</> }</main>
    <footer><div><span className="footer-name">复旦记忆</span><span>以史料为起点，以共同记忆为延伸。</span></div><div><Link to="/detectives">档案侦探局</Link><Link to="/sources">资料与出处</Link><Link to="/review">{isDemo ? '审核演示' : '审核工作台'}</Link><span>学生项目 · 2026</span></div></footer>
  </>;
}
