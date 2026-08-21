import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, Trash2 } from 'lucide-react';
import { useJobCarts } from '../../api/hooks/useJobCarts';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import SearchInput from '../../components/ui/SearchInput';
import Tabs from '../../components/ui/Tabs';
import DataTable, { Column } from '../../components/ui/DataTable';
import StatusBadge from '../../components/shared/StatusBadge';
import EmptyState from '../../components/shared/EmptyState';
import { formatINR, formatDate } from '../../utils/formatters';
import api from '../../api/axiosInstance';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import ConfirmModal from '../../components/ui/ConfirmModal';

const statusTabs = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'open', label: 'Open' },
  { key: 'complete', label: 'Complete' },
];

export default function JobCartListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useJobCarts({ search, status, page, limit });
  const queryClient = useQueryClient();
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleDeleteClick = (id: number) => {
    setCancelTargetId(id);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTargetId) return;
    setCancelling(true);
    try {
      await api.delete(`/job-carts/${cancelTargetId}`);
      toast.success('Job card cancelled');
      setCancelTargetId(null);
      queryClient.invalidateQueries({ queryKey: ['job-carts'] });
    } catch {
      toast.error('Failed to cancel job card');
    } finally {
      setCancelling(false);
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'registration_no',
      header: 'Vehicle',
      render: (row) => (
        <div>
          <span className="font-bold text-[#0F172A] tracking-wide">{row.registration_no}</span>
          <p className="text-[11px] text-[#5f5e5e] mt-0.5">{row.brand} {row.model}</p>
        </div>
      ),
    },
    { key: 'customer_name', header: 'Customer' },
    {
      key: 'visit_date',
      header: 'Date',
      render: (row) => <span className="text-[#5f5e5e]">{formatDate(row.visit_date)}</span>,
    },
    {
      key: 'visit_number',
      header: 'Visit #',
      render: (row) => (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#f6f3f2] text-xs font-bold text-[#0F172A]">
          {row.visit_number}
        </span>
      ),
    },
    {
      key: 'services_count',
      header: 'Services',
      render: (row) => <span className="text-[#5f5e5e]">{row.services_count}</span>,
    },
    {
      key: 'total_amount',
      header: 'Total',
      render: (row) => <span className="font-bold">{formatINR(row.total_amount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: '',
      render: (row) => row.status !== 'cancelled' ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleDeleteClick(row.id); }}
          className="p-1.5 rounded hover:bg-blue-50 transition-colors"
          title="Cancel Job Card"
        >
          <Trash2 size={14} className="text-gray-400 hover:text-blue-500" />
        </button>
      ) : null,
    },
  ];

  return (
    <>
      <AdminTopBar
        title="Job Cards"
        subtitle={`${data?.pagination?.total || 0} total cards`}
        actions={
          <Button
            onClick={() => navigate('/admin/job-carts/new')}
            icon={<Plus size={16} />}
          >
            New Job Card
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search by reg no, customer, brand..."
          className="sm:w-80"
        />
        <Tabs
          tabs={statusTabs}
          activeTab={status}
          onTabChange={(t) => { setStatus(t); setPage(1); }}
        />
      </div>

      {/* Table */}
      {!isLoading && !data?.data?.length ? (
        <EmptyState
          icon={ClipboardList}
          title="No Job Cards Found"
          description={search || status !== 'all' ? 'Try changing your filters' : 'Create your first job card to get started'}
          actionLabel={!search && status === 'all' ? '+ New Job Card' : undefined}
          onAction={!search && status === 'all' ? () => navigate('/admin/job-carts/new') : undefined}
        />
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <div className="min-w-[950px] p-4 sm:p-0">
            <DataTable
              columns={columns}
              data={data?.data || []}
              loading={isLoading}
              onRowClick={(row) => navigate(`/admin/job-carts/${row.id}`)}
              pagination={data?.pagination ? {
                page: data.pagination.page,
                limit: data.pagination.limit,
                total: data.pagination.total,
                onPageChange: setPage,
              } : undefined}
            />
          </div>
        </div>
      )}

      <ConfirmModal
        open={cancelTargetId !== null}
        onClose={() => setCancelTargetId(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel Job Card"
        description="Are you sure you want to cancel this job card? It will be moved to the Recycle Bin."
        confirmText="Cancel Job Card"
        isDestructive={true}
        loading={cancelling}
      />
    </>
  );
}
