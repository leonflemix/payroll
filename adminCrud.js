// Filename: adminCrud.js
import { state, db } from './state.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { setMessage, downloadCSV, getWeekNumber, writeAuditLog, toDatetimeLocal, formatTimestamp } from './utils.js';
import { showPhotoModal, closeLogModal, renderUI } from './uiRender.js';

import { 
    timecards_employees_path, 
    timecards_logs_path, 
    STANDARD_WORK_DAY_HOURS, 
    STANDARD_WORK_WEEK_HOURS, 
    BREAK_TRIGGER_HOURS, 
    BREAK_DEDUCTION_MINUTES,
    ENABLE_CAMERA
} from './constants.js';

/*
|--------------------------------------------------------------------------
| EMPLOYEE MANAGEMENT
|--------------------------------------------------------------------------
*/

export function showSignupModal() {
    const modal = document.getElementById('employee-signup-modal');
    modal.querySelector('#employee-modal-title').textContent = 'Sign Up New Employee';
    modal.querySelector('#employee-name').value = '';
    modal.querySelector('#employee-email').value = '';
    modal.querySelector('#employee-password').value = '';
    modal.classList.remove('hidden');
}
window.showSignupModal = showSignupModal;

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}
window.closeSignupModal = closeSignupModal;

export async function handleEmployeeSignup() {
    const modal = document.getElementById('employee-signup-modal');
    const name = modal.querySelector('#employee-name').value.trim();
    const email = modal.querySelector('#employee-email').value.trim();
    const password = modal.querySelector('#employee-password').value.trim();

    if (!name || !email || password.length < 6) {
        setMessage("Name and valid email are required. Password must be at least 6 characters.", 'error');
        return;
    }

    state.loading = true;
    renderUI();
    closeSignupModal();

    try {
        // 1. Create user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        // 2. Create user document in Firestore
        await setDoc(doc(db, timecards_employees_path, uid), {
            uid, 
            name, 
            email, 
            status: 'out', 
            isAdmin: false
        });

        setMessage(`Employee ${name} created successfully!`, 'success');
    } catch (error) {
        console.error("Failed to sign up employee:", error);
        if (error.code === 'auth/email-already-in-use') {
            setMessage("The provided email is already in use.", 'error');
        } else {
            setMessage(`Failed to create employee. Error: ${error.message}`, 'error');
        }
    }
    state.loading = false;
    renderUI();
}
window.handleEmployeeSignup = handleEmployeeSignup;

export async function handleEmployeeDelete(uidToDelete) {
    if (!confirm(`Are you sure you want to delete the employee (UID: ${uidToDelete})? This will disable their login and delete all associated data. This cannot be undone.`)) return;

    state.loading = true;
    renderUI();

    try {
        // We simulate deletion by removing the Firestore document, which prevents them from using the Kiosk 
        await deleteDoc(doc(db, timecards_employees_path, uidToDelete));

        setMessage(`Employee data deleted from Firestore. Login disabled.`, 'success');
    } catch (error) {
        console.error("Failed to delete employee:", error);
        setMessage("Failed to delete employee. Check console.", 'error');
    }
    state.loading = false;
    renderUI();
}
window.handleEmployeeDelete = handleEmployeeDelete;


/*
|--------------------------------------------------------------------------
| LOG MANAGEMENT & REPORTING
|--------------------------------------------------------------------------
*/

/**
 * Recalculates and updates the employee's current status (in/out) 
 */
export async function updateEmployeeStatusAfterLogEdit(employeeUid) {
    try {
        const logsRef = collection(db, timecards_logs_path);
        const q = query(logsRef, where('employeeUid', '==', employeeUid));
        const snapshot = await getDocs(q);

        // Get all logs for the employee
        const employeeLogs = snapshot.docs.map(doc => ({ 
            id: doc.id, 
            type: doc.data().type, 
            timestamp: doc.data().timestamp.toDate().getTime() 
        }));

        // Sort by timestamp descending (newest first)
        employeeLogs.sort((a, b) => b.timestamp - a.timestamp);

        const employeeDocRef = doc(db, timecards_employees_path, employeeUid);

        if (employeeLogs.length > 0) {
            const latestLog = employeeLogs[0];
            // Update employee status to match the type of the latest log entry
            await updateDoc(employeeDocRef, { status: latestLog.type });
        } else {
            // If all logs were deleted, reset status to 'out'
            await updateDoc(employeeDocRef, { status: 'out' });
        }
    } catch (error) {
        console.error("Failed to update employee status after admin edit:", error);
    }
}


export function updateAdminLogFilters() {
    const start = document.getElementById('filter-start-date').value;
    const end = document.getElementById('filter-end-date').value;
    const employeeUid = document.getElementById('filter-employee-uid').value; 

    state.filterStartDate = start || null;
    state.filterEndDate = end || null;
    state.filterEmployeeUid = employeeUid; 

    renderUI();
    setMessage('Log table filter applied.', 'success');
}
window.updateAdminLogFilters = updateAdminLogFilters;

export function getFilteredLogs() {
    let logs = state.allLogs;

    // Date Filtering
    if (state.filterStartDate) {
        const startDate = new Date(state.filterStartDate);
        startDate.setHours(0, 0, 0, 0);

        logs = logs.filter(log => log.timestamp.toDate().getTime() >= startDate.getTime());
    }

    if (state.filterEndDate) {
        const endDate = new Date(state.filterEndDate);
        endDate.setHours(23, 59, 59, 999); 

        logs = logs.filter(log => log.timestamp.toDate().getTime() <= endDate.getTime());
    }

    // Employee Filtering
    if (state.filterEmployeeUid && state.filterEmployeeUid !== 'all') {
        logs = logs.filter(log => log.employeeUid === state.filterEmployeeUid);
    }

    return logs;
}

export function generatePayrollReport() {
    const logsToProcess = getFilteredLogs();

    if (logsToProcess.length === 0) {
        setMessage("No logs found for the selected date range to generate a report.", 'error');
        return;
    }

    const applyBreakDeduction = document.getElementById('apply-break-deduction').checked;

    const pairedData = {}; 
    const currentPunches = {}; 
    const weeklyRegularHoursTracker = {};

    // 1. First Pass: Pair Shifts, Calculate Daily OT and Break Deductions
    const sortedLogs = [...logsToProcess].sort((a, b) => a.timestamp.toDate().getTime() - b.timestamp.toDate().getTime());

    sortedLogs.forEach(log => {
        if (!pairedData[log.employeeUid]) {
            pairedData[log.employeeUid] = { uid: log.employeeUid, name: log.employeeName, shifts: [] };
        }

        if (log.type === 'in') {
            currentPunches[log.employeeUid] = log;
        } else if (log.type === 'out' && currentPunches[log.employeeUid]) {
            const inLog = currentPunches[log.employeeUid];

            const rawMilliseconds = log.timestamp.toDate().getTime() - inLog.timestamp.toDate().getTime();
            const rawHours = rawMilliseconds / (1000 * 60 * 60);

            let totalShiftHours = rawHours;
            let deductedMinutes = 0;

            // Apply Break Deduction Logic
            if (applyBreakDeduction && rawHours >= BREAK_TRIGGER_HOURS) {
                deductedMinutes = BREAK_DEDUCTION_MINUTES;
                totalShiftHours = rawHours - (deductedMinutes / 60);
            }

            // Calculate Daily Overtime (DOT)
            const regularHours = Math.min(totalShiftHours, STANDARD_WORK_DAY_HOURS);
            const dailyOvertimeHours = Math.max(0, totalShiftHours - STANDARD_WORK_DAY_HOURS);

            const shiftDate = inLog.timestamp.toDate().toLocaleDateString();
            const weekKey = getWeekNumber(inLog.timestamp.toDate());

            pairedData[log.employeeUid].shifts.push({
                employeeName: log.employeeName,
                weekKey,
                date: shiftDate,
                clockIn: formatTimestamp(inLog.timestamp),
                clockOut: formatTimestamp(log.timestamp),
                rawHours: rawHours.toFixed(2),
                deductedMinutes,
                regularHours,
                dailyOvertimeHours,
                totalShiftHours: totalShiftHours.toFixed(2),
                weeklyOvertimeHours: 0, // Placeholder
            });

            delete currentPunches[log.employeeUid];
        }
    });

    // 2. Second Pass: Calculate Weekly Overtime (WOT)

    Object.values(pairedData).forEach(employeeData => {
        const employeeUid = employeeData.uid;
        weeklyRegularHoursTracker[employeeUid] = {}; 

        employeeData.shifts.forEach(shift => {
            const weekKey = shift.weekKey;

            if (!weeklyRegularHoursTracker[employeeUid][weekKey]) {
                weeklyRegularHoursTracker[employeeUid][weekKey] = 0;
            }

            const cumulativeRegHours = weeklyRegularHoursTracker[employeeUid][weekKey];
            const hoursToConsider = shift.regularHours;

            const remainingWeeklyRegHours = STANDARD_WORK_WEEK_HOURS - cumulativeRegHours;

            if (remainingWeeklyRegHours > 0) {
                const actualRegHours = Math.min(hoursToConsider, remainingWeeklyRegHours);
                const otFromRegHours = hoursToConsider - actualRegHours;

                shift.regularHours = actualRegHours;
                shift.weeklyOvertimeHours += otFromRegHours;

                weeklyRegularHoursTracker[employeeUid][weekKey] += actualRegHours;

            } else {
                shift.weeklyOvertimeHours += shift.regularHours;
                shift.regularHours = 0;
            }

            shift.totalHours = shift.regularHours + shift.dailyOvertimeHours + shift.weeklyOvertimeHours;
        });
    });


    // 3. Generate CSV

    let totalCompanyHours = 0;
    let csvContent = "Employee,Date,Clock In,Clock Out,Raw Hours,Break Deducted (min),Total Shift Hours,Regular Hours,Daily OT,Weekly OT\n";

    Object.values(pairedData).forEach(employeeData => {
        employeeData.shifts.forEach(shift => {
            totalCompanyHours += parseFloat(shift.totalHours);
            csvContent += `"${shift.employeeName || employeeData.name}",`;
            csvContent += `"${shift.date}",`;
            csvContent += `"${shift.clockIn}",`;
            csvContent += `"${shift.clockOut}",`;
            csvContent += `"${shift.rawHours}",`;
            csvContent += `"${shift.deductedMinutes}",`;
            csvContent += `"${(shift.regularHours + shift.dailyOvertimeHours + shift.weeklyOvertimeHours).toFixed(2)}",`; // Calculated total
            csvContent += `"${shift.regularHours.toFixed(2)}",`;
            csvContent += `"${shift.dailyOvertimeHours.toFixed(2)}",`;
            csvContent += `"${shift.weeklyOvertimeHours.toFixed(2)}"\n`;
        });
    });

    downloadCSV(csvContent, `payroll_report_${state.filterStartDate || 'all'}_to_${state.filterEndDate || 'all'}.csv`);
    setMessage(`Payroll report for filtered range generated. Total Compensable Hours: ${totalCompanyHours.toFixed(2)}`, 'success');
}
window.generatePayrollReport = generatePayrollReport;

export function showLogModal(logId, log = null) {
    const modal = document.getElementById('log-modal');
    const logEntry = log || state.allLogs.find(l => l.id === logId);

    if (!logEntry) { setMessage("Log entry not found.", 'error'); return; }

    modal.querySelector('#log-modal-title').textContent = `Edit Log: ${logEntry.employeeName}`;
    modal.querySelector('#log-id').value = logEntry.id;
    modal.querySelector('#log-employee-name').textContent = logEntry.employeeName;
    modal.querySelector('#log-type').value = logEntry.type;
    modal.querySelector('#log-timestamp').value = toDatetimeLocal(logEntry.timestamp);

    const deleteBtn = modal.querySelector('#delete-log-btn');
    deleteBtn.onclick = () => handleLogDelete(logEntry.id);
    deleteBtn.classList.remove('hidden');

    const photoStatus = document.getElementById('log-photo-status');
    const photoBtn = document.getElementById('log-photo-btn');

    if (ENABLE_CAMERA) {
        if (logEntry.photoData) {
            photoStatus.innerHTML = '<i class="fas fa-check-circle text-green-500"></i> Photo Available';
            photoBtn.onclick = () => showPhotoModal(logEntry.photoData);
            photoBtn.classList.remove('hidden');
        } else {
            photoStatus.innerHTML = '<i class="fas fa-exclamation-triangle text-yellow-500"></i> No Photo Data';
            photoBtn.classList.add('hidden');
        }
    } else {
         photoStatus.innerHTML = '<i class="fas fa-camera-slash text-gray-500"></i> Camera Disabled';
         photoBtn.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}
window.showLogModal = showLogModal;

export async function handleLogSave() {
    const modal = document.getElementById('log-modal');
    const logId = modal.querySelector('#log-id').value;
    const type = modal.querySelector('#log-type').value;
    const datetimeLocal = modal.querySelector('#log-timestamp').value;

    if (!logId || !type || !datetimeLocal) { setMessage("Log data incomplete.", 'error'); return; }
    state.loading = true; renderUI(); closeLogModal();

    try {
        const logRef = doc(db, timecards_logs_path, logId);

        // --- 1. Fetch OLD Data for Audit ---
        const oldLogSnap = await getDoc(logRef);
        if (!oldLogSnap.exists()) {
             setMessage("Log entry not found for audit.", 'error');
             state.loading = false; renderUI(); return;
        }
        const oldData = oldLogSnap.data();

        const newData = {
            type: type,
            timestamp: Timestamp.fromDate(new Date(datetimeLocal)),
        };

        // --- 2. Write Audit Log ---
        await writeAuditLog('EDIT', logId, oldData, newData); 

        // --- 3. Update Document ---
        await updateDoc(logRef, newData);

        // --- 4. Update Employee Status (NEW) ---
        const affectedLog = state.allLogs.find(l => l.id === logId);
        if (affectedLog) {
            await updateEmployeeStatusAfterLogEdit(affectedLog.employeeUid);
        }

        setMessage(`Log entry ${logId} updated successfully!`, 'success');
    } catch (error) {
        console.error("Failed to update log:", error);
        setMessage("Failed to update log. Check console.", 'error');
    }
    state.loading = false; renderUI();
}
window.handleLogSave = handleLogSave;

export async function handleLogDelete(idToDelete) {
     if (!confirm(`Are you sure you want to delete log entry ${idToDelete}?`)) return;
    state.loading = true; renderUI(); closeLogModal();

    try {
        const logRef = doc(db, timecards_logs_path, idToDelete);

        // --- 1. Fetch OLD Data and Employee UID for Audit and Status Update ---
        const oldLogSnap = await getDoc(logRef);
        let employeeUidToUpdate = null;

        if (oldLogSnap.exists()) {
            const oldData = oldLogSnap.data();
            employeeUidToUpdate = oldData.employeeUid;

            // --- 2. Write Audit Log ---
            await writeAuditLog('DELETE', idToDelete, oldData);
        }

        // --- 3. Delete Document ---
        await deleteDoc(logRef);

        // --- 4. Update Employee Status (NEW) ---
        if (employeeUidToUpdate) {
            await updateEmployeeStatusAfterLogEdit(employeeUidToUpdate);
        }

        setMessage(`Log entry ${idToDelete} deleted.`, 'success');
    } catch (error) {
        console.error("Failed to delete log:", error);
        setMessage("Failed to delete log. Check console.", 'error');
    }
    state.loading = false; renderUI();
}
window.handleLogDelete = handleLogDelete;
