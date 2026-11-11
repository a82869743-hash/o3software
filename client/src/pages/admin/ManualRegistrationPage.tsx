import { ymd } from '../../utils/formatters';
import { CAR_TYPES } from '../../utils/carTypes';
import { useState, useEffect } from 'react';
import api from '../../api/axiosInstance';
import { PlusCircle, Search, User, Car, Phone, Mail, Box, Calendar, Loader2, IndianRupee } from 'lucide-react';
import { useBrands, useModels } from '../../api/hooks/useVehicles';
import { getCategoryForModel } from '../../utils/carData';
import AdminHero from '../../components/admin/AdminHero';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

interface OfflineRegistration {
  customer_id: number;
  name: string;
  mobile: string;
  brand: string;
  model: string;
  registration_no: string;
  package_id: number | null;
  package_name: string | null;
  status: string | null;
  created_at: string;
}

export default function ManualRegistrationPage() {
  const [registrations, setRegistrations] = useState<OfflineRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    email: '',
    password: '',
    brand: '',
    model: '',
    category: '',
    registration_no: '',
    package_id: '',
    price: '',
    package_start_date: ymd(),
    package_end_date: ''
  });

  const [packages, setPackages] = useState<any[]>([]);
  const [existingCustomer, setExistingCustomer] = useState(false);
  const [packageServices, setPackageServices] = useState<any[]>([]);
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');

  // Car brand/model lists
  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(formData.brand);
  const brandsList: string[] = brandsRes?.data || [];
  const modelsList: string[] = modelsRes?.data || [];

  const brandsOptions = [
    ...brandsList.map((b: string) => ({ value: b, label: b })),
    { value: 'Others', label: 'Others (Enter Manually)' }
  ];

  const modelsOptions = [
    ...modelsList.map((m: string) => ({ value: m, label: m })),
    { value: 'Others', label: 'Others (Enter Manually)' }
  ];

  useLiveReload(() => { fetchPackages(); fetchRegistrations(); }); // reload when anything changes elsewhere
  useEffect(() => {
    fetchRegistrations();
    fetchPackages();
  }, []);

  useEffect(() => {
    if (!formData.package_id) {
      setPackageServices([]);
      return;
    }
    const loadServices = async () => {
      try {
        const res = await api.get(`/packages/${formData.package_id}/services`);
        if (res.data.success) {
          const mapped = res.data.data.map((s: any) => ({
            service_name: s.name,
            total_count: s.total_count || 1,
            remaining: s.total_count || 1,
            complimentary: s.complimentary || 0,
            display_order: s.display_order || 0
          }));
          setPackageServices(mapped);
        }
      } catch (err) {
        console.error('Failed to fetch package services:', err);
      }
    };
    loadServices();
  }, [formData.package_id]);

  // Package chosen (or car type / start date changed): fill the package's price for this car type and its end date.
  // Admin can still type a different price.
  useEffect(() => {
    const pkg = packages.find(p => String(p.id) === String(formData.package_id));
    if (!pkg) return;
    const cat = formData.category || 'sedan';
    const row = (pkg.pricing || []).find((r: any) => r.car_type === cat && (r.pricing_type || 'basic') === 'basic');
    const price = Number(row?.price) || Number(pkg[`price_${cat}`]) || 0;
    const months = Number(pkg.package_validity) || 0;
    setFormData((f: any) => {
      let end = f.package_end_date;
      if (months && f.package_start_date) {
        const d = new Date(`${f.package_start_date}T00:00:00`);
        d.setMonth(d.getMonth() + months);
        end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return { ...f, price: price ? String(price) : f.price, package_end_date: end };
    });
  }, [formData.package_id, formData.category, formData.package_start_date, packages]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers/manual-registration/list', { params: { search } });
      if (res.data.success) {
        setRegistrations(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPackages = async () => {
    try {
      const res = await api.get('/packages');
      if (res.data.success) {
        setPackages(res.data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRegistrations();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalBrand = formData.brand === 'Others' ? customBrand : formData.brand;
    const finalModel = (formData.brand === 'Others' || formData.model === 'Others') ? customModel : formData.model;

    if (formData.package_id) {
      if (!finalBrand.trim() || !finalModel.trim() || !formData.registration_no.trim() || !formData.category) {
        alert('All vehicle details (Brand, Model, Reg No, Category) are required when selecting a package.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        brand: finalBrand,
        model: finalModel,
        package_custom_services: formData.package_id ? packageServices : undefined
      };
      const res = await api.post('/customers/manual-registration', payload);
      if (res.data.success) {
        alert('Customer registered successfully!');
        setFormData({
          name: '', mobile: '', email: '', password: '', brand: '', model: '',
          category: '', registration_no: '', package_id: '', price: '',
          package_start_date: ymd(),
          package_end_date: ''
        });
        setCustomBrand('');
        setCustomModel('');
        setPackageServices([]);
        fetchRegistrations();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to register customer');
    } finally {
      setSubmitting(false);
    }
  };

  // Auto lookup when a 10-digit mobile number is typed
  useEffect(() => {
    const cleanMobile = formData.mobile.replace(/\D/g, '');
    if (cleanMobile.length === 10) {
      const lookupCustomer = async () => {
        try {
          const res = await api.get(`/customers/lookup/${cleanMobile}`);
          setExistingCustomer(!!(res.data.success && res.data.found));
          if (res.data.success && res.data.found) {
            const cust = res.data.data;
            setFormData(prev => ({
              ...prev,
              name: cust.name || prev.name,
              email: cust.email || prev.email || '',
              brand: cust.vehicle?.brand || prev.brand || '',
              model: cust.vehicle?.model || prev.model || '',
              category: cust.vehicle?.category || prev.category || '',
              registration_no: cust.vehicle?.registration_no || prev.registration_no || ''
            }));
          }
        } catch (err) {
          console.warn('Customer auto-lookup failed:', err);
        }
      };
      lookupCustomer();
    }
  }, [formData.mobile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let { name, value } = e.target;
    // strict formats: 10-digit mobile, GJ06AB1234-style number plate
    if (name === 'mobile') value = value.replace(/\D/g, '').slice(0, 10);
    if (name === 'registration_no') value = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto font-sans">
      <AdminHero title={'Offline Registration'} subtitle={'Manually register walk-in customers, their vehicles, and directly assign packages.'} />
      <div className="mb-8">
        
        
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Form Panel */}
        <div className="lg:col-span-1">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
            <h3 className="font-bold text-lg text-gray-900 border-b pb-3 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              New Registration
            </h3>

            {/* Customer Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Customer Details</h4>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input required name="name" value={formData.name} onChange={handleChange} className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="John Doe" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Mobile Number *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    required
                    type="tel"
                    name="mobile"
                    maxLength={10}
                    value={formData.mobile}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setFormData(prev => ({ ...prev, mobile: val }));
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="9876543210"
                  />
                </div>
                {existingCustomer && <p className="text-[11px] text-emerald-700 mt-1">Already a customer. Details filled in.</p>}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="name@example.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">App password {existingCustomer ? '(leave empty to keep theirs)' : '*'}</label>
                <input type="text" name="password" required={!existingCustomer} minLength={6} autoComplete="new-password" value={formData.password} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="At least 6 characters" />
                <p className="text-[11px] text-gray-500 mt-1">The customer logs in to the O3 app with this mobile and password.</p>
              </div>
            </div>

            {/* Vehicle Details */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Vehicle Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <SearchableSelect
                    label="Brand"
                    options={brandsOptions}
                    value={formData.brand}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, brand: e.target.value, model: '', category: '' }));
                      setCustomBrand('');
                      setCustomModel('');
                    }}
                    placeholder="Select Brand"
                  />
                </div>
                <div>
                  <SearchableSelect
                    label="Model"
                    options={modelsOptions}
                    value={formData.model}
                    onChange={(e) => {
                      const mVal = e.target.value;
                      const cat = getCategoryForModel(formData.brand, mVal) || '';
                      setFormData(prev => ({ ...prev, model: mVal, category: cat }));
                      setCustomModel('');
                    }}
                    placeholder={formData.brand ? "Select Model" : "Select brand first"}
                    disabled={!formData.brand || formData.brand === 'Others'}
                  />
                </div>
              </div>
              {(formData.brand === 'Others' || formData.model === 'Others') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                  {formData.brand === 'Others' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Enter Brand Name</label>
                      <input
                        type="text"
                        value={customBrand}
                        onChange={(e) => setCustomBrand(e.target.value)}
                        placeholder="e.g. Porsche"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  )}
                  {(formData.brand === 'Others' || formData.model === 'Others') && (
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Enter Model Name</label>
                      <input
                        type="text"
                        value={customModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomModel(val);
                          if (val.trim()) {
                            const detectedCat = getCategoryForModel(formData.brand === 'Others' ? customBrand : formData.brand, val);
                            if (detectedCat) {
                              setFormData(prev => ({ ...prev, category: detectedCat }));
                            }
                          }
                        }}
                        placeholder="e.g. Cayenne"
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reg No.</label>
                  <input name="registration_no" value={formData.registration_no} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm uppercase focus:bg-white focus:ring-2 focus:ring-blue-500" placeholder="MH01AB1234" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <Dropdown name="category" value={formData.category} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500">
                    <option value="">Select...</option>
                    {CAR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Dropdown>
                </div>
              </div>
            </div>

            {/* Package Details */}
            <div className="space-y-4 pt-4 border-t">
              <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Package Details (Optional)</h4>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Select Package</label>
                <Dropdown name="package_id" value={formData.package_id} onChange={handleChange} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500">
                  <option value="">No Package</option>
                  {packages.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Dropdown>
              </div>
              {formData.package_id && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Final Price (₹)</label>
                    <div className="relative">
                      <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="number" name="price" value={formData.price} onChange={handleChange} className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="0" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Package Start Date</label>
                      <input 
                        type="date" 
                        name="package_start_date" 
                        value={formData.package_start_date} 
                        onChange={handleChange} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Package End Date (Optional)</label>
                      <input 
                        type="date" 
                        name="package_end_date" 
                        value={formData.package_end_date} 
                        onChange={handleChange} 
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500" 
                        placeholder="Auto calculated"
                      />
                    </div>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-dashed border-gray-200">
                    <label className="block text-xs font-semibold text-gray-700">Remaining Service Balances</label>
                    <p className="text-[10px] text-gray-400">Specify current remaining counts for this customer's package services.</p>
                    
                    <div className="space-y-2">
                      {packageServices.map((svc, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                          <span className="text-xs font-medium text-gray-700 truncate flex-1" title={svc.service_name}>
                            {svc.service_name} {svc.complimentary === 1 ? '(Free)' : ''}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min="0"
                              max={svc.total_count}
                              className="w-14 px-2 py-1 text-center border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 bg-white"
                              value={svc.remaining}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(svc.total_count, parseInt(e.target.value) || 0));
                                const next = [...packageServices];
                                next[idx].remaining = val;
                                setPackageServices(next);
                              }}
                            />
                            <span className="text-xs text-gray-500 font-semibold">/ {svc.total_count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button type="submit" disabled={submitting} className="w-full bg-gray-900 text-white font-bold py-3 rounded-lg hover:bg-gray-800 transition flex justify-center items-center gap-2">
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Register Customer'}
            </button>
          </form>
        </div>

        {/* Right List Panel */}
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2 w-full max-w-md ml-auto">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search registrations..." className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <button type="submit" className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition shadow-sm">Search</button>
          </form>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="p-4">Customer</th>
                    <th className="p-4">Vehicle</th>
                    <th className="p-4">Package</th>
                    <th className="p-4 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                  ) : registrations.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">No recent registrations found.</td></tr>
                  ) : (
                    registrations.map((reg, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition">
                        <td className="p-4">
                          <div className="font-bold text-gray-900">{reg.name}</div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3"/> {reg.mobile}</div>
                        </td>
                        <td className="p-4">
                          {reg.brand ? (
                            <>
                              <div className="font-medium text-gray-800">{reg.brand} {reg.model}</div>
                              <div className="text-xs text-gray-500">{reg.registration_no || 'No Reg'}</div>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">No vehicle</span>
                          )}
                        </td>
                        <td className="p-4">
                          {reg.package_id ? (
                            <div>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                {reg.package_name}
                              </span>
                              {reg.status && <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">{reg.status}</div>}
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">—</span>
                          )}
                        </td>
                        <td className="p-4 text-right text-gray-500 text-xs whitespace-nowrap">
                          {new Date(reg.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
