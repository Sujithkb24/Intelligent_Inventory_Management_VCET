import { useState } from 'react';
import { useClarify } from '../api/hooks';
import type { ClarifyResult } from '../api/types';
import { ToolTraceViewer } from '../components/agent/ToolTraceViewer';
import { Banner, PageHeader } from '../components/common/common';
import { toast } from '../lib/toast';

interface Msg {
  role: 'user' | 'agent';
  text: string;
  trace?: Record<string, unknown> | unknown[] | null;
  clarify?: ClarifyResult;
  source?: string;
}

const SUGGESTED = ['Why is O102 at risk?', 'What if SUP_A is 5 days late on MCU_AUTO?'];

export default function AgentChatPage() {
  const clarify = useClarify();
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);

  const send = (question: string, answers: string[] = []) => {
    const text = question.trim();
    if (!text || clarify.isPending) return;
    setMsgs((m) => [...m, { role: 'user', text: answers.length ? answers.join(', ') : text }]);
    setQ('');
    clarify.mutate(
      { question: text, session_id: sessionId, answers },
      {
        onSuccess: (r) => {
          setSessionId(r.session_id);
          setMsgs((m) => [...m, { role: 'agent', text: r.answer, trace: r.trace, clarify: r, source: text }]);
        },
        onError: (e) => {
          if (e.status !== 403) toast(e.message, 'error');
          setMsgs((m) => [...m, { role: 'agent', text: `Error: ${e.message}` }]);
        },
      },
    );
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Agent chat" />
      <Banner tone="amber">Numbers come from backend tools. Verify before acting.</Banner>

      <div className="card mb-4 min-h-[300px] space-y-3">
        {msgs.length === 0 && (
          <div>
            <p className="mb-3 text-sm text-[var(--text-muted)]">Try a suggested prompt:</p>
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
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-[12px] px-3.5 py-2.5 text-left text-sm ${
                m.role === 'user'
                  ? 'bg-[var(--blue-600)] text-white'
                  : 'bg-[var(--bg)] text-[var(--text-primary)]'
              }`}
            >
              {m.text}
            </div>
            {m.clarify?.interpretations?.length ? (
              <div className="mt-1.5 text-xs text-[var(--text-muted)]">
                {m.clarify.interpretations.join(' ')}
              </div>
            ) : null}
            {m.clarify?.questions?.map((question, qi) => (
              <div key={qi} className="mt-2 flex flex-wrap gap-2">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    className="btn"
                    disabled={clarify.isPending}
                    onClick={() => send(m.source ?? '', [option.id])}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ))}
            {m.trace && (
              <details className="mt-1.5 text-left">
                <summary className="cursor-pointer text-xs font-medium text-[var(--purple-700)]">Tool trace</summary>
                <div className="mt-1.5">
                  <ToolTraceViewer evidence={m.trace} />
                </div>
              </details>
            )}
          </div>
        ))}
        {clarify.isPending && <div className="text-sm text-[var(--text-muted)]">Agent is working{'\u2026'}</div>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about orders, materials or suppliers"
        />
        <button className="btn btn-primary" disabled={clarify.isPending || q.trim().length < 3}>
          Ask
        </button>
      </form>
    </div>
  );
}
