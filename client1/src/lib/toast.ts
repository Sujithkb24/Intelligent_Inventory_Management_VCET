export interface ToastItem {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
}

type Listener = (t: ToastItem[]) => void;

let list: ToastItem[] = [];
let counter = 0;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l(list));

export function toast(text: string, kind: ToastItem['kind'] = 'info'): void {
  const item = { id: ++counter, kind, text };
  list = [...list, item];
  emit();
  setTimeout(() => {
    list = list.filter((x) => x.id !== item.id);
    emit();
  }, 4500);
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(list);
  return () => {
    listeners.delete(l);
  };
}
