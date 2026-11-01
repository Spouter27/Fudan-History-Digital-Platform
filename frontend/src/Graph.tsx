import { useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Search, ArrowUpRight } from 'lucide-react';
import type { Catalog } from './model';
import { DemoTag, Empty } from './ui';
import { catalogRepository, adaptGraph } from './catalogRepository';
import { useDebounced, useQuery } from './useQuery';
import { Pagination, QueryError } from './BrowseUi';

type Point = { x: number; y: number };
// 视图只接收适配后的图；拖动坐标和缩放是本地展示状态，不写回后端史料。
function GraphView({ catalog, open, selected, setSelected }: { catalog: Catalog; open: (type: string, id: string) => void; selected: string; setSelected: (id: string) => void }) {
  const [zoom, setZoom] = useState(1); const [positions, setPositions] = useState<Record<string, Point>>({});
  const drag = useRef<{ id: string; start: Point; point: Point } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const visible = catalog.people;
  const ids = new Set(visible.map(p => p.id));
  const candidate = visible.find(p => p.id === selected) || visible[0];
  // 图节点没有完整生平，选择人物后再调用详情接口，元数据用于加载中的展示。
  const detail = useQuery('person:' + (candidate?.id || ''), () => candidate ? catalogRepository.person(candidate.id) : Promise.resolve(null));
  const chosen = detail.data || candidate;
  const edges = catalog.relations.filter(r => ids.has(r.from) && ids.has(r.to));
  const related = chosen ? catalog.relations.filter(r => r.from === chosen.id || r.to === chosen.id) : [];
  const adjacent = new Set(related.flatMap(r => [r.from, r.to]));
  const position = (id: string) => positions[id] || catalog.people.find(p => p.id === id)!;
  const localPoint = (clientX: number, clientY: number) => {
    // 把屏幕指针位置转换到 SVG 坐标系；拖动时再除以图内部的 zoom 比例。
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : new DOMPoint(clientX, clientY);
  };
  return <>
    <div className="graph-layout"><section className="panel graph-panel">
      {!visible.length ? <Empty>没有匹配的人物，试试其他名字或分类。</Empty> : <svg ref={svg} className="network" viewBox="0 0 780 530" role="group" aria-label="人物关系图，节点可用键盘选择或鼠标拖动"
        onPointerMove={e => { if (!drag.current) return; const p = localPoint(e.clientX, e.clientY); const d = drag.current;
          setPositions(old => ({ ...old, [d.id]: { x: Math.max(50, Math.min(730, d.point.x + (p.x - d.start.x) / zoom)), y: Math.max(55, Math.min(470, d.point.y + (p.y - d.start.y) / zoom)) } })); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        <defs><pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#dce3e8" /></pattern></defs><rect width="780" height="530" fill="url(#dots)" />
        <g transform={`translate(390 265) scale(${zoom}) translate(-390 -265)`}>
          {edges.map(r => { const a = position(r.from), b = position(r.to); const active = chosen && (r.from === chosen.id || r.to === chosen.id); return <g key={r.id} opacity={active ? 1 : .35}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? '#9b574e' : '#8c9ead'} strokeWidth={active ? 2 : 1.4} strokeDasharray={r.type === '同窗' || r.type === '社团协作' ? '5 5' : undefined} />
            {active && <g><rect x={(a.x + b.x) / 2 - 32} y={(a.y + b.y) / 2 - 10} width="64" height="21" rx="4" fill="#fafbfc" /><text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 5} textAnchor="middle" fontSize="13" fill="#6d514b">{r.type}</text></g>}
          </g>; })}
          {visible.map(p => { const pos = position(p.id), active = chosen?.id === p.id; return <g key={p.id} className="graph-node" tabIndex={0} role="button" aria-label={`查看人物 ${p.name}`} aria-pressed={active}
            transform={`translate(${pos.x} ${pos.y})`} opacity={!chosen || adjacent.has(p.id) ? 1 : .55}
            onClick={() => setSelected(p.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id); } }}
            onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: p.id, start: localPoint(e.clientX, e.clientY), point: { ...pos } }; setSelected(p.id); }}>
            {active && <circle r="41" fill="none" stroke="#b46a60" strokeWidth="1.4" strokeDasharray="3 4" />}
            <circle r="32" fill={p.role === '教育工作者' ? '#193950' : p.role === '学者' ? '#547b87' : '#ae6559'} stroke="white" strokeWidth="3" />
            <text textAnchor="middle" dy="7" fill="white" fontSize="21" fontFamily="serif">{p.name.slice(-2, -1)}</text><rect x="-43" y="38" width="86" height="26" rx="5" fill="#f7f9fa" /><text textAnchor="middle" y="56" fontSize="16" fill="#233e50">{p.name}</text>
          </g>; })}
        </g>
      </svg>}
      <div className="graph-bottom"><div className="legend"><span><i className="legend-dot leader" />教育工作者</span><span><i className="legend-dot scholar" />学者</span><span><i className="legend-dot student" />学生</span></div><div className="row"><button className="icon-button" aria-label="缩小关系图" onClick={() => setZoom(z => Math.max(.6, z - .15))}><Minus size={17} /></button><span className="small">{Math.round(zoom * 100)}%</span><button className="icon-button" aria-label="放大关系图" onClick={() => setZoom(z => Math.min(1.8, z + .15))}><Plus size={17} /></button><button className="icon-button" aria-label="重置关系图" onClick={() => { setZoom(1); setPositions({}); }}><Maximize2 size={17} /></button></div></div>
      <p className="graph-note">可拖动节点，点击查看关联。布局距离不代表关系亲疏。{catalog.people.some(p => p.demo) && '当前包含虚构演示人物与关系。'}</p>
    </section><aside className="panel person-aside">{detail.error && <QueryError error={detail.error} retry={detail.reload} />}{detail.loading && candidate && <p role="status">正在读取人物详情…</p>}{chosen ? <><div className="eyebrow">人物档案</div><div className="person-monogram">{chosen.name.slice(0, 1)}</div><h2>{chosen.name}</h2><p className="muted">{chosen.role} · {chosen.years}</p>{chosen.demo && <DemoTag />}<p className="person-summary">{chosen.summary}</p><button className="button primary full" onClick={() => open('person', chosen.id)}>查看完整档案 <ArrowUpRight size={17} /></button><div className="section-title"><h3>关联人物</h3><span>{related.length}</span></div><div className="related-list">{related.map(r => { const other = catalog.people.find(p => p.id === (r.from === chosen.id ? r.to : r.from)); return other && <button key={r.id} onClick={() => { setSelected(other.id); }}><span>{other.name}</span><small>{r.type}</small></button>; })}</div></> : <Empty>选择一个人物，查看档案与关联。</Empty>}</aside></div>
  </>;
}


export default function Graph({ catalog, open }: { catalog: Catalog; open: (type: string, id: string) => void }) {
  // 人物列表筛选与图谱范围分开管理：查找一个人时保留其周围关系的阅读上下文。
  const [query, setQuery] = useState(''), [role, setRole] = useState('全部'), [page, setPage] = useState(1);
  const [selected, setSelected] = useState(''), [centerId, setCenterId] = useState(''), [depth, setDepth] = useState(1);
  const keyword = useDebounced(query);
  const params = { page, pageSize: 5, keyword: keyword.trim(), role: role === '全部' ? undefined : role };
  const people = useQuery(JSON.stringify(params), () => catalogRepository.persons(params));
  // 不指定中心时 depth 没有含义，因此不传给后端；中心模式允许展开 1—5 层。
  const graphParams = { centerId: centerId || undefined, depth: centerId ? depth : undefined };
  const graph = useQuery(JSON.stringify(graphParams), () => catalogRepository.graph(graphParams));
  const graphCatalog = graph.data ? adaptGraph(graph.data, catalog) : null;
  // 全图模式只改变选中状态；中心模式中点击新人物会同步重新查询其子图。
  function select(id: string) { setSelected(id); if (centerId) setCenterId(id); }
  return <>
    <div className="page-heading"><div><div className="eyebrow">PEOPLE & CONNECTIONS</div><h1>人，与人的连接<span>人物关系</span></h1><p>从一个名字出发，探索求学、合作与共同生活的线索。</p></div><span className="count-label">{graphCatalog?.people.length ?? 0} 位人物 · {graphCatalog?.relations.length ?? 0} 条关系</span></div>
    <section className="panel people-browser" aria-label="人物列表和关系图筛选">
      <div className="graph-toolbar"><label className="input-icon"><Search size={17} /><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="查找人物" aria-label="查找人物" maxLength={100} /></label>
        <select aria-label="筛选人物类型" value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>{['全部', '教育工作者', '学者', '学生'].map(value => <option key={value}>{value}</option>)}</select></div>
      {people.loading ? <p role="status">正在查找人物…</p> : people.error ? <QueryError error={people.error} retry={people.reload} /> : people.data && <>
        <div className="row wrap">{people.data.items.map(person => <button className="button secondary small-button" key={person.id} onClick={() => select(person.id)}>{person.name} · {person.role}</button>)}</div>
        {!people.data.items.length && <Empty>没有匹配的人物，请调整筛选。</Empty>}
        <Pagination page={people.data.page} pageSize={people.data.pageSize} total={people.data.total} onPage={setPage} />
      </>}
      <div className="row wrap graph-scope"><label>关系范围 <select aria-label="关系图中心人物" value={centerId} onChange={e => { setCenterId(e.target.value); if (e.target.value) setSelected(e.target.value); }}><option value="">全部人物</option>{catalog.people.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
        <label>展开层数 <select aria-label="关系图展开层数" disabled={!centerId} value={depth} onChange={e => setDepth(Number(e.target.value))}>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} 层</option>)}</select></label>
      </div>
    </section>
    {graph.loading ? <Empty>正在读取关系图…</Empty> : graph.error ? <QueryError error={graph.error} retry={graph.reload} /> : graphCatalog && <GraphView catalog={graphCatalog} open={open} selected={selected} setSelected={select} />}
  </>;
}
