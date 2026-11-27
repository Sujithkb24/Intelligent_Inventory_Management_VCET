import { useState } from 'react';
import { useAsk } from '../api/hooks';
import { ToolTraceViewer } from '../components/agent/ToolTraceViewer';
import { Banner, PageHeader } from '../components/common/common';
import { toast } from '../lib/toast';

interface Msg {
  role: 'user' | 'agent';
  text: string;
  trace?: Record<string, unknown> | unknown[] | null;
}

const SUGGESTED = ['Why is O102 at risk?', 'What if SUP_A is 5 days late on MCU_AUTO?'];

export default function AgentChatPage() {
  const ask = useAsk();
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const send = (question: string) => {
    const text = question.trim();
    if (!text || ask.isPending) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setQ('');
    ask.mutate(text, {
      onSuccess: (r) => setMsgs((m) => [...m, { role: 'agent', text: r.answer, trace: r.trace }]),
      onError: (e) => {
        if (e.status !== 403) toast(e.message, 'error');
        setMsgs((m) => [...m, { role: 'agent', text: `Error: ${e.message}` }]);
      },
    });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Agent chat" />
      <Banner tone="amber">Numbers come from backend tools. Verify before acting.</Banner>

      <div className="card mb-3 min-h-[300px] space-y-3">
        {msgs.length === 0 && (
          <div>
            <p className="mb-2 text-sm text-slate-500">Try a suggested prompt:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button key={s} className="btn" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-left text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100'}`}>{m.text}</div>
            {m.trace && (
              <details className="mt-1 text-left">
                <summary className="cursor-pointer text-xs text-slate-500">Tool trace</summary>
                <div className="mt-1">
                  <ToolTraceViewer evidence={m.trace} />
                </div>
              </details>
            )}
          </div>
        ))}
        {ask.isPending && <div className="text-sm text-slate-500">Agent is working (up to 8 tool calls){'…'}</div>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about orders, materials or suppliers" />
        <button className="btn btn-primary" disabled={ask.isPending || q.trim().length < 3}>
          Ask
        </button>
      </form>
    </div>
  );
}
