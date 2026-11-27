import { z } from 'zod';
import { EVENT_TYPES } from '../api/types';

// Client-side validation is a convenience; the server's REJECTED text is the source of truth.
export const eventSchema = z
  .object({
    event_id: z.string().min(1, 'Required'),
    event_type: z.enum(EVENT_TYPES as [string, ...string[]]),
    timestamp: z.string().min(1, 'Required'),
    source: z.string().min(1, 'Required'),
    material_id: z.string().optional(),
    quantity: z.number().optional(),
    order_id: z.string().optional(),
    po_id: z.string().optional(),
    delay_days: z.number().optional(),
  })
  .superRefine((e, ctx) => {
    const need = (field: keyof typeof e, msg = 'Required') => {
      const v = e[field];
      if (v === undefined || v === null || v === '' || (typeof v === 'number' && Number.isNaN(v))) {
        ctx.addIssue({ code: 'custom', path: [field], message: msg });
        return false;
      }
      return true;
    };
    switch (e.event_type) {
      case 'INVENTORY_RECEIVED':
      case 'INVENTORY_ISSUED':
        need('material_id');
        if (need('quantity') && (e.quantity as number) <= 0)
          ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Must be greater than 0' });
        break;
      case 'INVENTORY_ADJUSTED':
        need('material_id');
        need('quantity');
        break;
      case 'ORDER_CREATED':
      case 'ORDER_UPDATED':
        need('order_id');
        break;
      case 'PO_CONFIRMED':
        need('po_id');
        break;
      case 'SUPPLIER_DELAY':
        need('po_id');
        need('delay_days');
        break;
    }
  });

export const eventBatchSchema = z.array(eventSchema).min(1, 'Provide at least one event');

export const decisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE'), reason: z.string().optional() }),
  z.object({ decision: z.literal('REJECT'), reason: z.string().min(5, 'Reason is required (min 5 characters)') }),
]);

export const newOrderSchema = z.object({
  order_id: z.string().min(2, 'Required').regex(/^[A-Za-z0-9_.:-]+$/, 'Letters, numbers, _ . : - only'),
  product: z.string().min(1, 'Required'),
  qty: z.number({ invalid_type_error: 'Required' }).int().positive('Must be greater than 0'),
  crd: z.string().min(1, 'Required'),
});
export type NewOrderForm = z.infer<typeof newOrderSchema>;

export const askSchema = z.object({ question: z.string().min(3) });
