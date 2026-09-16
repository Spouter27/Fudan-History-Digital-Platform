import { useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Search, ArrowUpRight } from 'lucide-react';
import type { Catalog } from './model';
import { DemoTag, Empty } from './ui';

type Point = { x: number; y: number };
export default function Graph({ catalog, open }: { catalog: Catalog; open: (type: string, id: string) => void }) {
  const [selected, setSelected] = useState(catalog.people[0]?.id || '');
  const [query, setQuery] = useState(''); const [role, setRole] = useState('全部');
  const [zoom, setZoom] = useState(1); const [positions, setPositions] = useState<Record<string, Point>>({});
  const drag = useRef<{ id: string; start: Point; point: Point } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const visible = useMemo(() => catalog.people.filter(p => (role === '全部' || p.role === role) && `${p.name} ${p.summary}`.includes(query.trim())), [catalog, role, query]);
  const ids = new Set(visible.map(p => p.id));
  const chosen = visible.find(p => p.id === selected) || visible[0];
  const edges = catalog.relations.filter(r => ids.has(r.from) && ids.has(r.to));
  const related = chosen ? catalog.relations.filter(r => r.from === chosen.id || r.to === chosen.id) : [];
  const adjacent = new Set(related.flatMap(r => [r.from, r.to]));
  const position = (id: string) => positions[id] || catalog.people.find(p => p.id === id)!;
  const localPoint = (clientX: number, clientY: number) => {
    const matrix = svg.current?.getScreenCTM();
    return matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : new DOMPoint(clientX, clientY);
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow">PEOPLE & CONNECTIONS</div><h1>人，与人的连接<span>人物关系</span></h1><p>从一个名字出发，探索求学、合作与共同生活的线索。</p></div><span className="count-label">{catalog.people.length} 位人物 · {catalog.relations.length} 条关系</span></div>
    <div className="graph-layout"><section className="panel graph-panel">
      <div className="graph-toolbar"><label className="input-icon"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="查找人物" aria-label="查找人物" /></label><select aria-label="筛选人物类型" value={role} onChange={e => setRole(e.target.value)}>{['全部', '教育工作者', '学者', '学生'].map(x => <option key={x}>{x}</option>)}</select></div>
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
    </section><aside className="panel person-aside">{chosen ? <><div className="eyebrow">人物档案</div><div className="person-monogram">{chosen.name.slice(0, 1)}</div><h2>{chosen.name}</h2><p className="muted">{chosen.role} · {chosen.years}</p>{chosen.demo && <DemoTag />}<p className="person-summary">{chosen.summary}</p><button className="button primary full" onClick={() => open('person', chosen.id)}>查看完整档案 <ArrowUpRight size={17} /></button><div className="section-title"><h3>关联人物</h3><span>{related.length}</span></div><div className="related-list">{related.map(r => { const other = catalog.people.find(p => p.id === (r.from === chosen.id ? r.to : r.from)); return other && <button key={r.id} onClick={() => { setRole('全部'); setQuery(''); setSelected(other.id); }}><span>{other.name}</span><small>{r.type}</small></button>; })}</div></> : <Empty>选择一个人物，查看档案与关联。</Empty>}</aside></div>
  </>;
}
