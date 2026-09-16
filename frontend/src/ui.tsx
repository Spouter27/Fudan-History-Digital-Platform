import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, X } from 'lucide-react';
import type { Source } from './model';

export function DemoTag() { return <span className="demo-tag">演示资料</span>; }
export function Empty({ children }: { children: ReactNode }) { return <div className="empty"><BookOpen size={30} strokeWidth={1.3} /><p>{children}</p></div>; }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!; const previous = document.activeElement as HTMLElement | null;
    dialog.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = old; previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" aria-labelledby="dialog-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-inner"><div className="modal-heading"><span className="eyebrow">档案详情 / RECORD</span><button className="icon-button" aria-label="关闭详情" onClick={onClose}><X size={22} /></button></div><h2 id="dialog-title">{title}</h2>{children}</div>
  </dialog>;
}
export function SourceCard({ source }: { source: Source }) {
  const url = source.url && /^https?:\/\//i.test(source.url) ? source.url : undefined;
  return <article className="source-card"><div className="row"><span className="tag">{source.kind}</span>{source.demo && <DemoTag />}</div><h4>{source.title}</h4><p className="small muted">{source.citation}</p><blockquote>{source.excerpt}</blockquote><div className="row small"><span>{source.authorization}</span>{url && <a href={url} target="_blank" rel="noopener noreferrer">查看原始来源 <ArrowUpRight size={14} /></a>}</div></article>;
}
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.trim().split(/\s+/).filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const regex = new RegExp(`(${words.join('|')})`, 'gi');
  return <>{text.split(regex).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)}</>;
}
