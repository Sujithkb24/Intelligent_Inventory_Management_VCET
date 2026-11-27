import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useRec } from '../api/hooks';
import { useAuth } from '../auth/AuthContext';
import { ToolTraceViewer } from '../components/agent/ToolTraceViewer';
import { ApprovalDialog } from '../components/approval/ApprovalDialog';
import { Banner, PageHeader, QueryBoundary, StatusBadge } from '../components/common/common';
import { config } from '../config';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '../lib/format';
import type { Recommendation } from '../api/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
function warnings(rec: Recommendation): string[] {
  // Derive from evidence.get_supplier_details if present, otherwise show reasoning text only.
  const ev = rec.evidence as any;
  const det = ev?.get_supplier_details?.output ?? ev?.get_supplier_details;
  const list: any[] = Array.isArray(det) ? det : det && typeof det === 'object' ? [det] : [];
  const out: string[] = [];
  const mine = list.find((s) => s?.supplier_id === rec.supplier_id) ?? list[0];
  if (mine?.single_source) out.push('Single-source supplier for this material.');
  if (typeof mine?.reliability === 'number' && mine.reliability < config.reliabilityWarn)
    out.push(`Supplier reliability ${mine.reliability} is below ${config.reliabilityWarn}.`);
  if (list.filter((s) => s?.supplier_id !== rec.supplier_id).length > 0) out.push('Alternate suppliers exist for this material.');
  return out;
}

function isGroundingFailure(rec: Recommendation): boolean {
  const r = rec as any;
  return r.grounding_failure === true || r.grounding_ok === false || String(rec.status).toUpperCase().includes('GROUNDING');
}

export default function RecommendationDetailPage() {
  const { recId = '' } = useParams();
  const { can } = useAuth();
  const q = useRec(recId);
  const [dialog, setDialog] = useState<'APPROVE' | 'REJECT' | null>(null);

  return (
    <div>
      <PageHeader title={`Recommendation ${recId}`}>
        <Link className="btn" to="/recommendations">
          Back
        </Link>
      </PageHeader>
      <QueryBoundary q={q}>
        {(rec) => {
          const failed = isGroundingFailure(rec);
          const pending = String(rec.status).toUpperCase() === 'PENDING';
          const warn = warnings(rec);
          const approver = rec.approver ?? rec.approved_by;
          return (
            <>
              {failed ? (
                <Banner tone="red">Grounding failure: numbers could not be verified against tool outputs. Approval is disabled.</Banner>
              ) : (
                <Banner tone="green">All numbers grounded in tool outputs</Banner>
              )}
              {warn.map((w) => (
                <Banner key={w} tone="amber">
                  {w}
                </Banner>
              ))}

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="card">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-semibold">Purchase order draft</h2>
                    <StatusBadge status={rec.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="label">Material</dt>
                      <dd>
                        <Link className="text-indigo-600 underline" to={`/inventory/${rec.material_id}`}>
                          {rec.material_id}
                        </Link>
                      </dd>
                    </div>
                    <div>
                      <dt className="label">Supplier</dt>
                      <dd>{rec.supplier_id}</dd>
                    </div>
                    <div>
                      <dt className="label">Quantity (MOQ / pack rounded)</dt>
                      <dd>{fmtNum(rec.qty)}</dd>
                    </div>
                    <div>
                      <dt className="label">Needed by</dt>
                      <dd>{fmtDate(rec.needed_by)}</dd>
                    </div>
                    <div>
                      <dt className="label">Estimated cost</dt>
                      <dd>{fmtMoney(rec.est_cost)}</dd>
                    </div>
                    <div>
                      <dt className="label">Affected orders</dt>
                      <dd>
                        {rec.affected_orders.map((o) => (
                          <Link key={o} className="mr-2 text-indigo-600 underline" to={`/orders/${o}`}>
                            {o}
                          </Link>
                        ))}
                      </dd>
                    </div>
                  </dl>

                  {pending && can('decide_rec') && (
                    <div className="mt-4 flex gap-2 border-t border-slate-100 pt-3">
                      <button className="btn btn-primary" disabled={failed} onClick={() => setDialog('APPROVE')}>
                        Approve
                      </button>
                      <button className="btn btn-danger" onClick={() => setDialog('REJECT')}>
                        Reject
                      </button>
                    </div>
                  )}
                  {pending && !can('decide_rec') && <p className="mt-3 text-xs text-slate-500">Only a procurement officer can approve or reject.</p>}
                </div>

                <div className="card">
                  <h2 className="mb-2 font-semibold">Reasoning</h2>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{rec.reasoning}</p>
                </div>
              </div>

              {!pending && (
                <div className="card mt-4">
                  <h2 className="mb-2 font-semibold">Audit trail</h2>
                  <p className="text-sm">
                    Decision: <StatusBadge status={rec.status} /> {approver && <>by <b>{approver}</b></>} {rec.decided_at && <>at {fmtDateTime(rec.decided_at)}</>}
                  </p>
                  {(rec.decision_reason ?? rec.reason) && <p className="mt-1 text-sm text-slate-600">Reason: {rec.decision_reason ?? rec.reason}</p>}
                  {rec.audit_trail && rec.audit_trail.length > 0 && (
                    <ul className="mt-2 space-y-1 text-sm">
                      {rec.audit_trail.map((a, i) => (
                        <li key={i} className="text-slate-600">
                          {fmtDateTime(a.at)} - {a.by ?? 'system'}: {a.action}
                          {a.reason ? ` (${a.reason})` : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="card mt-4">
                <h2 className="mb-2 font-semibold">Evidence trace</h2>
                <ToolTraceViewer evidence={rec.evidence} />
              </div>

              {dialog && <ApprovalDialog recId={recId} decision={dialog} onClose={() => setDialog(null)} />}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
