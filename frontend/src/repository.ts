import { demoCatalog } from './data';
import { catalogSchema, submissionInputSchema, submissionListSchema, submissionSchema, transitionSubmission,
  type Catalog, type Submission, type SubmissionInput, type ReviewAction } from './model';
import { z } from 'zod';

export interface PlatformRepository {
  catalog(): Promise<Catalog>;
  submissions(scope: 'mine' | 'review' | 'public'): Promise<Submission[]>;
  submit(input: SubmissionInput): Promise<Submission>;
  update(id: string, action: ReviewAction, note?: string): Promise<void>;
  remove(id: string): Promise<void>;
}
const STORAGE_KEY = 'fudan-history:submissions:v1';

export function decodeSubmissions(raw: string | null): Submission[] {
  if (raw === null) return [];
  try { return submissionListSchema.parse(JSON.parse(raw)); }
  catch { throw new Error('本地演示记录格式异常。请先导出或备份浏览器数据，再清除此站点的数据；原记录未被覆盖。'); }
}

export class LocalRepository implements PlatformRepository {
  constructor(private storage: Pick<Storage, 'getItem' | 'setItem'>) {}
  private read() {
    try { return decodeSubmissions(this.storage.getItem(STORAGE_KEY)); }
    catch (error) { if (error instanceof Error) throw error; throw new Error('无法读取浏览器存储。'); }
  }
  private write(items: Submission[]) {
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(items)); }
    catch { throw new Error('保存失败：浏览器存储不可用或空间不足。请复制正文后重试。'); }
  }
  async catalog() { return catalogSchema.parse(demoCatalog); }
  async submissions(scope: 'mine' | 'review' | 'public') {
    const all = this.read();
    return scope === 'public' ? all.filter(s => s.status === 'approved') : all;
  }
  async submit(input: SubmissionInput) {
    const valid = submissionInputSchema.parse(input);
    const item: Submission = { ...valid, id: crypto.randomUUID(), status: 'pending', reviewNote: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const all = this.read(); this.write([item, ...all]); return item;
  }
  async update(id: string, action: ReviewAction, note = '') {
    const all = this.read(); const item = all.find(s => s.id === id);
    if (!item) throw new Error('记录不存在，请刷新页面。');
    const updated = transitionSubmission(item, action, note);
    this.write(all.map(s => s.id === id ? updated : s));
  }
  async remove(id: string) { this.write(this.read().filter(s => s.id !== id)); }
}

export class HttpRepository implements PlatformRepository {
  constructor(private base: string) {}
  private async request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${this.base.replace(/\/$/, '')}${path}`, {
        ...init, credentials: 'include', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-App-Request': 'fudan-history', ...init.headers },
      });
      if (response.status === 401) throw new Error('请先登录开发账号，或刷新页面更新登录状态。');
      if (response.status === 403) throw new Error('没有执行此操作的权限。');
      if (!response.ok) { const failure = await response.json().catch(() => null); throw new Error(failure?.message || '服务请求失败，请稍后重试。'); }
      const envelope = z.object({ code: z.literal(0), message: z.string(), data: z.unknown() }).safeParse(await response.json());
      if (!envelope.success) throw new Error('接口数据不符合约定，请联系开发人员检查。');
      const data = schema.safeParse(envelope.data.data);
      if (!data.success) throw new Error('接口数据不符合约定，请联系开发人员检查。');
      return data.data;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw new Error('请求超时，请重试。');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  catalog() { return this.request('/catalog', catalogSchema); }
  submissions(scope: 'mine' | 'review' | 'public') { return this.request(`/submissions?scope=${scope}`, submissionListSchema); }
  submit(input: SubmissionInput) { return this.request('/submissions', submissionSchema, { method: 'POST', body: JSON.stringify(submissionInputSchema.parse(input)) }); }
  async update(id: string, action: ReviewAction, note = '') {
    await this.request(`/submissions/${encodeURIComponent(id)}/${action}`, z.null(), { method: 'POST', body: JSON.stringify({ note }) });
  }
  async remove(id: string) { await this.request(`/submissions/${encodeURIComponent(id)}`, z.null(), { method: 'DELETE' }); }
}

export const isDemo = import.meta.env?.VITE_DATA_MODE !== 'api';
// Access storage only when the user opens/submits a memory; blocked storage must not break browsing.
const storage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
};
export const repository: PlatformRepository = isDemo ? new LocalRepository(storage) : new HttpRepository(import.meta.env?.VITE_API_BASE_URL || '/api');
