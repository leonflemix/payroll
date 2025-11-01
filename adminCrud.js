// Filename: adminCrud.js
import { state } from './state.js';
import { setAuthMessage, setStatusMessage, setLogMessage, closeLogModal, closeSignupModal, showPhotoModal, closeSettingsModal, closePhotoModal, closeAllModals, renderEmployeeList, applyFilters } from './uiRender.js';
import { writeAuditLog, getDateTimeInput } from './utils.js';
import { timecards_employees_path, timecards_logs_path } from './constants.js';
import { updateEmployeeStatusAfterLogEdit } from './firebase.js';

import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { setDoc, doc, deleteDoc, Timestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. EMPLOYEE MANAGEMENT (SIGN UP / EDIT / DELETE)
|--------------------------------------------------------------------------
*/

// Handles creating a new user in Firebase Auth and a corresponding employee document in Firestore.
export async function handleSignup() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const isAdmin = document.getElementById('signup-is-admin').checked;

    if (!name || !email || !password) {
        setAuthMessage('Please fill out all fields.', 'error', 'signup-message');
        return;
    }

    if (password.length < 6) {
        setAuthMessage('Password must be at least 6 characters.', 'error', 'signup-message');
        return;
    }

    try {
        // 1. Create user in Firebase Authentication
        const userCredential = await createUserWithEmailAndPassword(state.auth, email, password);
        const uid = userCredential.user.uid;

        // 2. Create corresponding employee document in Firestore
        const employeeData = {
            name: name,
            email: email,
            isAdmin: isAdmin,
            status: 'out', // Default status
            cameraEnabled: false,
            maxDailyHours: 8,
            breakDeductionMins: 30
        };

        await setDoc(doc(state.db, timecards_employees_path, uid), employeeData);

        writeAuditLog('ADD_EMPLOYEE', name, employeeData);
        
        setAuthMessage(`Employee ${name} created successfully!`, 'success', 'signup-message');
        setTimeout(() => { closeSignupModal(); }, 1500);

    } catch (error) {
        console.error("Employee signup failed:", error);
        if (error.code === 'auth/email-already-in-use') {
            setAuthMessage('Email is already in use.', 'error', 'signup-message');
        } else {
            setAuthMessage(`Signup failed: ${error.message}`, 'error', 'signup-message');
        }
    }
}

// Opens the employee settings modal and populates fields
export function showSettingsModal(employeeUid) {
    closeAllModals();
    const employee = state.allEmployees[employeeUid];

    if (!employee) {
        setStatusMessage('Error: Employee data not found.', 'error');
        return;
    }

    document.getElementById('edit-employee-uid').value = employee.uid;
    document.getElementById('edit-employee-name').value = employee.name;
    document.getElementById('edit-employee-email').value = employee.email;
    document.getElementById('edit-max-daily-hours').value = employee.maxDailyHours;
    document.getElementById('edit-break-deduction').value = employee.breakDeductionMins;
    document.getElementById('edit-camera-enabled').checked = employee.cameraEnabled;
    document.getElementById('edit-is-admin').checked = employee.isAdmin;

    document.getElementById('employee-settings-modal').classList.remove('hidden');
}

// Handles saving changes to employee settings
export async function handleSettingsSave() {
    const uid = document.getElementById('edit-employee-uid').value;
    const name = document.getElementById('edit-employee-name').value;
    const maxDailyHours = parseFloat(document.getElementById('edit-max-daily-hours').value);
    const breakDeductionMins = parseInt(document.getElementById('edit-break-deduction').value);
    const cameraEnabled = document.getElementById('edit-camera-enabled').checked;
    const isAdmin = document.getElementById('edit-is-admin').checked;

    if (!name) {
        setAuthMessage('Name cannot be empty.', 'error', 'settings-message');
        return;
    }

    const oldEmployee = state.allEmployees[uid];
    const updatedData = {
        name: name,
        maxDailyHours: isNaN(maxDailyHours) ? 8 : maxDailyHours,
        breakDeductionMins: isNaN(breakDeductionMins) ? 30 : breakDeductionMins,
        cameraEnabled: cameraEnabled,
        isAdmin: isAdmin
    };
    
    try {
        const employeeDocRef = doc(state.db, timecards_employees_path, uid);
        await updateDoc(employeeDocRef, updatedData);

        const auditDetails = { old: oldEmployee, new: updatedData };
        writeAuditLog('EDIT_EMPLOYEE', name, auditDetails);

        setAuthMessage('Employee settings updated!', 'success', 'settings-message');
        setTimeout(() => { closeSettingsModal(); }, 1500);

    } catch (error) {
        console.error("Failed to update employee settings:", error);
        setAuthMessage('Failed to save settings: ' + error.message, 'error', 'settings-message');
    }
}

// Handles deleting an employee (only the Firestore document, Firebase Auth user must be deleted manually)
export async function handleDeleteEmployee(employeeUid) {
    if (!confirm(`Are you sure you want to delete the employee document for ${state.allEmployees[employeeUid].name}? You must also delete the user in Firebase Auth console.`)) return;

    try {
        await deleteDoc(doc(state.db, timecards_employees_path, employeeUid));
        writeAuditLog('DELETE_EMPLOYEE_DOC', state.allEmployees[employeeUid].name, { uid: employeeUid });
        setStatusMessage('Employee document deleted. Remember to delete the Auth user.', 'success');
        
    } catch (error) {
        console.error("Failed to delete employee:", error);
        setStatusMessage('Failed to delete employee: ' + error.message, 'error');
    }
}

/*
|--------------------------------------------------------------------------
| 2. LOG MANAGEMENT (EDIT / DELETE)
|--------------------------------------------------------------------------
*/

// Opens the log editing modal
export function showLogModal(logId) {
    closeAllModals();
    const log = state.allLogs.find(l => l.id === logId);
    if (!log) return;

    const { date, time } = getDateTimeInput(log.timestamp);
    
    document.getElementById('edit-log-id').value = log.id;
    document.getElementById('edit-log-employee').value = log.name;
    document.getElementById('edit-log-date').value = date;
    document.getElementById('edit-log-time').value = time;
    document.getElementById('edit-log-type').value = log.type;
    document.getElementById('edit-log-photo').value = log.photo || '';

    // Show photo button only if photo data exists
    const photoBtn = document.querySelector('#log-modal .btn-secondary');
    if (log.photo) {
        photoBtn.classList.remove('hidden');
    } else {
        photoBtn.classList.add('hidden');
    }

    document.getElementById('log-modal').classList.remove('hidden');
}

// Handles saving changes to a time log
export async function handleLogSave() {
    const logId = document.getElementById('edit-log-id').value;
    const employeeUid = state.allLogs.find(l => l.id === logId)?.employeeUid;
    const dateInput = document.getElementById('edit-log-date').value;
    const timeInput = document.getElementById('edit-log-time').value;
    const type = document.getElementById('edit-log-type').value;

    if (!dateInput || !timeInput) {
        setLogMessage('Date and time must be set.', 'error', 'log-message');
        return;
    }

    try {
        const dateTime = new Date(`${dateInput}T${timeInput}`);
        const newTimestamp = Timestamp.fromDate(dateTime);
        const oldLog = state.allLogs.find(l => l.id === logId);

        const updatedData = {
            timestamp: newTimestamp,
            type: type
        };

        const logDocRef = doc(state.db, timecards_logs_path, logId);
        await updateDoc(logDocRef, updatedData);

        const auditDetails = { old: oldLog, new: updatedData };
        writeAuditLog('EDIT_LOG', logId, auditDetails);

        // Crucial: Recalculate employee status after edit
        if (employeeUid) {
            await updateEmployeeStatusAfterLogEdit(employeeUid);
        }

        setLogMessage('Log updated successfully!', 'success', 'log-message');
        setTimeout(() => { closeLogModal(); }, 1500);

    } catch (error) {
        console.error("Failed to save log:", error);
        setLogMessage('Failed to save log: ' + error.message, 'error', 'log-message');
    }
}

// Handles deleting a time log
export async function handleDeleteLog(logId) {
    if (!confirm(`Are you sure you want to delete log entry ${logId}? This action cannot be undone.`)) return;
    
    const log = state.allLogs.find(l => l.id === logId);
    const employeeUid = log.employeeUid;

    try {
        await deleteDoc(doc(state.db, timecards_logs_path, logId));
        writeAuditLog('DELETE_LOG', logId, log);

        // Crucial: Recalculate employee status after delete
        if (employeeUid) {
            await updateEmployeeStatusAfterLogEdit(employeeUid);
        }

        setStatusMessage('Log entry deleted successfully!', 'success');
        
    } catch (error) {
        console.error("Failed to delete log:", error);
        setStatusMessage('Failed to delete log: ' + error.message, 'error');
    }
}


/*
|--------------------------------------------------------------------------
| 3. PAYROLL REPORTING
|--------------------------------------------------------------------------
*/

function calculateShiftDuration(inTime, outTime, employeeConfig) {
    const shiftMs = outTime.getTime() - inTime.getTime();
    if (shiftMs <= 0) return { totalHours: 0, regularHours: 0, dailyOT: 0 };
    
    let totalHours = shiftMs / (1000 * 60 * 60); // Convert milliseconds to hours
    
    // Apply break deduction if enabled and shift exceeds threshold (e.g., 6 hours)
    const applyBreak = document.getElementById('apply-break-deductions').checked;
    if (applyBreak && employeeConfig.breakDeductionMins > 0 && totalHours >= (employeeConfig.maxDailyHours * 0.75)) { // Use 75% of max hours as threshold
        totalHours -= (employeeConfig.breakDeductionMins / 60); // Deduct break time in hours
    }

    const maxDailyHours = employeeConfig.maxDailyHours || 8; // Default to 8
    
    let regularHours = Math.min(totalHours, maxDailyHours);
    let dailyOT = Math.max(0, totalHours - maxDailyHours);

    return { totalHours, regularHours, dailyOT };
}


function generateWeeklyHoursMap(pairedLogs, employeeConfigs) {
    const weeklyHours = {}; // Key: YYYY-WW, Value: { uid: { totalRegular, totalOT, dailyOTCarryover } }

    pairedLogs.forEach(pair => {
        const inDate = pair.in.timestamp.toDate();
        const year = inDate.getFullYear();
        // Calculate week number (ISO standard week)
        const dayNum = inDate.getDay() || 7; // Convert Sunday 0 to 7
        inDate.setDate(inDate.getDate() + 4 - dayNum);
        const yearStart = new Date(inDate.getFullYear(), 0, 1);
        const weekNumber = Math.ceil((((inDate - yearStart) / 86400000) + 1) / 7);
        const weekKey = `${year}-${String(weekNumber).padStart(2, '0')}`;

        const config = employeeConfigs[pair.employeeUid] || {};
        const { regularHours, dailyOT } = calculateShiftDuration(pair.in.timestamp.toDate(), pair.out.timestamp.toDate(), config);

        if (!weeklyHours[weekKey]) {
            weeklyHours[weekKey] = {};
        }
        if (!weeklyHours[weekKey][pair.employeeUid]) {
            weeklyHours[weekKey][pair.employeeUid] = { totalRegular: 0, totalDailyOT: 0, totalWeeklyOT: 0, carryoverHours: 0 };
        }

        // Add daily hours
        weeklyHours[weekKey][pair.employeeUid].totalRegular += regularHours;
        weeklyHours[weekKey][pair.employeeUid].totalDailyOT += dailyOT;
    });

    // Calculate Weekly Overtime (40 hours per week)
    Object.keys(weeklyHours).forEach(weekKey => {
        Object.keys(weeklyHours[weekKey]).forEach(uid => {
            const entry = weeklyHours[weekKey][uid];
            let totalTime = entry.totalRegular + entry.totalDailyOT;
            
            if (totalTime > 40) {
                // If Daily OT pushed total over 40, we only assign the *remaining* time as Weekly OT
                // Total hours: 45. Daily OT: 3. Regular: 42. Weekly OT should be 5.
                
                // Max Regular + Daily OT before weekly OT kicks in
                const weeklyRegular = Math.min(entry.totalRegular, 40);
                let remainingOT = totalTime - 40;
                
                entry.totalWeeklyOT = remainingOT;
                entry.totalRegular = Math.min(entry.totalRegular, 40);
            }
        });
    });

    return weeklyHours;
}


export function generatePayrollReport() {
    const filteredLogs = state.allLogs.filter(log => {
        const filterUid = document.getElementById('filter-employee').value;
        const startDate = document.getElementById('filter-start-date').value;
        const endDate = document.getElementById('filter-end-date').value;

        const logDate = log.timestamp.toDate();
        const logDateStr = logDate.toISOString().split('T')[0];

        let passesFilter = true;

        if (filterUid && log.employeeUid !== filterUid) {
            passesFilter = false;
        }

        if (startDate && logDateStr < startDate) {
            passesFilter = false;
        }

        if (endDate && logDateStr > endDate) {
            passesFilter = false;
        }

        return passesFilter;
    });

    // 1. Pair up IN and OUT punches
    const pairedLogs = [];
    const openPunches = {}; // Stores the last 'in' punch for each employee

    filteredLogs.sort((a, b) => a.timestamp.toDate() - b.timestamp.toDate()).forEach(log => {
        if (log.type === 'in') {
            openPunches[log.employeeUid] = log;
        } else if (log.type === 'out' && openPunches[log.employeeUid]) {
            pairedLogs.push({
                employeeUid: log.employeeUid,
                in: openPunches[log.employeeUid],
                out: log
            });
            delete openPunches[log.employeeUid];
        }
    });

    // 2. Map employee configs for personalized limits
    const employeeConfigs = {};
    Object.values(state.allEmployees).forEach(emp => {
        employeeConfigs[emp.uid] = {
            maxDailyHours: emp.maxDailyHours,
            breakDeductionMins: emp.breakDeductionMins
        };
    });

    // 3. Calculate hours per week
    const weeklyHoursMap = generateWeeklyHoursMap(pairedLogs, employeeConfigs);

    // 4. Flatten data for CSV
    const reportData = [];
    Object.keys(weeklyHoursMap).sort().forEach(weekKey => {
        Object.keys(weeklyHoursMap[weekKey]).forEach(uid => {
            const employeeData = weeklyHoursMap[weekKey][uid];
            const employee = state.allEmployees[uid];

            if (employeeData.totalRegular > 0 || employeeData.totalDailyOT > 0 || employeeData.totalWeeklyOT > 0) {
                 reportData.push({
                    Week: weekKey,
                    Name: employee.name,
                    UID: uid,
                    'Regular Hours': employeeData.totalRegular.toFixed(2),
                    'Daily Overtime': employeeData.totalDailyOT.toFixed(2),
                    'Weekly Overtime': employeeData.totalWeeklyOT.toFixed(2),
                    'Total Paid Hours': (employeeData.totalRegular + employeeData.totalDailyOT + employeeData.totalWeeklyOT).toFixed(2),
                });
            }
        });
    });

    // 5. Generate CSV file
    const headers = ["Week", "Name", "UID", "Regular Hours", "Daily Overtime", "Weekly Overtime", "Total Paid Hours"];
    let csv = headers.join(',') + '\n';
    reportData.forEach(row => {
        csv += headers.map(header => row[header]).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `payroll_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


// Attach handlers to the window for DOM access
window.showSettingsModal = showSettingsModal;
window.handleSettingsSave = handleSettingsSave;
window.handleDeleteEmployee = handleDeleteEmployee;
window.handleSignup = handleSignup;
window.showLogModal = showLogModal;
window.handleLogSave = handleLogSave;
window.handleDeleteLog = handleDeleteLog;
window.generatePayrollReport = generatePayrollReport;
window.applyFilters = applyFilters;
