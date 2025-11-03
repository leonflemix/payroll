// Filename: adminCrud.js
import { state } from './state.js';
import { renderEmployeeList, renderTimeLogList, renderAuditLogList, closeAllModals, setAuthMessage, closeSignupModal, closeLogModal, closeSettingsModal } from './uiRender.js';
import { writeAuditLog, updateEmployeeStatusAfterLogEdit } from './firebase.js';
import { formatTotalHours, formatTime } from './utils.js';
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { doc, setDoc, deleteDoc, collection, getDocs, Timestamp, query, where, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. EMPLOYEE MANAGEMENT (CRUD)
|--------------------------------------------------------------------------
*/

/**
 * Toggles the Employee Sign Up/Edit modal.
 * @param {string} [uid] - The UID of the employee to edit. If null/undefined, shows new sign-up form.
 */
export function toggleSignupModal(uid) {
    const modal = document.getElementById('employee-signup-modal');
    const form = document.getElementById('employee-signup-form');
    if (!modal || !form) return;

    // Reset form for new entry
    form.reset();
    document.getElementById('signup-title').textContent = 'Sign Up New Employee';
    document.getElementById('signup-password-group').classList.remove('hidden');
    document.getElementById('signup-uid').value = '';
    document.getElementById('signup-password-input').required = true;

    if (uid && state.allEmployees[uid]) {
        const emp = state.allEmployees[uid];
        document.getElementById('signup-title').textContent = 'Edit Employee Profile';
        document.getElementById('signup-name').value = emp.name;
        document.getElementById('signup-email').value = emp.email;
        document.getElementById('signup-uid').value = emp.uid; // Hidden field to track the user being edited
        document.getElementById('signup-password-group').classList.add('hidden');
        document.getElementById('signup-password-input').required = false;
    }

    modal.classList.remove('hidden');
}

/**
 * Handles the submission of the employee sign up/edit form.
 * @param {Event} event - The form submission event.
 */
export async function handleEmployeeSignup(event) {
    event.preventDefault();
    closeAllModals();

    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password-input').value;
    const uid = document.getElementById('signup-uid').value; // Check for existing UID

    if (uid) {
        // --- Edit Existing Employee ---
        try {
            const employeeRef = doc(state.db, state.employee_path, uid);
            await setDoc(employeeRef, { name, email }, { merge: true });

            await writeAuditLog('EDIT_PROFILE', `Updated name/email for ${name}`, uid);
            setAuthMessage(`Successfully updated profile for ${name}.`, false);
        } catch (error) {
            console.error("Error updating employee profile:", error);
            setAuthMessage(`Failed to update profile: ${error.message}`, true);
        }
    } else {
        // --- Sign Up New Employee (Requires Auth + Firestore Doc) ---
        try {
            const userCredential = await createUserWithEmailAndPassword(state.auth, email, password);
            const newUid = userCredential.user.uid;
            const employeeRef = doc(state.db, state.employee_path, newUid);

            const initialData = {
                uid: newUid,
                name: name,
                email: email,
                isAdmin: false,
                status: 'out',
                cameraEnabled: false,
                maxDailyHours: 8,
                breakDeductionMins: 30
            };

            await setDoc(employeeRef, initialData);

            await writeAuditLog('CREATE_USER', `Created new employee: ${name}`, newUid);
            setAuthMessage(`Employee ${name} created successfully!`, false);
        } catch (error) {
            console.error("Error creating new employee:", error);
            setAuthMessage(`Sign Up failed: ${error.message}`, true);
        }
    }
}

/**
 * Toggles the Employee Settings modal.
 * @param {string} uid - The UID of the employee to edit settings for.
 */
export function toggleSettingsModal(uid) {
    const modal = document.getElementById('employee-settings-modal');
    const form = document.getElementById('employee-settings-form');
    if (!modal || !form || !state.allEmployees[uid]) return;

    const emp = state.allEmployees[uid];

    document.getElementById('settings-title').textContent = `Edit Settings: ${emp.name}`;
    document.getElementById('settings-uid').value = emp.uid;
    document.getElementById('settings-admin').checked = emp.isAdmin;
    document.getElementById('settings-camera').checked = emp.cameraEnabled;
    document.getElementById('settings-max-hours').value = emp.maxDailyHours || 8;
    document.getElementById('settings-break-mins').value = emp.breakDeductionMins || 30;

    modal.classList.remove('hidden');
}

/**
 * Handles the submission of the employee settings form.
 * @param {Event} event - The form submission event.
 */
export async function handleEmployeeSettings(event) {
    event.preventDefault();
    closeAllModals();

    const uid = document.getElementById('settings-uid').value;
    const isAdmin = document.getElementById('settings-admin').checked;
    const cameraEnabled = document.getElementById('settings-camera').checked;
    const maxDailyHours = parseFloat(document.getElementById('settings-max-hours').value);
    const breakDeductionMins = parseInt(document.getElementById('settings-break-mins').value, 10);

    const emp = state.allEmployees[uid];

    if (!emp) {
        setAuthMessage("Error: Employee not found.", true);
        return;
    }

    try {
        const employeeRef = doc(state.db, state.employee_path, uid);
        const updates = {
            isAdmin,
            cameraEnabled,
            maxDailyHours,
            breakDeductionMins
        };

        await setDoc(employeeRef, updates, { merge: true });
        await writeAuditLog('EDIT_SETTINGS', `Updated settings for ${emp.name}`, uid, JSON.stringify(updates));
        setAuthMessage(`Successfully updated settings for ${emp.name}.`, false);

    } catch (error) {
        console.error("Error updating employee settings:", error);
        setAuthMessage(`Failed to update settings: ${error.message}`, true);
    }
}


/**
 * Deletes an employee from Firestore (does not delete Auth user).
 * @param {string} uid - The UID of the employee to delete.
 */
export async function deleteEmployee(uid) {
    if (!confirm(`Are you sure you want to delete employee ${state.allEmployees[uid]?.name}? This will NOT delete the Firebase Authentication user.`)) return;

    const employee = state.allEmployees[uid];
    if (!employee) return;

    try {
        const employeeRef = doc(state.db, state.employee_path, uid);
        await deleteDoc(employeeRef);

        await writeAuditLog('DELETE_PROFILE', `Deleted employee profile for ${employee.name}`, uid, JSON.stringify(employee));
        setAuthMessage(`Employee ${employee.name} profile deleted.`, false);
    } catch (error) {
        console.error("Error deleting employee:", error);
        setAuthMessage(`Failed to delete employee: ${error.message}`, true);
    }
}

/*
|--------------------------------------------------------------------------
| 2. TIME LOG MANAGEMENT (CRUD)
|--------------------------------------------------------------------------
*/

/**
 * Toggles the Log Edit/Add modal.
 * @param {string} [logId] - The ID of the log to edit.
 * @param {string} [logType] - The type ('in' or 'out') of the log to edit.
 */
export function toggleLogModal(logId, logType) {
    const modal = document.getElementById('log-modal');
    const form = document.getElementById('log-edit-form');
    if (!modal || !form) return;

    // Reset form and set to New Log mode by default
    form.reset();
    document.getElementById('log-title').textContent = 'Add New Time Log';
    document.getElementById('log-id').value = '';
    document.getElementById('log-employee-select').disabled = false;
    document.getElementById('log-photo-group').classList.add('hidden');

    // Populate Employee Select if empty
    const employeeSelect = document.getElementById('log-employee-select');
    if (employeeSelect.children.length === 0 || employeeSelect.children.length === 1 && employeeSelect.children[0].value === "") {
        employeeSelect.innerHTML = Object.values(state.allEmployees).map(emp =>
            `<option value="${emp.uid}">${emp.name}</option>`
        ).join('');
    }

    if (logId && logType) {
        // --- Edit Existing Log ---
        const log = state.allLogs.find(l => l.id === logId);
        if (!log) return;

        document.getElementById('log-title').textContent = 'Edit Time Log';
        document.getElementById('log-id').value = log.id;
        document.getElementById('log-employee-select').value = log.employeeUid;
        document.getElementById('log-employee-select').disabled = true; // Cannot change employee of an existing log

        // Format timestamp for datetime-local input
        const date = log.timestamp.toDate();
        const datePart = date.toISOString().substring(0, 10);
        const timePart = date.toTimeString().substring(0, 5);
        document.getElementById('log-datetime').value = `${datePart}T${timePart}`;
        document.getElementById('log-type').value = log.type;

        // Show photo controls if photo exists
        const photoGroup = document.getElementById('log-photo-group');
        if (log.photo) {
            photoGroup.classList.remove('hidden');
            document.getElementById('view-log-photo').setAttribute('onclick', `showPhotoModal('${log.photo}')`);
        } else {
            photoGroup.classList.add('hidden');
        }
    } else {
        // Default values for new log
        const now = new Date();
        const datePart = now.toISOString().substring(0, 10);
        const timePart = now.toTimeString().substring(0, 5);
        document.getElementById('log-datetime').value = `${datePart}T${timePart}`;
        document.getElementById('log-type').value = 'in';
    }

    modal.classList.remove('hidden');
}

/**
 * Handles the submission of the log edit/add form.
 * @param {Event} event - The form submission event.
 */
export async function handleLogSave(event) {
    event.preventDefault();
    closeAllModals();

    const logId = document.getElementById('log-id').value;
    const employeeUid = document.getElementById('log-employee-select').value;
    const datetime = document.getElementById('log-datetime').value;
    const type = document.getElementById('log-type').value;

    if (!employeeUid || !datetime || !type) {
        setAuthMessage("All fields are required.", true);
        return;
    }

    const newTimestamp = Timestamp.fromDate(new Date(datetime));

    try {
        if (logId) {
            // --- Edit Existing Log ---
            const log = state.allLogs.find(l => l.id === logId);
            if (!log) throw new Error("Log record not found.");

            const oldDetails = JSON.stringify({ oldTime: formatTimestamp(log.timestamp), oldType: log.type });
            const logRef = doc(state.db, state.timecards_logs_path, logId);

            await updateDoc(logRef, {
                timestamp: newTimestamp,
                type: type
            });

            const newDetails = JSON.stringify({ newTime: formatTimestamp(newTimestamp), newType: type });
            await writeAuditLog('EDIT_LOG', `Time log edited by Admin. Old: ${oldDetails} New: ${newDetails}`, log.employeeUid);
            
            // Recalculate employee status based on the newest log
            await updateEmployeeStatusAfterLogEdit(employeeUid);
            setAuthMessage("Time log updated successfully.", false);

        } else {
            // --- Add New Log ---
            const logsCollection = collection(state.db, state.timecards_logs_path);
            
            const newLog = {
                employeeUid: employeeUid,
                timestamp: newTimestamp,
                type: type,
                photo: null // Admin added logs do not have a photo
            };

            const docRef = await setDoc(doc(logsCollection), newLog);

            await writeAuditLog('ADD_LOG', `New log added by Admin: ${type} at ${formatTimestamp(newTimestamp)}`, employeeUid);
            
            // Recalculate employee status based on the newest log
            await updateEmployeeStatusAfterLogEdit(employeeUid);
            setAuthMessage("New time log added successfully.", false);
        }
    } catch (error) {
        console.error("Error saving time log:", error);
        setAuthMessage(`Failed to save log: ${error.message}`, true);
    }
}

/**
 * Deletes a time log entry.
 * @param {string} logId - The ID of the log entry to delete.
 */
export async function handleLogDelete(logId) {
    if (!confirm("Are you sure you want to delete this time log entry?")) return;

    const log = state.allLogs.find(l => l.id === logId);
    if (!log) return;

    try {
        const logRef = doc(state.db, state.timecards_logs_path, logId);
        await deleteDoc(logRef);

        await writeAuditLog('DELETE_LOG', `Deleted log: ${log.type} at ${formatTimestamp(log.timestamp)}`, log.employeeUid, JSON.stringify(log));
        
        // Recalculate employee status based on the newest log
        await updateEmployeeStatusAfterLogEdit(log.employeeUid);
        setAuthMessage("Time log deleted.", false);
    } catch (error) {
        console.error("Error deleting log:", error);
        setAuthMessage(`Failed to delete log: ${error.message}`, true);
    }
}

/*
|--------------------------------------------------------------------------
| 3. PAYROLL REPORTING
|--------------------------------------------------------------------------
*/

/**
 * Generates and downloads a CSV file based on the currently filtered logs.
 * Includes shift calculations and overtime logic.
 * @param {boolean} applyDeductions - Whether to apply automated break deductions.
 */
export async function generatePayrollReport() {
    closeAllModals();

    if (!state.allLogs || !state.allEmployees) {
        setAuthMessage("Error: Data not fully loaded.", true);
        return;
    }

    const applyDeductions = document.getElementById('payroll-break-deductions').checked;

    // Use the current filtered and sorted logs from the rendering logic
    const tableBody = document.getElementById('log-list-body');
    if (!tableBody) {
        setAuthMessage("Error: Log list table not found.", true);
        return;
    }

    // Since renderTimeLogList filters, we re-run the filtering logic here for consistency
    const employeeFilter = document.getElementById('filter-employee');
    const startDateFilter = document.getElementById('filter-start-date');
    const endDateFilter = document.getElementById('filter-end-date');

    let filteredLogs = state.allLogs;

    // Filter by Employee UID
    if (state.filterEmployeeUid) {
        filteredLogs = filteredLogs.filter(log => log.employeeUid === state.filterEmployeeUid);
    }

    // Filter by Date Range
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;

    if (startDate) {
        const startTimestamp = startDate.getTime();
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() >= startTimestamp);
    }

    if (endDate) {
        const endTimestamp = endDate.getTime() + 86400000;
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() < endTimestamp);
    }

    // Sort chronologically for pairing
    filteredLogs.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());


    // --- 1. Pair Punches and Calculate Shifts ---
    const shifts = [];
    const unpairedPunches = [];

    for (let i = 0; i < filteredLogs.length; i++) {
        const current = filteredLogs[i];

        if (current.type === 'in') {
            const nextOutIndex = filteredLogs.findIndex((next, j) => j > i && next.type === 'out' && next.employeeUid === current.employeeUid);

            if (nextOutIndex !== -1) {
                const nextOut = filteredLogs[nextOutIndex];
                const shiftDurationMs = nextOut.timestamp.toMillis() - current.timestamp.toMillis();
                const shiftHours = shiftDurationMs / 3600000; // Convert MS to hours

                const employee = state.allEmployees[current.employeeUid];
                const maxDailyHours = employee?.maxDailyHours || 8;
                const breakDeductionMins = employee?.breakDeductionMins || 0;

                shifts.push({
                    employeeUid: current.employeeUid,
                    name: employee.name,
                    in: current.timestamp.toDate(),
                    out: nextOut.timestamp.toDate(),
                    durationMs: shiftDurationMs,
                    shiftHours: shiftHours,
                    maxDailyHours: maxDailyHours,
                    breakDeductionMins: breakDeductionMins,
                    date: current.timestamp.toDate().toDateString()
                });
                // Skip the next 'out' punch since it's now paired
                i = nextOutIndex;
            } else {
                unpairedPunches.push(current);
            }
        } else {
            // An 'out' punch without a preceding 'in' in the filtered set
            unpairedPunches.push(current);
        }
    }

    // --- 2. Calculate Overtime (Daily and Weekly) ---
    const finalReport = [];
    const weeklyHours = {}; // Tracks hours for weekly OT calculation

    for (const shift of shifts) {
        let grossHours = shift.shiftHours;
        let regularHours = 0;
        let dailyOvertime = 0;
        let weeklyOvertime = 0;

        // 2a. Apply Break Deduction (if applicable and shift > 6 hours)
        const breakDeductionHours = (applyDeductions && grossHours > (6 + (shift.breakDeductionMins / 60))) ? (shift.breakDeductionMins / 60) : 0;
        let netHours = grossHours - breakDeductionHours;

        // 2b. Daily Overtime Calculation
        const dailyLimit = shift.maxDailyHours;
        if (netHours > dailyLimit) {
            dailyOvertime = netHours - dailyLimit;
            netHours = dailyLimit;
        }

        // 2c. Weekly Overtime (needs weekly context)
        // Determine the ISO Week/Year for accurate tracking
        const shiftDate = shift.in;
        const year = shiftDate.getFullYear();
        const startOfWeek = new Date(shiftDate);
        startOfWeek.setDate(shiftDate.getDate() - (shiftDate.getDay() === 0 ? 6 : shiftDate.getDay() - 1)); // Adjust to Monday
        startOfWeek.setHours(0, 0, 0, 0);
        const weekKey = `${shift.employeeUid}-${year}-${startOfWeek.getMonth() + 1}-${startOfWeek.getDate()}`;

        if (!weeklyHours[weekKey]) {
            weeklyHours[weekKey] = 0;
        }

        const remainingRegularCapacity = 40 - weeklyHours[weekKey];
        
        if (remainingRegularCapacity > 0) {
            // Hours that fit into regular 40-hour week
            const hoursForRegular = Math.min(netHours, remainingRegularCapacity);
            regularHours = hoursForRegular;
            weeklyHours[weekKey] += hoursForRegular;

            const hoursRemainingAfterRegular = netHours - hoursForRegular;
            if (hoursRemainingAfterRegular > 0) {
                weeklyOvertime = hoursRemainingAfterRegular;
                weeklyHours[weekKey] += hoursRemainingAfterRegular; // Track total weekly OT hours
            }
        } else {
            // All net hours are weekly overtime
            weeklyOvertime = netHours;
            weeklyHours[weekKey] += netHours;
        }
        
        // Final Regular Hours is the portion of netHours that wasn't Daily or Weekly OT
        regularHours = netHours - weeklyOvertime;


        finalReport.push({
            name: shift.name,
            date: shift.date,
            inTime: formatTime(shift.in),
            outTime: formatTime(shift.out),
            grossHours: formatTotalHours(shift.shiftHours),
            breakDeduction: formatTotalHours(breakDeductionHours),
            netHours: formatTotalHours(grossHours - breakDeductionHours),
            regularHours: formatTotalHours(regularHours),
            dailyOvertime: formatTotalHours(dailyOvertime),
            weeklyOvertime: formatTotalHours(weeklyOvertime),
            notes: (breakDeductionHours > 0) ? `Break deducted: ${shift.breakDeductionMins}m` : ''
        });
    }

    // --- 3. Generate CSV Content ---
    let csv = "Employee,Date,Clock In,Clock Out,Gross Hours,Break Deduction,Net Hours,Regular Hours,Daily OT,Weekly OT,Notes\n";
    finalReport.forEach(row => {
        csv += `${row.name},${row.date},${row.inTime},${row.outTime},${row.grossHours},${row.breakDeduction},${row.netHours},${row.regularHours},${row.dailyOvertime},${row.weeklyOvertime},"${row.notes}"\n`;
    });

    if (unpairedPunches.length > 0) {
        csv += "\n\n--- UNPAIRED PUNCHEES (Review Required) ---\n";
        csv += "Employee,Date/Time,Type\n";
        unpairedPunches.forEach(log => {
            const employee = state.allEmployees[log.employeeUid] || { name: 'Unknown' };
            csv += `${employee.name},${formatTimestamp(log.timestamp)},${log.type.toUpperCase()}\n`;
        });
    }

    // --- 4. Download CSV ---
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `payroll_report_${new Date().toISOString().substring(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    setAuthMessage("Payroll report generated successfully.", false);
}

// Option 1: Named export
export const updateEmployee = (employeeData) => {
    // Your update employee implementation
};

// OR Option 2: Default export
export default function updateEmployee(employeeData) {
    // Your update employee implementation
}
