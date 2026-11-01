import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Search } from 'lucide-react';
import { catalogRepository } from './catalogRepository';
import { useQuery } from './useQuery';
import { Empty } from './ui';
import { Pagination, QueryError, SafeHighlight } from './BrowseUi';

export default function SearchPage({ open }: { open: (type: string, id: string) => void }) {
  // 查询以 URL 为准，刷新及浏览器前进/后退都能恢复关键词、类型和页码。
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '', type = params.get('type') || 'all';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const request = { q: query, type, page, pageSize: 10 };
  // 点击结果用后端 jumpType/jumpId 定位；timeline 是后端事件类型，前端弹窗类型为 event。
  const result = useQuery(JSON.stringify(request), () => catalogRepository.search(request));
  // 新搜索不保留 page，让服务端从第 1 页返回；切换类型同样回第 1 页。
  function search(event: FormEvent) { event.preventDefault(); setParams({ q: draft.trim(), type }); }
  return <><div className="page-heading"><div><div className="eyebrow">SEARCH THE ARCHIVE</div><h1>寻找一条历史线索<span>全站检索</span></h1><p>从年份、事件、人物或资料开始。多个关键词以空格分隔。</p></div></div>
    <section className="panel search-panel"><form className="large-search" onSubmit={search}><Search size={23} /><input value={draft} onChange={e => setDraft(e.target.value)} aria-label="全站搜索关键词" placeholder="搜索事件、人物、资料…" maxLength={100} /><button className="button primary">搜索</button></form>
      <div className="tabs">{[['all', '全部'], ['event', '事件'], ['person', '人物'], ['source', '史料']].map(([value, label]) => <button className={type === value ? 'active' : ''} key={value} onClick={() => setParams({ q: query, type: value })}>{label}</button>)}</div>
      {!query.trim() ? <Empty>输入关键词开始查找，例如“校园”“学术”或“江知远”。</Empty> : result.loading ? <Empty>正在检索资料…</Empty> : result.error ? <QueryError error={result.error} retry={result.reload} /> : result.data && <>
        <p className="small muted" aria-live="polite">找到 {result.data.total} 条相关记录</p>
        {!result.data.items.length && <Empty>当前页没有结果，请调整关键词或返回上一页。</Empty>}
        {result.data.items.map(item => <button key={`${item.type}-${item.id}`} className="search-result" onClick={() => open(item.jumpType === 'timeline' ? 'event' : item.jumpType, item.jumpId)}><span className="tag">{item.label}</span><div><h3>{item.title}</h3><p><SafeHighlight value={item.highlight} /></p></div><ArrowUpRight size={20} /></button>)}
        <Pagination page={result.data.page} pageSize={result.data.pageSize} total={result.data.total} onPage={value => setParams({ q: query, type, page: String(value) })} />
      </>}
    </section></>;
}
