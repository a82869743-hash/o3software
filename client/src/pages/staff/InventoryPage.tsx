import { useState } from 'react';
import { Package, AlertTriangle } from 'lucide-react';
import { useInventory } from '../../api/hooks/useInventory';
import SearchInput from '../../components/ui/SearchInput';
import DataTable, { Column } from '../../components/ui/DataTable';
import EmptyState from '../../components/shared/EmptyState';

export default function StaffInventoryPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useInventory({ search, page, limit: 50 });

  const columns: Column<any>[] = [
    {
      key: 'product_name',
      header: 'Product Name',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.is_low_stock && (
            <div className="w-1.5 h-8 bg-gradient-to-b from-amber-400 to-amber-500 rounded-full shrink-0" />
          )}
          <span className="font-bold text-[#0F172A]">{row.product_name}</span>
        </div>
      ),
    },
    { key: 'unit', header: 'Unit' },
    {
      key: 'quantity',
      header: 'Quantity',
      render: (row) => <span className="font-bold text-lg">{parseFloat(row.quantity)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => row.is_low_stock ? (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          <AlertTriangle size={10} /> Low Stock
        </span>
      ) : (
        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200">
          OK
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-8" style={{ borderImage: 'linear-gradient(to bottom, #1D4ED8, #2563EB) 1' }}>
        <div className="border-l-4 pl-6" style={{ borderImage: 'linear-gradient(to bottom, #1D4ED8, #2563EB) 1' }}>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#0F172A] uppercase">Inventory</h2>
          <p className="text-sm text-[#5f5e5e] mt-1">{data?.pagination?.total || 0} products</p>
        </div>
      </div>

      <div className="mb-6">
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search products..."
          className="sm:w-80"
        />
      </div>

      {!isLoading && !data?.data?.length ? (
        <EmptyState icon={Package} title="No Products Found" description="Try a different search" />
      ) : (
        <DataTable
          columns={columns}
          data={data?.data || []}
          loading={isLoading}
          pagination={data?.pagination ? {
            page: data.pagination.page,
            limit: data.pagination.limit,
            total: data.pagination.total,
            onPageChange: setPage,
          } : undefined}
        />
      )}
    </div>
  );
}
