import { useState, useEffect } from 'react';
import { FranchiseUsersPanel, PriceVisibilityPanel } from '../../components/admin/SuperAdminAccessPanel';
import {
  Building2, Plus, Edit3, Power, CheckCircle, AlertCircle,
  MapPin, Phone, Mail, Clock, DollarSign, Users, ClipboardList,
  CalendarCheck, Package, Sparkles, RefreshCw, ChevronRight, Shield,
  Eye, UserPlus, Key, Trash2, Check, Lock, Layers
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import AdminHero from '../../components/admin/AdminHero';
import Input from '../../components/ui/Input';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

interface Franchise {
  id: number;
  name: string;
  code: string;
  plan_tier?: 'basic' | 'pro' | 'enterprise';
  address?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  city?: string;
  state?: string;
  upi_id?: string;
  upi_name?: string;
  qr_image_url?: string;
  logo_url?: string;
  slot_duration_minutes?: number;
  opening_time?: string;
  closing_time?: string;
  is_active: number;
  created_at?: string;
  stats?: {
    total_job_cards: number;
    completed_job_cards: number;
    total_bookings: number;
    staff_count: number;
  };
}

interface ConsolidatedOverview {
  summary: {
    total_franchises: number;
    active_franchises: number;
    grand_revenue: number;
    grand_jobs: number;
    grand_bookings: number;
    grand_customers: number;
    grand_inventory_items: number;
    grand_stock_valuation: number;
  };
  franchises: Array<{
    franchise_id: number;
    name: string;
    code: string;
    city: string;
    is_active: number;
    revenue: number;
    job_cards: {
      total: number;
      completed: number;
      in_progress: number;
      pending: number;
    };
    bookings: {
      total: number;
      confirmed: number;
      pending: number;
      completed: number;
    };
    customers: number;
    staff: number;
    inventory: {
      count: number;
      valuation: number;
    };
  }>;
}

export default function FranchiseManagementPage() {
  const toast = useUIStore((s) => s.toast);

  const [activeTab, setActiveTab] = useState<'locations' | 'overview' | 'settings' | 'entitlements' | 'users' | 'prices'>('locations');
  const [franchises, setFranchises] = useState<Franchise[]>([]);
  const [overview, setOverview] = useState<ConsolidatedOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'disabled'>('all');

  // Create / Edit modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    gstin: '',
    upi_id: '',
    upi_name: '',
    slot_duration_minutes: 60,
    opening_time: '09:00:00',
    closing_time: '20:00:00',
    plan_tier: 'enterprise',
  });

  // Per-franchise settings tab state
  const [selectedSettingFid, setSelectedSettingFid] = useState<number>(1);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-franchise Entitlements state
  const [selectedEntitlementFid, setSelectedEntitlementFid] = useState<number>(1);
  const [entitlementsData, setEntitlementsData] = useState<any>(null);
  const [loadingEntitlements, setLoadingEntitlements] = useState(false);
  const [savingEntitlements, setSavingEntitlements] = useState(false);
  const [applyingPreset, setApplyingPreset] = useState(false);

  // Create Owner Account modal state
  const [isOwnerModalOpen, setIsOwnerModalOpen] = useState(false);
  const [ownerTargetFranchise, setOwnerTargetFranchise] = useState<Franchise | null>(null);
  const [ownerFormData, setOwnerFormData] = useState({ name: '', mobile: '', email: '', password: '' });
  const [creatingOwner, setCreatingOwner] = useState(false);

  // Fetch franchise list
  const fetchFranchises = async () => {
    try {
      setLoading(true);
      const res = await api.get('/franchises');
      if (res.data.success) {
        setFranchises(res.data.data || []);
      }
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to load franchises');
    } finally {
      setLoading(false);
    }
  };

  // Fetch consolidated overview
  const fetchOverview = async () => {
    try {
      const res = await api.get('/franchises/consolidated/overview');
      if (res.data.success) {
        setOverview(res.data.data);
      }
    } catch (err: any) {
      console.warn('Consolidated overview error:', err.message);
    }
  };

  // Fetch settings for a specific franchise
  const fetchFranchiseSettings = async (fid: number) => {
    try {
      setLoadingSettings(true);
      const res = await api.get(`/franchises/${fid}/settings`);
      if (res.data.success) {
        setSettingsData(res.data.data);
      }
    } catch (err: any) {
      toast('error', 'Failed to load franchise settings');
    } finally {
      setLoadingSettings(false);
    }
  };

  // Fetch entitlements for a specific franchise
  const fetchEntitlements = async (fid: number) => {
    try {
      setLoadingEntitlements(true);
      const res = await api.get(`/franchises/${fid}/entitlements`);
      if (res.data.success) {
        setEntitlementsData(res.data.data);
      }
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to load feature entitlements');
    } finally {
      setLoadingEntitlements(false);
    }
  };

  useLiveReload(() => { fetchFranchises(); fetchOverview(); }); // reload when anything changes elsewhere
  useEffect(() => {
    fetchFranchises();
    fetchOverview();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings' && selectedSettingFid) {
      fetchFranchiseSettings(selectedSettingFid);
    }
  }, [activeTab, selectedSettingFid]);

  useEffect(() => {
    if (activeTab === 'entitlements' && selectedEntitlementFid) {
      fetchEntitlements(selectedEntitlementFid);
    }
  }, [activeTab, selectedEntitlementFid]);

  const handleApplyPreset = async (preset: 'basic' | 'pro' | 'enterprise') => {
    if (!window.confirm(`Apply ${preset.toUpperCase()} preset? This will overwrite module enablements with the ${preset.toUpperCase()} defaults.`)) {
      return;
    }
    try {
      setApplyingPreset(true);
      const res = await api.post(`/franchises/${selectedEntitlementFid}/entitlements/preset`, { preset });
      toast('success', res.data.message || `Applied ${preset.toUpperCase()} preset`);
      fetchEntitlements(selectedEntitlementFid);
      fetchFranchises();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to apply preset');
    } finally {
      setApplyingPreset(false);
    }
  };

  // switch every module on / off for this studio (each keeps its full set of actions when on)
  const setAllModules = (on: boolean) => {
    if (!entitlementsData) return;
    const next: Record<string, any> = {};
    for (const m of (entitlementsData.catalog || []) as any[]) {
      if (!m.key) continue;
      next[m.key] = { ...(entitlementsData.entitlements?.[m.key] || {}), is_enabled: on, actions: on ? (m.actions || []) : [] };
    }
    setEntitlementsData({ ...entitlementsData, entitlements: { ...entitlementsData.entitlements, ...next } });
  };

  const handleToggleModule = (featKey: string) => {
    if (!entitlementsData) return;
    const current = entitlementsData.entitlements[featKey] || { is_enabled: false, actions: [] };
    const isEnabled = !current.is_enabled;
    setEntitlementsData({
      ...entitlementsData,
      entitlements: {
        ...entitlementsData.entitlements,
        [featKey]: {
          ...current,
          is_enabled: isEnabled,
        }
      }
    });
  };

  const handleToggleAction = (featKey: string, action: string) => {
    if (!entitlementsData) return;
    const current = entitlementsData.entitlements[featKey] || { is_enabled: true, actions: [] };
    const curActions: string[] = current.actions || [];
    const newActions = curActions.includes(action)
      ? curActions.filter((a: string) => a !== action)
      : [...curActions, action];

    setEntitlementsData({
      ...entitlementsData,
      entitlements: {
        ...entitlementsData.entitlements,
        [featKey]: {
          ...current,
          actions: newActions
        }
      }
    });
  };

  const handleSaveEntitlements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entitlementsData) return;
    try {
      setSavingEntitlements(true);
      const res = await api.put(`/franchises/${selectedEntitlementFid}/entitlements`, {
        entitlements: entitlementsData.entitlements,
        plan_tier: entitlementsData.plan_tier,
      });
      toast('success', res.data.message || 'Feature entitlements updated successfully');
      fetchEntitlements(selectedEntitlementFid);
      fetchFranchises();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to save entitlements');
    } finally {
      setSavingEntitlements(false);
    }
  };

  const handleImpersonate = async (f: Franchise) => {
    if (!window.confirm(`Impersonate franchise "${f.name}"? You will enter their operational view with full audit logging.`)) {
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const currentUser = useAuthStore.getState().user;
      if (token && currentUser) {
        sessionStorage.setItem('super_admin_backup_token', token);
        sessionStorage.setItem('super_admin_backup_user', JSON.stringify(currentUser));
      }
      const res = await api.post(`/franchises/${f.id}/impersonate`);
      if (res.data.success) {
        useAuthStore.getState().login(res.data.data.token, res.data.data.impersonating_user);
        localStorage.setItem('active_franchise_id', String(f.id));
        toast('success', `Impersonating ${f.name}`);
        window.location.href = '/admin';
      }
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to generate impersonation session');
    }
  };

  const handleSoftDelete = async (f: Franchise) => {
    if (f.id === 1) {
      toast('error', 'Main Studio Headquarters cannot be deleted');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete/archive franchise "${f.name}"? This action disables branch access.`)) {
      return;
    }
    try {
      const res = await api.delete(`/franchises/${f.id}`);
      toast('success', res.data.message || 'Franchise archived successfully');
      fetchFranchises();
      fetchOverview();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to delete franchise');
    }
  };

  const handleOpenOwnerModal = (f: Franchise) => {
    setOwnerTargetFranchise(f);
    setOwnerFormData({ name: '', mobile: '', email: '', password: '' });
    setIsOwnerModalOpen(true);
  };

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerTargetFranchise) return;
    if (!ownerFormData.name || !ownerFormData.mobile || !ownerFormData.password) {
      toast('error', 'Owner name, mobile, and initial password are required');
      return;
    }
    try {
      setCreatingOwner(true);
      const res = await api.post(`/franchises/${ownerTargetFranchise.id}/owner`, ownerFormData);
      toast('success', res.data.message || 'Franchise Owner account created successfully');
      setIsOwnerModalOpen(false);
      fetchFranchises();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to create franchise owner account');
    } finally {
      setCreatingOwner(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormData({
      name: '',
      code: '',
      address: '',
      phone: '',
      email: '',
      city: '',
      state: '',
      gstin: '',
      upi_id: '',
      upi_name: '',
      slot_duration_minutes: 60,
      opening_time: '09:00:00',
      closing_time: '20:00:00',
      plan_tier: 'enterprise',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (f: Franchise) => {
    setModalMode('edit');
    setEditingId(f.id);
    setFormData({
      name: f.name || '',
      code: f.code || '',
      address: f.address || '',
      phone: f.phone || '',
      email: f.email || '',
      city: f.city || '',
      state: f.state || '',
      gstin: f.gstin || '',
      upi_id: f.upi_id || '',
      upi_name: f.upi_name || '',
      slot_duration_minutes: f.slot_duration_minutes || 60,
      opening_time: f.opening_time || '09:00:00',
      closing_time: f.closing_time || '20:00:00',
      plan_tier: (f as any).plan_tier || 'enterprise',
    });
    setIsModalOpen(true);
  };

  const handleSaveFranchise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      toast('error', 'Franchise name and unique code are required');
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        const res = await api.post('/franchises', formData);
        toast('success', `${res.data.message || 'Franchise created'}. Now choose exactly what this studio can use.`);
        // straight to its module access, so the Super Admin decides access while setting it up
        if (res.data.data?.id) { setSelectedEntitlementFid(res.data.data.id); setActiveTab('entitlements'); }
      } else if (editingId) {
        const res = await api.put(`/franchises/${editingId}`, formData);
        toast('success', res.data.message || 'Franchise updated successfully');
      }
      setIsModalOpen(false);
      fetchFranchises();
      fetchOverview();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (f: Franchise) => {
    if (f.id === 1) {
      toast('error', 'Main Studio Branch cannot be disabled');
      return;
    }
    const action = f.is_active === 1 ? 'disable' : 'enable';
    if (!window.confirm(`Are you sure you want to ${action} franchise "${f.name}"?`)) {
      return;
    }
    try {
      const res = await api.patch(`/franchises/${f.id}/status`);
      toast('success', res.data.message || `Franchise ${action}d`);
      fetchFranchises();
      fetchOverview();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to toggle status');
    }
  };

  const handleSwitchWorkspace = (fid: number, name: string) => {
    localStorage.setItem('active_franchise_id', String(fid));
    toast('success', `Switched active workspace to ${name}`);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsData) return;
    setSavingSettings(true);
    try {
      await api.put(`/franchises/${selectedSettingFid}/settings`, {
        franchise: settingsData.franchise,
        settings: settingsData.settings,
      });
      toast('success', 'Franchise settings saved successfully');
      fetchFranchises();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSavingSettings(false);
    }
  };

  // Filtered franchise list
  const filteredFranchises = franchises.filter((f) => {
    const matchesSearch =
      (f.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (f.city || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && f.is_active === 1) ||
      (filterStatus === 'disabled' && f.is_active === 0);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <AdminHero title={'Super Admin — Franchise Network'} subtitle={'Manage multi-tenant studio locations, configure branch settings, and view cross-franchise metrics.'} />
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">

            
          </div>
          
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              fetchFranchises();
              fetchOverview();
            }}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            variant="primary"
            onClick={openCreateModal}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Franchise
          </Button>
        </div>
      </div>

      {/* ── View Navigation Tabs ── */}
      <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto no-scrollbar [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          onClick={() => setActiveTab('locations')}
          className={`py-3 px-5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'locations'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Franchise Locations ({franchises.length})
        </button>

        <button
          onClick={() => setActiveTab('overview')}
          className={`py-3 px-5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Consolidated Overview
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`py-3 px-5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          Per-Franchise Settings & Branding
        </button>

        <button
          onClick={() => setActiveTab('entitlements')}
          className={`py-3 px-5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
            activeTab === 'entitlements'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Key className="w-4 h-4" />
          Module Access (per franchise)
        </button>

        {(['users', 'prices'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`py-3 px-5 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === t ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'users' ? 'Logins & Admins' : 'Price Visibility'}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <FranchiseUsersPanel franchises={franchises.filter((f: any) => !f.is_deleted)} />}
      {activeTab === 'prices' && <PriceVisibilityPanel />}

      {/* ── TAB 1: FRANCHISE LOCATIONS ── */}
      {activeTab === 'locations' && (
        <div className="space-y-6">
          {/* Filters bar */}
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white dark:bg-[#1E293B] p-4 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="w-full sm:w-72">
              <Input
                placeholder="Search by name, code or city..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-gray-500 font-medium">Status:</span>
              <Dropdown
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-gray-800 dark:text-gray-200"
              >
                <option value="all">All Locations</option>
                <option value="active">Active Only</option>
                <option value="disabled">Disabled Only</option>
              </Dropdown>
            </div>
          </div>

          {/* Franchise Cards Grid */}
          {loading ? (
            <div className="py-12 text-center text-gray-500">Loading franchises...</div>
          ) : filteredFranchises.length === 0 ? (
            <div className="py-12 text-center text-gray-500 bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-gray-800">
              No franchises match the search filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFranchises.map((f) => (
                <div
                  key={f.id}
                  className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
                >
                  {/* Card Header */}
                  <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base">
                          {f.name}
                        </h3>
                        {f.id === 1 && (
                          <span className="text-xs px-2 py-0.5 rounded font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            Headquarters
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-gray-600 dark:text-gray-300">
                          #{f.code}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-extrabold uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                          {f.plan_tier || 'PRO'} TIER
                        </span>
                        {f.is_active === 1 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                            <CheckCircle className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-500 font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> Disabled
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm">
                      {f.code.slice(0, 3)}
                    </div>
                  </div>

                  {/* Card Details */}
                  <div className="p-5 space-y-3 flex-1 text-sm text-gray-600 dark:text-gray-300">
                    {f.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">
                          {f.address}{f.city ? `, ${f.city}` : ''}
                        </span>
                      </div>
                    )}
                    {f.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>{f.phone}</span>
                      </div>
                    )}
                    {f.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">{f.email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        Hours: {f.opening_time || '09:00'} - {f.closing_time || '20:00'} ({f.slot_duration_minutes || 60}m slots)
                      </span>
                    </div>

                    {/* Stats pills */}
                    {f.stats && (
                      <div className="pt-3 grid grid-cols-3 gap-2 border-t border-gray-100 dark:border-gray-800 text-center">
                        <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg">
                          <p className="text-xs text-gray-400">Job Cards</p>
                          <p className="font-bold text-gray-800 dark:text-gray-100">
                            {f.stats.total_job_cards}
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg">
                          <p className="text-xs text-gray-400">Bookings</p>
                          <p className="font-bold text-gray-800 dark:text-gray-100">
                            {f.stats.total_bookings}
                          </p>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg">
                          <p className="text-xs text-gray-400">Staff</p>
                          <p className="font-bold text-gray-800 dark:text-gray-100">
                            {f.stats.staff_count}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 flex-wrap">
                    <button
                      onClick={() => handleSwitchWorkspace(f.id, f.name)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline flex items-center gap-1"
                    >
                      Enter Workspace <ChevronRight className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleImpersonate(f)}
                        className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        title="Impersonate Franchise Studio (Audited)"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleOpenOwnerModal(f)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                        title="Create Franchise Owner Account"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedEntitlementFid(f.id);
                          setActiveTab('entitlements');
                        }}
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        title="Configure Feature Entitlements"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEditModal(f)}
                        className="p-1.5"
                        title="Edit Details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </Button>

                      {f.id !== 1 && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleStatus(f)}
                            className={`p-1.5 ${f.is_active === 1 ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                            title={f.is_active === 1 ? 'Disable Franchise' : 'Enable Franchise'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSoftDelete(f)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                            title="Delete Franchise"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: CONSOLIDATED CROSS-FRANCHISE OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {overview ? (
            <>
              {/* Summary Metric Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#1E293B] p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Revenue</span>
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    ₹{overview.summary.grand_revenue.toLocaleString('en-IN')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Cross-network combined</p>
                </div>

                <div className="bg-white dark:bg-[#1E293B] p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Job Cards</span>
                    <ClipboardList className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {overview.summary.grand_jobs}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Completed & In-service</p>
                </div>

                <div className="bg-white dark:bg-[#1E293B] p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Bookings</span>
                    <CalendarCheck className="w-4 h-4 text-indigo-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {overview.summary.grand_bookings}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Scheduled appointments</p>
                </div>

                <div className="bg-white dark:bg-[#1E293B] p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Active Studios</span>
                    <Building2 className="w-4 h-4 text-amber-500" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {overview.summary.active_franchises} / {overview.summary.total_franchises}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">Operational branches</p>
                </div>
              </div>

              {/* Comparative Table */}
              <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <h3 className="font-bold text-gray-900 dark:text-white">
                    Studio Breakdown & Performance Comparison
                  </h3>
                  <span className="text-xs text-gray-400">Live multi-tenant data</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 border-b border-gray-100 dark:border-gray-800">
                        <th className="py-3 px-4 font-semibold">Franchise</th>
                        <th className="py-3 px-4 font-semibold">City</th>
                        <th className="py-3 px-4 font-semibold">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Revenue</th>
                        <th className="py-3 px-4 font-semibold text-center">Jobs (Done/Total)</th>
                        <th className="py-3 px-4 font-semibold text-center">Bookings</th>
                        <th className="py-3 px-4 font-semibold text-center">Customers</th>
                        <th className="py-3 px-4 font-semibold text-center">Staff</th>
                        <th className="py-3 px-4 font-semibold text-right">Inventory Val.</th>
                        <th className="py-3 px-4 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {overview.franchises.map((f) => (
                        <tr key={f.franchise_id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                          <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">
                            <div>{f.name}</div>
                            <div className="text-xs font-mono text-gray-400">#{f.code}</div>
                          </td>
                          <td className="py-3 px-4 text-gray-600 dark:text-gray-300">
                            {f.city || '—'}
                          </td>
                          <td className="py-3 px-4">
                            {f.is_active === 1 ? (
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Active
                              </span>
                            ) : (
                              <span className="text-xs font-medium px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                                Disabled
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                            ₹{f.revenue.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-semibold text-emerald-600">{f.job_cards.completed}</span>
                            <span className="text-gray-400"> / {f.job_cards.total}</span>
                          </td>
                          <td className="py-3 px-4 text-center font-medium">
                            {f.bookings.total}
                          </td>
                          <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">
                            {f.customers}
                          </td>
                          <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-300">
                            {f.staff}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-gray-700 dark:text-gray-300">
                            ₹{f.inventory.valuation.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleSwitchWorkspace(f.franchise_id, f.name)}
                              className="text-xs px-2.5 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 font-medium"
                            >
                              Switch
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-gray-500">Loading consolidated overview...</div>
          )}
        </div>
      )}

      {/* ── TAB 3: PER-FRANCHISE SETTINGS ── */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1E293B] p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Per-Franchise Configuration & Studio Customization
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Set slot capacities, opening hours, UPI payment destination, and invoice prefix per branch.
                </p>
              </div>

              {/* Franchise Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">Target studio:</span>
                <Dropdown
                  value={selectedSettingFid}
                  onChange={(e) => setSelectedSettingFid(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-gray-800 dark:text-gray-200 font-medium"
                >
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (#{f.code})
                    </option>
                  ))}
                </Dropdown>
              </div>
            </div>

            {loadingSettings ? (
              <div className="py-12 text-center text-gray-500">Loading settings...</div>
            ) : settingsData ? (
              <form onSubmit={handleSaveSettings} className="space-y-6 pt-4">
                {/* Operational hours & slots */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-500" /> Operational Hours & Slot Duration
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Opening Time
                      </label>
                      <Input
                        type="time"
                        value={settingsData.franchise?.opening_time || '09:00:00'}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: { ...settingsData.franchise, opening_time: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Closing Time
                      </label>
                      <Input
                        type="time"
                        value={settingsData.franchise?.closing_time || '20:00:00'}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: { ...settingsData.franchise, closing_time: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Slot Duration (Minutes)
                      </label>
                      <Dropdown
                        value={settingsData.franchise?.slot_duration_minutes || 60}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: {
                              ...settingsData.franchise,
                              slot_duration_minutes: parseInt(e.target.value, 10),
                            },
                          })
                        }
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-gray-800 dark:text-gray-200"
                      >
                        <option value={30}>30 Minutes</option>
                        <option value={45}>45 Minutes</option>
                        <option value={60}>60 Minutes (Default)</option>
                        <option value={90}>90 Minutes</option>
                        <option value={120}>120 Minutes</option>
                      </Dropdown>
                    </div>
                  </div>
                </div>

                {/* Studio Contact & Billing Details */}
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-500" /> Branding & Financial Parameters
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Studio Phone
                      </label>
                      <Input
                        value={settingsData.franchise?.phone || ''}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: { ...settingsData.franchise, phone: e.target.value },
                          })
                        }
                        placeholder="e.g. 9876543210"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Studio Email
                      </label>
                      <Input
                        value={settingsData.franchise?.email || ''}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: { ...settingsData.franchise, email: e.target.value },
                          })
                        }
                        placeholder="e.g. branch@o3carspaa.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        GSTIN
                      </label>
                      <Input
                        value={settingsData.franchise?.gstin || ''}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: { ...settingsData.franchise, gstin: e.target.value },
                          })
                        }
                        placeholder="e.g. 24AAAAA0000A1Z5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        UPI ID (VPA) for Branch Payments
                      </label>
                      <Input
                        value={settingsData.franchise?.upi_id || ''}
                        onChange={(e) =>
                          setSettingsData({
                            ...settingsData,
                            franchise: { ...settingsData.franchise, upi_id: e.target.value },
                          })
                        }
                        placeholder="e.g. o3carspa@upi"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" variant="primary" loading={savingSettings}>
                    Save Franchise Settings
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {/* ── TAB 4: PER-FRANCHISE FEATURE ENTITLEMENTS ── */}
      {activeTab === 'entitlements' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1E293B] p-5 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
            {/* Header & Target selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-blue-600" />
                  Feature Entitlements & Plan Ceiling
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure enabled modules and allowed operations for each franchise. Studio roles cannot exceed these entitlements.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">Target studio:</span>
                <Dropdown
                  value={selectedEntitlementFid}
                  onChange={(e) => setSelectedEntitlementFid(parseInt(e.target.value, 10))}
                  className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-[#0F172A] text-gray-800 dark:text-gray-200 font-medium"
                >
                  {franchises.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} (#{f.code}) — {f.plan_tier?.toUpperCase() || 'PRO'}
                    </option>
                  ))}
                </Dropdown>
              </div>
            </div>

            {loadingEntitlements ? (
              <div className="py-12 text-center text-gray-500">Loading feature entitlements...</div>
            ) : entitlementsData ? (
              <form onSubmit={handleSaveEntitlements} className="space-y-6 pt-4">
                {/* What this screen does */}
                <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">
                    <b className="text-slate-900">Which parts of the app {entitlementsData.franchise?.name} can use.</b> Turn a module off and nobody in that studio sees it.
                    Inside the studio, its admin then decides what each staff role may do (Roles &amp; permissions). The Super Admin always sees everything.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => setAllModules(true)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">Turn all on</button>
                    <button type="button" onClick={() => setAllModules(false)} className="px-3 py-1.5 text-xs font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50">Turn all off</button>
                  </div>
                </div>

                {/* Categories & Feature Toggles */}
                <div className="space-y-6">
                  {Object.values(((entitlementsData.catalog || []) as any[]).reduce((acc: Record<string, any>, m: any) => {
                    // server sends a flat list of modules — group them by category for display
                    if (m.modules) { acc[m.category] = m; return acc; }
                    const key = m.category || 'Other';
                    (acc[key] = acc[key] || { category: key, modules: [] }).modules.push({ ...m, label: m.label || m.name });
                    return acc;
                  }, {})).map((cat: any) => (
                    <div key={cat.category} className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                        <Layers className="w-4 h-4 text-blue-600" />
                        <span>{cat.category}</span>
                        <span className="text-xs text-slate-400 font-normal">
                          ({cat.modules?.length} modules)
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {cat.modules?.map((mod: any) => {
                          const ent = entitlementsData.entitlements?.[mod.key] || { is_enabled: false, actions: [] };
                          const isEnabled = ent.is_enabled;

                          return (
                            <div
                              key={mod.key}
                              className={`p-4 rounded-xl border transition-all ${
                                isEnabled
                                  ? 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-800 shadow-xs'
                                  : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/60 opacity-70'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h5 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                      {mod.label}
                                    </h5>
                                  </div>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                                    {mod.description}
                                  </p>
                                </div>

                                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={isEnabled}
                                    onChange={() => handleToggleModule(mod.key)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                              </div>

                              {/* Granular Actions */}
                              {isEnabled && mod.actions?.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                                    Allowed Actions
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {mod.actions.map((act: string) => {
                                      const hasAct = ent.actions?.includes(act);
                                      return (
                                        <button
                                          key={act}
                                          type="button"
                                          onClick={() => handleToggleAction(mod.key, act)}
                                          className={`text-[10px] px-2 py-0.5 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                                            hasAct
                                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                              : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border border-slate-200 dark:border-slate-700 hover:text-slate-700'
                                          }`}
                                        >
                                          {hasAct && <Check size={10} />}
                                          <span>{act}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Save Entitlements Bar */}
                <div className="sticky bottom-4 z-10 p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Changes take effect immediately across all branch user sessions and APIs.
                  </div>
                  <Button type="submit" variant="primary" loading={savingEntitlements}>
                    Save Feature Entitlements
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {/* ── CREATE / EDIT MODAL ── */}
      <Modal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === 'create' ? 'Add New Studio Location' : 'Edit Franchise Location'}
      >
        <form onSubmit={handleSaveFranchise} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Studio Name *
              </label>
              <Input
                required
                placeholder="e.g. Alkapuri Studio"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Unique Branch Code *
              </label>
              <Input
                required
                disabled={modalMode === 'edit'}
                placeholder="e.g. ALK"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
              />
            </div>
          </div>

          {modalMode === 'create' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Starting access</label>
              <Dropdown value={formData.plan_tier} onChange={(e) => setFormData({ ...formData, plan_tier: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                <option value="basic">Basic: job cards, quick wash, bookings, slots, customers, enquiries, billing, invoices, staff, feedback</option>
                <option value="enterprise">Everything (services and prices stay view-only)</option>
              </Dropdown>
              <p className="text-[11px] text-gray-500 mt-1">You can switch any module or action on or off right after saving, or any time later.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address
            </label>
            <Input
              placeholder="e.g. Near Race Course Circle, Alkapuri"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                City
              </label>
              <Input
                placeholder="e.g. Vadodara"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                State
              </label>
              <Input
                placeholder="e.g. Gujarat"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <Input
                placeholder="e.g. 9876543210"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <Input
                placeholder="e.g. alkapuri@o3carspaa.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Opening Time
              </label>
              <Input
                type="time"
                value={formData.opening_time}
                onChange={(e) => setFormData({ ...formData, opening_time: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Closing Time
              </label>
              <Input
                type="time"
                value={formData.closing_time}
                onChange={(e) => setFormData({ ...formData, closing_time: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {modalMode === 'create' ? 'Create Franchise' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── CREATE OWNER MODAL ── */}
      <Modal
        open={isOwnerModalOpen}
        onClose={() => setIsOwnerModalOpen(false)}
        title={`Create Franchise Owner — ${ownerTargetFranchise?.name || ''}`}
      >
        <form onSubmit={handleCreateOwner} className="space-y-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-800 dark:text-blue-300">
            This creates an Administrator account for <strong>{ownerTargetFranchise?.name}</strong> (#{ownerTargetFranchise?.code}). On first login, the owner will be required to change their temporary password.
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Owner Full Name *
            </label>
            <Input
              required
              placeholder="e.g. Ramesh Patel"
              value={ownerFormData.name}
              onChange={(e) => setOwnerFormData({ ...ownerFormData, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Mobile Number (10 digits) *
            </label>
            <Input
              required
              type="tel"
              maxLength={10}
              placeholder="e.g. 9876543210"
              value={ownerFormData.mobile}
              onChange={(e) => setOwnerFormData({ ...ownerFormData, mobile: e.target.value.replace(/\D/g, '') })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <Input
              type="email"
              placeholder="e.g. owner@franchise.com"
              value={ownerFormData.email}
              onChange={(e) => setOwnerFormData({ ...ownerFormData, email: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Temporary Initial Password *
            </label>
            <Input
              required
              type="text"
              placeholder="Temporary password (min 8 chars)"
              value={ownerFormData.password}
              onChange={(e) => setOwnerFormData({ ...ownerFormData, password: e.target.value })}
            />
            <span className="text-[10px] text-gray-400 block mt-1">Must be at least 8 characters. User will reset this immediately upon first login.</span>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsOwnerModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={creatingOwner}>
              Create Owner Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
