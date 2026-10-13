import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Truck, CheckCircle, Send, Plus, Trash2, X, Save, Loader2, Edit2, Package, Mail, Share2, MessageCircle, Activity, CheckCircle2, History, Users, UserCheck, Award, ExternalLink, Clock, Check, Sparkles } from 'lucide-react';

import { useJobCart, useSubmitJobCart, useCompleteJobCart, useAddService, useUpdateService as useUpdateJobService, useDeleteService as useDeleteJobService, useUploadPhoto, useDeletePhoto } from '../../api/hooks/useJobCarts';
import { useMessagesLog } from '../../api/hooks/useMessages';
import { useSendWhatsApp } from '../../api/hooks/useWhatsApp';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import StatusBadge from '../../components/shared/StatusBadge';
import ErrorState from '../../components/shared/ErrorState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import FileUpload from '../../components/ui/FileUpload';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { formatINR, formatDate } from '../../utils/formatters';
import BelongingsSection from '../../components/shared/BelongingsSection';
import PrintJobCardModal from '../../components/shared/PrintJobCardModal';
import { Printer } from 'lucide-react';
import type { JobService, JobPhoto } from '../../types';


interface ProductRow {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit: string;
}

export default function JobCartDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const { data: cart, isLoading, isError, refetch } = useJobCart(id);
  const submitMut = useSubmitJobCart();
  const completeMut = useCompleteJobCart();
  const addServiceMut = useAddService();
  const updateServiceMut = useUpdateJobService();
  const deleteServiceMut = useDeleteJobService();
  const uploadPhotoMut = useUploadPhoto();
  const deletePhotoMut = useDeletePhoto();
  const { data: messagesData } = useMessagesLog({ reference_type: 'job_cart', reference_id: id });
  const messages = messagesData?.data || [];
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareExpiry, setShareExpiry] = useState('24');
  const [shareFilePayload, setShareFilePayload] = useState<{ url: string; name: string; type: string } | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [belongings, setBelongings] = useState<any[]>([]);
  const [sendingPickupWhatsApp, setSendingPickupWhatsApp] = useState(false);
  const sendWhatsApp = useSendWhatsApp();

  const handleNotifyPickupWhatsApp = () => {
    if (!cart?.customer?.mobile) return;
    const msg = `Hi ${cart.customer?.name || 'Customer'},\n\nYour vehicle *${cart.vehicle?.registration_no || ''}* (${cart.vehicle?.brand || ''} ${cart.vehicle?.model || ''}) is ready for pickup at *O3 Car Spaa*! 🚗✨\n\nTotal Amount: *₹${formatINR(cart.total_amount || 0)}*\nBalance Due: *₹${formatINR(cart.balance_due !== undefined ? cart.balance_due : cart.total_amount || 0)}*\n\nWorkshop Location:\nPlot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC, Anand - 388121\n📞 7225030303\n\nThank you for choosing O3 Car Spaa! 🙏`;
    setSendingPickupWhatsApp(true);
    sendWhatsApp.mutate(
      {
        phone: cart.customer.mobile,
        message: msg,
        customer_id: cart.customer.id
      },
      {
        onSettled: () => setSendingPickupWhatsApp(false)
      }
    );
  };

  // ─── Phase 6 Detailing Pipeline States ──────────
  const [pipelineData, setPipelineData] = useState<any>(null);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [selectedStageName, setSelectedStageName] = useState('');
  const [stageNotesInput, setStageNotesInput] = useState('');
  const [notifyCustomerOnStage, setNotifyCustomerOnStage] = useState(true);
  const [updatingStage, setUpdatingStage] = useState(false);
  const [showStageHistoryModal, setShowStageHistoryModal] = useState(false);

  const fetchPipelineStages = async () => {
    if (!id) return;
    setLoadingPipeline(true);
    try {
      const res = await api.get(`/job-carts/${id}/stages`);
      if (res.data?.success) {
        setPipelineData(res.data.data);
      }
    } catch (err) {
      console.error('Failed to fetch stages:', err);
    } finally {
      setLoadingPipeline(false);
    }
  };

  const handleUpdateStage = async (stageName: string, status: string, notes?: string) => {
    setUpdatingStage(true);
    try {
      await api.put(`/job-carts/${id}/stages`, {
        stage_name: stageName,
        status,
        notes: notes || stageNotesInput || null,
        notify: notifyCustomerOnStage
      });
      toast('success', `Stage "${stageName}" updated to ${status}`);
      setStageNotesInput('');
      setSelectedStageName('');
      fetchPipelineStages();
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update stage');
    } finally {
      setUpdatingStage(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchPipelineStages();
      api.get(`/job-carts/${id}/belongings`)
        .then(r => setBelongings(r.data.data || []))
        .catch(() => {});
    }
  }, [id]);

  const handleShareFile = async (url: string, name: string, type: string) => {
    setShareFilePayload({ url, name, type });
    setShareLink('');
    setShareModalOpen(true);
  };

  const handleGenerateShareLink = async () => {
    if (!shareFilePayload) return;
    try {
      const response = await api.post('/shared-files/generate-link', {
        file_name: shareFilePayload.name,
        file_url: shareFilePayload.url,
        file_type: shareFilePayload.type,
        reference_type: shareFilePayload.type === 'pdf' ? 'invoice' : 'job_cart',
        reference_id: Number(id),
        expiry_hours: shareExpiry === 'permanent' ? null : parseInt(shareExpiry)
      });
      if (response.data.success) {
        setShareLink(response.data.data.share_url);
        toast('success', 'Shareable link generated!');
      } else {
        toast('error', 'Failed to generate link');
      }
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to generate share link');
    }
  };

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'staff';
  const isCustomer = user?.role === 'customer';
  
  let canEdit = !isCustomer && cart?.status !== 'complete';
  let editTimeRemaining = null;

  if (cart?.status === 'complete' && cart?.completed_at) {
    const completedAt = new Date(cart.completed_at);
    const now = new Date();
    const hoursSinceComplete = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60);
    
    if (isAdmin) {
      canEdit = true; // Admin override
    } else if (hoursSinceComplete < 24) {
      canEdit = !isStaff; // Staff cannot edit historical complete carts even within 24h
      editTimeRemaining = Math.floor(24 - hoursSinceComplete);
    }
  } else if (cart?.status === 'complete') {
    canEdit = isAdmin;
  }

  // Staff restriction: only today's carts
  if (isStaff && cart?.visit_date) {
    const d = new Date(cart.visit_date);
    const cartDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (cartDateStr !== todayStr) {
      canEdit = false;
    }
  }

  // ─── Catalog data ──────────────────────
  const [servicesCatalog, setServicesCatalog] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);

  useEffect(() => {
    api.get('/services').then(r => setServicesCatalog(r.data.data || [])).catch(() => {});
    api.get('/inventory?limit=500').then(r => setInventory(r.data.data || [])).catch(() => {});
  }, []);

  // ─── Edit notes/date ───────────────────
  const [editingInfo, setEditingInfo] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPreInspector, setEditPreInspector] = useState('Sunil Patel (Quality Inspector)');
  const [savingInfo, setSavingInfo] = useState(false);

  // ─── Add service modal ─────────────────
  const [addSvcOpen, setAddSvcOpen] = useState(false);
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcIsCustom, setNewSvcIsCustom] = useState(false);
  const [newSvcPrice, setNewSvcPrice] = useState(0);
  const [newSvcLabor, setNewSvcLabor] = useState(0);
  const [newSvcNotes, setNewSvcNotes] = useState('');
  const [newSvcProducts, setNewSvcProducts] = useState<ProductRow[]>([]);

  // ─── Edit service modal ────────────────
  const [editSvcOpen, setEditSvcOpen] = useState(false);
  const [editSvcId, setEditSvcId] = useState<number | null>(null);
  const [editSvcName, setEditSvcName] = useState('');
  const [editSvcPrice, setEditSvcPrice] = useState(0);
  const [editSvcLabor, setEditSvcLabor] = useState(0);
  const [editSvcNotes, setEditSvcNotes] = useState('');
  const [editSvcProducts, setEditSvcProducts] = useState<ProductRow[]>([]);

  // ─── Delete service confirm ────────────
  const [deleteSvcId, setDeleteSvcId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // ─── Edit History Modal ────────────────
  const [editHistoryOpen, setEditHistoryOpen] = useState(false);

  // ─── Loyalty modal ─────────────────────
  const [loyaltyOpen, setLoyaltyOpen] = useState(false);
  const [credits, setCredits] = useState(0);
  const [freeWashes, setFreeWashes] = useState(0);
  const [waxAward, setWaxAward] = useState(0);

  // ─── Delivery modal & Staff List ───────
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [deliveryLoading, setDeliveryLoading] = useState(false);

  // ─── Staff & Car Arrival State ─────────
  const [referralPerson, setReferralPerson] = useState('');
  const [handlerId, setHandlerId] = useState<number | ''>('');
  const [technicianId, setTechnicianId] = useState<number | ''>('');
  const [teamIncentiveUsers, setTeamIncentiveUsers] = useState<number[]>([]);
  const [savingStaff, setSavingStaff] = useState(false);

  useEffect(() => {
    api.get('/staff').then(res => setStaffList(res.data.data || [])).catch(() => {});
  }, []);

  // ─── Collect Advance Modal ─────────────
  const [collectAdvanceOpen, setCollectAdvanceOpen] = useState(false);
  const [advanceAmountInput, setAdvanceAmountInput] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState('cash');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [submittingAdvance, setSubmittingAdvance] = useState(false);

  // ─── Billing, GST & Discount State ─────
  const [gstType, setGstType] = useState<'with_gst' | 'none'>('with_gst');
  const [gstPct, setGstPct] = useState(18);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [discountReference, setDiscountReference] = useState('');
  const [pickupType, setPickupType] = useState('none');
  const [pickupCharge, setPickupCharge] = useState(0);
  const [advancePaidInput, setAdvancePaidInput] = useState(0);
  const [invoiceNotesInput, setInvoiceNotesInput] = useState('');
  const [savingBilling, setSavingBilling] = useState(false);

  useEffect(() => {
    if (cart) {
      const c = cart as any;
      setGstType(c.gst_type || 'with_gst');
      setGstPct(c.gst_pct !== undefined ? c.gst_pct : 18);
      setDiscountType(c.discount_type || 'fixed');
      setDiscountValue(c.discount_value || 0);
      setDiscountReason(c.discount_reason || '');
      setDiscountReference(c.discount_reference || '');
      setPickupType(c.pickup_type || 'none');
      setPickupCharge(c.pickup_charge || 0);
      setAdvancePaidInput(c.advance_paid || 0);
      setInvoiceNotesInput(c.invoice_notes || '');

      setReferralPerson(c.referral_person || '');
      setHandlerId(c.handler_id || '');
      setTechnicianId(c.technician_id || '');
      let parsedTeam: number[] = [];
      if (c.team_incentive_users) {
        try {
          parsedTeam = typeof c.team_incentive_users === 'string' ? JSON.parse(c.team_incentive_users) : c.team_incentive_users;
        } catch (e) {}
      }
      setTeamIncentiveUsers(Array.isArray(parsedTeam) ? parsedTeam : []);
    }
  }, [cart]);

  const handleSaveStaffAssignment = async () => {
    if (!cart) return;
    setSavingStaff(true);
    try {
      await api.put(`/job-carts/${cart.id}`, {
        referral_person: referralPerson,
        handler_id: handlerId ? Number(handlerId) : null,
        technician_id: technicianId ? Number(technicianId) : null,
        team_incentive_users: teamIncentiveUsers,
      });
      toast('success', 'Arrival & Staff assignments updated!');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update staff assignments');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleSaveBilling = async () => {
    if (!cart) return;

    if (discountValue > 0) {
      if (discountType === 'percentage' && discountValue > 100) {
        toast('error', 'Discount percentage cannot exceed 100%');
        return;
      }
      if (!discountReason?.trim() || !discountReference?.trim()) {
        toast('error', 'Discount reason and approved/referred by are mandatory');
        return;
      }
    }

    setSavingBilling(true);
    try {
      await api.put(`/job-carts/${cart.id}`, {
        visit_date: cart.visit_date,
        notes: cart.notes,
        gst_type: gstType,
        gst_pct: gstPct,
        discount_type: discountType,
        discount_value: discountValue,
        discount_reason: discountReason,
        discount_reference: discountReference,
        pickup_type: pickupType,
        pickup_charge: pickupCharge,
        advance_paid: advancePaidInput,
        invoice_notes: invoiceNotesInput,
      });
      toast('success', 'Tax, Discount & Billing settings updated!');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update billing details');
    } finally {
      setSavingBilling(false);
    }
  };


  // ─── Helpers ───────────────────────────

  const serviceOptions = [
    ...servicesCatalog.map(s => ({ value: s.name, label: s.name })),
    { value: '__custom__', label: '✏️ Custom / Other' },
  ];

  const inventoryOptions = inventory
    .filter((i: any) => !i.is_deleted)
    .map((i: any) => ({ value: i.id, label: `${i.product_name} (${i.quantity} ${i.unit})` }));

  const emptyProduct = (): ProductRow => ({ product_id: 0, product_name: '', quantity: 1, unit_cost: 0, unit: 'pcs' });

  const handleProductSelect = (products: ProductRow[], setProducts: (p: ProductRow[]) => void, idx: number, productId: number) => {
    const item = inventory.find((i: any) => i.id === productId);
    if (item) {
      const updated = [...products];
      updated[idx] = { ...updated[idx], product_id: productId, product_name: item.product_name, unit: item.unit };
      setProducts(updated);
    }
  };

  const handleSvcSelect = (val: string, setName: (v: string) => void, setCustom: (v: boolean) => void, setPrice: (v: number) => void) => {
    if (val === '__custom__') {
      setName(''); setCustom(true); setPrice(0);
    } else {
      const svc = servicesCatalog.find(s => s.name === val);
      setName(val); setCustom(false); setPrice(Number(svc?.price_sedan) || Number(svc?.price_hatchback) || 0);
    }
  };

  // ─── Loading / Error ───────────────────
  if (isLoading) {
    return (
      <>
        <AdminTopBar title="Loading..." />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      </>
    );
  }

  if (isError || !cart) {
    return <ErrorState message="Job card not found" onRetry={() => refetch()} />;
  }

  // ─── Actions ───────────────────────────

  const handleStartEditInfo = () => {
    if (cart) {
      const d = cart.visit_date ? new Date(cart.visit_date) : new Date();
      setEditDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      setEditNotes(cart.notes || '');
      setEditPreInspector(cart.pre_inspector_name || 'Sunil Patel (Quality Inspector)');
      setEditingInfo(true);
    }
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    try {
      await api.put(`/job-carts/${cart.id}`, { visit_date: editDate, notes: editNotes });
      toast('success', 'Details updated');
      setEditingInfo(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update');
    } finally {
      setSavingInfo(false);
    }
  };

  // ─── Add Service ─────────────────
  const openAddService = () => {
    setNewSvcName(''); setNewSvcIsCustom(false); setNewSvcPrice(0); setNewSvcLabor(0); setNewSvcNotes(''); setNewSvcProducts([]);
    setAddSvcOpen(true);
  };

  const handleUploadBefore = async (files: File[]) => {
    setBeforeFiles(files);
    if (files.length > 0) {
      try {
        await uploadPhotoMut.mutateAsync({ cartId: Number(id), files, type: 'before' });
        toast('success', `Uploaded ${files.length} before photo(s)`);
        refetch();
        setBeforeFiles([]);
      } catch (err: any) {
        toast('error', err?.response?.data?.error || 'Failed to upload photo');
      }
    }
  };

  const handleUploadAfter = async (files: File[]) => {
    setAfterFiles(files);
    if (files.length > 0) {
      try {
        await uploadPhotoMut.mutateAsync({ cartId: Number(id), files, type: 'after' });
        toast('success', `Uploaded ${files.length} after photo(s)`);
        refetch();
        setAfterFiles([]);
      } catch (err: any) {
        toast('error', err?.response?.data?.error || 'Failed to upload photo');
      }
    }
  };

  const handleDeletePhoto = async (photoId: number) => {
    if (!confirm('Are you sure you want to remove this photo?')) return;
    try {
      await deletePhotoMut.mutateAsync({ cartId: Number(id), photoId });
      toast('success', 'Photo removed');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to remove photo');
    }
  };

  const handleAddService = async () => {
    if (!newSvcName.trim()) { toast('error', 'Service name is required'); return; }
    const isPPF = /ppf|film/i.test(newSvcName);
    if (isPPF && !newSvcNotes.trim()) {
      toast('error', 'Note is mandatory for PPF services (e.g. "bonnet PPF", "hood PPF")');
      return;
    }
    try {
      await addServiceMut.mutateAsync({
        id: cart.id,
        service_name: newSvcName,
        service_price: newSvcPrice,
        labor_charges: newSvcLabor,
        custom_notes: newSvcNotes.trim(),
        products: newSvcProducts.filter(p => p.product_id > 0).map(p => ({
          product_id: p.product_id, quantity: p.quantity, unit_cost: p.unit_cost,
        })),
      });
      toast('success', 'Service added');
      setAddSvcOpen(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to add service');
    }
  };

  // ─── Edit Service ────────────────
  const openEditService = (svc: any) => {
    setEditSvcId(svc.id);
    setEditSvcName(svc.service_name);
    setEditSvcPrice(parseFloat(svc.service_price) || 0);
    setEditSvcLabor(parseFloat(svc.labor_charges) || 0);
    setEditSvcNotes(svc.custom_notes || '');
    setEditSvcProducts(
      (svc.products || []).map((p: any) => ({
        product_id: p.product_id,
        product_name: p.product_name || '',
        quantity: parseFloat(p.quantity) || 1,
        unit_cost: parseFloat(p.unit_cost) || 0,
        unit: p.unit || 'pcs',
      }))
    );
    setEditSvcOpen(true);
  };

  const handleUpdateService = async () => {
    if (!editSvcName.trim() || !editSvcId) { toast('error', 'Service name is required'); return; }
    const isPPF = /ppf|film/i.test(editSvcName);
    if (isPPF && !editSvcNotes.trim()) {
      toast('error', 'Note is mandatory for PPF services (e.g. "bonnet PPF", "hood PPF")');
      return;
    }
    try {
      await updateServiceMut.mutateAsync({
        cartId: cart.id,
        serviceId: editSvcId,
        service_name: editSvcName,
        service_price: editSvcPrice,
        labor_charges: editSvcLabor,
        custom_notes: editSvcNotes.trim(),
        products: editSvcProducts.filter(p => p.product_id > 0).map(p => ({
          product_id: p.product_id, quantity: p.quantity, unit_cost: p.unit_cost,
        })),
      });
      toast('success', 'Service updated');
      setEditSvcOpen(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update service');
    }
  };

  // ─── Delete Service ──────────────
  const handleDeleteService = async () => {
    if (!deleteSvcId) return;
    try {
      await deleteServiceMut.mutateAsync({ cartId: cart.id, serviceId: deleteSvcId });
      toast('success', 'Service removed');
      setDeleteConfirmOpen(false);
      setDeleteSvcId(null);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to delete service');
    }
  };

  // ─── Status actions ──────────────
  const handleSubmit = async () => {
    try {
      await submitMut.mutateAsync(cart.id);
      toast('success', 'Job card submitted');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to submit');
    }
  };

  const handleComplete = async () => {
    try {
      await completeMut.mutateAsync({
        id: cart.id,
        credits_awarded: credits,
        free_washes_awarded: freeWashes,
        wax_awarded: waxAward,
      });
      toast('success', 'Job card completed! Invoice generated.');
      setLoyaltyOpen(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to complete');
    }
  };

  const handleDownloadInvoice = () => {
    const apiBase = import.meta.env.VITE_API_URL || '/api';
    window.open(
      `${apiBase}/job-carts/${cart.id}/invoice?token=${token}`,
      '_blank'
    );
  };

  const handleSendInvoiceWhatsApp = () => {
    if (!cart?.customer?.mobile) {
      toast('error', 'Customer mobile number not found');
      return;
    }
    const invUrl = `${window.location.origin}/invoice/${cart.id}`;
    const msg = `Dear ${cart.customer?.name || 'Customer'},\n\nYour tax invoice *${cart.invoice_number || `#${cart.id}`}* from *O3 Car Spaa* is ready! 🚗\n\nTotal Amount: *₹${formatINR(cart.total_amount || 0)}*\nView & Download Invoice: ${invUrl}\n\nThank you for choosing O3 Car Spaa! 🙏`;
    sendWhatsApp.mutate({
      phone: cart.customer.mobile,
      message: msg,
      customer_id: cart.customer.id
    });
  };



  const handleCollectAdvance = async () => {
    const amt = parseFloat(advanceAmountInput);
    if (isNaN(amt) || amt <= 0) {
      toast('error', 'Please enter a valid advance amount');
      return;
    }
    setSubmittingAdvance(true);
    try {
      await api.post('/payments/advance', {
        customer_id: cart.customer?.id,
        job_cart_id: cart.id,
        booking_id: cart.booking_id || undefined,
        advance_amount: amt,
        total_amount: cart.total_amount,
        payment_method: advanceMethod,
        notes: advanceNotes || 'Advance payment collected at counter'
      });
      toast('success', 'Advance payment recorded successfully!');
      setCollectAdvanceOpen(false);
      setAdvanceAmountInput('');
      setAdvanceNotes('');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to record advance payment');
    } finally {
      setSubmittingAdvance(false);
    }
  };

  const openDeliveryModal = async () => {
    try {
      const res = await api.get('/staff');
      setStaffList(res.data.data || []);
    } catch { setStaffList([]); }
    setDeliveryOpen(true);
  };

  const handleDelivery = async () => {
    if (!selectedStaff) { toast('error', 'Select a staff member'); return; }
    setDeliveryLoading(true);
    try {
      await api.post('/deliveries', { job_cart_id: cart.id, staff_id: parseInt(selectedStaff) });
      toast('success', 'Delivery initiated');
      setDeliveryOpen(false);
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to initiate delivery');
    } finally {
      setDeliveryLoading(false);
    }
  };

  const beforePhotos = cart.photos?.filter((p: JobPhoto) => p.type === 'before') || [];
  const afterPhotos = cart.photos?.filter((p: JobPhoto) => p.type === 'after') || [];

  // ─── Product list editor (shared) ──────
  const ProductEditor = ({ products, setProducts }: { products: ProductRow[]; setProducts: (p: ProductRow[]) => void }) => (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e]">Products Used</span>
        <button onClick={() => setProducts([...products, emptyProduct()])} className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1">
          <Plus size={12} /> Add Product
        </button>
      </div>
      {products.map((prod, pIdx) => {
        const item = inventory.find((i: any) => i.id === prod.product_id);
        let imgUrl = '';
        if (item && item.images_json) {
          try {
            const arr = typeof item.images_json === 'string' ? JSON.parse(item.images_json) : item.images_json;
            if (Array.isArray(arr) && arr.length > 0) imgUrl = arr[0];
          } catch (e) {}
        }
        return (
          <div key={pIdx} className="flex gap-2 items-end mb-2">
            <div className="pb-1">
              {imgUrl ? (
                <img src={imgUrl} alt="Prod" className="w-9 h-9 rounded-lg object-contain border border-gray-200 bg-gray-50 shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center shrink-0 text-gray-300">
                  <Package size={14} />
                </div>
              )}
            </div>
            <div className="flex-1">
              <Select
                options={inventoryOptions}
                value={prod.product_id || ''}
                onChange={e => handleProductSelect(products, setProducts, pIdx, parseInt(e.target.value))}
                placeholder="Select product..."
              />
            </div>
          <div className="w-20">
            <Input
              type="number"
              value={prod.quantity || ''}
              onChange={e => {
                const updated = [...products];
                updated[pIdx] = { ...updated[pIdx], quantity: parseFloat(e.target.value) || 0 };
                setProducts(updated);
              }}
              placeholder="Qty"
            />
          </div>
          {!isStaff && (
            <div className="w-24">
              <Input
                type="number"
                value={prod.unit_cost || ''}
                onChange={e => {
                  const updated = [...products];
                  updated[pIdx] = { ...updated[pIdx], unit_cost: parseFloat(e.target.value) || 0 };
                  setProducts(updated);
                }}
                placeholder="₹ Cost"
              />
            </div>
          )}
          <button onClick={() => setProducts(products.filter((_, i) => i !== pIdx))} className="pb-3 text-gray-300 hover:text-blue-500">
            <X size={16} />
          </button>
        </div>
      );
    })}
    {products.length === 0 && <p className="text-xs text-gray-400 italic">No products added</p>}
    </div>
  );

  // ─── Service modal content (shared) ────
  const ServiceModalContent = ({
    svcName, setSvcName, isCustom, setIsCustom, svcPrice, setSvcPrice, svcLabor, setSvcLabor, svcNotes, setSvcNotes, products, setProducts
  }: any) => {
    const isPPF = /ppf|film/i.test(svcName);
    return (
      <div className="space-y-4">
        {isCustom ? (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="Custom Service Name" value={svcName} onChange={e => setSvcName(e.target.value)} placeholder="Enter service name" />
            </div>
            <button onClick={() => setIsCustom(false)} className="pb-3 text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        ) : (
          <Select
            label="Service"
            options={serviceOptions}
            value={svcName}
            onChange={e => handleSvcSelect(e.target.value, setSvcName, setIsCustom, setSvcPrice)}
            placeholder="Select service..."
          />
        )}
        <div>
          <label className="block text-xs font-bold text-gray-700 mb-1">
            Service Note / Panel Description {isPPF ? <span className="text-red-600 font-extrabold">* (MANDATORY for Partial PPF)</span> : <span className="text-gray-400 font-normal">(Optional)</span>}
          </label>
          <Input
            placeholder={isPPF ? 'e.g. Bonnet PPF, Hood PPF, Left Fender PPF' : 'Additional service notes...'}
            value={svcNotes}
            onChange={e => setSvcNotes(e.target.value)}
          />
          {isPPF && (
            <p className="text-[11px] text-amber-700 mt-1 font-semibold">
              ⚠️ Note required: For Partial PPF services, specify panel or custom work description. This note will appear on invoices, job card, and customer view.
            </p>
          )}
        </div>
        {!isStaff && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Service Price (₹)" type="number" value={svcPrice || ''} onChange={e => setSvcPrice(parseFloat(e.target.value) || 0)} />
            <Input label="Labor Charges (₹)" type="number" value={svcLabor || ''} onChange={e => setSvcLabor(parseFloat(e.target.value) || 0)} />
          </div>
        )}
        <ProductEditor products={products} setProducts={setProducts} />
      </div>
    );
  };

  return (
    <>
      <AdminTopBar
        title={cart.vehicle?.registration_no || `Cart #${cart.id}`}
        subtitle={
          cart.vehicle
            ? `${cart.vehicle.brand} ${cart.vehicle.model}${cart.vehicle.car_year || cart.vehicle.manufacture_year ? ' (' + (cart.vehicle.car_year || cart.vehicle.manufacture_year) + ')' : ''} · Visit #${cart.visit_number}`
            : `Visit #${cart.visit_number}`
        }
        actions={
          <div className="flex gap-2 flex-wrap">
            {cart.customer?.mobile && (
              <Button
                variant="primary"
                size="sm"
                disabled={sendingPickupWhatsApp}
                onClick={handleNotifyPickupWhatsApp}
                className="bg-green-600 hover:bg-green-700 text-white"
                icon={sendingPickupWhatsApp ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              >
                {sendingPickupWhatsApp ? 'Sending...' : 'Notify Pickup (WhatsApp)'}
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => setPrintModalOpen(true)} icon={<Printer size={14} />}>
              Print Job Card
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} icon={<ArrowLeft size={14} />}>
              Back
            </Button>
          </div>
        }

      />

      <div className="max-w-4xl space-y-6">

        {/* ─── Header Card ─────────────────────── */}
        {cart.status === 'complete' && canEdit && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 flex items-center gap-2 mb-2">
            <Edit2 size={16} />
            <span className="font-medium">
              {isAdmin 
                ? "Admin Override: You can edit this completed job card." 
                : `Edit Window Open: You have ${editTimeRemaining} hours left to edit this completed job card.`}
            </span>
          </div>
        )}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-extrabold text-[#0F172A] tracking-tight">{cart.vehicle?.registration_no}</h3>
                <StatusBadge status={cart.status} />
                {canEdit && !editingInfo && (
                  <button onClick={handleStartEditInfo} className="p-1.5 rounded-lg text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors" title="Edit details">
                    <Edit2 size={14} />
                  </button>
                )}
              </div>

              {editingInfo ? (
                <div className="space-y-3 mt-3">
                  <Input label="Visit Date" type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                  <Input label="🔍 Delivery Pre-Inspected By (Inspector Name)" value={editPreInspector} onChange={e => setEditPreInspector(e.target.value)} placeholder="e.g. Sunil Patel (Quality Inspector)" />
                  <Textarea label="Notes" value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Any special instructions..." />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveInfo} loading={savingInfo} icon={<Save size={14} />}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingInfo(false)} disabled={savingInfo}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[#5f5e5e] space-y-0.5">
                  <p>
                    <span className="font-semibold">Customer:</span> {(cart as any).customer?.name || 'N/A'}
                    {!isStaff && (cart as any).customer?.mobile && ` · ${(cart as any).customer?.mobile}`}
                  </p>
                  {cart.vehicle && (
                    <p><span className="font-semibold">Vehicle:</span> {cart.vehicle.brand} {cart.vehicle.model}{cart.vehicle.car_year || cart.vehicle.manufacture_year ? ' (' + (cart.vehicle.car_year || cart.vehicle.manufacture_year) + ')' : ''}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <p className="text-xs text-gray-500">
                      <span className="font-semibold text-gray-700">Created:</span> {new Date((cart as any).created_at || cart.visit_date).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {(cart as any).updated_at && (new Date((cart as any).updated_at).getTime() - new Date((cart as any).created_at || cart.visit_date).getTime() > 1000) && (
                      <p className="text-xs text-amber-700 font-bold flex items-center gap-1">
                        · <span>Edited:</span> {new Date((cart as any).updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditHistoryOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors shadow-2xs border border-slate-200"
                      title="View all edits on this job card"
                    >
                      <History size={13} /> Edit History ({cart.edit_logs?.length || 0})
                    </button>
                  </div>

                  {cart.notes && <p><span className="font-semibold">Notes:</span> {cart.notes}</p>}
                  {cart.invoice_number && <p><span className="font-semibold">Invoice:</span> {cart.invoice_number}</p>}
                  <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg text-xs font-extrabold shadow-2xs">
                    <span>🔍 Delivery Pre-Inspected By:</span>
                    <span className="text-[#2563EB]">{(cart as any).pre_inspector_name || 'Sunil Patel (Quality Inspector)'}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Total */}
            {!isStaff && cart.total_amount !== undefined && (
              <div className="text-left sm:text-right shrink-0 space-y-1.5">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Total Amount</p>
                  <p className="text-3xl font-black text-[#0F172A] tracking-tight">{formatINR(cart.total_amount)}</p>
                  {(cart as any).pickup_charge > 0 && (
                    <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                      Includes ₹{(cart as any).pickup_charge} Pickup & Drop ({(cart as any).pickup_type})
                    </p>
                  )}
                </div>
                {((cart as any).advance_paid || 0) > 0 ? (
                  <>
                    <div className="pt-1.5 border-t border-dashed border-gray-200">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#2563EB]">Advance Paid</p>
                      <p className="text-sm font-bold text-[#2563EB]">{formatINR((cart as any).advance_paid)}</p>
                    </div>
                    {(cart as any).balance_due !== undefined && (
                      <div className="pt-0.5">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-gray-500">Balance Due</p>
                        <p className="text-base font-extrabold text-gray-800">{formatINR((cart as any).balance_due)}</p>
                      </div>
                    )}
                  </>
                ) : (
                  cart.status !== 'complete' && (
                    <button
                      onClick={() => {
                        setAdvanceAmountInput(String(Math.round((cart.total_amount || 0) * 0.3)));
                        setCollectAdvanceOpen(true);
                      }}
                      className="mt-2 px-3 py-1.5 bg-[#2563EB]/10 hover:bg-[#2563EB]/20 text-[#2563EB] border border-[#2563EB]/20 text-xs font-bold rounded-lg transition-all"
                    >
                      Collect Advance
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </div>

        {/* ─── Phase 6: Vehicle Detailing Pipeline & Live Stages ─── */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold">
                <Activity size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                    Customer Detailing Pipeline
                  </h3>
                  <span className="px-2 py-0.5 bg-blue-100 text-[#2563EB] text-[10px] font-black rounded-full uppercase">
                    Stage {pipelineData?.stages?.findIndex((s: any) => s.stage_name === pipelineData.current_stage) + 1 || 1} of {pipelineData?.stages?.length || 7}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Update stages to broadcast live tracking to customer and trigger WhatsApp alerts
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const url = `${window.location.origin}/job/${cart.id}`;
                  navigator.clipboard.writeText(url);
                  toast('success', 'Customer live tracking URL copied to clipboard!');
                }}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5"
                title="Copy customer tracking link"
              >
                <Share2 size={13} /> Copy Link
              </button>
              <a
                href={`/job/${cart.id}`}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-bold rounded-xl border border-blue-200 transition-colors flex items-center gap-1.5"
              >
                <ExternalLink size={13} /> Live Customer View
              </a>
            </div>
          </div>

          {/* Stepper Grid */}
          {loadingPipeline && !pipelineData ? (
            <div className="h-20 bg-slate-100 rounded-xl animate-pulse" />
          ) : pipelineData?.stages ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                {pipelineData.stages.map((stage: any, idx: number) => {
                  const isDone = stage.status === 'completed';
                  const isCurrent = stage.stage_name === pipelineData.current_stage;
                  const isSelected = selectedStageName === stage.stage_name;

                  return (
                    <button
                      key={stage.stage_name}
                      type="button"
                      onClick={() => {
                        setSelectedStageName(stage.stage_name);
                        setStageNotesInput(stage.notes || '');
                      }}
                      className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-[#2563EB] ring-2 ring-blue-100 bg-blue-50/50'
                          : isDone
                          ? 'border-emerald-200 bg-emerald-50/40 hover:bg-emerald-50/70'
                          : isCurrent
                          ? 'border-blue-300 bg-blue-50/30 hover:bg-blue-50/50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                          isDone 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : isCurrent 
                            ? 'bg-blue-100 text-[#2563EB]' 
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          #{idx + 1}
                        </span>
                        {isDone ? (
                          <CheckCircle2 size={15} className="text-emerald-600" />
                        ) : isCurrent ? (
                          <span className="w-2 h-2 rounded-full bg-[#2563EB] animate-ping" />
                        ) : null}
                      </div>
                      <div>
                        <p className={`text-xs font-extrabold truncate ${
                          isDone ? 'text-slate-800' : isCurrent ? 'text-[#2563EB]' : 'text-slate-600'
                        }`}>
                          {stage.stage_name}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400 capitalize mt-0.5">
                          {stage.status === 'completed' ? 'Done' : stage.status === 'in_progress' ? 'In Progress' : 'Pending'}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Stage Action & Note Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex-1 w-full space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-700">
                      Target Stage: <strong className="text-[#2563EB]">{selectedStageName || pipelineData.current_stage}</strong>
                    </span>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 ml-auto cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyCustomerOnStage}
                        onChange={(e) => setNotifyCustomerOnStage(e.target.checked)}
                        className="rounded text-[#2563EB] focus:ring-blue-500"
                      />
                      <span>WhatsApp Notify Customer</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    value={stageNotesInput}
                    onChange={(e) => setStageNotesInput(e.target.value)}
                    placeholder="Inspection remarks or milestone notes for this stage..."
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-400"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={updatingStage}
                    onClick={() => handleUpdateStage(selectedStageName || pipelineData.current_stage, 'in_progress')}
                  >
                    In Progress
                  </Button>
                  <Button
                    size="sm"
                    loading={updatingStage}
                    icon={<CheckCircle size={14} />}
                    onClick={() => handleUpdateStage(selectedStageName || pipelineData.current_stage, 'completed')}
                  >
                    Mark Done & Advance
                  </Button>
                </div>
              </div>

              {/* Transition Audit Log link */}
              {pipelineData.history && pipelineData.history.length > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>Last Transition: {new Date(pipelineData.history[pipelineData.history.length - 1].created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })} by {pipelineData.history[pipelineData.history.length - 1].updated_by_name || 'Admin'}</span>
                  <button
                    type="button"
                    onClick={() => setShowStageHistoryModal(true)}
                    className="text-[#2563EB] font-bold hover:underline flex items-center gap-1"
                  >
                    <History size={13} /> View Audit Log ({pipelineData.history.length})
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* ─── Vehicle Arrival Capture & Staff Assignment Card ─── */}
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-2">
              <Users size={15} className="text-[#2563EB]" />
              Vehicle Arrival Capture & Staff Assignment
            </h3>
            {canEdit && (
              <Button size="sm" onClick={handleSaveStaffAssignment} loading={savingStaff} icon={<Save size={14} />}>
                Save Staff Assignments
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Referral Person / Source</label>
              <Input
                placeholder="e.g. Ramesh Bhai (Referral) or Direct"
                value={referralPerson}
                onChange={e => setReferralPerson(e.target.value)}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Handling Manager</label>
              <Select
                options={[
                  { value: '', label: 'Select Manager...' },
                  ...staffList.map(s => ({ value: s.id, label: s.name }))
                ]}
                value={handlerId}
                onChange={e => setHandlerId(e.target.value ? Number(e.target.value) : '')}
                disabled={!canEdit}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Lead Assigned Technician</label>
              <Select
                options={[
                  { value: '', label: 'Select Lead Technician...' },
                  ...staffList.map(s => ({ value: s.id, label: s.name }))
                ]}
                value={technicianId}
                onChange={e => setTechnicianId(e.target.value ? Number(e.target.value) : '')}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5">
              Team Incentive Pool Members (Staff Sharing Team Pool)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {staffList.map(s => {
                const isSelected = teamIncentiveUsers.includes(Number(s.id));
                return (
                  <label key={s.id} className={`flex items-center gap-2 text-xs font-bold p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-100 text-blue-900 border border-blue-300' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'}`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!canEdit}
                      onChange={() => {
                        if (isSelected) {
                          setTeamIncentiveUsers(prev => prev.filter(x => x !== Number(s.id)));
                        } else {
                          setTeamIncentiveUsers(prev => [...prev, Number(s.id)]);
                        }
                      }}
                      className="rounded text-blue-600"
                    />
                    <span>{s.name}</span>
                  </label>
                );
              })}
              {staffList.length === 0 && <span className="text-xs text-gray-400 italic">No staff found</span>}
            </div>
          </div>
        </div>

        {/* ─── Staff Incentive Distribution Breakdown Card ───────── */}
        {cart.incentive_splits && cart.incentive_splits.length > 0 && (
          <div className="bg-white rounded-lg p-5 shadow-sm border border-emerald-100 space-y-3">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-emerald-800 flex items-center gap-2">
                <Award size={15} className="text-emerald-600" />
                Staff Incentive Distribution Breakdown
              </h3>
              <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                Total Incentive: {formatINR(cart.incentive_amount || 0)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {cart.incentive_splits.map((split: any, sIdx: number) => (
                <div key={split.id || sIdx} className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200/60 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded">
                      {split.role ? split.role.replace('_', ' ') : 'Split'}
                    </span>
                    <span className="text-xs font-black text-emerald-700">
                      {formatINR(split.amount)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-bold text-gray-800">
                    {split.employee_name || `Staff #${split.user_id}`}
                  </div>
                  <div className="text-[10px] text-gray-500 capitalize mt-0.5">
                    Status: <span className="font-semibold text-emerald-600">{split.status || 'pending'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Live Detailing Progress Stepper ───────────── */}
        <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e] flex items-center gap-2">
              <Activity size={15} className="text-[#2563EB]" />
              Live Detailing Progress Pipeline (Customer Visible)
            </h3>
            <span className="text-[10px] font-bold text-slate-400">1-Click Status Update</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            {[
              { key: 'Pre-Inspection', label: '1. Pre-Inspection' },
              { key: 'Washing', label: '2. Washing & Prep' },
              { key: 'Stage 1 Polishing', label: '3. Polishing & Paint' },
              { key: 'PPF Application', label: '4. PPF / Ceramic' },
              { key: 'Quality Check', label: '5. Quality Check' },
              { key: 'Ready for Delivery', label: '6. Ready for Pickup' },
              { key: 'Delivered', label: '7. Vehicle Delivered' },
            ].map((stg) => (
              <button
                key={stg.key}
                type="button"
                onClick={async () => {
                  try {
                    await api.put(`/job-carts/${cart.id}/stages`, { stage_name: stg.key, status: 'completed' });
                    toast('success', `Updated stage: ${stg.label}`);
                    refetch();
                  } catch {
                    toast('error', 'Failed to update stage');
                  }
                }}
                className="px-3 py-2 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-xs font-bold text-slate-700 hover:text-blue-700 transition-all text-left flex items-center justify-between"
              >
                <span>{stg.label}</span>
                <CheckCircle2 size={13} className="text-blue-600 shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* ─── Customer Belongings ────────────────── */}

        <BelongingsSection
          jobCartId={id}
          initialBelongings={belongings}
          canEdit={canEdit}
          onUpdate={(updated) => setBelongings(updated)}
        />

        {/* ─── Services ────────────────────────── */}

        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e]">Services ({cart.services?.length || 0})</h3>
            {canEdit && (
              <button onClick={openAddService} className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1">
                <Plus size={14} /> Add Service
              </button>
            )}
          </div>
          {cart.services?.length ? (
            <div className="divide-y divide-gray-50">
              {cart.services.map((svc: any, idx: number) => (
                <div key={svc.id || idx} className="px-6 py-4 group hover:bg-gray-50/50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-[#0F172A]">{svc.service_name}</p>
                        {svc.custom_notes && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                            📝 {svc.custom_notes}
                          </span>
                        )}
                        {canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEditService(svc)}
                              className="p-1 rounded text-gray-400 hover:text-[#2563EB] hover:bg-blue-50 transition-colors"
                              title="Edit service"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => { setDeleteSvcId(svc.id); setDeleteConfirmOpen(true); }}
                              className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Remove service"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      {!isStaff && (
                        <div className="text-xs text-[#5f5e5e] mt-1 space-x-3">
                          <span>Price: {formatINR(svc.service_price)}</span>
                          <span>Labor: {formatINR(svc.labor_charges)}</span>
                        </div>
                      )}
                    </div>
                    {!isStaff && svc.subtotal !== undefined && (
                      <span className="text-sm font-extrabold text-[#0F172A]">{formatINR(svc.subtotal)}</span>
                    )}
                  </div>

                  {svc.products?.length > 0 && (
                    <div className="mt-2 ml-4">
                      {svc.products.map((p: any, pIdx: number) => (
                        <div key={pIdx} className="text-xs text-[#5f5e5e] flex justify-between py-0.5">
                          <span>• {p.product_name} × {p.quantity} {p.unit}</span>
                          {!isStaff && <span>{formatINR(p.quantity * p.unit_cost)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center">
              <Package size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-[#5f5e5e]">No services added yet</p>
              {canEdit && (
                <button onClick={openAddService} className="mt-2 text-sm font-bold text-[#2563EB] hover:underline">
                  + Add First Service
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─── Billing, Tax & Discount Options ───────────── */}
        {!isStaff && (
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e]">
                Tax, Discount & Billing Breakdown
              </h3>
              {canEdit && (
                <Button size="sm" onClick={handleSaveBilling} loading={savingBilling} icon={<Save size={14} />}>
                  Save Billing Settings
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* GST Type */}
              <Select
                label="GST Tax Mode"
                options={[
                  { value: 'with_gst', label: 'With GST (Tax Invoice)' },
                  { value: 'none', label: 'Without GST (Bill of Supply)' },
                ]}
                value={gstType}
                onChange={(e) => setGstType(e.target.value as 'with_gst' | 'none')}
                disabled={!canEdit}
              />

              {/* GST Percentage */}
              {gstType === 'with_gst' && (
                <Input
                  label="GST Rate (%)"
                  type="number"
                  value={gstPct}
                  onChange={(e) => setGstPct(parseFloat(e.target.value) || 0)}
                  disabled={!canEdit}
                />
              )}

              {/* Discount Type */}
              <Select
                label="Discount Type"
                options={[
                  { value: 'fixed', label: 'Fixed Amount (₹)' },
                  { value: 'percentage', label: 'Percentage (%)' },
                ]}
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as 'fixed' | 'percentage')}
                disabled={!canEdit}
              />

              {/* Discount Value */}
              <Input
                label={`Discount Value (${discountType === 'percentage' ? '%' : '₹'})`}
                type="number"
                value={discountValue || ''}
                onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </div>

            {discountValue > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-amber-50/80 border border-amber-200/80 rounded-lg">
                <Input
                  label="Discount Reason *"
                  placeholder="e.g. Regular Customer / Festive Offer"
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  disabled={!canEdit}
                />
                <Input
                  label="Approved / Referred By *"
                  placeholder="e.g. Approved by Sodhi Sir / Reference"
                  value={discountReference}
                  onChange={(e) => setDiscountReference(e.target.value)}
                  disabled={!canEdit}
                />
              </div>
            )}


            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <Select
                label="Pickup & Drop Service"
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'pickup', label: 'Pickup Only' },
                  { value: 'drop', label: 'Drop Only' },
                  { value: 'both', label: 'Both Pickup & Drop' },
                ]}
                value={pickupType}
                onChange={(e) => setPickupType(e.target.value)}
                disabled={!canEdit}
              />
              <Input
                label="Pickup Charge (₹)"
                type="number"
                value={pickupCharge || ''}
                onChange={(e) => setPickupCharge(parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
              />
              <Input
                label="Advance Paid (₹)"
                type="number"
                value={advancePaidInput || ''}
                onChange={(e) => setAdvancePaidInput(parseFloat(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </div>

            <div className="pt-2">
              <Textarea
                label="Invoice Notes / Special Remarks (Appears on PDF)"
                value={invoiceNotesInput}
                onChange={(e) => setInvoiceNotesInput(e.target.value)}
                placeholder="e.g. Terms, coating warranty details, etc."
                disabled={!canEdit}
              />
            </div>
          </div>
        )}

        {/* ─── Photos ──────────────────────────── */}
        {(beforePhotos.length > 0 || afterPhotos.length > 0 || canEdit) && (
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-4">Photos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">Before</p>
                {beforePhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {beforePhotos.map((p: JobPhoto) => (
                      <div key={p.id} className="relative group/photo aspect-square w-full">
                        <img src={p.url} alt="Before" className="rounded-lg object-cover w-full h-full" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center gap-2 rounded-lg transition-opacity">
                          <button
                            onClick={() => handleShareFile(p.url, `Before Photo - Job #${id}`, 'image')}
                            className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-md transition-colors shadow"
                            title="Share photo"
                          >
                            <Share2 size={14} />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleDeletePhoto(p.id)}
                              className="p-1.5 bg-blue-600/90 hover:bg-blue-600 text-white rounded-md transition-colors shadow"
                              title="Delete photo"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic mb-4">No before photos</p>
                )}
                {canEdit && (
                  <FileUpload
                    label="Upload Before Photo"
                    files={beforeFiles}
                    onChange={handleUploadBefore}
                    maxFiles={1}
                  />
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">After</p>
                {afterPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {afterPhotos.map((p: JobPhoto) => (
                      <div key={p.id} className="relative group/photo aspect-square w-full">
                        <img src={p.url} alt="After" className="rounded-lg object-cover w-full h-full" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center gap-2 rounded-lg transition-opacity">
                          <button
                            onClick={() => handleShareFile(p.url, `After Photo - Job #${id}`, 'image')}
                            className="p-1.5 bg-white/90 hover:bg-white text-gray-800 rounded-md transition-colors shadow"
                            title="Share photo"
                          >
                            <Share2 size={14} />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => handleDeletePhoto(p.id)}
                              className="p-1.5 bg-blue-600/90 hover:bg-blue-600 text-white rounded-md transition-colors shadow"
                              title="Delete photo"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic mb-4">No after photos</p>
                )}
                {canEdit && (
                  <FileUpload
                    label="Upload After Photo"
                    files={afterFiles}
                    onChange={handleUploadAfter}
                    maxFiles={1}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Action Buttons ──────────────────── */}
        {!isCustomer && (
          <div className="flex flex-wrap gap-3 pb-8">
            {cart.status === 'draft' && (
              <Button onClick={handleSubmit} loading={submitMut.isPending} icon={<Send size={14} />}>
                Submit Job Card
              </Button>
            )}
            {cart.status === 'open' && !isStaff && (
              <Button onClick={() => setLoyaltyOpen(true)} icon={<CheckCircle size={14} />}>
                Mark Complete
              </Button>
            )}
            {cart.status === 'complete' && (
              <>
                <Button onClick={handleDownloadInvoice} icon={<Download size={14} />}>
                  Download Invoice
                </Button>
                <Button
                  onClick={handleSendInvoiceWhatsApp}
                  disabled={sendWhatsApp.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  icon={<MessageCircle size={14} />}
                >
                  {sendWhatsApp.isPending ? 'Sending...' : 'Send WhatsApp Invoice'}
                </Button>
                <Button variant="secondary" onClick={() => handleShareFile(`/api/job-carts/${cart.id}/invoice`, `Invoice - Job #${cart.invoice_number || cart.id}`, 'pdf')} icon={<Share2 size={14} />}>
                  Share Invoice
                </Button>
                {!isStaff && (
                  <Button variant="secondary" onClick={openDeliveryModal} icon={<Truck size={14} />}>
                    Send for Delivery
                  </Button>
                )}
              </>
            )}
          </div>
        )}

        {/* Customer: download invoice */}
        {isCustomer && cart.status === 'complete' && (
          <div className="pb-8">
            <Button onClick={handleDownloadInvoice} icon={<Download size={14} />}>
              Download Invoice
            </Button>
          </div>
        )}

        {/* ─── Messages Sent Section ──────────────────── */}
        {!isCustomer && messages.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8 p-6">
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
              <Mail className="text-[#2563EB] w-5 h-5" />
              <h2 className="text-lg font-bold text-[#0F172A]">Notification History</h2>
            </div>
            <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
              {messages.map((log: any) => {
                return (
                  <div key={log.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          log.status === 'sent' ? 'bg-green-100 text-green-700' : 
                          log.status === 'failed' ? 'bg-rose-100 text-rose-700' : 
                          log.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {log.status}
                        </span>
                        <span className="text-xs uppercase font-bold text-gray-400 tracking-wider">
                          {log.channel}
                        </span>
                        {log.template_name && (
                          <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            {log.template_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5f5e5e]">{log.message_body}</p>
                      {log.channel === 'whatsapp' && (
                        <button
                          type="button"
                          onClick={() => {
                            if (cart.customer?.mobile) {
                              sendWhatsApp.mutate({
                                phone: cart.customer.mobile,
                                message: log.message_body,
                                customer_id: cart.customer?.id
                              });
                            }
                          }}
                          disabled={sendWhatsApp.isPending || !cart.customer?.mobile}
                          className="inline-flex items-center gap-1.5 mt-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                        >
                          <Send size={11} /> 1-Click Resend via Server Engine
                        </button>
                      )}
                    </div>
                    <div className="text-right text-[10px] text-gray-400 ml-4">
                      {new Date(log.sent_at).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Add Service Modal ──────────────────── */}
      <Modal
        open={addSvcOpen}
        onClose={() => setAddSvcOpen(false)}
        title="Add Service"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddSvcOpen(false)} disabled={addServiceMut.isPending}>Cancel</Button>
            <Button onClick={handleAddService} loading={addServiceMut.isPending}>Add Service</Button>
          </>
        }
      >
        <ServiceModalContent
          svcName={newSvcName} setSvcName={setNewSvcName}
          isCustom={newSvcIsCustom} setIsCustom={setNewSvcIsCustom}
          svcPrice={newSvcPrice} setSvcPrice={setNewSvcPrice}
          svcLabor={newSvcLabor} setSvcLabor={setNewSvcLabor}
          svcNotes={newSvcNotes} setSvcNotes={setNewSvcNotes}
          products={newSvcProducts} setProducts={setNewSvcProducts}
        />
      </Modal>

      {/* ─── Edit Service Modal ─────────────────── */}
      <Modal
        open={editSvcOpen}
        onClose={() => setEditSvcOpen(false)}
        title="Edit Service"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditSvcOpen(false)} disabled={updateServiceMut.isPending}>Cancel</Button>
            <Button onClick={handleUpdateService} loading={updateServiceMut.isPending}>Save Changes</Button>
          </>
        }
      >
        <ServiceModalContent
          svcName={editSvcName} setSvcName={setEditSvcName}
          isCustom={false} setIsCustom={() => {}}
          svcPrice={editSvcPrice} setSvcPrice={setEditSvcPrice}
          svcLabor={editSvcLabor} setSvcLabor={setEditSvcLabor}
          svcNotes={editSvcNotes} setSvcNotes={setEditSvcNotes}
          products={editSvcProducts} setProducts={setEditSvcProducts}
        />
      </Modal>

      {/* ─── Delete Service Confirm ─────────────── */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setDeleteSvcId(null); }}
        onConfirm={handleDeleteService}
        title="Remove Service"
        message="This will permanently remove this service and its products from the job card. Continue?"
        confirmLabel="Remove"
        loading={deleteServiceMut.isPending}
      />

      {/* ─── Loyalty Award Modal ───────────────── */}
      <Modal
        open={loyaltyOpen}
        onClose={() => setLoyaltyOpen(false)}
        title="Complete & Award Loyalty"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLoyaltyOpen(false)} disabled={completeMut.isPending}>Cancel</Button>
            <Button onClick={handleComplete} loading={completeMut.isPending}>
              Confirm & Complete
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[#5f5e5e]">
            Award loyalty rewards to the customer for this visit. Leave at 0 to skip.
          </p>
          <Input label="Credits to Award (₹)" type="number" value={credits || ''} onChange={e => setCredits(parseInt(e.target.value) || 0)} />
          <Input label="Free Washes to Award" type="number" value={freeWashes || ''} onChange={e => setFreeWashes(parseInt(e.target.value) || 0)} />
          <Input label="Wax Treatments to Award" type="number" value={waxAward || ''} onChange={e => setWaxAward(parseInt(e.target.value) || 0)} />
        </div>
      </Modal>

      {/* ─── Delivery Modal ────────────────────── */}
      <Modal
        open={deliveryOpen}
        onClose={() => setDeliveryOpen(false)}
        title="Send for Delivery"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeliveryOpen(false)} disabled={deliveryLoading}>Cancel</Button>
            <Button onClick={handleDelivery} loading={deliveryLoading}>
              Initiate Delivery
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[#5f5e5e]">Select a staff member to deliver this vehicle.</p>
          <Select
            label="Staff Member"
            options={staffList.map(s => ({ value: s.id, label: s.name }))}
            value={selectedStaff}
            onChange={e => setSelectedStaff(e.target.value)}
            placeholder="Choose staff..."
          />
        </div>
      </Modal>

      {/* ─── Collect Advance Modal ───────────────── */}
      <Modal
        open={collectAdvanceOpen}
        onClose={() => setCollectAdvanceOpen(false)}
        title="Collect Advance Payment"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCollectAdvanceOpen(false)} disabled={submittingAdvance}>Cancel</Button>
            <Button onClick={handleCollectAdvance} loading={submittingAdvance}>
              Collect Payment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[#5f5e5e]">
            Record an advance payment collected from the customer at the counter.
          </p>
          <Input
            label="Advance Amount (₹)"
            type="number"
            value={advanceAmountInput}
            onChange={e => setAdvanceAmountInput(e.target.value)}
            placeholder="e.g. 500"
          />
          <Select
            label="Payment Method"
            options={[
              { value: 'cash', label: '💵 Cash' },
              { value: 'upi', label: '📱 UPI' },
              { value: 'card', label: '💳 Card' },
              { value: 'net_banking', label: '🏦 Net Banking' },
              { value: 'qr', label: '🔲 QR Code Scan' },
              { value: 'other', label: '📝 Other' },
            ]}
            value={advanceMethod}
            onChange={e => setAdvanceMethod(e.target.value)}
          />
          <Input
            label="Notes / Reference (Optional)"
            value={advanceNotes}
            onChange={e => setAdvanceNotes(e.target.value)}
            placeholder="e.g. Transaction ID, note"
          />
        </div>
      </Modal>

      {/* ─── Share Link Modal ─────────────────── */}
      <Modal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title="Share File Link"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShareModalOpen(false)}>Close</Button>
            {!shareLink && (
              <Button onClick={handleGenerateShareLink} variant="primary">Generate Link</Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {!shareLink ? (
            <>
              <p className="text-sm text-[#5f5e5e]">
                Choose an expiration period for this shared link. Anyone with the link will be able to access the file without logging in.
              </p>
              <Select
                label="Expiry Duration"
                value={shareExpiry}
                onChange={e => setShareExpiry(e.target.value)}
                options={[
                  { value: '24', label: '24 Hours' },
                  { value: '168', label: '7 Days' },
                  { value: 'permanent', label: 'Permanent (No Expiry)' }
                ]}
              />
            </>
          ) : (
            <>
              <p className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded inline-block">
                ✓ Shareable link ready!
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-gray-50 text-gray-700 select-all"
                  onClick={e => (e.target as HTMLInputElement).select()}
                />
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    toast('success', 'Copied to clipboard!');
                  }}
                  variant="primary"
                >
                  Copy
                </Button>
              </div>
              <div className="pt-2">
                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Here is the shared document: ${shareLink}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
                >
                  💬 Share on WhatsApp
                </a>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* ─── Edit History Modal ─────────────────── */}
      <Modal
        open={editHistoryOpen}
        onClose={() => setEditHistoryOpen(false)}
        title="Job Card Edit History & Audit Log"
        size="lg"
        footer={<Button variant="ghost" onClick={() => setEditHistoryOpen(false)}>Close</Button>}
      >
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {cart.edit_logs && cart.edit_logs.length > 0 ? (
            <div className="space-y-3">
              {cart.edit_logs.map((log: any, lIdx: number) => (
                <div key={log.id || lIdx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 uppercase">
                      {log.action ? log.action.replace('_', ' ') : 'Update'}
                    </span>
                    <span className="text-gray-500 font-medium">
                      {new Date(log.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-gray-900">
                    By: <span className="text-gray-700">{log.editor_name || log.created_by || 'Staff/Admin'}</span>
                  </div>
                  {log.details && (
                    <div className="text-xs text-gray-600 bg-white p-2.5 rounded-lg border border-gray-100 font-mono whitespace-pre-wrap">
                      {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : log.details}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 italic">
              No previous edit logs found for this job card.
            </div>
          )}
        </div>
      </Modal>

      {/* ─── Pipeline Stage History Modal ─────────────── */}
      <Modal
        open={showStageHistoryModal}
        onClose={() => setShowStageHistoryModal(false)}
        title="Detailing Pipeline Transition Audit History"
        size="lg"
        footer={<Button variant="ghost" onClick={() => setShowStageHistoryModal(false)}>Close</Button>}
      >
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {pipelineData?.history && pipelineData.history.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {pipelineData.history.map((log: any) => (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900">{log.stage_name}</span>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        log.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {log.status}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {log.notes}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">
                      Updated by: <strong className="text-slate-700">{log.updated_by_name || 'Admin'}</strong>
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic text-center py-6">No stage history logged yet.</p>
          )}
        </div>
      </Modal>

      <PrintJobCardModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        cart={cart}
        belongings={belongings}
      />
    </>
  );
}

