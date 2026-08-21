import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  CheckSquare,
  CalendarOff,
  Trophy,
  Plus,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
  UserCheck,
  Download,
  Printer,
  Calendar,
} from 'lucide-react';
import {
  useStaffTasks,
  useCreateStaffTask,
  useUpdateTaskStatus,
  useStaffLeaves,
  useUpdateLeaveStatus,
  useStaffPerformance,
  useStaffAttendance,
  useStaffAttendanceSummary,
  useMarkStaffAttendance,
  useStaffPayroll,
  useProcessPayroll,
  useUpdatePayrollItem,
} from '../../api/hooks/useStaffHR';
import { useStaffList } from '../../api/hooks/useStaff';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';
import { formatINR } from '../../utils/formatters';
import toast from 'react-hot-toast';

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
};

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending: Clock,
  in_progress: AlertCircle,
  completed: CheckCircle,
  cancelled: XCircle,
};

type Tab = 'tasks' | 'leaves' | 'performance' | 'payroll' | 'attendance';

export default function StaffHRPage() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ assigned_to: '', title: '', description: '', priority: 'medium', due_date: '' });

  // Payroll state
  const [payrollMonth, setPayrollMonth] = useState(new Date().getMonth() + 1);
  const [payrollYear, setPayrollYear] = useState(new Date().getFullYear());
  const [payModal, setPayModal] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({ payment_mode: 'cash', bonuses: 0, deductions: 0 });
  const [slipModal, setSlipModal] = useState<any | null>(null);

  // Attendance Roster state
  const [attPeriod, setAttPeriod] = useState<'today' | 'weekly' | 'monthly' | 'yearly'>('today');
  const [manualAttModal, setManualAttModal] = useState<any | null>(null);
  const [manualAttForm, setManualAttForm] = useState({
    status: 'present',
    note: '',
    check_in_time: '09:00',
    check_out_time: '18:00',
    att_date: new Date().toISOString().slice(0, 10),
  });

  // Queries
  const { data: staffList = [] } = useStaffList();
  const { data: tasks = [] } = useStaffTasks();
  const { data: leaves = [] } = useStaffLeaves();
  const { data: performance = [] } = useStaffPerformance();
  const { data: attendanceList = [] } = useStaffAttendance();
  const { data: attSummaryRes, refetch: refetchAttSummary } = useStaffAttendanceSummary({ period: attPeriod });
  const { data: payrollList = [], refetch: refetchPayroll } = useStaffPayroll({
    month: payrollMonth.toString(),
    year: payrollYear.toString(),
  });

  // Mutations
  const createTask = useCreateStaffTask();
  const updateTask = useUpdateTaskStatus();
  const updateLeave = useUpdateLeaveStatus();
  const processPayroll = useProcessPayroll();
  const updatePayrollItem = useUpdatePayrollItem();
  const markStaffAtt = useMarkStaffAttendance();

  const summaryData = attSummaryRes?.data || [];
  const summaryCounts = attSummaryRes?.summary || { total_staff: 0, present_today: 0, absent_today: 0, photo_verified: 0 };

  const handleSaveManualAttendance = () => {
    if (!manualAttModal) return;
    markStaffAtt.mutate(
      {
        staffId: manualAttModal.staff_id || manualAttModal.id,
        status: manualAttForm.status,
        note: manualAttForm.note || 'Admin Manual Entry',
        check_in_time: manualAttForm.check_in_time,
        check_out_time: manualAttForm.check_out_time,
        att_date: manualAttForm.att_date,
      },
      {
        onSuccess: () => {
          toast.success('Attendance marked successfully');
          setManualAttModal(null);
          refetchAttSummary();
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.error || 'Failed to mark attendance');
        },
      }
    );
  };

  const pendingTasks = tasks.filter((t: any) => t.status !== 'completed' && t.status !== 'cancelled').length;
  const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
  const pendingLeaves = leaves.filter((l: any) => l.status === 'pending').length;

  const handleCreateTask = () => {
    if (!taskForm.assigned_to || !taskForm.title) {
      toast.error('Please fill required fields');
      return;
    }
    createTask.mutate(
      { ...taskForm, assigned_to: parseInt(taskForm.assigned_to) },
      {
        onSuccess: () => {
          setShowTaskModal(false);
          setTaskForm({ assigned_to: '', title: '', description: '', priority: 'medium', due_date: '' });
          toast.success('Task assigned successfully');
        },
      }
    );
  };

  const handleProcessPayroll = () => {
    processPayroll.mutate(
      { month: payrollMonth, year: payrollYear },
      {
        onSuccess: () => {
          toast.success('Monthly payroll processed successfully');
          refetchPayroll();
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.error || 'Failed to process payroll');
        },
      }
    );
  };

  const handlePayConfirm = () => {
    if (!payModal) return;
    updatePayrollItem.mutate(
      {
        id: payModal.id,
        payment_status: 'paid',
        payment_mode: payForm.payment_mode,
        bonuses: parseFloat(payForm.bonuses.toString() || '0'),
        deductions: parseFloat(payForm.deductions.toString() || '0'),
      },
      {
        onSuccess: () => {
          toast.success('Salary marked as PAID');
          setPayModal(null);
          refetchPayroll();
        },
        onError: (err: any) => {
          toast.error(err.response?.data?.error || 'Failed to update payroll item');
        },
      }
    );
  };

  const handlePrintSlip = () => {
    const slipDiv = document.getElementById('salary-slip-print');
    if (!slipDiv) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>O3 Car Spa - Salary Slip</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #333; }
            .slip-card { border: 2px solid #eaeaea; padding: 30px; border-radius: 12px; max-width: 600px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #2563EB; pb: 15px; margin-bottom: 20px; }
            .header h2 { margin: 0; color: #2563EB; font-size: 24px; text-transform: uppercase; }
            .header p { margin: 5px 0 0; font-size: 12px; color: #777; }
            .section-title { font-size: 14px; font-weight: bold; text-transform: uppercase; margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #555; }
            .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
            .bold { font-weight: bold; }
            .net-row { font-size: 18px; border-top: 2px dashed #2563EB; padding-top: 10px; margin-top: 15px; }
            .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eaeaea; padding-top: 15px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <div class="slip-card">
            ${slipDiv.innerHTML}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const tabs = [
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: pendingTasks },
    { id: 'leaves', label: 'Leave Requests', icon: CalendarOff, count: pendingLeaves },
    { id: 'performance', label: 'Performance', icon: Trophy },
    { id: 'payroll', label: 'Payroll', icon: DollarSign },
    { id: 'attendance', label: 'Attendance', icon: UserCheck },
  ];

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto">
      <PremiumPageHeader
        title="Staff HR"
        subtitle="Manage workflows, requests, salaries, and presence details"
        icon={Users}
        iconColor="#0EA5E9"
        accentGradient="from-sky-600 to-sky-500"
        actions={
          <RippleButton onClick={() => setShowTaskModal(true)} variant="primary" className="bg-sky-500 hover:bg-sky-600 text-white rounded-xl">
            <Plus size={14} className="mr-1" /> Assign Task
          </RippleButton>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <PremiumStatCard title="Active Tasks" value={pendingTasks} icon={CheckSquare} color="#0EA5E9" gradient="from-sky-500/10 to-sky-400/5" />
        <PremiumStatCard title="Completed Tasks" value={completedTasks} icon={CheckCircle} color="#10B981" gradient="from-emerald-500/10 to-emerald-400/5" delay={0.1} />
        <PremiumStatCard title="Pending Leaves" value={pendingLeaves} icon={CalendarOff} color="#F59E0B" gradient="from-amber-500/10 to-amber-400/5" delay={0.2} />
        <PremiumStatCard title="Team Members" value={staffList.length || 0} icon={Users} color="#7C3AED" gradient="from-purple-500/10 to-purple-400/5" delay={0.3} />
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-[#0F172A] shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon size={16} />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="text-[10px] bg-[#2563EB] text-white px-1.5 py-0.5 rounded-full font-bold">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tasks Tab */}
      {tab === 'tasks' && (
        <AnimatedCard className="bg-white rounded-2xl border border-gray-100" delay={0.15}>
          <div className="divide-y divide-gray-50">
            {tasks.length === 0 ? (
              <div className="p-12 text-center">
                <CheckSquare size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No tasks assigned yet</p>
              </div>
            ) : (
              tasks.map((task: any, i: number) => {
                const StatusIcon = STATUS_ICONS[task.status] || Clock;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        task.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-600'
                          : task.status === 'in_progress'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <StatusIcon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-sm font-semibold ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-[#0F172A]'}`}>
                          {task.title}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold capitalize ${PRIORITY_STYLES[task.priority] || ''}`}>
                          {task.priority}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Assigned to: <span className="font-semibold text-gray-600">{task.staff_name || 'Unassigned'}</span>{' '}
                        {task.due_date ? `· Due ${new Date(task.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                      </p>
                      {task.description && <p className="text-xs text-gray-400 mt-1">{task.description}</p>}
                    </div>
                    {task.status !== 'completed' && task.status !== 'cancelled' && (
                      <div className="flex gap-1.5 shrink-0">
                        {task.status === 'pending' && (
                          <RippleButton variant="ghost" onClick={() => updateTask.mutate({ id: task.id, status: 'in_progress' })}>
                            Start
                          </RippleButton>
                        )}
                        <RippleButton variant="primary" onClick={() => updateTask.mutate({ id: task.id, status: 'completed' })}>
                          <CheckCircle size={14} className="mr-1" /> Done
                        </RippleButton>
                      </div>
                    )}
                  </motion.div>
                );
              })
            )}
          </div>
        </AnimatedCard>
      )}

      {/* Leaves Tab */}
      {tab === 'leaves' && (
        <AnimatedCard className="bg-white rounded-2xl border border-gray-100" delay={0.15}>
          <div className="divide-y divide-gray-50">
            {leaves.length === 0 ? (
              <div className="p-12 text-center">
                <CalendarOff size={40} className="mx-auto text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No leave requests</p>
              </div>
            ) : (
              leaves.map((leave: any, i: number) => (
                <motion.div
                  key={leave.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      leave.status === 'approved'
                        ? 'bg-emerald-50 text-emerald-600'
                        : leave.status === 'rejected'
                        ? 'bg-blue-50 text-blue-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    <CalendarOff size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-[#0F172A]">{leave.staff_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium capitalize">
                        {leave.leave_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(leave.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} —{' '}
                      {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} ·{' '}
                      {leave.days_count} day{leave.days_count > 1 ? 's' : ''}
                    </p>
                    {leave.reason && <p className="text-xs text-gray-400 mt-0.5">{leave.reason}</p>}
                  </div>
                  <div className="shrink-0">
                    {leave.status === 'pending' ? (
                      <div className="flex gap-1.5">
                        <RippleButton variant="primary" onClick={() => updateLeave.mutate({ id: leave.id, status: 'approved' })}>
                          Approve
                        </RippleButton>
                        <RippleButton variant="danger" onClick={() => updateLeave.mutate({ id: leave.id, status: 'rejected' })}>
                          Reject
                        </RippleButton>
                      </div>
                    ) : (
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold capitalize ${
                          leave.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {leave.status}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </AnimatedCard>
      )}

      {/* Performance Tab */}
      {tab === 'performance' && (
        <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.15}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Staff</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Period</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Jobs</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Rating</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Attendance</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Bonus</th>
                </tr>
              </thead>
              <tbody>
                {performance.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400 text-sm">
                      No performance data yet
                    </td>
                  </tr>
                ) : (
                  performance.map((p: any, i: number) => (
                    <motion.tr
                      key={p.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.05 }}
                      className="border-b border-gray-50 hover:bg-gray-50/50"
                    >
                      <td className="py-3 px-4 font-medium text-[#0F172A]">{p.staff_name}</td>
                      <td className="py-3 px-4 text-center text-gray-600">{p.period}</td>
                      <td className="py-3 px-4 text-center font-semibold">{p.jobs_completed}</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            parseFloat(p.avg_rating) >= 4
                              ? 'bg-emerald-50 text-emerald-700'
                              : parseFloat(p.avg_rating) >= 3
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          ★ {parseFloat(p.avg_rating).toFixed(1)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full bg-sky-500 rounded-full" style={{ width: `${p.attendance_pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-600">{p.attendance_pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        ₹{parseFloat(p.bonus_amount).toLocaleString('en-IN')}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AnimatedCard>
      )}

      {/* Payroll Tab */}
      {tab === 'payroll' && (
        <div className="space-y-4">
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={18} className="text-gray-400" />
              <select
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(parseInt(e.target.value))}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString('default', { month: 'long' })}
                  </option>
                ))}
              </select>
              <select
                value={payrollYear}
                onChange={(e) => setPayrollYear(parseInt(e.target.value))}
                className="border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
              >
                {[2025, 2026, 2027].map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
            <RippleButton onClick={handleProcessPayroll} variant="primary" className="bg-[#2563EB] hover:bg-[#1E40AF] text-white rounded-xl text-xs py-2 px-4 font-semibold">
              Process Monthly Payroll
            </RippleButton>
          </AnimatedCard>

          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.1}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Staff Member</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Base Salary</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Days (Att/Leave)</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Bonus / Deduct</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Net Salary</th>
                    <th className="text-center py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payrollList.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                        No payroll records processed for this month.
                      </td>
                    </tr>
                  ) : (
                    payrollList.map((p: any, i: number) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0F172A]">{p.staff_name}</div>
                          <div className="text-[10px] text-gray-400">{p.staff_mobile}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">{formatINR(p.base_salary)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-emerald-600 font-semibold">{p.present_days}d</span>
                          <span className="text-gray-300 mx-1">/</span>
                          <span className="text-amber-600">{p.leave_days}L</span>
                        </td>
                        <td className="py-3 px-4 text-right text-xs">
                          <div className="text-emerald-600 font-semibold">+{formatINR(p.bonuses)}</div>
                          <div className="text-blue-500">-{formatINR(p.deductions)}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-[#0F172A]">{formatINR(p.net_salary)}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                              p.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {p.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {p.payment_status === 'pending' && (
                            <button
                              onClick={() => {
                                setPayModal(p);
                                setPayForm({ payment_mode: 'cash', bonuses: parseFloat(p.bonuses), deductions: parseFloat(p.deductions) });
                              }}
                              className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700 transition"
                            >
                              Mark Paid
                            </button>
                          )}
                          <button
                            onClick={() => setSlipModal(p)}
                            className="p-1 hover:bg-gray-100 rounded text-gray-500 inline-flex items-center gap-1 text-xs"
                            title="View Slip"
                          >
                            <Printer size={14} /> Slip
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* Attendance Tab */}
      {tab === 'attendance' && (
        <div className="space-y-6">
          {/* Top Control Bar & Period Switcher */}
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Attendance Period:</span>
              <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                {(['today', 'weekly', 'monthly', 'yearly'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAttPeriod(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold capitalize transition-all ${
                      attPeriod === mode
                        ? 'bg-[#2563EB] text-white shadow-xs'
                        : 'text-gray-600 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'today' ? "Today's Roster" : mode}
                  </button>
                ))}
              </div>
            </div>

            <RippleButton
              onClick={() => {
                if (staffList.length) {
                  setManualAttModal(staffList[0]);
                } else {
                  toast.error('No active staff found');
                }
              }}
              variant="primary"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs py-2 px-4 font-bold flex items-center gap-1.5"
            >
              <Plus size={14} /> Mark / Adjust Staff Attendance
            </RippleButton>
          </div>

          {/* KPI Cards for Today */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <PremiumStatCard
              title="Total Team Staff"
              value={summaryCounts.total_staff}
              icon={Users}
              color="#2563EB"
              gradient="from-blue-500/10 to-blue-400/5"
            />
            <PremiumStatCard
              title="Checked In Today"
              value={summaryCounts.present_today}
              icon={UserCheck}
              color="#10B981"
              gradient="from-emerald-500/10 to-emerald-400/5"
            />
            <PremiumStatCard
              title="Not Checked In / Absent"
              value={summaryCounts.absent_today}
              icon={XCircle}
              color="#EF4444"
              gradient="from-red-500/10 to-red-400/5"
            />
            <PremiumStatCard
              title="Selfie & Geotag Verified"
              value={summaryCounts.photo_verified}
              icon={CheckCircle}
              color="#0EA5E9"
              gradient="from-sky-500/10 to-sky-400/5"
            />
          </div>

          {/* Roster & Stats Table */}
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden" delay={0.15}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left">
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase">Staff Member</th>
                    <th className="py-3 px-4 text-xs font-bold text-gray-500 uppercase">Studio / Outlet</th>
                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-500 uppercase">Today's Status</th>
                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-500 uppercase">Shift Times</th>
                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-500 uppercase">Face Selfie & Geotag</th>
                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-500 uppercase">
                      {attPeriod === 'weekly' ? 'Weekly (7d)' : attPeriod === 'yearly' ? 'Yearly (2026)' : 'Monthly Att %'}
                    </th>
                    <th className="py-3 px-4 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {summaryData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400 text-sm font-bold">
                        No staff members found for attendance roster.
                      </td>
                    </tr>
                  ) : (
                    summaryData.map((item: any) => {
                      const isPresent = item.today_status === 'present' || item.today_status === 'half_day';
                      const isCompleted = item.today_record?.check_out_time;

                      return (
                        <tr key={item.staff_id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-extrabold text-[#0F172A]">{item.staff_name}</p>
                            <p className="text-[10px] text-gray-400 font-mono">{item.staff_mobile}</p>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs font-extrabold text-[#2563EB] bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                              {item.franchise_name}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                isCompleted
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : isPresent
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {isCompleted
                                ? 'Shift Completed'
                                : isPresent
                                ? 'Active Duty / Clocked In'
                                : 'Not Checked In / Absent'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-xs font-bold text-gray-700">
                            {item.check_in_time ? (
                              <span>
                                In: {new Date(item.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                {item.check_out_time && (
                                  <span className="text-gray-400 block font-normal text-[10px]">
                                    Out: {new Date(item.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                )}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {item.face_photo_url ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setSlipModal({
                                    isPhotoModal: true,
                                    staff_name: item.staff_name,
                                    franchise_name: item.franchise_name,
                                    att_date: item.today_record?.att_date || new Date().toISOString(),
                                    face_photo_url: item.face_photo_url,
                                    latitude: item.latitude,
                                    longitude: item.longitude,
                                    check_in_time: item.check_in_time,
                                  })
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-extrabold transition-all border border-emerald-200"
                              >
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                View Premises Photo
                              </button>
                            ) : item.is_geofenced_valid ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                Geofence Verified
                              </span>
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">No Photo Uploaded</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {attPeriod === 'weekly' ? (
                              <span className="text-xs font-bold text-gray-700">
                                {item.stats.weekly_present}d Present / {item.stats.weekly_absent}d Absent
                              </span>
                            ) : attPeriod === 'yearly' ? (
                              <span className="text-xs font-bold text-gray-700">
                                {item.stats.yearly_present}d Present
                              </span>
                            ) : (
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      item.stats.attendance_pct >= 90
                                        ? 'bg-emerald-500'
                                        : item.stats.attendance_pct >= 75
                                        ? 'bg-amber-500'
                                        : 'bg-red-500'
                                    }`}
                                    style={{ width: `${item.stats.attendance_pct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-extrabold text-slate-800">{item.stats.attendance_pct}%</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setManualAttModal(item);
                                setManualAttForm({
                                  status: item.today_status === 'not_checked_in' ? 'present' : item.today_status,
                                  note: 'Admin Manual Override',
                                  check_in_time: '09:00',
                                  check_out_time: '18:00',
                                  att_date: new Date().toISOString().slice(0, 10),
                                });
                              }}
                              className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all"
                            >
                              Mark / Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* Assign Task Modal */}
      <AnimatedModal isOpen={showTaskModal} onClose={() => setShowTaskModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-6">Assign Task</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Staff Member</label>
              <select
                value={taskForm.assigned_to}
                onChange={(e) => setTaskForm((p) => ({ ...p, assigned_to: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
              >
                <option value="">Select Staff...</option>
                {staffList.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.mobile})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Task Title</label>
              <input
                value={taskForm.title}
                onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                placeholder="What needs to be done?"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Description</label>
              <textarea
                value={taskForm.description}
                onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm"
                placeholder="Task details..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Priority</label>
                <select
                  value={taskForm.priority}
                  onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={taskForm.due_date}
                  onChange={(e) => setTaskForm((p) => ({ ...p, due_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <RippleButton variant="ghost" onClick={() => setShowTaskModal(false)}>
                Cancel
              </RippleButton>
              <RippleButton variant="primary" className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white rounded-xl" onClick={handleCreateTask}>
                Assign Task
              </RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>

      {/* Pay Confirmation & Bonus/Deduction Modal */}
      <AnimatedModal isOpen={!!payModal} onClose={() => setPayModal(null)}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-[#0F172A] mb-4">Complete Payment: {payModal?.staff_name}</h3>
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-semibold">Calculated Net Salary:</span>
              <span className="text-sm font-bold text-gray-800">{formatINR(payModal?.net_salary)}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Additional Bonus</label>
                <input
                  type="number"
                  value={payForm.bonuses}
                  onChange={(e) => setPayForm((p) => ({ ...p, bonuses: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Salary Deductions</label>
                <input
                  type="number"
                  value={payForm.deductions}
                  onChange={(e) => setPayForm((p) => ({ ...p, deductions: parseFloat(e.target.value) || 0 }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Payment Mode</label>
              <select
                value={payForm.payment_mode}
                onChange={(e) => setPayForm((p) => ({ ...p, payment_mode: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <RippleButton variant="ghost" onClick={() => setPayModal(null)}>
              Cancel
            </RippleButton>
            <RippleButton variant="primary" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl" onClick={handlePayConfirm}>
              Confirm & Pay
            </RippleButton>
          </div>
        </div>
      </AnimatedModal>

      {/* Salary Slip / Facial Photo Detail Modal */}
      <AnimatedModal isOpen={!!slipModal} onClose={() => setSlipModal(null)}>
        <div className="p-6">
          {slipModal?.isPhotoModal ? (
            <div className="space-y-4 text-center">
              <h3 className="text-lg font-black text-slate-900">
                Facial Attendance Verification: {slipModal?.staff_name}
              </h3>
              <p className="text-xs text-[#2563EB] font-bold">
                Outlet: {slipModal?.franchise_name || 'Main Studio'} · Date: {new Date(slipModal?.att_date).toLocaleDateString('en-IN')}
              </p>

              {slipModal?.face_photo_url ? (
                <div className="relative aspect-video rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-lg mx-auto max-w-sm">
                  <img src={slipModal.face_photo_url} alt="Staff Attendance Facial Capture" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="p-6 bg-slate-100 rounded-2xl text-xs text-gray-500 font-bold">
                  No selfie photo available for this log entry
                </div>
              )}

              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 font-bold text-left space-y-1">
                <p>📍 Location Status: <strong>Studio Premises Geofence Verified</strong></p>
                {slipModal?.latitude && (
                  <p className="text-[11px] text-emerald-700 font-mono">GPS Coordinates: {slipModal.latitude}, {slipModal.longitude}</p>
                )}
                <p className="text-[11px] text-emerald-700">Punch-In: {slipModal?.check_in_time ? new Date(slipModal.check_in_time).toLocaleTimeString('en-IN') : 'Standard Log'}</p>
              </div>

              <div className="pt-2 flex justify-end">
                <RippleButton variant="ghost" onClick={() => setSlipModal(null)}>
                  Close
                </RippleButton>
              </div>
            </div>
          ) : (
            <>
              <div id="salary-slip-print">
                <div className="header">
                  <h2>O3 Car Spa</h2>
                  <p>Car Detailing Studio | Vitthal Udyognagar, Anand</p>
                  <p style={{ marginTop: '3px', fontWeight: 'bold' }}>SALARY SLIP FOR {new Date(2000, slipModal?.month - 1).toLocaleString('default', { month: 'long' }).toUpperCase()} {slipModal?.year}</p>
                </div>

                <div className="section-title">Employee Details</div>
                <div className="row">
                  <span>Employee Name:</span>
                  <span className="bold">{slipModal?.staff_name}</span>
                </div>
            <div className="row">
              <span>Mobile Number:</span>
              <span>{slipModal?.staff_mobile}</span>
            </div>
            <div className="row">
              <span>Email:</span>
              <span>{slipModal?.staff_email || '—'}</span>
            </div>

            <div className="section-title">Salary Breakdown</div>
            <div className="row">
              <span>Base Rate / Salary:</span>
              <span>{formatINR(slipModal?.base_salary)}</span>
            </div>
            <div className="row">
              <span>Attendance Presence:</span>
              <span>{slipModal?.present_days} Days (calculated)</span>
            </div>
            <div className="row">
              <span>Leaves Approved:</span>
              <span>{slipModal?.leave_days} Days</span>
            </div>
            <div className="row">
              <span>Performance Bonuses:</span>
              <span className="text-emerald-600">+{formatINR(slipModal?.bonuses)}</span>
            </div>
            <div className="row">
              <span>Deductions:</span>
              <span className="text-blue-500">-{formatINR(slipModal?.deductions)}</span>
            </div>

            <div className="row bold net-row">
              <span>Net Paid Amount:</span>
              <span>{formatINR(slipModal?.net_salary)}</span>
            </div>

            <div className="footer">
              <p>This is a system generated salary slip and does not require a physical signature.</p>
              <p>O3 Car Spa © {new Date().getFullYear()}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 border-t border-gray-100 pt-4">
            <RippleButton variant="ghost" onClick={() => setSlipModal(null)}>
              Close
            </RippleButton>
            <RippleButton variant="primary" className="bg-[#2563EB] hover:bg-[#1E40AF] text-white rounded-xl inline-flex items-center gap-1.5" onClick={handlePrintSlip}>
              <Printer size={16} /> Print Payslip
            </RippleButton>
          </div>
          </>
          )}
        </div>
      </AnimatedModal>

      {/* Manual Staff Attendance Override Modal */}
      <AnimatedModal isOpen={!!manualAttModal} onClose={() => setManualAttModal(null)}>
        <div className="p-6">
          <h3 className="text-lg font-bold text-[#0F172A] mb-1">
            Mark / Adjust Staff Attendance
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Staff: <strong className="text-slate-900">{manualAttModal?.staff_name || manualAttModal?.name}</strong> ({manualAttModal?.staff_mobile || manualAttModal?.mobile})
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Attendance Date</label>
              <input
                type="date"
                value={manualAttForm.att_date}
                onChange={(e) => setManualAttForm((p) => ({ ...p, att_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Attendance Status</label>
              <select
                value={manualAttForm.status}
                onChange={(e) => setManualAttForm((p) => ({ ...p, status: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"
              >
                <option value="present">Present (Full Day)</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Check-In Time</label>
                <input
                  type="time"
                  value={manualAttForm.check_in_time}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, check_in_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Check-Out Time</label>
                <input
                  type="time"
                  value={manualAttForm.check_out_time}
                  onChange={(e) => setManualAttForm((p) => ({ ...p, check_out_time: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Admin Remark / Reason</label>
              <input
                type="text"
                value={manualAttForm.note}
                onChange={(e) => setManualAttForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="e.g. On-field client visit / Manual correction"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <RippleButton variant="ghost" onClick={() => setManualAttModal(null)}>
              Cancel
            </RippleButton>
            <RippleButton
              variant="primary"
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold"
              onClick={handleSaveManualAttendance}
            >
              Save Attendance Record
            </RippleButton>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
