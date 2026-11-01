import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
import { catalogRepository, sourceReferences, type PersonDetail } from './catalogRepository';
import type { Catalog, HistoryEvent, Source } from './model';
import { useQuery } from './useQuery';
import { DemoTag, Empty, Modal, SourceCard } from './ui';
import { QueryError } from './BrowseUi';

type Detail = { event?: HistoryEvent; person?: PersonDetail; source?: Source };
// 详情单独请求，不从当前分页列表中查找，以支持跨页跳转及后端 404 状态。
export default function RecordDetail({ catalog, value, open, close }: { catalog: Catalog; value: string; open: (type: string, id: string) => void; close: () => void }) {
  const separator = value.indexOf(':');
  const type = value.slice(0, separator), id = value.slice(separator + 1);
  const result = useQuery<Detail>(value, async () => {
    if (type === 'event') return { event: await catalogRepository.event(id) };
    if (type === 'person') return { person: await catalogRepository.person(id) };
    // C 组本轮没有独立来源详情接口，来源正文仍由兼容的 catalog 提供。
    return { source: catalog.sources.find(s => s.id === id) };
  });
  const { event, person, source } = result.data || {};
  const sources = catalog.sources.filter(s => (event?.sourceIds || person?.sourceIds || []).includes(s.id));
  return <Modal title={event?.title || person?.name || source?.title || (result.loading ? '正在调阅档案…' : '档案详情')} onClose={close}>
    {result.loading ? <Empty>正在读取详情…</Empty> : result.error ? <QueryError error={result.error} retry={result.reload} /> : <>
      {(event?.demo || person?.demo || source?.demo) && <p className="notice-strip compact"><DemoTag />内容与人物仅用于界面测试，不作为真实校史依据。</p>}
      {event && <><div className="row wrap muted"><span><CalendarDays size={16} />{event.year}</span><span className="tag">{event.category}</span><span><MapPin size={15} />{event.place}</span></div><p className="detail-lead">{event.summary}</p><p className="preserve">{event.content}</p><h3>关联人物</h3><div className="row wrap">{event.personIds.map(pid => <button className="button secondary small-button" key={pid} onClick={() => open('person', pid)}>{catalog.people.find(p => p.id === pid)?.name || pid}<ArrowUpRight size={14} /></button>)}</div></>}
      {person && <><p className="muted">{person.role} · {person.years}</p><p className="detail-lead">{person.summary}</p><h3>相关事件</h3><div className="related-list">{person.relatedEvents.map(e => <button key={e.id} onClick={() => open('event', e.id)}><span>{e.title}</span><small>{e.year}</small></button>)}</div><h3>关系与出处</h3>{person.relations.map(r => <div className="relation-record" key={r.id}><button className="text-button" onClick={() => open('person', r.otherId)}>{catalog.people.find(p => p.id === r.from)?.name || r.from} — {r.type} — {catalog.people.find(p => p.id === r.to)?.name || r.to}</button><div>{sourceReferences(r.sourceRef).map(sid => <button className="text-button" key={sid} onClick={() => open('source', sid)}>{catalog.sources.find(s => s.id === sid)?.title || sid}<ArrowUpRight size={13} /></button>)}</div></div>)}</>}
      {sources.length > 0 && <><h3>资料与出处</h3>{sources.map(s => <SourceCard key={s.id} source={s} />)}</>}{source && <SourceCard source={source} />}
      {!event && !person && !source && <Empty>该记录不存在或已下架，请返回列表。</Empty>}
    </>}
  </Modal>;
}
