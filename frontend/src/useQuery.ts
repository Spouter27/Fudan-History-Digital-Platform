import { useEffect, useRef, useState } from 'react';

// key 必须包含所有查询条件（例如页码、关键词、人物 ID）。
// key 变化立即隐藏旧数据；迟到响应不能覆盖当前查询的结果。
export function useQuery<T>(key: string, load: () => Promise<T>) {
  // 页面每次渲染都会创建新的回调；通过 ref 保存最新回调，以 key 控制实际请求次数。
  const loader = useRef(load); loader.current = load;
  const [retry, setRetry] = useState(0);
  const identity = key + '\nretry=' + retry;
  const [state, setState] = useState<{ identity: string; data?: T; error: string; loading: boolean }>({ identity: '', error: '', loading: true });
  useEffect(() => {
    // cleanup 仅使旧请求失效，并不取消底层 HTTP；请求本身由 HTTP 层的超时约束。
    let live = true;
    setState({ identity, error: '', loading: true });
    Promise.resolve().then(() => loader.current()).then(data => { if (live) setState({ identity, data, error: '', loading: false }); })
      .catch(error => { if (live) setState({ identity, error: error instanceof Error ? error.message : '读取失败，请重试。', loading: false }); });
    return () => { live = false; };
  }, [identity]);
  // 比 useEffect 更早屏蔽旧状态，避免切到人物 B 时短暂显示人物 A 的详情。
  return { ...(state.identity === identity ? state : { data: undefined, error: '', loading: true }), reload: () => setRetry(n => n + 1) };
}
// 延迟提交输入中的关键词，减少每次键入都发请求；组件卸载或继续输入时清理旧计时器。
export function useDebounced<T>(value: T, delay = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return settled;
}
