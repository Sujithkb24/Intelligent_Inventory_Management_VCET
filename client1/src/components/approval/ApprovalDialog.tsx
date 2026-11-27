import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Modal, FieldError } from '../common/common';
import { useDecide } from '../../api/hooks';
import { decisionSchema } from '../../lib/schemas';
import { toast } from '../../lib/toast';

type FormVals = { decision: 'APPROVE' | 'REJECT'; reason?: string };

export function ApprovalDialog({
  recId,
  decision,
  onClose,
}: {
  recId: string;
  decision: 'APPROVE' | 'REJECT';
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const mut = useDecide(recId);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormVals>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { decision, reason: '' },
  });

  const submit = (v: FormVals) => {
    if (mut.isPending) return; // no double submit
    mut.mutate(
      { decision: v.decision, reason: v.reason?.trim() || undefined },
      {
        onSuccess: () => {
          toast(v.decision === 'APPROVE' ? 'Recommendation approved' : 'Recommendation rejected', 'success');
          onClose();
        },
        onError: (e) => {
          if (e.status === 409) {
            toast('Already decided', 'info');
            qc.invalidateQueries({ queryKey: ['rec', recId] });
            onClose();
          } else if (e.status !== 403) {
            toast(e.message, 'error');
          }
        },
      },
    );
  };

  const approve = decision === 'APPROVE';
  return (
    <Modal title={approve ? 'Approve purchase order' : 'Reject recommendation'} onClose={onClose}>
      <form onSubmit={handleSubmit(submit)} className="space-y-3">
        <input type="hidden" {...register('decision')} />
        {approve ? (
          <p className="rounded-[8px] border border-[#F6D79D] bg-[#FFF3DC] p-3 text-sm text-[#9A5B00]">
            This creates an OPEN purchase order record. Nothing is sent to the supplier. A human must send it.
          </p>
        ) : null}
        <div>
          <label className="label">Reason {approve ? '(optional)' : '(required)'}</label>
          <textarea className="input" rows={3} {...register('reason')} />
          <FieldError msg={errors.reason?.message} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={mut.isPending} className={approve ? 'btn btn-primary' : 'btn btn-danger'}>
            {mut.isPending ? 'Submitting…' : approve ? 'Approve' : 'Reject'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
