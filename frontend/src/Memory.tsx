import { useEffect, useState, type FormEvent } from 'react';
import { Check, Download, Feather, Send, Trash2, Undo2 } from 'lucide-react';
import { isDemo, repository } from './repository';
import { submissionInputSchema, type ReviewAction, type Submission } from './model';
import { Empty, Modal } from './ui';

const statusLabels = { pending: '待审核', approved: '已展示', rejected: '已退回', withdrawn: '已撤回' };
export default function Memory({ review = false }: { review?: boolean }) {
  const [items, setItems] = useState<Submission[]>([]); const [tab, setTab] = useState('mine');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [refresh, setRefresh] = useState(0);
  const [title, setTitle] = useState(''); const [year, setYear] = useState('2026'); const [body, setBody] = useState(''); const [author, setAuthor] = useState(''); const [consent, setConsent] = useState(false);
  const [decision, setDecision] = useState<{ item: Submission; action: ReviewAction | 'delete' } | null>(null); const [note, setNote] = useState('');
  useEffect(() => { let live = true; setLoading(true); setError('');
    repository.submissions(review ? 'review' : tab === 'public' ? 'public' : 'mine').then(result => { if (live) setItems(result); }).catch(e => { if (live) setError(e instanceof Error ? e.message : '读取失败'); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [review, tab, refresh]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    const parsed = submissionInputSchema.safeParse({ title, year: Number(year), body, author, consent });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try { await repository.submit(parsed.data); setTitle(''); setBody(''); setConsent(false); setTab('mine'); setNotice('记忆已提交，审核后才会展示。'); setRefresh(r => r + 1); }
    catch (e) { setError(e instanceof Error ? e.message : '提交失败'); }
    finally { setBusy(false); }
  }
  async function decide() {
    if (!decision) return; setBusy(true); setError('');
    try {
      if (decision.action === 'delete') await repository.remove(decision.item.id);
      else await repository.update(decision.item.id, decision.action, note);
      setNotice(decision.action === 'delete' ? '记录已删除。' : decision.action === 'approve' ? '审核通过，已加入共同记忆。' : decision.action === 'reject' ? '已退回，原因已记录。' : '已撤回，内容不再展示。');
      setDecision(null); setNote(''); setRefresh(r => r + 1);
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  }
  function exportItems() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = '我的校史记忆.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const pending = items.filter(i => i.status === 'pending');
  const shown = review ? pending : items;
  return <><div className="page-heading"><div><div className="eyebrow">{review ? 'EDITORIAL DESK' : 'OUR SHARED MEMORIES'}</div><h1>{review ? '让每一段记忆，有据可循' : '你的经历，也是校史的一部分'}<span>{review ? '审核工作台' : '记忆共创'}</span></h1><p>{review ? '核对出处、授权与个人信息，保留审核意见。' : '记录一次相遇、一堂课，或一段值得留下的校园时光。'}</p></div></div>
    {isDemo && <div className="notice-strip"><Feather size={18} /><span>{review ? '审核员视角演示：这里没有真实账号或权限。操作仅影响当前浏览器中的演示投稿。' : '本地演示：投稿仅保存在当前浏览器，不会发送到服务器。请勿填写真实敏感信息。'}</span></div>}
    {error && <div className="error-box" role="alert">{error} <button className="text-button" onClick={() => setRefresh(r => r + 1)}>重新加载</button></div>}
    {notice && <div className="success-box" role="status"><Check size={18} />{notice}</div>}
    <div className={review ? '' : 'memory-layout'}>
      {!review && <section className="panel compose"><div className="section-title"><h2>写下一段记忆</h2><Feather size={20} /></div><form onSubmit={submit}>
        <label>标题<input value={title} onChange={e => setTitle(e.target.value)} required minLength={4} maxLength={60} placeholder="给这段记忆起一个名字" /></label>
        <div className="form-row"><label>发生年份<input type="number" min={1905} max={new Date().getFullYear()} required value={year} onChange={e => setYear(e.target.value)} /></label><label>展示署名<input value={author} onChange={e => setAuthor(e.target.value)} required maxLength={24} placeholder="可使用笔名" autoComplete="off" /></label></div>
        <label>记忆内容<textarea rows={8} value={body} onChange={e => setBody(e.target.value)} minLength={20} maxLength={2000} required placeholder="发生了什么？你记得哪些细节？这段经历对你意味着什么？" /><span className="field-help">至少20字 · {body.length}/2000</span></label>
        <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>我确认有权提交这些内容，同意审核通过后展示，并可随时撤回。{isDemo && '本次授权仅用于本地演示。'}</span></label>
        <button className="button primary full" disabled={busy} type="submit"><Send size={16} />{busy ? '正在保存…' : '提交记忆'}</button>
      </form></section>}
      <section className="panel memory-records"><div className="section-title"><h2>{review ? `待审核记忆（${pending.length}）` : '记忆簿'}</h2>{!review && tab === 'mine' && <button className="text-button" disabled={loading || !items.length} onClick={exportItems}><Download size={15} />导出 JSON</button>}</div>
        {!review && <div className="tabs"><button className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>我的投稿</button><button className={tab === 'public' ? 'active' : ''} onClick={() => setTab('public')}>共同记忆</button></div>}
        {loading ? <Empty>正在读取记忆…</Empty> : !shown.length ? <Empty>{review ? '暂时没有待审核内容。可以先在记忆共创页提交一条演示投稿。' : tab === 'public' ? '还没有审核通过的记忆。' : '你的记忆簿还是空白，从左侧写下第一段记忆。'}</Empty> : shown.map(item => <article key={item.id} className="memory-card"><div className="row spread"><span className="small muted">{item.year} · {item.author}</span><span className={`status ${item.status}`}>{statusLabels[item.status]}</span></div><h3>{item.title}</h3><p className="preserve">{item.body}</p><p className="small muted">提交于 {new Date(item.createdAt).toLocaleDateString('zh-CN')}</p>{item.reviewNote && <p className="review-note">审核意见：{item.reviewNote}</p>}<div className="row wrap">
          {review ? <><button className="button primary small-button" disabled={busy} onClick={() => { setDecision({ item, action: 'approve' }); setNote(''); }}>通过审核</button><button className="button secondary small-button" disabled={busy} onClick={() => { setDecision({ item, action: 'reject' }); setNote(''); }}>退回修改</button></> : tab === 'mine' && <>{item.status !== 'withdrawn' && <button className="text-button" onClick={() => { setDecision({ item, action: 'withdraw' }); setNote(''); }}><Undo2 size={15} />撤回</button>}<button className="text-button danger" onClick={() => { setDecision({ item, action: 'delete' }); setNote(''); }}><Trash2 size={15} />删除</button></>}
        </div></article>)}
        {review && !loading && <p className="small muted">已处理 {items.length - pending.length} 条。处理结果可在记忆共创页查看。</p>}
      </section>
    </div>
    {decision && <Modal title={decision.action === 'delete' ? '删除这段记忆？' : decision.action === 'withdraw' ? '撤回这段记忆？' : decision.action === 'approve' ? '确认通过审核' : '退回并填写意见'} onClose={() => { if (!busy) setDecision(null); }}><p>《{decision.item.title}》</p>{decision.action === 'delete' ? <p className="muted">删除后无法恢复。你可以先关闭窗口并导出记录。</p> : decision.action === 'withdraw' ? <p className="muted">撤回后停止展示，记录保留在我的投稿中。</p> : <label>审核意见{decision.action === 'reject' && '（必填）'}<textarea value={note} onChange={e => setNote(e.target.value)} rows={4} maxLength={500} placeholder="请核对内容、展示授权及他人隐私" /></label>}{error && <p className="danger" role="alert">{error}</p>}<div className="row end"><button className="button secondary" disabled={busy} onClick={() => setDecision(null)}>取消</button><button className="button primary" disabled={busy || (decision.action === 'reject' && !note.trim())} onClick={decide}>{busy ? '处理中…' : '确认'}</button></div></Modal>}
  </>;
}
