import { z } from 'zod';

export const categorySchema = z.enum(['学校沿革', '学术教育', '校园生活']);
export const sourceSchema = z.object({
  id: z.string(), title: z.string(), kind: z.enum(['档案', '报刊', '口述']),
  citation: z.string(), excerpt: z.string(), demo: z.boolean(),
  authorization: z.enum(['演示资料', '已授权', '可依法引用']),
  url: z.string().url().optional(),
});
export const personSchema = z.object({
  id: z.string(), name: z.string(), role: z.enum(['教育工作者', '学者', '学生']),
  years: z.string(), summary: z.string(), sourceIds: z.array(z.string()),
  x: z.number(), y: z.number(), demo: z.boolean(),
});
export const eventSchema = z.object({
  id: z.string(), year: z.number().int(), title: z.string(), category: categorySchema,
  summary: z.string(), content: z.string(), place: z.string(),
  sourceIds: z.array(z.string()), personIds: z.array(z.string()), demo: z.boolean(),
});
export const relationSchema = z.object({
  id: z.string(), from: z.string(), to: z.string(),
  type: z.enum(['师生', '同窗', '学术合作', '社团协作']),
  sourceIds: z.array(z.string()), demo: z.boolean(),
});
export const catalogSchema = z.object({
  events: z.array(eventSchema), people: z.array(personSchema),
  relations: z.array(relationSchema), sources: z.array(sourceSchema),
});
export const submissionInputSchema = z.object({
  title: z.string().trim().min(4, '标题至少4个字').max(60, '标题最多60个字'),
  year: z.number().int().min(1905).max(new Date().getFullYear()),
  body: z.string().trim().min(20, '请用至少20个字描述你的记忆').max(2000, '正文最多2000字'),
  author: z.string().trim().min(1, '请填写署名').max(24),
  consent: z.literal(true, { errorMap: () => ({ message: '请先同意展示授权' }) }),
});
export const submissionSchema = submissionInputSchema.extend({
  id: z.string(), status: z.enum(['pending', 'approved', 'rejected', 'withdrawn']),
  createdAt: z.string(), updatedAt: z.string(), reviewNote: z.string(),
});
export const submissionListSchema = z.array(submissionSchema);
export type Catalog = z.infer<typeof catalogSchema>;
export type HistoryEvent = z.infer<typeof eventSchema>;
export type Person = z.infer<typeof personSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Relation = z.infer<typeof relationSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionInput = z.infer<typeof submissionInputSchema>;
export type ReviewAction = 'approve' | 'reject' | 'withdraw';

export function transitionSubmission(item: Submission, action: ReviewAction, note = ''): Submission {
  if (action === 'withdraw' && item.status === 'withdrawn') throw new Error('这条记忆已经撤回。');
  if (action !== 'withdraw' && item.status !== 'pending') throw new Error('只能审核待审核的记忆，请刷新列表。');
  if (action === 'reject' && !note.trim()) throw new Error('请填写退回原因，帮助投稿者了解问题。');
  return { ...item, status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'withdrawn',
    reviewNote: action === 'withdraw' ? item.reviewNote : note.trim(), updatedAt: new Date().toISOString() };
}

export type SearchResult = { id: string; type: 'event' | 'person' | 'source'; title: string; summary: string; label: string };
export function searchCatalog(catalog: Catalog, query: string): SearchResult[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all: SearchResult[] = [
    ...catalog.events.map(e => ({ id: e.id, type: 'event' as const, title: e.title, summary: `${e.year} · ${e.summary} ${e.content} ${e.place}`, label: '事件' })),
    ...catalog.people.map(p => ({ id: p.id, type: 'person' as const, title: p.name, summary: `${p.role} · ${p.summary}`, label: '人物' })),
    ...catalog.sources.map(s => ({ id: s.id, type: 'source' as const, title: s.title, summary: `${s.citation} ${s.excerpt}`, label: '史料' })),
  ];
  return all.filter(r => words.every(w => `${r.title} ${r.summary}`.toLocaleLowerCase().includes(w)));
}
