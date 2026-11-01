import { highlightParts } from './catalogRepository';

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  // 页数由服务端 total 计算，不能用当前页 items.length 判断是否还有下一页。
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1 && page === 1) return null;
  return <nav className="pagination" aria-label="分页"><button className="button secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button><span>{page} / {pages} · 共 {total} 条</span><button className="button secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</button></nav>;
}
export function QueryError({ error, retry }: { error: string; retry: () => void }) {
  return <div className="error-box" role="alert">{error}<button className="button secondary" onClick={retry}>重新加载</button></div>;
}
export function SafeHighlight({ value }: { value: string }) {
  // 仅将成对、无属性的 <em> 转为 React 高亮元素；脚本、图片、事件属性均作为文本显示。
  return <>{highlightParts(value).map((part, index) => part.marked ? <mark key={index}>{part.text}</mark> : <span key={index}>{part.text}</span>)}</>;
}
