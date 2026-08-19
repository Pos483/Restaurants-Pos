import { useState, useMemo } from 'react';
import { useLiveQuery, db } from '../db';
import { DBStaff, DBStaffAttendance, DBStaffAdvance } from '../db/types';
import {
  Users, UserPlus, Calendar, IndianRupee, CheckCircle2,
  Edit3, Trash2, Wallet, X,
  ChevronLeft, ChevronRight, Phone,
  Receipt, Sparkles, Printer, Table2
} from 'lucide-react';
import { useToast } from './Toast';

export default function StaffManagement() {
  const { showToast } = useToast();

  // Active Main Tab: 'attendance' | 'register' | 'staff_list' | 'advances' | 'payroll'
  const [activeTab, setActiveTab] = useState<'attendance' | 'register' | 'staff_list' | 'advances' | 'payroll'>('attendance');

  // Helper date functions
  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getCurrentMonthString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthString());
  const [selectedRegisterMonth, setSelectedRegisterMonth] = useState<string>(getCurrentMonthString());
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals state
  const [showAddStaffModal, setShowAddStaffModal] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<DBStaff | null>(null);
  const [showAdvanceModal, setShowAdvanceModal] = useState<boolean>(false);

  // Form states for Staff Add/Edit
  const [staffName, setStaffName] = useState<string>('');
  const [staffRole, setStaffRole] = useState<DBStaff['role']>('waiter');
  const [staffPhone, setStaffPhone] = useState<string>('');
  const [staffSalary, setStaffSalary] = useState<string>('12000');
  const [staffSalaryType, setStaffSalaryType] = useState<'monthly' | 'daily'>('monthly');
  const [staffAllowedLeaves, setStaffAllowedLeaves] = useState<string>('4');
  const [staffJoiningDate, setStaffJoiningDate] = useState<string>(getTodayString());

  // Form states for Advance Payment
  const [advStaffId, setAdvStaffId] = useState<string>('');
  const [advAmount, setAdvAmount] = useState<string>('');
  const [advDate, setAdvDate] = useState<string>(getTodayString());
  const [advMethod, setAdvMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'other'>('cash');
  const [advNote, setAdvNote] = useState<string>('');

  // ── Database Queries ──────────────────────────────────────────────────────────
  const staffList = useLiveQuery(() => db.staff.toArray(), [], 'staff') || [];
  const attendanceList = useLiveQuery(() => db.staffAttendance.toArray(), [], 'staff_attendance') || [];
  const advancesList = useLiveQuery(() => db.staffAdvances.toArray(), [], 'staff_advances') || [];

  const activeStaff = useMemo(() => {
    return staffList.filter(s => s.status === 'active');
  }, [staffList]);

  // Attendance map for currently selected date: staffId -> DBStaffAttendance
  const attendanceMapForDate = useMemo(() => {
    const map = new Map<string, DBStaffAttendance>();
    attendanceList
      .filter(a => a.date === selectedDate)
      .forEach(a => map.set(a.staffId, a));
    return map;
  }, [attendanceList, selectedDate]);

  // Today / Selected Date Summary Stats
  const dailyStats = useMemo(() => {
    let present = 0;
    let paidLeave = 0;
    let halfDay = 0;
    let absent = 0;
    let unmarked = 0;

    activeStaff.forEach(staff => {
      const att = attendanceMapForDate.get(staff.id);
      if (!att) {
        unmarked++;
      } else if (att.status === 'present') {
        present++;
      } else if (att.status === 'leave') {
        paidLeave++;
      } else if (att.status === 'half_day') {
        halfDay++;
      } else if (att.status === 'absent') {
        absent++;
      }
    });

    return {
      total: activeStaff.length,
      present,
      paidLeave,
      halfDay,
      absent,
      unmarked
    };
  }, [activeStaff, attendanceMapForDate]);

  // ── Monthly Matrix Attendance Data ──────────────────────────────────────────
  const registerMatrixData = useMemo(() => {
    const [yearStr, monthStr] = selectedRegisterMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const totalDays = new Date(year, month, 0).getDate();
    const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1);

    const staffDayMap = new Map<string, Map<number, DBStaffAttendance>>();

    attendanceList.forEach(att => {
      const [aYear, aMonth, aDay] = att.date.split('-').map(Number);
      if (aYear === year && aMonth === month) {
        if (!staffDayMap.has(att.staffId)) {
          staffDayMap.set(att.staffId, new Map());
        }
        staffDayMap.get(att.staffId)!.set(aDay, att);
      }
    });

    const rows = activeStaff.map(staff => {
      const dayMap = staffDayMap.get(staff.id) || new Map();
      let presentCount = 0;
      let paidLeaveCount = 0;
      let halfDayCount = 0;
      let absentCount = 0;
      let unmarkedCount = 0;

      const dayRecords = daysArray.map(day => {
        const rec = dayMap.get(day);
        const status = rec?.status;
        if (status === 'present') presentCount++;
        else if (status === 'leave') paidLeaveCount++;
        else if (status === 'half_day') halfDayCount++;
        else if (status === 'absent') absentCount++;
        else unmarkedCount++;

        return { day, record: rec, status };
      });

      const payableDays = presentCount + paidLeaveCount + (halfDayCount * 0.5);

      return {
        staff,
        dayRecords,
        presentCount,
        paidLeaveCount,
        halfDayCount,
        absentCount,
        unmarkedCount,
        payableDays
      };
    });

    return {
      year,
      month,
      totalDays,
      daysArray,
      rows
    };
  }, [activeStaff, attendanceList, selectedRegisterMonth]);

  // ── Attendance Actions ───────────────────────────────────────────────────────

  const handleSetStatus = async (staffId: string, status: DBStaffAttendance['status'], customDate?: string) => {
    const targetDate = customDate || selectedDate;
    try {
      const existing = attendanceList.find(a => a.staffId === staffId && a.date === targetDate);
      if (existing) {
        if (existing.status === status) {
          await db.staffAttendance.delete(existing.id);
        } else {
          await db.staffAttendance.update(existing.id, {
            status,
            timestamp: Date.now()
          });
        }
      } else {
        const newAtt: DBStaffAttendance = {
          id: crypto.randomUUID(),
          staffId,
          date: targetDate,
          status,
          timestamp: Date.now()
        };
        await db.staffAttendance.add(newAtt);
      }
    } catch (err) {
      console.error('Error saving attendance:', err);
      showToast('⚠️ Failed to save attendance status.', 'error');
    }
  };

  const handleCycleMatrixStatus = async (staffId: string, day: number) => {
    const [y, m] = selectedRegisterMonth.split('-');
    const dateStr = `${y}-${m.padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = attendanceList.find(a => a.staffId === staffId && a.date === dateStr);
    const currentStatus = existing?.status;

    let nextStatus: DBStaffAttendance['status'] | null = 'present';
    if (!currentStatus) nextStatus = 'present';
    else if (currentStatus === 'present') nextStatus = 'leave';
    else if (currentStatus === 'leave') nextStatus = 'half_day';
    else if (currentStatus === 'half_day') nextStatus = 'absent';
    else nextStatus = null;

    try {
      if (nextStatus === null) {
        if (existing) await db.staffAttendance.delete(existing.id);
      } else {
        if (existing) {
          await db.staffAttendance.update(existing.id, { status: nextStatus, timestamp: Date.now() });
        } else {
          await db.staffAttendance.add({
            id: crypto.randomUUID(),
            staffId,
            date: dateStr,
            status: nextStatus,
            timestamp: Date.now()
          });
        }
      }
    } catch (err) {
      console.error('Matrix cell update failed:', err);
    }
  };

  const handleMarkAllPresent = async () => {
    if (activeStaff.length === 0) {
      showToast('⚠️ No active staff members to mark.', 'error');
      return;
    }
    try {
      for (const staff of activeStaff) {
        const existing = attendanceMapForDate.get(staff.id);
        if (existing) {
          await db.staffAttendance.update(existing.id, {
            status: 'present',
            timestamp: Date.now()
          });
        } else {
          await db.staffAttendance.add({
            id: crypto.randomUUID(),
            staffId: staff.id,
            date: selectedDate,
            status: 'present',
            timestamp: Date.now()
          });
        }
      }
      showToast(`✅ All ${activeStaff.length} staff members marked Present.`);
    } catch (err) {
      console.error('Failed to mark all present:', err);
      showToast('⚠️ Failed to mark all present.', 'error');
    }
  };

  // ── Print Attendance Register ────────────────────────────────────────────────
  const printAttendanceRegister = () => {
    const { daysArray, rows, totalDays, year, month } = registerMatrixData;
    const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const printWindow = window.open('', '_blank', 'width=1100,height=750');
    if (!printWindow) {
      showToast('⚠️ Pop-up blocked! Please allow pop-ups to print attendance register.', 'error');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Monthly Attendance Register - ${monthName}</title>
          <style>
            @page { size: landscape; margin: 6mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 10px; color: #0f172a; font-size: 9px; }
            h1 { font-size: 15px; margin: 0 0 2px 0; color: #0f172a; font-weight: 900; text-transform: uppercase; }
            .subtitle { font-size: 10px; color: #475569; margin-bottom: 8px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 8.5px; }
            th, td { border: 1px solid #94a3b8; padding: 3px 1.5px; text-align: center; }
            th { background-color: #f1f5f9; font-weight: 900; color: #1e293b; }
            .text-left { text-align: left; padding-left: 4px; }
            .p-badge { color: #166534; font-weight: 900; background-color: #dcfce7; }
            .pl-badge { color: #1e40af; font-weight: 900; background-color: #dbeafe; }
            .hd-badge { color: #9a3412; font-weight: 900; background-color: #ffedd5; }
            .a-badge { color: #991b1b; font-weight: 900; background-color: #fee2e2; }
            .sun-col { background-color: #fff1f2; color: #e11d48; }
            .totals-col { font-weight: 900; }
            .footer { margin-top: 24px; display: flex; justify-content: space-between; font-weight: bold; color: #334155; font-size: 10px; padding: 0 10px; }
            .legend { display: flex; gap: 12px; font-size: 8.5px; font-weight: bold; margin-bottom: 4px; }
            .legend-item { display: flex; align-items: center; gap: 3px; }
          </style>
        </head>
        <body>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #334155; padding-bottom: 6px; margin-bottom: 6px;">
            <div>
              <h1>Staff Monthly Attendance Register</h1>
              <div class="subtitle">Month: ${monthName} | Total Days: ${totalDays} | Staff Count: ${rows.length}</div>
            </div>
            <div style="text-align: right; font-size: 9px; color: #64748b; font-weight: bold;">
              Generated: ${new Date().toLocaleDateString('en-US')} ${new Date().toLocaleTimeString()}
            </div>
          </div>

          <div class="legend">
            <div class="legend-item"><span class="p-badge" style="padding: 1px 4px; border-radius: 3px;">P</span>: Present</div>
            <div class="legend-item"><span class="pl-badge" style="padding: 1px 4px; border-radius: 3px;">PL</span>: Paid Leave</div>
            <div class="legend-item"><span class="hd-badge" style="padding: 1px 4px; border-radius: 3px;">HD</span>: Half Day</div>
            <div class="legend-item"><span class="a-badge" style="padding: 1px 4px; border-radius: 3px;">A</span>: Absent</div>
            <div class="legend-item"><span>-</span>: Unmarked</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 22px;">#</th>
                <th class="text-left" style="min-width: 90px;">Staff Name</th>
                <th style="min-width: 55px;">Role</th>
                ${daysArray.map(d => {
                  const dateObj = new Date(year, month - 1, d);
                  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });
                  const isSun = dateObj.getDay() === 0;
                  return `<th class="${isSun ? 'sun-col' : ''}" style="min-width: 18px;">${d}<br><span style="font-size: 6.5px; font-weight: normal;">${dayName}</span></th>`;
                }).join('')}
                <th class="totals-col" style="background-color: #dcfce7; color: #166534; min-width: 26px;">P</th>
                <th class="totals-col" style="background-color: #dbeafe; color: #1e40af; min-width: 26px;">PL</th>
                <th class="totals-col" style="background-color: #ffedd5; color: #9a3412; min-width: 26px;">HD</th>
                <th class="totals-col" style="background-color: #fee2e2; color: #991b1b; min-width: 26px;">A</th>
                <th class="totals-col" style="background-color: #f1f5f9; min-width: 36px;">Payable</th>
                <th style="min-width: 60px;">Signature</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r, idx) => {
                return `
                  <tr>
                    <td>${idx + 1}</td>
                    <td class="text-left" style="font-weight: bold;">${r.staff.name}</td>
                    <td>${r.staff.role}</td>
                    ${r.dayRecords.map(({ day, status }) => {
                      const isSun = new Date(year, month - 1, day).getDay() === 0;
                      let badgeClass = '';
                      let text = '-';
                      if (status === 'present') { badgeClass = 'p-badge'; text = 'P'; }
                      else if (status === 'leave') { badgeClass = 'pl-badge'; text = 'PL'; }
                      else if (status === 'half_day') { badgeClass = 'hd-badge'; text = 'HD'; }
                      else if (status === 'absent') { badgeClass = 'a-badge'; text = 'A'; }
                      return `<td class="${isSun ? 'sun-col' : ''} ${badgeClass}">${text}</td>`;
                    }).join('')}
                    <td class="totals-col p-badge">${r.presentCount}</td>
                    <td class="totals-col pl-badge">${r.paidLeaveCount}</td>
                    <td class="totals-col hd-badge">${r.halfDayCount}</td>
                    <td class="totals-col a-badge">${r.absentCount}</td>
                    <td class="totals-col" style="font-weight: 900; background-color: #f8fafc;">${r.payableDays}</td>
                    <td></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div class="footer">
            <div>Prepared By: __________________________</div>
            <div>Manager / Owner Signature: __________________________</div>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ── Staff Add / Edit Actions ─────────────────────────────────────────────────

  const resetStaffForm = () => {
    setEditingStaff(null);
    setStaffName('');
    setStaffRole('waiter');
    setStaffPhone('');
    setStaffSalary('12000');
    setStaffSalaryType('monthly');
    setStaffAllowedLeaves('4');
    setStaffJoiningDate(getTodayString());
  };

  const openAddStaff = () => {
    resetStaffForm();
    setShowAddStaffModal(true);
  };

  const openEditStaff = (staff: DBStaff) => {
    setEditingStaff(staff);
    setStaffName(staff.name);
    setStaffRole(staff.role);
    setStaffPhone(staff.phone || '');
    setStaffSalary(String(staff.salary));
    setStaffSalaryType(staff.salaryType || 'monthly');
    setStaffAllowedLeaves(String(staff.allowedLeaves ?? 4));
    setStaffJoiningDate(staff.joiningDate || getTodayString());
    setShowAddStaffModal(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) {
      showToast('⚠️ Staff Name is required.', 'error');
      return;
    }
    const salaryNum = Number(staffSalary) || 0;
    if (salaryNum <= 0) {
      showToast('⚠️ Please enter a valid Salary amount.', 'error');
      return;
    }

    try {
      const leavesNum = Number(staffAllowedLeaves) >= 0 ? Number(staffAllowedLeaves) : 4;

      if (editingStaff) {
        await db.staff.update(editingStaff.id, {
          name: staffName.trim(),
          role: staffRole,
          phone: staffPhone.trim(),
          salary: salaryNum,
          salaryType: staffSalaryType,
          allowedLeaves: leavesNum,
          joiningDate: staffJoiningDate
        });
        showToast(`✅ ${staffName} record updated!`);
      } else {
        const newStaff: DBStaff = {
          id: crypto.randomUUID(),
          name: staffName.trim(),
          role: staffRole,
          phone: staffPhone.trim(),
          salary: salaryNum,
          salaryType: staffSalaryType,
          allowedLeaves: leavesNum,
          status: 'active',
          joiningDate: staffJoiningDate,
          timestamp: Date.now()
        };
        await db.staff.add(newStaff);
        showToast(`🎉 ${staffName} added to staff directory!`);
      }

      setShowAddStaffModal(false);
      resetStaffForm();
    } catch (err: any) {
      console.error('Error saving staff:', err);
      showToast(err?.message || '⚠️ Failed to save staff.', 'error');
    }
  };

  const handleDeleteStaff = async (staffId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to deactivate ${name}?`)) return;
    try {
      await db.staff.update(staffId, { status: 'inactive' });
      showToast(`🗑️ ${name} deactivated.`);
    } catch (err) {
      showToast('⚠️ Failed to delete staff.', 'error');
    }
  };

  // ── Advance Payment Actions ──────────────────────────────────────────────────

  const openAdvanceModal = (prefillStaffId?: string) => {
    if (activeStaff.length === 0) {
      showToast('⚠️ Please add staff members first.', 'error');
      return;
    }
    setAdvStaffId(prefillStaffId || activeStaff[0]?.id || '');
    setAdvAmount('');
    setAdvDate(getTodayString());
    setAdvMethod('cash');
    setAdvNote('');
    setShowAdvanceModal(true);
  };

  const handleSaveAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(advAmount) || 0;
    if (!advStaffId) {
      showToast('⚠️ Please select a staff member.', 'error');
      return;
    }
    if (amountNum <= 0) {
      showToast('⚠️ Please enter an advance amount.', 'error');
      return;
    }

    try {
      const selectedStaffObj = activeStaff.find(s => s.id === advStaffId);
      const newAdv: DBStaffAdvance = {
        id: crypto.randomUUID(),
        staffId: advStaffId,
        amount: amountNum,
        date: advDate,
        type: 'advance',
        paymentMethod: advMethod,
        note: advNote.trim(),
        timestamp: Date.now()
      };
      await db.staffAdvances.add(newAdv);
      showToast(`💸 Advance of ₹${amountNum.toLocaleString()} recorded for ${selectedStaffObj?.name || 'Staff'}.`);
      setShowAdvanceModal(false);
    } catch (err) {
      showToast('⚠️ Error saving advance entry.', 'error');
    }
  };

  const handleDeleteAdvance = async (advId: string) => {
    if (!window.confirm('Are you sure you want to delete this advance entry?')) return;
    try {
      await db.staffAdvances.delete(advId);
      showToast('🗑️ Advance entry deleted.');
    } catch (err) {
      showToast('⚠️ Delete failed.', 'error');
    }
  };

  // ── Monthly Payroll Calculations ──────────────────────────────────────────────

  const payrollData = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    return activeStaff.map(staff => {
      const monthAtt = attendanceList.filter(a => {
        if (a.staffId !== staff.id) return false;
        const [aYear, aMonth] = a.date.split('-');
        return Number(aYear) === year && Number(aMonth) === month;
      });

      let presentCount = 0;
      let paidLeaveCount = 0;
      let halfDayCount = 0;
      let absentCount = 0;

      monthAtt.forEach(a => {
        if (a.status === 'present') presentCount++;
        else if (a.status === 'leave') paidLeaveCount++;
        else if (a.status === 'half_day') halfDayCount++;
        else if (a.status === 'absent') absentCount++;
      });

      const monthAdv = advancesList.filter(adv => {
        if (adv.staffId !== staff.id) return false;
        const [adYear, adMonth] = adv.date.split('-');
        return Number(adYear) === year && Number(adMonth) === month;
      });

      const totalAdvance = monthAdv.reduce((sum, adv) => sum + (adv.amount || 0), 0);

      const allowedLeaves = staff.allowedLeaves ?? 4;
      const payableDays = presentCount + paidLeaveCount + (halfDayCount * 0.5);

      const perDaySalary = staff.salaryType === 'daily'
        ? staff.salary
        : staff.salary / totalDaysInMonth;

      const grossEarned = Math.round(payableDays * perDaySalary);
      const netPayable = Math.max(0, grossEarned - totalAdvance);

      return {
        staff,
        totalDaysInMonth,
        presentCount,
        paidLeaveCount,
        halfDayCount,
        absentCount,
        payableDays,
        perDaySalary: Math.round(perDaySalary),
        grossEarned,
        totalAdvance,
        netPayable,
        allowedLeaves
      };
    });
  }, [activeStaff, attendanceList, advancesList, selectedMonth]);

  // Overall Monthly Stats
  const monthlyOverall = useMemo(() => {
    const totalGross = payrollData.reduce((acc, curr) => acc + curr.grossEarned, 0);
    const totalAdv = payrollData.reduce((acc, curr) => acc + curr.totalAdvance, 0);
    const totalNet = payrollData.reduce((acc, curr) => acc + curr.netPayable, 0);
    return { totalGross, totalAdv, totalNet };
  }, [payrollData]);

  // Role Badge Component
  const getRoleBadge = (role: DBStaff['role']) => {
    switch (role) {
      case 'chef':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            Chef / Cook
          </span>
        );
      case 'waiter':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            Waiter / Server
          </span>
        );
      case 'manager':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            Manager
          </span>
        );
      case 'cashier':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            Cashier
          </span>
        );
      case 'cleaner':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
            Cleaner / Helper
          </span>
        );
      case 'helper':
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            Kitchen Helper
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20">
            Staff
          </span>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50/60 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 overflow-hidden font-sans select-none transition-colors">
      
      {/* ── TOP HEADER ───────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-900/90 border-b border-slate-200/80 dark:border-slate-800/80 px-6 py-4.5 shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 text-white rounded-2xl shadow-lg shadow-indigo-500/25 flex items-center justify-center shrink-0">
              <Users size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-slate-50">
                  Staff &amp; Attendance Management
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50">
                  {activeStaff.length} Active Staff
                </span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-0.5 flex items-center gap-1.5">
                <span>Daily Attendance</span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                <span>Monthly Calendar Register</span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                <span>Salary Advances</span>
                <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                <span>Monthly Payroll</span>
              </p>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => openAdvanceModal()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 transition-all cursor-pointer border border-emerald-500/30"
            >
              <Wallet size={15} />
              + Advance Entry
            </button>
            <button
              onClick={openAddStaff}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition-all cursor-pointer border border-indigo-500/30"
            >
              <UserPlus size={15} />
              + Add Staff
            </button>
          </div>
        </div>
      </div>

      {/* ── 5 NAVIGATION TABS ─────────────────────────────────────────────────── */}
      <div className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800/70 px-6 py-2.5 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
          
          <button
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Calendar size={15} />
            <span>1. Daily Attendance</span>
          </button>

          <button
            onClick={() => setActiveTab('register')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Table2 size={15} />
            <span>2. Attendance Register</span>
          </button>

          <button
            onClick={() => setActiveTab('staff_list')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeTab === 'staff_list'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Users size={15} />
            <span>3. Staff Directory</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${
              activeTab === 'staff_list' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {activeStaff.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('advances')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeTab === 'advances'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Wallet size={15} />
            <span>4. Salary Advances</span>
          </button>

          <button
            onClick={() => setActiveTab('payroll')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer ${
              activeTab === 'payroll'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Receipt size={15} />
            <span>5. Monthly Payroll</span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: DAILY ATTENDANCE ──────────────────────────────────────────── */}
      {activeTab === 'attendance' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto gap-4">
          
          {/* Clean Date Toolbar without icons in inputs */}
          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            
            {/* Date Controls */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-slate-500">Date:</span>
              
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() - 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft size={16} />
                </button>

                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent px-2.5 py-1 text-xs font-black text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
                />

                <button
                  type="button"
                  onClick={() => {
                    const d = new Date(selectedDate);
                    d.setDate(d.getDate() + 1);
                    setSelectedDate(d.toISOString().split('T')[0]);
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(getTodayString())}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                  selectedDate === getTodayString()
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
            </div>

            {/* Quick Counters & Mark All Present */}
            <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto justify-between lg:justify-end">
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-extrabold text-xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Present: {dailyStats.present}
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-extrabold text-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Paid Leave: {dailyStats.paidLeave}
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-extrabold text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Half Day: {dailyStats.halfDay}
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-extrabold text-xs">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  Absent: {dailyStats.absent}
                </div>
              </div>

              <button
                type="button"
                onClick={handleMarkAllPresent}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-500/15 transition-all cursor-pointer"
              >
                <CheckCircle2 size={15} />
                Mark All Present
              </button>
            </div>
          </div>

          {/* Daily Attendance Card Grid */}
          {activeStaff.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center flex flex-col items-center justify-center shadow-sm">
              <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4">
                <Users size={32} />
              </div>
              <h3 className="text-base font-black text-slate-800 dark:text-slate-200">No Staff Members Found</h3>
              <p className="text-xs text-slate-400 mt-1 mb-5 max-w-sm">Please add staff members to start tracking attendance.</p>
              <button
                onClick={openAddStaff}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
              >
                + Add First Staff Member
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeStaff.map(staff => {
                const att = attendanceMapForDate.get(staff.id);
                const currentStatus = att?.status;

                return (
                  <div
                    key={staff.id}
                    className={`bg-white dark:bg-slate-900/90 rounded-3xl p-5 border transition-all duration-300 shadow-xs flex flex-col justify-between gap-4.5 relative overflow-hidden ${
                      currentStatus === 'present'
                        ? 'border-emerald-500/30 dark:border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.02] to-transparent'
                        : currentStatus === 'leave'
                        ? 'border-blue-500/30 dark:border-blue-500/30 bg-gradient-to-b from-blue-500/[0.02] to-transparent'
                        : currentStatus === 'half_day'
                        ? 'border-amber-500/30 dark:border-amber-500/30 bg-gradient-to-b from-amber-500/[0.02] to-transparent'
                        : currentStatus === 'absent'
                        ? 'border-rose-500/30 dark:border-rose-500/30 bg-gradient-to-b from-rose-500/[0.02] to-transparent'
                        : 'border-slate-200/80 dark:border-slate-800/80'
                    }`}
                  >
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white flex items-center justify-center font-black text-sm shadow-md shadow-indigo-500/20 shrink-0">
                          {staff.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                            {staff.name}
                          </h4>
                          <div className="mt-1">
                            {getRoleBadge(staff.role)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-black text-slate-800 dark:text-slate-200">
                          ₹{staff.salary.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase">
                          /{staff.salaryType === 'monthly' ? 'Mo' : 'Day'}
                        </span>
                      </div>
                    </div>

                    {/* Middle: 4 One-Click Haziri Control Buttons */}
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                        <span>Attendance Status:</span>
                        {currentStatus ? (
                          <span className="font-extrabold capitalize text-indigo-600 dark:text-indigo-400">
                            {currentStatus === 'leave' ? 'Paid Leave' : currentStatus} Marked
                          </span>
                        ) : (
                          <span className="text-amber-500 font-extrabold">⏳ Unmarked</span>
                        )}
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                        
                        <button
                          type="button"
                          onClick={() => handleSetStatus(staff.id, 'present')}
                          className={`py-2 px-1 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            currentStatus === 'present'
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 scale-102 ring-2 ring-emerald-400/40'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:text-emerald-600'
                          }`}
                          title="Present (Full Day)"
                        >
                          <span className="text-xs leading-none">P</span>
                          <span className="text-[9px] opacity-85 font-extrabold">Present</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetStatus(staff.id, 'leave')}
                          className={`py-2 px-1 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            currentStatus === 'leave'
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 scale-102 ring-2 ring-blue-400/40'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-600'
                          }`}
                          title="Paid Leave (No Salary Deduction)"
                        >
                          <span className="text-xs leading-none">PL</span>
                          <span className="text-[9px] opacity-85 font-extrabold">Pd Leave</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetStatus(staff.id, 'half_day')}
                          className={`py-2 px-1 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            currentStatus === 'half_day'
                              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30 scale-102 ring-2 ring-amber-400/40'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600'
                          }`}
                          title="Half Day (0.5 Day)"
                        >
                          <span className="text-xs leading-none">HD</span>
                          <span className="text-[9px] opacity-85 font-extrabold">Half Day</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSetStatus(staff.id, 'absent')}
                          className={`py-2 px-1 rounded-xl font-black text-xs transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                            currentStatus === 'absent'
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 scale-102 ring-2 ring-rose-400/40'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600'
                          }`}
                          title="Absent (Unpaid)"
                        >
                          <span className="text-xs leading-none">A</span>
                          <span className="text-[9px] opacity-85 font-extrabold">Absent</span>
                        </button>
                      </div>
                    </div>

                    {/* Bottom: Quick Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
                      <div className="flex items-center gap-1 text-slate-400">
                        <Phone size={12} />
                        <span className="text-[11px] font-bold">{staff.phone || 'No phone'}</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openAdvanceModal(staff.id)}
                        className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Wallet size={12} />
                        + Give Advance
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: ATTENDANCE REGISTER ───────────────────────────────────────── */}
      {activeTab === 'register' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto gap-4">
          
          {/* Month Navigator + Print Register Sheet Bar without input icons */}
          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-slate-500">Register Month:</span>
              
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => {
                    const [y, m] = selectedRegisterMonth.split('-').map(Number);
                    const prevD = new Date(y, m - 2, 1);
                    const prevStr = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
                    setSelectedRegisterMonth(prevStr);
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                  title="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>

                <input
                  type="month"
                  value={selectedRegisterMonth}
                  onChange={e => setSelectedRegisterMonth(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-800 dark:text-slate-100 outline-none cursor-pointer px-2.5 py-1"
                />

                <button
                  type="button"
                  onClick={() => {
                    const [y, m] = selectedRegisterMonth.split('-').map(Number);
                    const nextD = new Date(y, m, 1);
                    const nextStr = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
                    setSelectedRegisterMonth(nextStr);
                  }}
                  className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                  title="Next Month"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-2 text-[10px] font-black flex-wrap">
                <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">P = Present</span>
                <span className="px-2 py-1 rounded-lg bg-blue-500/10 text-blue-600 border border-blue-500/20">PL = Paid Leave</span>
                <span className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">HD = Half Day</span>
                <span className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-600 border border-rose-500/20">A = Absent</span>
                <span className="text-slate-400 font-bold ml-1 hidden sm:inline">💡 Click any cell to cycle status</span>
              </div>
            </div>

            {/* Print Register Button */}
            <button
              onClick={printAttendanceRegister}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
              title="Print Monthly Attendance Register Sheet"
            >
              <Printer size={15} />
              Print Register Sheet
            </button>
          </div>

          {/* Paper Register Table Matrix */}
          <div className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-black text-slate-600 dark:text-slate-300 border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 px-3.5 py-3 text-left min-w-[140px] border-r border-slate-200 dark:border-slate-700">
                      Staff Member
                    </th>
                    <th className="px-2.5 py-3 min-w-[65px] border-r border-slate-200 dark:border-slate-700">
                      Role
                    </th>

                    {registerMatrixData.daysArray.map(day => {
                      const dateObj = new Date(registerMatrixData.year, registerMatrixData.month - 1, day);
                      const isSun = dateObj.getDay() === 0;
                      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'narrow' });

                      return (
                        <th
                          key={day}
                          className={`px-1.5 py-2 min-w-[34px] border-r border-slate-200/60 dark:border-slate-800 ${
                            isSun ? 'bg-rose-50/70 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400' : ''
                          }`}
                        >
                          <span className="block text-[11px] font-black">{day}</span>
                          <span className="block text-[8.5px] font-bold opacity-75">{dayName}</span>
                        </th>
                      );
                    })}

                    <th className="px-3 py-3 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-black min-w-[45px] border-l border-r border-slate-200 dark:border-slate-700" title="Total Present">
                      P
                    </th>
                    <th className="px-3 py-3 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-black min-w-[45px] border-r border-slate-200 dark:border-slate-700" title="Total Paid Leaves">
                      PL
                    </th>
                    <th className="px-3 py-3 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-black min-w-[45px] border-r border-slate-200 dark:border-slate-700" title="Total Half Days">
                      HD
                    </th>
                    <th className="px-3 py-3 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 font-black min-w-[45px] border-r border-slate-200 dark:border-slate-700" title="Total Absences">
                      A
                    </th>
                    <th className="px-3.5 py-3 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-black min-w-[65px]" title="Payable Working Days">
                      Payable
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {registerMatrixData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={registerMatrixData.totalDays + 7} className="p-12 text-center text-slate-400 font-bold">
                        No active staff members registered.
                      </td>
                    </tr>
                  ) : (
                    registerMatrixData.rows.map((row, rIdx) => {
                      return (
                        <tr
                          key={row.staff.id}
                          className={`hover:bg-indigo-50/20 dark:hover:bg-indigo-950/10 transition-colors ${
                            rIdx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/30' : ''
                          }`}
                        >
                          <td className="sticky left-0 bg-white dark:bg-slate-900 z-10 px-3.5 py-2.5 text-left font-black text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-700 shadow-xs whitespace-nowrap">
                            {row.staff.name}
                          </td>

                          <td className="px-2 py-2.5 text-[10px] font-bold text-slate-500 border-r border-slate-200/60 dark:border-slate-800 capitalize">
                            {row.staff.role}
                          </td>

                          {row.dayRecords.map(({ day, status }) => {
                            const isSun = new Date(registerMatrixData.year, registerMatrixData.month - 1, day).getDay() === 0;

                            let badge = (
                              <span className="text-slate-300 dark:text-slate-700 font-bold text-xs">-</span>
                            );

                            if (status === 'present') {
                              badge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-500 text-white font-black text-[11px] shadow-xs">
                                  P
                                </span>
                              );
                            } else if (status === 'leave') {
                              badge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-blue-500 text-white font-black text-[10px] shadow-xs" title="Paid Leave">
                                  PL
                                </span>
                              );
                            } else if (status === 'half_day') {
                              badge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-amber-500 text-white font-black text-[10px] shadow-xs" title="Half Day">
                                  HD
                                </span>
                              );
                            } else if (status === 'absent') {
                              badge = (
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-rose-500 text-white font-black text-[11px] shadow-xs" title="Absent">
                                  A
                                </span>
                              );
                            }

                            return (
                              <td
                                key={day}
                                onClick={() => handleCycleMatrixStatus(row.staff.id, day)}
                                className={`p-1 border-r border-slate-200/40 dark:border-slate-800/80 cursor-pointer hover:bg-indigo-100/60 dark:hover:bg-indigo-950/40 transition-all ${
                                  isSun ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                                }`}
                                title={`Click to change status for Day ${day}`}
                              >
                                {badge}
                              </td>
                            );
                          })}

                          <td className="px-2.5 py-2 font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 border-l border-r border-slate-200/60 dark:border-slate-800">
                            {row.presentCount}
                          </td>

                          <td className="px-2.5 py-2 font-black text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20 border-r border-slate-200/60 dark:border-slate-800">
                            {row.paidLeaveCount}
                          </td>

                          <td className="px-2.5 py-2 font-black text-amber-600 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20 border-r border-slate-200/60 dark:border-slate-800">
                            {row.halfDayCount}
                          </td>

                          <td className="px-2.5 py-2 font-black text-rose-600 dark:text-rose-400 bg-rose-50/40 dark:bg-rose-950/20 border-r border-slate-200/60 dark:border-slate-800">
                            {row.absentCount}
                          </td>

                          <td className="px-3 py-2 font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30 text-xs">
                            {row.payableDays}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: STAFF DIRECTORY ──────────────────────────────────────────── */}
      {activeTab === 'staff_list' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto gap-4">
          
          {/* Clean Search without icon inside */}
          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="w-full sm:w-80">
              <input
                type="text"
                placeholder="Search staff by name or phone..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              onClick={openAddStaff}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
            >
              <UserPlus size={15} />
              + Add New Staff Member
            </button>
          </div>

          {/* Staff Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeStaff
              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()) || (s.phone && s.phone.includes(searchTerm)))
              .map(staff => (
                <div
                  key={staff.id}
                  className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 p-5 shadow-xs flex flex-col justify-between gap-4 transition-all hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 text-white font-black text-base flex items-center justify-center shadow-md shadow-indigo-500/20">
                        {staff.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-slate-100 tracking-tight">
                          {staff.name}
                        </h3>
                        <div className="mt-1">
                          {getRoleBadge(staff.role)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditStaff(staff)}
                        className="p-2 text-slate-400 hover:text-indigo-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit Profile"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(staff.id, staff.name)}
                        className="p-2 text-slate-400 hover:text-rose-600 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Deactivate"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl text-xs border border-slate-100 dark:border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Salary:</span>
                      <strong className="font-black text-slate-800 dark:text-slate-100">₹{staff.salary.toLocaleString()}</strong>
                      <span className="text-[10px] text-slate-400"> /{staff.salaryType === 'monthly' ? 'Mo' : 'Day'}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block font-bold">Paid Leaves:</span>
                      <strong className="font-black text-indigo-600 dark:text-indigo-400">{staff.allowedLeaves ?? 4} Leaves/Mo</strong>
                    </div>
                    <div className="col-span-2 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mt-1 pt-2 border-t border-slate-200/60 dark:border-slate-700/50">
                      <Phone size={12} />
                      <span className="font-bold">{staff.phone || 'No Phone Registered'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openAdvanceModal(staff.id)}
                      className="flex-1 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold text-xs rounded-xl border border-emerald-500/20 transition-all cursor-pointer text-center"
                    >
                      + Give Advance
                    </button>
                    <button
                      onClick={() => setActiveTab('payroll')}
                      className="py-2.5 px-4 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                    >
                      Payroll
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: ADVANCE SALARY LEDGER ─────────────────────────────────────── */}
      {activeTab === 'advances' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto gap-4">
          
          <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wallet size={16} className="text-emerald-500" />
                Staff Advance Salary Ledger
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Record and track salary advance payments. Deducted automatically during monthly payroll.</p>
            </div>
            <button
              onClick={() => openAdvanceModal()}
              className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 cursor-pointer"
            >
              <IndianRupee size={15} />
              + Record Advance Payment
            </button>
          </div>

          {/* Advances Ledger Table */}
          <div className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
            {advancesList.length === 0 ? (
              <div className="p-16 text-center text-slate-400 text-xs font-bold">
                No advance salary records found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-700/80">
                      <th className="p-4 pl-6">Date</th>
                      <th className="p-4">Staff Member</th>
                      <th className="p-4">Amount</th>
                      <th className="p-4">Payment Method</th>
                      <th className="p-4">Reason / Notes</th>
                      <th className="p-4 text-right pr-6">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {advancesList.map(adv => {
                      const staffObj = staffList.find(s => s.id === adv.staffId);
                      return (
                        <tr key={adv.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="p-4 pl-6 font-bold text-slate-700 dark:text-slate-300">{adv.date}</td>
                          <td className="p-4">
                            <div className="font-black text-slate-900 dark:text-slate-100">{staffObj?.name || 'Unknown Staff'}</div>
                            <span className="text-[10px] text-slate-400">{staffObj ? getRoleBadge(staffObj.role) : null}</span>
                          </td>
                          <td className="p-4 font-black text-amber-600 dark:text-amber-400 text-sm">
                            ₹{adv.amount.toLocaleString()}
                          </td>
                          <td className="p-4">
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {adv.paymentMethod}
                            </span>
                          </td>
                          <td className="p-4 text-slate-500">{adv.note || '—'}</td>
                          <td className="p-4 text-right pr-6">
                            <button
                              onClick={() => handleDeleteAdvance(adv.id)}
                              className="text-rose-600 hover:text-rose-700 hover:underline font-bold text-xs cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: MONTHLY SALARY PAYROLL ────────────────────────────────────── */}
      {activeTab === 'payroll' && (
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-y-auto gap-4">
          
          {/* Top Month Selector & KPI Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5">
            
            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col justify-between">
              <span className="text-xs font-bold text-slate-400">Select Salary Month:</span>
              <div className="mt-2">
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black text-slate-900 dark:text-slate-100 outline-none cursor-pointer"
                />
              </div>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <IndianRupee size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">Gross Earned</p>
                <p className="text-base font-black text-slate-900 dark:text-slate-100">₹{monthlyOverall.totalGross.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 backdrop-blur-md p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-400">Advance Deducted</p>
                <p className="text-base font-black text-amber-600 dark:text-amber-400">-₹{monthlyOverall.totalAdv.toLocaleString()}</p>
              </div>
            </div>

            <div className="bg-gradient-to-tr from-emerald-600 to-teal-600 text-white p-4 rounded-3xl shadow-lg shadow-emerald-500/20 flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/20 text-white flex items-center justify-center shrink-0">
                <Sparkles size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-emerald-100">Total Net Payable</p>
                <p className="text-lg font-black text-white">₹{monthlyOverall.totalNet.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Salary Breakdown Table */}
          <div className="bg-white dark:bg-slate-900/90 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200/80 dark:border-slate-700/80">
                    <th className="p-4 pl-6">Staff Member</th>
                    <th className="p-4">Base Rate</th>
                    <th className="p-4 text-center">Present</th>
                    <th className="p-4 text-center">Paid Leave</th>
                    <th className="p-4 text-center">Half Day</th>
                    <th className="p-4 text-center">Absent</th>
                    <th className="p-4">Gross Earned</th>
                    <th className="p-4">Advance</th>
                    <th className="p-4 text-right pr-6 font-black text-emerald-600">Net Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {payrollData.map(item => (
                    <tr key={item.staff.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-4 pl-6 font-black text-slate-900 dark:text-slate-100">
                        {item.staff.name}
                        <div className="mt-0.5">{getRoleBadge(item.staff.role)}</div>
                      </td>
                      <td className="p-4 font-bold text-slate-700 dark:text-slate-300">
                        ₹{item.staff.salary.toLocaleString()}
                      </td>
                      <td className="p-4 text-center font-black text-emerald-600">
                        {item.presentCount} Days
                      </td>
                      <td className="p-4 text-center font-black text-blue-600">
                        {item.paidLeaveCount} Days
                      </td>
                      <td className="p-4 text-center font-black text-amber-600">
                        {item.halfDayCount} HD
                      </td>
                      <td className="p-4 text-center font-black text-rose-600">
                        {item.absentCount} Days
                      </td>
                      <td className="p-4 font-bold text-slate-800 dark:text-slate-200">
                        ₹{item.grossEarned.toLocaleString()}
                      </td>
                      <td className="p-4 font-black text-amber-600">
                        -₹{item.totalAdvance.toLocaleString()}
                      </td>
                      <td className="p-4 text-right pr-6 font-black text-emerald-600 text-sm">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          ₹{item.netPayable.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ADD / EDIT STAFF ─────────────────────────────────────────── */}
      {showAddStaffModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <UserPlus size={18} />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  {editingStaff ? 'Edit Staff Profile' : 'Add New Staff Member'}
                </h3>
              </div>
              <button onClick={() => setShowAddStaffModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Staff Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={staffName}
                  onChange={e => setStaffName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Role / Designation *</label>
                  <select
                    value={staffRole}
                    onChange={e => setStaffRole(e.target.value as DBStaff['role'])}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  >
                    <option value="waiter">Waiter / Server</option>
                    <option value="chef">Chef / Cook</option>
                    <option value="manager">Manager</option>
                    <option value="cashier">Cashier</option>
                    <option value="cleaner">Cleaner / Helper</option>
                    <option value="helper">Kitchen Helper</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Mobile Number</label>
                  <input
                    type="tel"
                    placeholder="9876543210"
                    value={staffPhone}
                    onChange={e => setStaffPhone(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Salary Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    placeholder="12000"
                    value={staffSalary}
                    onChange={e => setStaffSalary(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Salary Type</label>
                  <select
                    value={staffSalaryType}
                    onChange={e => setStaffSalaryType(e.target.value as 'monthly' | 'daily')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="daily">Daily Wage</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">
                  Allowed Paid Leaves Per Month
                </label>
                <input
                  type="number"
                  min="0"
                  max="15"
                  value={staffAllowedLeaves}
                  onChange={e => setStaffAllowedLeaves(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">e.g. 4 for 4 weekly off days (No salary deduction)</span>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 cursor-pointer"
                >
                  {editingStaff ? 'Update Staff' : 'Save Staff'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: RECORD ADVANCE ───────────────────────────────────────────── */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <Wallet size={18} />
                </div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  Record Advance Salary Payment
                </h3>
              </div>
              <button onClick={() => setShowAdvanceModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAdvance} className="flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Select Staff Member *</label>
                <select
                  required
                  value={advStaffId}
                  onChange={e => setAdvStaffId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                >
                  {activeStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Advance Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="1000"
                    value={advAmount}
                    onChange={e => setAdvAmount(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={advDate}
                    onChange={e => setAdvDate(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Payment Method</label>
                <select
                  value={advMethod}
                  onChange={e => setAdvMethod(e.target.value as any)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none uppercase text-slate-900 dark:text-slate-100"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / Online</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300 block mb-1">Notes / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Festival advance, emergency"
                  value={advNote}
                  onChange={e => setAdvNote(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAdvanceModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  Save Advance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
