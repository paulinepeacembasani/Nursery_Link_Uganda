import { SERVICE_REQUEST_TRANSITIONS, serviceRequestStatuses, serviceTypes, type ServiceRequestStatus } from '@nurserylink/shared';
import { Badge, Button, Select, formatDateTime, formatPhone, toast } from '@nurserylink/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import { ReasonDialog } from '../components/ReasonDialog';
import { en } from '../copy/en';
import { useServiceRequests, useUpdateServiceRequest, type AdminServiceRequest } from '../features/serviceRequests/api';
import { toastError } from '../lib/errors';
import { usePage, useParam } from '../lib/params';

type NextStatus = Exclude<ServiceRequestStatus, 'new'>;
type Decision = { req: AdminServiceRequest; status: NextStatus };
const TONE = { new: 'info', contacted: 'neutral', scheduled: 'positive', done: 'positive', cancelled: 'neutral' } as const;
const t = en.serviceRequests;

/** Queue of service requests: opens on New, so the people waiting for a call come first. */
const ServiceRequests = () => {
  const [status, setStatus] = useParam('status');
  const [service, setService] = useParam('service');
  const [page, setPage] = usePage();
  const statusFilter = status === null ? 'new' : status === 'all' ? null : (serviceRequestStatuses.find(s => s === status) ?? 'new');
  const serviceFilter = serviceTypes.find(s => s === service) ?? null;
  const list = useServiceRequests({ status: statusFilter, service: serviceFilter }, page);
  const update = useUpdateServiceRequest();
  const [decision, setDecision] = useState<Decision | null>(null);

  const columns = useMemo<ColumnDef<AdminServiceRequest>[]>(() => [
    {
      header: t.columns.requester,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-bold">{row.original.requester.full_name}</span>
          <a href={`tel:${row.original.requester.phone}`} className="text-xs">{formatPhone(row.original.requester.phone)}</a>
        </span>
      ),
    },
    { header: t.columns.service, cell: ({ row }) => t.services[row.original.service] },
    {
      header: t.columns.where,
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{row.original.location}</span>
          {row.original.land_acres !== null && <span className="text-xs text-bark-muted">{t.acres(String(row.original.land_acres))}</span>}
        </span>
      ),
    },
    { header: t.columns.notes, cell: ({ row }) => <span className="block max-w-xs text-xs">{row.original.notes ?? '—'}</span> },
    { header: t.columns.date, cell: ({ row }) => formatDateTime(row.original.created_at) },
    { header: t.columns.status, cell: ({ row }) => <Badge tone={TONE[row.original.status]}>{t.statuses[row.original.status]}</Badge> },
    { header: t.columns.note, cell: ({ row }) => <span className="block max-w-xs text-xs">{row.original.admin_note ?? '—'}</span> },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          {SERVICE_REQUEST_TRANSITIONS[row.original.status].map(next => (
            <Button
              key={next}
              size="sm"
              variant={next === 'cancelled' ? 'ghost' : next === 'done' ? 'primary' : 'secondary'}
              onClick={() => { setDecision({ req: row.original, status: next as NextStatus }); }}
            >
              {t.actions[next as NextStatus]}
            </Button>
          ))}
        </span>
      ),
    },
  ], []);

  return (
    <div>
      <PageHeader title={t.title} intro={t.intro} />
      <div className="mb-4 flex flex-wrap items-center gap-4 rounded-md bg-paper p-4 ring-1 ring-line">
        <label className="flex items-center gap-2 text-sm">
          {t.status}
          <Select className="min-h-9 w-40 text-sm" value={status ?? 'new'} onChange={e => { setStatus(e.target.value === 'new' ? null : e.target.value); }}>
            {serviceRequestStatuses.map(s => <option key={s} value={s}>{t.statuses[s]}</option>)}
            <option value="all">{en.common.all}</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t.service}
          <Select className="min-h-9 w-56 text-sm" value={service ?? ''} onChange={e => { setService(e.target.value || null); }}>
            <option value="">{t.allServices}</option>
            {serviceTypes.map(s => <option key={s} value={s}>{t.services[s]}</option>)}
          </Select>
        </label>
      </div>
      <DataTable columns={columns} data={list.data?.data} loading={list.isPending} error={list.error} onRetry={() => { void list.refetch(); }} getRowId={r => r.id} page={page} total={list.data?.meta.total ?? 0} limit={25} onPage={setPage} />
      <ReasonDialog
        open={decision !== null}
        onOpenChange={o => { if (!o) setDecision(null); }}
        title={decision ? `${t.actions[decision.status]}: ${decision.req.requester.full_name} (${t.services[decision.req.service]})` : ''}
        confirmLabel={decision ? t.actions[decision.status] : ''}
        danger={decision?.status === 'cancelled'}
        optional
        label={t.noteLabel}
        busy={update.isPending}
        onConfirm={note => {
          if (!decision) return;
          update.mutate({ id: decision.req.id, status: decision.status, note }, {
            onSuccess: () => {
              toast.success(t.toast(t.statuses[decision.status]));
              setDecision(null);
            },
            onError: toastError,
          });
        }}
      />
    </div>
  );
};
export default ServiceRequests;
