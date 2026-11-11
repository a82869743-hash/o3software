import { Printer, X } from 'lucide-react';
import StudioQr from './StudioQr';
import { useStudio } from '../../api/hooks/useStudio';
import { formatINR, formatDate } from '../../utils/formatters';

interface Belonging {
  id: number;
  description: string;
  image_url: string | null;
}

interface ServiceItem {
  id: number;
  service_name: string;
  service_price: number;
  labor_charges: number;
  products_cost?: number;
  custom_notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cart: any;
  belongings: Belonging[];
}

export default function PrintJobCardModal({ open, onClose, cart: rawCart, belongings }: Props) {
  // job cards keep customer / vehicle details nested — flatten them for the printout
  const cart = rawCart && {
    ...rawCart,
    customer_name: rawCart.customer_name ?? rawCart.customer?.name,
    customer_mobile: rawCart.customer_mobile ?? rawCart.customer?.mobile,
    customer_email: rawCart.customer_email ?? rawCart.customer?.email,
    registration_no: rawCart.registration_no ?? rawCart.vehicle?.registration_no,
    brand: rawCart.brand ?? rawCart.vehicle?.brand,
    model: rawCart.model ?? rawCart.vehicle?.model,
    registration_year: rawCart.registration_year ?? rawCart.vehicle?.registration_year ?? rawCart.vehicle?.car_year,
    handler_name: rawCart.handler_name ?? rawCart.handler?.name,
    technician_name: rawCart.technician_name ?? rawCart.technician?.name,
  };
  const { data: studio } = useStudio();
  if (!open || !cart) return null;

  const handlePrint = () => {
    window.print();
  };

  // Service calculation matching exact invoice structure
  let totalQty = 0;
  let grandTotal = 0;

  const serviceRows = (cart.services || []).map((s: ServiceItem) => {
    const servicePrice = parseFloat(s.service_price as any) || 0;
    const laborCharges = parseFloat(s.labor_charges as any) || 0;
    const productsTotal = parseFloat(s.products_cost as any) || 0;
    const amount = servicePrice + laborCharges + productsTotal;
    totalQty += 1;
    grandTotal += amount;
    const fromPkg = (s as any).user_package_id || (s as any).package_service_name;
    const noteText = (s.custom_notes ? ` [${s.custom_notes}]` : '') + (fromPkg && amount === 0 ? ' — ₹0: COVERED BY PACKAGE' : '');
    return {
      name: `${(s.service_name || '').toUpperCase()}${noteText.toUpperCase()}`,
      qty: '1 PCS',
      rate: amount,
      amount: amount,
    };
  });

  let discountAmt = 0;
  if (cart.discount_type === 'percentage') {
    discountAmt = grandTotal * ((parseFloat(cart.discount_value) || 0) / 100);
  } else if (cart.discount_type === 'fixed') {
    discountAmt = parseFloat(cart.discount_value) || 0;
  }
  discountAmt = Math.min(grandTotal, Math.max(0, discountAmt));

  const advancePaid = parseFloat(cart.advance_paid || 0);
  const pickupCharge = parseFloat(cart.pickup_charge || 0);
  const payable = Math.max(0, grandTotal - discountAmt + pickupCharge);
  const isPaid = cart.payment_status === 'paid';
  const balanceDue = isPaid ? 0 : Math.max(0, payable - advancePaid);

  const createdAtFormatted = cart.created_at ? new Date(cart.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : formatDate(cart.visit_date);
  const isEdited = cart.updated_at && cart.created_at && (new Date(cart.updated_at).getTime() - new Date(cart.created_at).getTime() > 1000);
  const editedAtFormatted = isEdited ? new Date(cart.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-[130] flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden my-2 sm:my-8 border border-slate-200">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="px-6 py-4 bg-[#0284C7] text-white flex items-center justify-between print:hidden">
          <div>
            <h2 className="font-extrabold text-base tracking-wide">Official Job Card — Print & Preview</h2>
            <p className="text-xs text-sky-100">Format matches official O3 Car Spaa Bill of Supply</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#0284C7] rounded-xl font-black text-xs hover:bg-sky-50 transition-colors shadow-md"
            >
              <Printer size={15} /> Print / Save as PDF
            </button>
            <button onClick={onClose} className="p-2 text-sky-100 hover:text-white rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── Official A4 Printable Layout ── */}
        <div className="p-8 print:p-0 bg-white" id="job-card-print-area">
          <style>{`
            @media print {
              body * { visibility: hidden; }
              #job-card-print-area, #job-card-print-area * { visibility: visible; }
              #job-card-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
              .print\\:hidden { display: none !important; }
            }
          `}</style>

          {/* 1. Header Title */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div>
              <span style={{ fontSize: '14px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#1a1a1a' }}>
                JOB CARD / SERVICE ESTIMATE
              </span>
              <span style={{ display: 'inline-block', border: '1px solid #999', padding: '2px 8px', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginLeft: '10px', color: '#666' }}>
                ORIGINAL WORKSHOP COPY
              </span>
            </div>
          </div>

          {/* 2. Official Blue Company Header */}
          <div style={{ background: '#0284C7', padding: '14px 18px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '14px', marginTop: '6px' }}>
            <div style={{ background: '#FFFFFF', padding: '6px 10px', borderRadius: '6px', textAlign: 'center', minWidth: '70px' }}>
              <span style={{ fontSize: '20px', fontWeight: 900, color: '#0284C7', display: 'block', lineHeight: 1 }}>O3</span>
              <span style={{ fontSize: '9px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>Car Spaa</span>
            </div>
            <div style={{ color: '#FFFFFF' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 900, margin: 0, lineHeight: 1.2 }}>O3 Car Spaa</h1>
              <p style={{ fontSize: '10px', margin: '2px 0 0', opacity: 0.95, lineHeight: 1.4 }}>
                {studio?.address || ''}
              </p>
              <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '3px' }}>
                Mobile: {studio?.mobile || ''} &nbsp;&nbsp;|&nbsp;&nbsp; Email: {studio?.email || ''}
              </div>
            </div>
          </div>

          {/* 3. Job Card Meta Row */}
          <div style={{ display: 'flex', border: '1px solid #0284C7', marginBottom: '12px' }}>
            <div style={{ flex: 1, padding: '8px 12px' }}>
              <span style={{ fontSize: '10px', color: '#0284C7', fontWeight: 700 }}>Job Card No.: </span>
              <span style={{ fontSize: '14px', fontWeight: 800 }}>JC-{cart.id}</span>
            </div>
            <div style={{ flex: 1, padding: '8px 12px', borderLeft: '1px solid #0284C7', textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#0284C7', fontWeight: 700 }}>Timeline: </div>
              <div style={{ fontSize: '11px', fontWeight: 700 }}>Created on: {createdAtFormatted}</div>
              {editedAtFormatted && <div style={{ fontSize: '11px', fontWeight: 800, color: '#dc2626' }}>Edited on: {editedAtFormatted}</div>}
            </div>
            <div style={{ flex: 1, padding: '8px 12px', borderLeft: '1px solid #0284C7', textAlign: 'right' }}>
              <span style={{ fontSize: '10px', color: '#0284C7', fontWeight: 700 }}>Visit Date: </span>
              <span style={{ fontSize: '14px', fontWeight: 800 }}>{formatDate(cart.visit_date)}</span>
            </div>
          </div>

          {/* 4. Customer & Vehicle Details */}
          <div style={{ display: 'flex', border: '1px solid #0284C7', marginBottom: '12px' }}>
            <div style={{ flex: 1, padding: '10px 14px' }}>
              <div style={{ fontSize: '10px', fontStyle: 'normal', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>CUSTOMER DETAILS</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1a1a1a', marginTop: '3px' }}>{cart.customer_name || '-'}</div>
              <div style={{ fontSize: '11px', color: '#444', marginTop: '2px' }}>Mobile: <strong>{cart.customer_mobile || '-'}</strong></div>
              {cart.customer_email && <div style={{ fontSize: '11px', color: '#444' }}>Email: {cart.customer_email}</div>}
              <div style={{ fontSize: '11px', color: '#444' }}>Visit Count: #{cart.visit_number || 1}</div>
            </div>
            <div style={{ flex: '0 0 240px', padding: '10px 14px', borderLeft: '1px solid #0284C7', textAlign: 'right' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>VEHICLE DETAILS</div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#0284C7', marginTop: '3px' }}>{cart.registration_no || '-'}</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a', marginTop: '2px' }}>{(cart.brand || '').toUpperCase()} {(cart.model || '').toUpperCase()}</div>
              {cart.registration_year && <div style={{ fontSize: '11px', color: '#555' }}>Year: {cart.registration_year}</div>}
            </div>
          </div>

          {/* 4b. Car Arrival & Staff Assignment */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', border: '1px solid #0284C7', background: '#F8FAFC', padding: '10px 14px', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>REFERRAL PERSON</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a', marginTop: '2px' }}>{cart.referral_person || 'Direct / Walk-in'}</div>
            </div>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>HANDLING MANAGER</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a', marginTop: '2px' }}>{cart.handler_name || 'Not assigned'}</div>
            </div>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>LEAD TECHNICIAN</div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1a1a1a', marginTop: '2px' }}>{cart.technician_name || 'Not assigned'}</div>
            </div>
            <div>
              <div style={{ fontSize: '9px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>TEAM INCENTIVE</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginTop: '2px' }}>{Array.isArray(cart.team_incentive_names) && cart.team_incentive_names.length > 0 ? cart.team_incentive_names.join(', ') : 'Not set'}</div>
            </div>
          </div>

          {/* 5. Services Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 0 }}>
            <thead>
              <tr style={{ background: '#0284C7', color: '#FFFFFF', fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', width: '50%' }}>SERVICES / DETAILED WORK</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', width: '15%' }}>QTY.</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', width: '17%' }}>RATE</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', width: '18%' }}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {serviceRows.length > 0 ? (
                serviceRows.map((s: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e0e0e0', fontSize: '12px' }}>
                    <td style={{ padding: '8px 12px', textTransform: 'uppercase', fontWeight: 700, color: '#1a1a1a' }}>{s.name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#555' }}>{s.qty}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#555' }}>{formatINR(s.rate)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: '#1a1a1a' }}>{formatINR(s.amount)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: '16px', fontStyle: 'italic', textAlign: 'center', color: '#888' }}>No services added yet</td>
                </tr>

              )}
            </tbody>
          </table>

          {/* 6. Subtotal Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #0284C7', borderTop: 'none', background: '#F8FAFC', fontWeight: 800, fontSize: '13px', marginBottom: '14px' }}>
            <div>SUBTOTAL ({totalQty} Services)</div>
            <div>{formatINR(grandTotal)}</div>
          </div>

          {/* 7. Belongings Checklist Box */}
          <div style={{ border: '1px solid #0284C7', borderRadius: '4px', padding: '10px 14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', marginBottom: '6px' }}>
              CUSTOMER PERSONAL BELONGINGS CHECKLIST ({belongings.length} Items Logged)
            </div>
            {belongings.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                {belongings.map((b) => (
                  <div key={b.id} style={{ fontSize: '11px', fontWeight: 700, color: '#1a1a1a', background: '#F1F5F9', padding: '5px 10px', borderRadius: '4px', border: '1px solid #CBD5E1' }}>
                    ✓ {b.description}
                    {b.image_url && <img src={b.image_url} alt="" style={{ display: 'block', marginTop: '4px', width: '90px', height: '68px', objectFit: 'cover', borderRadius: '3px' }} />}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                No personal belongings declared at entry.
              </div>
            )}
          </div>

          {/* 7b. Before / after car photos */}
          {(cart.photos || []).length > 0 && (
            <div style={{ border: '1px solid #0284C7', borderRadius: '4px', padding: '10px 14px', marginBottom: '14px', breakInside: 'avoid' }}>
              {['before', 'after'].map((t) => {
                const list = (cart.photos || []).filter((p: any) => p.type === t);
                if (!list.length) return null;
                return (
                  <div key={t} style={{ marginBottom: '6px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', marginBottom: '6px' }}>
                      {t === 'before' ? 'Before photos' : 'After photos'} ({list.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {list.map((p: any) => (
                        <img key={p.id} src={p.url} alt={t} style={{ width: '120px', height: '90px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #CBD5E1' }} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 8. Bottom Totals & Payment Summary */}
          <div style={{ display: 'flex', border: '1px solid #0284C7', marginBottom: '14px' }}>
            <div style={{ flex: 1, padding: '10px 14px', borderRight: '1px solid #0284C7' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', marginBottom: '4px' }}>
                WORKSHOP NOTES & INSTRUCTIONS
              </div>
              <div style={{ fontSize: '11px', color: '#333', lineHeight: 1.5 }}>
                {cart.notes || 'Standard detailing & washing service.'}
              </div>
            </div>
            <div style={{ flex: '0 0 260px', padding: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #eee' }}>
                <span style={{ fontWeight: 600 }}>Estimated Total</span>
                <span style={{ fontWeight: 700 }}>{formatINR(grandTotal)}</span>
              </div>
              {discountAmt > 0 && (
                <div style={{ padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #eee', color: '#0284C7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                    <span>Discount ({cart.discount_type === 'percentage' ? `${cart.discount_value}%` : 'Fixed'})</span>
                    <span>- {formatINR(discountAmt)}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: '#64748b', marginTop: '2px', fontWeight: 500 }}>
                    Reason: <strong>{cart.discount_reason || 'Not given'}</strong>
                    {' · '}Approved by: <strong>{(cart as any).discount_approved_by_name || cart.discount_reference || 'Not recorded'}</strong>
                  </div>
                </div>
              )}
              {pickupCharge > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #eee' }}>
                  <span style={{ fontWeight: 600 }}>Pickup / drop</span>
                  <span style={{ fontWeight: 700 }}>+ {formatINR(pickupCharge)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #eee' }}>
                <span style={{ fontWeight: 600 }}>Total payable</span>
                <span style={{ fontWeight: 700 }}>{formatINR(payable)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', fontSize: '11px', borderBottom: '1px solid #eee' }}>
                <span style={{ fontWeight: 600 }}>{isPaid ? 'Paid' : 'Advance Paid'}</span>
                <span style={{ fontWeight: 700 }}>{formatINR(isPaid ? payable : advancePaid)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#0284C7', color: '#FFFFFF', fontWeight: 800, fontSize: '13px' }}>
                <span>Balance Due</span>
                <span>{formatINR(balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Payment QR from Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px dashed #94a3b8', padding: '8px 12px', marginBottom: '14px' }}>
            <StudioQr place="jobcard" className="w-24 h-24" />
            <div style={{ fontSize: '10px', color: '#334155' }}>
              <b>Scan & pay with any UPI app</b><br />{studio?.upi_id ? `UPI: ${studio.upi_id}` : ''}
            </div>
          </div>

          {/* 9. Terms & Conditions */}
          <div style={{ border: '1px solid #0284C7', padding: '10px 14px', marginBottom: '14px' }}>
            <div style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase', marginBottom: '4px' }}>
              TERMS AND CONDITIONS
            </div>
            <div style={{ fontSize: '9px', color: '#444', lineHeight: 1.5 }}>
              1. Your car belongings are not our responsibility. Please verify all belongings before dropping your vehicle at our workshop.<br />
              2. Please check and remove any cash or important documents before handing over the vehicle.<br />
              3. All legal disputes are subject to Anand jurisdiction only.
            </div>
          </div>

          {/* 10. Authorised Signatory Footer */}
          <div style={{ border: '1px solid #0284C7', padding: '24px 14px 12px', textAlign: 'right' }}>
            <div style={{ width: '220px', marginLeft: 'auto', textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #999', paddingTop: '6px' }}>
                <div style={{ fontSize: '10px', fontWeight: 800, color: '#0284C7', textTransform: 'uppercase' }}>
                  AUTHORISED SIGNATORY FOR
                </div>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#1a1a1a', marginTop: '2px' }}>
                  O3 Car Spaa
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

