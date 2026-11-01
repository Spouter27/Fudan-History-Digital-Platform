import { z } from 'zod';
import { demoCatalog } from './data';
import { HttpRepository, isDemo } from './repository';
import { eventSchema, personSchema, relationSchema, searchCatalog, type Catalog } from './model';

// 对应 C 组接口契约 v1.1：列表共用分页外壳，items 按不同资源单独校验。
// 在请求边界校验数据，避免字段漂移后页面以 undefined 等形式继续渲染。
const pageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  total: z.number().int().nonnegative(), page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100), items: z.array(item),
});
export const timelinePageSchema = pageSchema(eventSchema);
export const personsPageSchema = pageSchema(personSchema);
// 人物详情包含后端派生的事件与关系；页面直接使用，避免按当前列表页推算而漏项。
export const personDetailSchema = personSchema.extend({
  relatedEvents: z.array(eventSchema.pick({ id: true, year: true, title: true, category: true })),
  relations: z.array(relationSchema.pick({ id: true, type: true, from: true, to: true }).extend({ otherId: z.string(), sourceRef: z.string() })),
});
export const graphSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), name: z.string(), category: personSchema.shape.role, colorKey: z.string() })),
  links: z.array(z.object({ id: z.string(), source: z.string(), target: z.string(), type: relationSchema.shape.type, styleKey: z.string(), sourceRef: z.string() })),
}).superRefine((graph, ctx) => {
  // SVG 绘制连线前必须能找到两个端点，同时拒绝重复节点 ID。
  const ids = new Set(graph.nodes.map(n => n.id));
  if (ids.size !== graph.nodes.length || graph.links.some(l => !ids.has(l.source) || !ids.has(l.target)))
    ctx.addIssue({ code: 'custom', message: '关系图节点或引用无效' });
});
export const searchPageSchema = pageSchema(z.object({
  id: z.string(), type: z.enum(['event', 'person', 'source']), title: z.string(), summary: z.string(), label: z.string(),
  highlight: z.string(), jumpType: z.enum(['timeline', 'person', 'source']), jumpId: z.string(),
}));
export type PersonDetail = z.infer<typeof personDetailSchema>;
export type GraphData = z.infer<typeof graphSchema>;
export type TimelineQuery = { page?: number; pageSize?: number; start?: number; end?: number; category?: string; keyword?: string };
export type PersonsQuery = { page?: number; pageSize?: number; role?: string; keyword?: string };
export type SearchQuery = { q: string; page?: number; pageSize?: number; type?: string };
export type GraphQuery = { centerId?: string; depth?: number };
function query(params: object) {
  // 空筛选不传给后端；URLSearchParams 负责中文、空格和 & 等字符的编码。
  const values = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  return '?' + new URLSearchParams(values.map(([k, v]) => [k, String(v)]));
}
// 复用原 HTTP 层的响应封装、会话、超时和错误提示；这里只声明 C 组只读接口。
export class HttpCatalogRepository extends HttpRepository {
  timeline(params: TimelineQuery) { return this.request('/timeline' + query(params), timelinePageSchema); }
  event(id: string) { return this.request('/timeline/' + encodeURIComponent(id), eventSchema); }
  persons(params: PersonsQuery) { return this.request('/persons' + query(params), personsPageSchema); }
  person(id: string) { return this.request('/persons/' + encodeURIComponent(id), personDetailSchema); }
  graph(params: GraphQuery = {}) { return this.request('/relations/graph' + query(params), graphSchema); }
  search(params: SearchQuery) { return this.request('/search' + query(params), searchPageSchema); }
}
function paginate<T>(items: T[], params: { page?: number; pageSize?: number }, defaultSize: number) {
  const page = Math.max(1, params.page || 1), pageSize = Math.max(1, Math.min(100, params.pageSize || defaultSize));
  return { total: items.length, page, pageSize, items: items.slice((page - 1) * pageSize, page * pageSize) };
}
// demo 与 HTTP 保持同形返回值，使页面不必按模式分支；网络失败不会切到此实现。
export class DemoCatalogRepository {
  constructor(private catalog: Catalog = demoCatalog) {}
  async timeline(params: TimelineQuery) {
    const items = this.catalog.events.filter(e => (params.start === undefined || e.year >= params.start) &&
      (params.end === undefined || e.year <= params.end) && (!params.category || e.category === params.category) &&
      (!params.keyword || (e.title + e.summary).toLowerCase().includes(params.keyword.toLowerCase()))).sort((a, b) => a.year - b.year);
    return paginate(items, params, 20);
  }
  async event(id: string) { const item = this.catalog.events.find(e => e.id === id); if (!item) throw new Error('事件不存在。'); return item; }
  async persons(params: PersonsQuery) {
    return paginate(this.catalog.people.filter(p => (!params.role || p.role === params.role) &&
      (!params.keyword || (p.name + p.summary).toLowerCase().includes(params.keyword.toLowerCase()))).sort((a, b) => a.id.localeCompare(b.id)), params, 20);
  }
  async person(id: string): Promise<PersonDetail> {
    const person = this.catalog.people.find(p => p.id === id); if (!person) throw new Error('人物不存在。');
    return { ...person, relatedEvents: this.catalog.events.filter(e => e.personIds.includes(id)),
      relations: this.catalog.relations.filter(r => r.from === id || r.to === id).map(r => ({ ...r, otherId: r.from === id ? r.to : r.from, sourceRef: r.sourceIds.join(',') })) };
  }
  async graph(params: GraphQuery = {}): Promise<GraphData> {
    const ids = new Set(this.catalog.people.map(p => p.id));
    if (params.centerId) {
      if (!ids.has(params.centerId)) throw new Error('人物不存在。');
      ids.clear(); ids.add(params.centerId);
      for (let d = 0; d < Math.max(1, Math.min(5, params.depth || 1)); d++) {
        // 每层以扩展前的节点集为准，防止一次循环沿关系链展开多层。
        const previous = new Set(ids);
        this.catalog.relations.forEach(r => { if (previous.has(r.from)) ids.add(r.to); if (previous.has(r.to)) ids.add(r.from); });
      }
    }
    return { nodes: this.catalog.people.filter(p => ids.has(p.id)).map(p => ({ id: p.id, name: p.name, category: p.role, colorKey: p.role })),
      links: this.catalog.relations.filter(r => ids.has(r.from) && ids.has(r.to)).map(r => ({ id: r.id, source: r.from, target: r.to, type: r.type, styleKey: r.type, sourceRef: r.sourceIds.join(',') })) };
  }
  async search(params: SearchQuery) {
    const q = params.q.trim(), lower = q.toLowerCase();
    const items = searchCatalog(this.catalog, q).filter(r => !params.type || params.type === 'all' || r.type === params.type).map(r => {
      const text = r.title.toLowerCase().includes(lower) ? r.title : r.summary.toLowerCase().includes(lower) ? r.summary : r.title;
      const index = text.toLowerCase().indexOf(lower);
      return { ...r, highlight: lower && index >= 0 ? text.slice(0, index) + '<em>' + text.slice(index, index + q.length) + '</em>' + text.slice(index + q.length) : r.title,
        jumpType: r.type === 'event' ? 'timeline' as const : r.type, jumpId: r.id };
    });
    return paginate(items, params, 10);
  }
}
// C 组图接口只提供 nodes/links，不含坐标和生平；这些展示字段从 catalog 补齐。
// 图的节点范围、姓名、边及出处仍以本次图接口为准，不能用全量 catalog 补回子图外节点。
export function adaptGraph(graph: GraphData, catalog: Catalog): Catalog {
  return { ...catalog, people: graph.nodes.map((n, i) => {
    const original = catalog.people.find(p => p.id === n.id);
    // 尚未出现在 catalog 快照中的新节点使用环形坐标；距离不代表关系强弱。
    const angle = 2 * Math.PI * i / Math.max(1, graph.nodes.length);
    return { id: n.id, years: '', summary: '', sourceIds: [], demo: false,
      x: 390 + 230 * Math.cos(angle), y: 265 + 150 * Math.sin(angle), ...original, name: n.name, role: n.category };
  }), relations: graph.links.map(l => ({ id: l.id, from: l.source, to: l.target, type: l.type,
    sourceIds: sourceReferences(l.sourceRef), demo: catalog.relations.find(r => r.id === l.id)?.demo ?? false })) };
}
// sourceRef 是契约规定的逗号分隔字符串，不是可直接跳转的 URL。
export function sourceReferences(value: string) { return value.split(',').map(id => id.trim()).filter(Boolean); }
export function highlightParts(value: string) {
  // 只识别精确的 <em>…</em>。返回文本片段，交由 React 转义，不把后端字符串当 HTML。
  return value.split(/(<em>[\s\S]*?<\/em>)/g).filter(Boolean).map(part => ({
    text: part.startsWith('<em>') && part.endsWith('</em>') ? part.slice(4, -5) : part,
    marked: part.startsWith('<em>') && part.endsWith('</em>'),
  }));
}
// 模式由构建环境显式选择；API 地址通常为同源 /api，由 Vite 代理到本地后端。
export const catalogRepository = isDemo ? new DemoCatalogRepository() : new HttpCatalogRepository(import.meta.env?.VITE_API_BASE_URL || '/api');
