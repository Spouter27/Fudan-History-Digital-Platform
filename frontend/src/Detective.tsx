import { useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, FileSearch, Lightbulb, RotateCcw, ShieldCheck } from 'lucide-react';
import type { Catalog } from './model';
import { DemoTag, SourceCard } from './ui';

type Mission = {
  id: string;
  serial: string;
  title: string;
  theme: string;
  summary: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  sourceId: string;
  clueFile: string;
};

const missions: Mission[] = [
  {
    id: 'date', serial: '卷宗 01', title: '校报里的时间线索', theme: '辨读日期',
    summary: '从一则虚构校报剪影中，辨认最能支撑时间判断的信息。',
    prompt: '如果一份报道的报头日期被折痕遮住，优先查看哪一处来确认事件发生的年份？',
    options: ['报道版面上的栏目标语', '文中明确印出的年份和日期', '纸张略微泛黄的程度'], answer: 1,
    explanation: '纸张颜色和版面风格只能提供推测；可以直接引用的年份与日期才是最稳妥的时间依据。', sourceId: 's2', clueFile: 'mission-date.txt',
  },
  {
    id: 'relation', serial: '卷宗 02', title: '人物关系的证据链', theme: '核对关联',
    summary: '判断一条人物关系能否进入图谱，区分“同时出现”和“直接关联”。',
    prompt: '两个人的名字同时出现在同一份虚构会议记录中，能否直接标注为“学术合作”？',
    options: ['可以，只要他们同页出现', '不可以，还需要材料明确说明合作关系', '可以，只要他们属于同一时期'], answer: 1,
    explanation: '共同出现不等于合作。关系图中的每一条边都应有能直接支持关系类型的资料依据。', sourceId: 's1', clueFile: 'mission-relation.txt',
  },
  {
    id: 'memory', serial: '卷宗 03', title: '照片背后的校园记忆', theme: '区分事实与推测',
    summary: '面对一张没有说明文字的虚构校园照片，选择应被谨慎保留的表述。',
    prompt: '照片中出现一栋教学楼，但没有日期或地点说明。下列哪种写法最合适？',
    options: ['“这一定是某年某月的教学楼。”', '“画面疑似教学楼，拍摄时间和地点待核。”', '“这证明当时所有学生都在这里上课。”'], answer: 1,
    explanation: '史料呈现需要保留不确定性。没有出处支撑的细节应明确标为待核，而不是补成定论。', sourceId: 's3', clueFile: 'mission-memory.txt',
  },
];

type Clue = { status: 'idle' | 'loading' | 'ready' | 'error'; text: string };

export default function Detective({ catalog, open }: { catalog: Catalog; open: (type: string, id: string) => void }) {
  const [active, setActive] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [clue, setClue] = useState<Clue>({ status: 'idle', text: '' });
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const mission = missions[active];
  const source = catalog.sources.find(item => item.id === mission.sourceId);
  const answered = choice !== null;
  const correct = choice === mission.answer;

  function chooseMission(index: number) {
    setActive(index); setChoice(null); setClue({ status: 'idle', text: '' });
  }

  async function showClue() {
    if (clue.status === 'ready') { setClue({ status: 'idle', text: '' }); return; }
    setClue({ status: 'loading', text: '' });
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}detective-responses/${mission.clueFile}`);
      if (!response.ok) throw new Error('无法读取预设线索');
      setClue({ status: 'ready', text: await response.text() });
    } catch {
      setClue({ status: 'error', text: '预设线索暂时无法打开，请稍后重试。' });
    }
  }

  function answer(index: number) {
    setChoice(index);
    if (index === mission.answer) setCompleted(previous => new Set([...previous, mission.id]));
  }

  return <>
    <div className="page-heading detective-heading"><div><div className="eyebrow">ARCHIVE DETECTIVE BUREAU</div><h1>档案侦探局<span>从一条线索开始，练习读懂史料。</span></h1><p>完成小任务，区分可证实的信息、合理推测与仍待核对的空白。</p></div><span className="count-label">已解锁 {completed.size} / {missions.length} 份卷宗</span></div>
    <section className="detective-notice"><ShieldCheck size={19} /><p><b>演示任务</b>：题目、线索与资料均为虚构内容，仅用于展示互动流程；“档案助手”读取项目内预设文本，不调用外部 AI。</p></section>
    <div className="detective-layout">
      <aside className="mission-list" aria-label="侦探任务列表"><div className="mission-list-heading"><FileSearch size={22} /><div><span className="eyebrow">CASE FILES</span><h2>待办卷宗</h2></div></div>{missions.map((item, index) => <button className={`mission-item ${index === active ? 'selected' : ''}`} key={item.id} onClick={() => chooseMission(index)}><span className="mission-status">{completed.has(item.id) ? <CheckCircle2 size={16} /> : `0${index + 1}`}</span><span><small>{item.serial} · {item.theme}</small><b>{item.title}</b></span><ArrowRight size={15} /></button>)}</aside>
      <section className="case-file panel" aria-live="polite"><div className="case-file-top"><div><span className="eyebrow">{mission.serial} · {mission.theme}</span><h2>{mission.title}</h2></div><DemoTag /></div><p className="case-summary">{mission.summary}</p><div className="evidence-card"><div className="evidence-icon"><BookOpen size={23} /></div><div><span className="eyebrow">证据提示</span><p>先阅读材料中能够被直接确认的信息，再作出判断。无法确认的部分，应保留为疑问。</p></div></div>
        <div className="detective-question"><span className="eyebrow">你的判断</span><h3>{mission.prompt}</h3><div className="detective-options">{mission.options.map((option, index) => <button key={option} className={`${choice === index ? (correct ? 'correct' : 'incorrect') : ''} ${answered && index === mission.answer ? 'answer-key' : ''}`} onClick={() => answer(index)} aria-pressed={choice === index} disabled={answered}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div></div>
        {answered && <div className={correct ? 'detective-result success' : 'detective-result retry'}><div>{correct ? <CheckCircle2 size={20} /> : <RotateCcw size={20} />}</div><p><b>{correct ? '线索判断正确。' : '这条判断还需要再核对。'}</b>{mission.explanation}</p>{!correct && <button className="text-button" onClick={() => setChoice(null)}>重新判断</button>}</div>}
        <div className="clue-zone"><div><Lightbulb size={19} /><span><b>档案助手线索</b><small>预设文本 · 不调用外部 AI</small></span></div><button className="button secondary small-button" onClick={showClue} disabled={clue.status === 'loading'}>{clue.status === 'loading' ? '正在调阅…' : clue.status === 'ready' ? '收起线索' : '调阅线索'}</button></div>
        {clue.status === 'ready' && <blockquote className="assistant-clue">{clue.text}</blockquote>}{clue.status === 'error' && <p className="clue-error">{clue.text}</p>}
        {source && <div className="mission-source"><div className="section-title"><div><span className="eyebrow">RELATED SOURCE</span><h3>关联资料</h3></div><button className="text-button" onClick={() => open('source', source.id)}>查看资料详情 <ArrowRight size={14} /></button></div><SourceCard source={source} /></div>}
      </section>
    </div>
  </>;
}
