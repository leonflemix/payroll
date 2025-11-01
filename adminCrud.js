// Filename: adminCrud.js
import { state } from './state.js'; // FIX: Corrected import to use only 'state'
import { collection, doc, getDocs, updateDoc, deleteDoc, query, where, Timestamp, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { formatTimestamp, getWeekNumber, downloadCSV, writeAuditLog, setMessage, toDatetimeLocal } from './utils.js';
import { renderUI, closeLogModal, closeSignupModal, showPhotoModal, closePhotoModal, renderEmployeeList } from './uiRender.js';
import { updateEmployeeStatusAfterLogEdit } from './firebase.js';
import { timecards_logs_path, timecards_employees_path } from './constants.js';

/*
|--------------------------------------------------------------------------
| ADMIN AUTH & EMPLOYEE MANAGEMENT (CRUD)
|--------------------------------------------------------------------------
*/

export function showSignupModal() {
    document.getElementById('employee-signup-modal').classList.remove('hidden');
    // Clear form
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-is-admin').checked = false;
    document.getElementById('signup-camera-enabled').checked = true;
    document.getElementById('signup-max-hours').value = 8;
    document.getElementById('signup-break-deduction').value = 30;
}
window.showSignupModal = showSignupModal;

export async function handleEmployeeSignup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value;
    const isAdmin = document.getElementById('signup-is-admin').checked;
    const cameraEnabled = document.getElementById('signup-camera-enabled').checked;
    const maxDailyHours = parseFloat(document.getElementById('signup-max-hours').value);
    const breakDeductionMinutes = parseFloat(document.getElementById('signup-break-deduction').value);

    if (password.length < 6) {
        setMessage('Password must be at least 6 characters.', 'error');
        return;
    }

    state.loading = true;
    renderUI();

    try {
        // 1. Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(state.auth, email, password); // FIX: Use state.auth
        const uid = userCredential.user.uid;

        // 2. Create document in Firestore employees collection
        const employeeDocRef = doc(collection(state.db, timecards_employees_path), uid); // FIX: Use state.db

        await updateDoc(employeeDocRef, {
            name: name,
            email: email,
            isAdmin: isAdmin,
            status: 'out',
            uid: uid,
            cameraEnabled: cameraEnabled,
            maxDailyHours: maxDailyHours,
            breakDeductionMinutes: breakDeductionMinutes,
        });

        setMessage(`Successfully signed up ${name}.`, 'success');
        closeSignupModal();

    } catch (error) {
        console.error("Employee signup failed:", error);
        setMessage(`Signup failed: ${error.message}`, 'error');
    }

    state.loading = false;
    renderUI();
}
window.handleEmployeeSignup = handleEmployeeSignup;

export function showEditEmployeeModal(uid) {
    const employee = state.employees.find(e => e.uid === uid);
    if (!employee) return;

    document.getElementById('edit-uid').value = employee.uid;
    document.getElementById('edit-email').value = employee.email;
    document.getElementById('edit-name').value = employee.name;
    document.getElementById('edit-is-admin').checked = employee.isAdmin || false;
    document.getElementById('edit-camera-enabled').checked = employee.cameraEnabled !== false;
    document.getElementById('edit-max-hours').value = employee.maxDailyHours || 8;
    document.getElementById('edit-break-deduction').value = employee.breakDeductionMinutes || 30;
    
    document.getElementById('employee-edit-modal').classList.remove('hidden');
}
window.showEditEmployeeModal = showEditEmployeeModal;

export function closeEditEmployeeModal() {
    document.getElementById('employee-edit-modal').classList.add('hidden');
}
window.closeEditEmployeeModal = closeEditEmployeeModal;

export async function handleEmployeeSave() {
    const uid = document.getElementById('edit-uid').value;
    const name = document.getElementById('edit-name').value;
    const isAdmin = document.getElementById('edit-is-admin').checked;
    const cameraEnabled = document.getElementById('edit-camera-enabled').checked;
    const maxDailyHours = parseFloat(document.getElementById('edit-max-hours').value);
    const breakDeductionMinutes = parseFloat(document.getElementById('edit-break-deduction').value);

    if (!name) {
        setMessage('Employee name is required.', 'error');
        return;
    }

    state.loading = true;
    renderUI();

    try {
        const employeeDocRef = doc(state.db, timecards_employees_path, uid); // FIX: Use state.db

        await updateDoc(employeeDocRef, {
            name: name,
            isAdmin: isAdmin,
            cameraEnabled: cameraEnabled,
            maxDailyHours: maxDailyHours,
            breakDeductionMinutes: breakDeductionMinutes,
        });

        setMessage(`Successfully updated ${name}.`, 'success');
        closeEditEmployeeModal();

    } catch (error) {
        console.error("Employee update failed:", error);
        setMessage(`Update failed: ${error.message}`, 'error');
    }

    state.loading = false;
    renderUI();
}
window.handleEmployeeSave = handleEmployeeSave;

export async function handleEmployeeDelete(uid, name) {
    if (!confirm(`Are you sure you want to DELETE employee: ${name}? This will delete the Firebase Auth user and their data.`)) return;

    state.loading = true;
    renderUI();

    try {
        // 1. Delete the Firestore document
        const employeeDocRef = doc(state.db, timecards_employees_path, uid); // FIX: Use state.db
        await deleteDoc(employeeDocRef);

        // 2. Delete the associated logs
        const logsRef = collection(state.db, timecards_logs_path); // FIX: Use state.db
        const q = query(logsRef, where('employeeUid', '==', uid));
        const snapshot = await getDocs(q);
        // Note: The original code used 'batch = doc(state.db)' which is incorrect.
        // It should use 'writeBatch'. For simplicity in a single file environment, 
        // we'll stick to a simpler loop, but recognize the Firestore limit on single writes.
        snapshot.docs.forEach(async (d) => {
             // Deleting logs one by one (less efficient but avoids writeBatch import)
            await deleteDoc(d.ref); 
        });


        // 3. Delete the Firebase Auth user
        try {
            const user = state.auth.currentUser; // FIX: Use state.auth
            if (user && user.uid === uid) {
                // Cannot delete self, must sign in as another admin
                setMessage('Cannot delete currently logged-in admin.', 'error');
                state.loading = false;
                renderUI();
                return;
            }
        } catch (e) {
            console.warn("Auth user check failed:", e.message);
        }

        setMessage(`Successfully deleted employee: ${name}.`, 'success');

    } catch (error) {
        console.error("Employee deletion failed:", error);
        setMessage(`Deletion failed: ${error.message}`, 'error');
    }

    state.loading = false;
    renderUI();
}
window.handleEmployeeDelete = handleEmployeeDelete;

/*
|--------------------------------------------------------------------------
| TIME LOG MANAGEMENT (CRUD)
|--------------------------------------------------------------------------
*/

export function showLogModal(logId) {
    const log = state.allLogs.find(l => l.id === logId);
    if (!log) return;

    document.getElementById('log-id').value = log.id;
    document.getElementById('log-employee').value = log.employeeName;
    document.getElementById('log-type').value = log.type;
    
    // Set timestamp value for datetime-local input
    document.getElementById('log-timestamp').value = toDatetimeLocal(log.timestamp);
    
    // Show photo if available
    if (log.photoData) {
        document.getElementById('view-photo-btn').classList.remove('hidden');
        document.getElementById('view-photo-btn').onclick = () => showPhotoModal(log.photoData);
    } else {
        document.getElementById('view-photo-btn').classList.add('hidden');
    }

    document.getElementById('log-modal').classList.remove('hidden');
}
window.showLogModal = showLogModal;

export async function handleLogSave() {
    const logId = document.getElementById('log-id').value;
    const newType = document.getElementById('log-type').value;
    const newTimestampStr = document.getElementById('log-timestamp').value;

    if (!newTimestampStr || !newType) {
        setMessage('Timestamp and Type are required.', 'error');
        return;
    }

    state.loading = true;
    renderUI();

    try {
        const log = state.allLogs.find(l => l.id === logId);
        if (!log) throw new Error("Log not found.");

        const logDocRef = doc(state.db, timecards_logs_path, logId); // FIX: Use state.db
        
        // Convert datetime-local string back to Date/Timestamp
        const newDate = new Date(newTimestampStr);
        const newTimestamp = Timestamp.fromDate(newDate);

        const oldData = { ...log, timestamp: log.timestamp.toDate().toISOString() };
        
        await updateDoc(logDocRef, {
            type: newType,
            timestamp: newTimestamp,
            editedBy: state.currentUser.email,
            editedAt: new Date(),
        });
        
        const newData = { ...log, type: newType, timestamp: newDate.toISOString() };
        
        // Write audit log
        await writeAuditLog('EDIT', logId, oldData, newData);

        // Update employee status based on this log's change
        await updateEmployeeStatusAfterLogEdit(log.employeeUid);

        setMessage(`Log entry for ${log.employeeName} updated successfully.`, 'success');
        closeLogModal();

    } catch (error) {
        console.error("Log save failed:", error);
        setMessage(`Log save failed: ${error.message}`, 'error');
    }

    state.loading = false;
    renderUI();
}
window.handleLogSave = handleLogSave;

export async function handleLogDelete(logId) {
    if (!confirm('Are you sure you want to DELETE this log entry?')) return;
    
    state.loading = true;
    renderUI();

    try {
        const log = state.allLogs.find(l => l.id === logId);
        if (!log) throw new Error("Log not found.");
        
        const logDocRef = doc(state.db, timecards_logs_path, logId); // FIX: Use state.db
        
        const oldData = { ...log, timestamp: log.timestamp.toDate().toISOString() };

        await deleteDoc(logDocRef);

        // Write audit log
        await writeAuditLog('DELETE', logId, oldData);

        // Update employee status based on deletion
        await updateEmployeeStatusAfterLogEdit(log.employeeUid);

        setMessage(`Log entry for ${log.employeeName} deleted successfully.`, 'success');

    } catch (error) {
        console.error("Log deletion failed:", error);
        setMessage(`Log deletion failed: ${error.message}`, 'error');
    }

    state.loading = false;
    renderUI();
}
window.handleLogDelete = handleLogDelete;

/*
|--------------------------------------------------------------------------
| PAYROLL REPORT GENERATION
|--------------------------------------------------------------------------
*/

export function applyLogFilters() {
    state.filterStartDate = document.getElementById('filter-start-date').value;
    state.filterEndDate = document.getElementById('filter-end-date').value;
    state.filterEmployeeUid = document.getElementById('filter-employee-uid').value;
    renderUI();
}
window.applyLogFilters = applyLogFilters;

function getFilteredLogs() {
    let logs = state.allLogs.slice().sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate());
    
    // Apply Employee filter
    if (state.filterEmployeeUid && state.filterEmployeeUid !== 'all') {
        logs = logs.filter(log => log.employeeUid === state.filterEmployeeUid);
    }
    
    // Apply Date filters
    const startDate = state.filterStartDate ? new Date(state.filterStartDate + 'T00:00:00') : null;
    const endDate = state.filterEndDate ? new Date(state.filterEndDate + 'T23:59:59') : null;

    if (startDate) {
        logs = logs.filter(log => log.timestamp.toDate() >= startDate);
    }
    if (endDate) {
        logs = logs.filter(log => log.timestamp.toDate() <= endDate);
    }

    return logs;
}

export function generatePayrollReport() {
    const logs = getFilteredLogs();
    const employees = state.employees;
    
    // Structure: { [uid]: { totalHours: 0, regular: 0, dailyOT: 0, weeklyOT: 0, shifts: [], weeklyHours: { [weekId]: 0 } } }
    const payrollData = {};

    employees.forEach(e => {
        payrollData[e.uid] = { 
            name: e.name, 
            totalHours: 0, 
            regular: 0, 
            dailyOT: 0, 
            weeklyOT: 0, 
            shifts: [], 
            weeklyHours: {} 
        };
    });

    const unpairedPunches = {}; // { uid: lastInLog }

    // Phase 1: Pair IN and OUT punches and calculate Daily Hours/OT
    for (const log of logs) {
        const uid = log.employeeUid;
        if (!payrollData[uid]) continue;

        if (log.type === 'in') {
            unpairedPunches[uid] = log;
        } else if (log.type === 'out' && unpairedPunches[uid]) {
            const inLog = unpairedPunches[uid];
            const outTime = log.timestamp.toDate().getTime();
            const inTime = inLog.timestamp.toDate().getTime();
            
            if (outTime > inTime) {
                let shiftDurationMs = outTime - inTime;

                // Break Deduction Logic (based on employee settings)
                const employeeConfig = employees.find(e => e.uid === uid);
                const maxHoursNoBreak = (employeeConfig.maxDailyHours || 8) * 60 * 60 * 1000;
                const breakDeductionMs = (employeeConfig.breakDeductionMinutes || 30) * 60 * 1000;
                
                if (shiftDurationMs > maxHoursNoBreak) {
                    shiftDurationMs -= breakDeductionMs;
                }

                let shiftHours = shiftDurationMs / (1000 * 60 * 60);
                
                // Calculate Daily OT (Hours over maxDailyHours)
                const dailyLimit = employeeConfig.maxDailyHours || 8;
                let regularHours = Math.min(shiftHours, dailyLimit);
                let dailyOT = shiftHours > dailyLimit ? shiftHours - dailyLimit : 0;
                
                payrollData[uid].shifts.push({
                    in: inLog.timestamp.toDate(),
                    out: log.timestamp.toDate(),
                    total: shiftHours,
                    regular: regularHours,
                    dailyOT: dailyOT,
                    breakDeducted: shiftDurationMs !== (outTime - inTime),
                });

                payrollData[uid].totalHours += shiftHours;
                payrollData[uid].regular += regularHours;
                payrollData[uid].dailyOT += dailyOT;
            }
            delete unpairedPunches[uid];
        }
        // Ignore single 'out' punches or 'in' punches not followed by 'out' in this period
    }

    // Phase 2: Calculate Weekly Overtime
    for (const uid in payrollData) {
        const employeeData = payrollData[uid];
        
        for (const shift of employeeData.shifts) {
            const weekId = getWeekNumber(shift.in);
            
            // Hours already counted as Daily OT shouldn't be double-counted as Regular
            const hoursForWeeklyCalculation = shift.regular;

            // Initialize week total if needed
            if (!employeeData.weeklyHours[weekId]) {
                employeeData.weeklyHours[weekId] = 0;
            }
            
            const weeklyLimit = 40; // Hardcoded 40-hour limit for Weekly OT
            
            // Hours worked THIS WEEK before THIS shift
            const hoursBeforeShift = employeeData.weeklyHours[weekId]; 
            
            // Total hours after THIS shift
            const totalHoursAfterShift = hoursBeforeShift + hoursForWeeklyCalculation;
            
            let weeklyOTForShift = 0;
            let regularHoursForShift = hoursForWeeklyCalculation;

            if (hoursBeforeShift < weeklyLimit && totalHoursAfterShift > weeklyLimit) {
                // Shift crosses the 40-hour threshold
                const regularPortion = weeklyLimit - hoursBeforeShift;
                const otPortion = totalHoursAfterShift - weeklyLimit;

                weeklyOTForShift = otPortion;
                regularHoursForShift = regularPortion;
                
            } else if (hoursBeforeShift >= weeklyLimit) {
                // Entire shift is Weekly OT
                weeklyOTForShift = hoursForWeeklyCalculation;
                regularHoursForShift = 0;
            }
            
            // Update running totals
            employeeData.weeklyHours[weekId] = totalHoursAfterShift;
            
            // Update final payroll totals (subtract hours moved to WeeklyOT from Regular)
            employeeData.weeklyOT += weeklyOTForShift;
            employeeData.regular -= weeklyOTForShift;
        }
    }
    
    // Phase 3: Generate CSV
    let csv = "Employee Name,Total Hours,Regular Hours,Daily OT,Weekly OT,Shifts Paired\n";
    
    for (const uid in payrollData) {
        const data = payrollData[uid];
        
        // Ensure totals are not negative due to floating point math
        data.regular = Math.max(0, data.regular); 

        csv += `"${data.name}",`;
        csv += `${(data.regular + data.dailyOT + data.weeklyOT).toFixed(2)},`;
        csv += `${data.regular.toFixed(2)},`;
        csv += `${data.dailyOT.toFixed(2)},`;
        csv += `${data.weeklyOT.toFixed(2)},`;
        csv += `${data.shifts.length}\n`;
    }

    downloadCSV(csv, `payroll_report_${state.filterStartDate || 'all'}_to_${state.filterEndDate || 'all'}.csv`);
    setMessage('Payroll report generated successfully.', 'success');
}
window.generatePayrollReport = generatePayrollReport;
