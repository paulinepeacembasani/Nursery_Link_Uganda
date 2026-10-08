import { feedbackKinds, feedbackStatuses, type FeedbackStatus } from '@nurserylink/shared';
import { Badge, Button, Select, formatDateTime, toast } from '@nurserylink/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { ReasonDialog } from '../components/ReasonDialog';
import { en } from '../copy/en';
import { useFeedback, useUpdateFeedback, type AdminFeedback } from '../features/feedback/api';
import { toastError } from '../lib/errors';
import { usePage, useParam } from '../lib/params';

const STATUS_TONE = { new: 'info', read: 'neutral', done: 'positive' } as const;
const KIND_TONE = { experience: 'neutral', suggestion: 'info', problem: 'danger' } as const;
const t = en.feedback;

/** Feedback from the public site's /feedback page: opens on New, so unread messages come first. */
const Feedback = () => {
  const [status, setStatus] = useParam('status');
  const [kind, setKind] = useParam('kind');
  const [page, setPage] = usePage();
  const statusFilter = status === null ? 'new' : status === 'all' ? null : (feedbackStatuses.find(s => s === status) ?? 'new');
  const kindFilter = feedbackKinds.find(k => k === kind) ?? null;
  const list = useFeedback({ status: statusFilter, kind: kindFilter }, page);
  const update = useUpdateFeedback();
  const [closing, setClosing] = useState<AdminFeedback | null>(null);

  const columns = useMemo<ColumnDef<AdminFeedback>[]>(() => {
    const mark = (f: AdminFeedback, next: FeedbackStatus) => {
      update.mutate({ id: f.id, status: next }, { onSuccess: () => { toast.success(t.toast(t.statuses[next])); }, onError: toastError });
    };
    return [
      { header: t.columns.kind, cell: ({ row }) => <Badge tone={KIND_TONE[row.original.kind]}>{t.kinds[row.original.kind]}</Badge> },
      { header: t.columns.message, cell: ({ row }) => <p className="max-w-md text-sm whitespace-pre-wrap">{row.original.message}</p> },
      {
        header: t.columns.from,
        cell: ({ row }) => (
          <span className="flex flex-col text-xs">
            <span className="font-bold">{row.original.name ?? t.anonymous}</span>
            {row.original.contact && <span>{row.original.contact}</span>}
            {row.original.user_id && <span className="text-bark-muted">{t.account}</span>}
          </span>
        ),
      },
      { header: t.columns.page, cell: ({ row }) => <span className="text-xs">{row.original.page ?? '—'}</span> },
      { header: t.columns.date, cell: ({ row }) => formatDateTime(row.original.created_at) },
      { header: t.columns.status, cell: ({ row }) => <Badge tone={STATUS_TONE[row.original.status]}>{t.statuses[row.original.status]}</Badge> },
      { header: t.columns.note, cell: ({ row }) => <span className="block max-w-xs text-xs">{row.original.admin_note ?? '—'}</span> },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <span className="flex flex-wrap gap-1">
            {row.original.status === 'new' && <Button size="sm" variant="secondary" onClick={() => { mark(row.original, 'read'); }}>{t.markRead}</Button>}
            {row.original.status !== 'done' && <Button size="sm" onClick={() => { setClosing(row.original); }}>{t.markDone}</Button>}
            {row.original.status === 'done' && <Button size="sm" variant="ghost" onClick={() => { mark(row.original, 'new'); }}>{t.reopen}</Button>}
          </span>
        ),
      },
    ];
  }, [update]);

  return (
    <div>
      <PageHeader title={t.title} intro={t.intro} />
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-md bg-paper p-4 ring-1 ring-line">
        <label className="flex items-center gap-2 text-sm">
          {t.status}
          <Select className="min-h-9 w-40 text-sm" value={status ?? 'new'} onChange={e => { setStatus(e.target.value === 'new' ? null : e.target.value); }}>
            {feedbackStatuses.map(s => <option key={s} value={s}>{t.statuses[s]}</option>)}
            <option value="all">{en.common.all}</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t.kind}
          <Select className="min-h-9 w-48 text-sm" value={kind ?? ''} onChange={e => { setKind(e.target.value || null); }}>
            <option value="">{t.allKinds}</option>
            {feedbackKinds.map(k => <option key={k} value={k}>{t.kinds[k]}</option>)}
          </Select>
        </label>
      </div>
      <DataTable columns={columns} data={list.data?.data} loading={list.isPending} error={list.error} onRetry={() => { void list.refetch(); }} getRowId={r => r.id} page={page} total={list.data?.meta.total ?? 0} limit={25} onPage={setPage} />
      <ReasonDialog
        open={closing !== null}
        onOpenChange={o => { if (!o) setClosing(null); }}
        title={t.doneTitle}
        confirmLabel={t.markDone}
        optional
        label={t.noteLabel}
        busy={update.isPending}
        onConfirm={note => {
          if (!closing) return;
          update.mutate({ id: closing.id, status: 'done', note }, {
            onSuccess: () => { toast.success(t.toast(t.statuses.done)); setClosing(null); },
            onError: toastError,
          });
        }}
      />
    </div>
  );
};
export default Feedback;
