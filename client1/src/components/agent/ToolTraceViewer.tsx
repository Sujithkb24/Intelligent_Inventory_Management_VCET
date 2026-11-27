function Json({ v }: { v: unknown }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-[8px] bg-[#161B2E] p-3 font-mono text-xs text-slate-100">
      {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
    </pre>
  );
}

/** Evidence trace: one accordion section per tool (name, input, output). Supports the audit story. */
export function ToolTraceViewer({ evidence }: { evidence: Record<string, unknown> | unknown[] | null | undefined }) {
  if (!evidence || (Array.isArray(evidence) ? evidence.length === 0 : Object.keys(evidence).length === 0)) {
    return <div className="text-sm text-[var(--text-muted)]">No evidence trace was returned.</div>;
  }
  const entries: [string, unknown][] = Array.isArray(evidence)
    ? evidence.map((e, i) => {
        const o = e as { tool?: string; name?: string };
        return [o?.tool ?? o?.name ?? `step_${i + 1}`, e] as [string, unknown];
      })
    : Object.entries(evidence);

  return (
    <div className="space-y-2">
      {entries.map(([name, val]) => {
        const o = (val && typeof val === 'object' ? val : {}) as { input?: unknown; output?: unknown; args?: unknown; result?: unknown };
        const input = o.input ?? o.args;
        const output = o.output ?? o.result;
        const structured = input !== undefined || output !== undefined;
        return (
          <details key={name} className="rounded-[8px] border border-[var(--border)] bg-white">
            <summary className="cursor-pointer px-3.5 py-2.5 font-mono text-[13px] font-semibold text-[var(--text-primary)]">{name}</summary>
            <div className="space-y-3 border-t border-[var(--border)] p-3.5">
              {structured ? (
                <>
                  <div>
                    <div className="label">Input</div>
                    <Json v={input ?? null} />
                  </div>
                  <div>
                    <div className="label">Output</div>
                    <Json v={output ?? null} />
                  </div>
                </>
              ) : (
                <Json v={val} />
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
