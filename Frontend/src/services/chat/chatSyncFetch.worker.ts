type FetchMsg = {
  type: 'FETCH';
  id: number;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

type ResultMsg =
  | { type: 'RESULT'; id: number; kind: 'ok'; status: number; body: unknown }
  | { type: 'RESULT'; id: number; kind: 'err'; code: 'abort' | 'network' | 'bad_json'; status?: number };

self.onmessage = async (e: MessageEvent<FetchMsg>) => {
  const d = e.data;
  if (d?.type !== 'FETCH') return;
  const { id, url, headers, timeoutMs } = d;
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
      signal: ac.signal,
    });
    const text = await res.text();
    clearTimeout(tid);
    let body: unknown;
    try {
      body = text.length ? JSON.parse(text) : null;
    } catch {
      const msg: ResultMsg = { type: 'RESULT', id, kind: 'err', code: 'bad_json', status: res.status };
      self.postMessage(msg);
      return;
    }
    const msg: ResultMsg = { type: 'RESULT', id, kind: 'ok', status: res.status, body };
    self.postMessage(msg);
  } catch (err: unknown) {
    clearTimeout(tid);
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    const code: 'abort' | 'network' = name === 'AbortError' ? 'abort' : 'network';
    const msg: ResultMsg = { type: 'RESULT', id, kind: 'err', code };
    self.postMessage(msg);
  }
};

export {};
