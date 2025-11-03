// Filename: adminCrud.js
import { state } from './state.js';
import { renderEmployeeList, renderTimeLogList, renderAuditLogList, closeAllModals, setAuthMessage, closeSignupModal, closeLogModal, closeSettingsModal, showPhotoModal } from './uiRender.js';
import { writeAuditLog, updateEmployeeStatusAfterLogEdit } from './firebase.js';
import { formatTotalHours, formatTime } from './utils.js';
import { createUserWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
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
        document.getElementById('signup-uid').value = uid; // Hidden field to track the user being edited
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
        if (password.length < 6) {
             setAuthMessage("Password must be at least 6 characters.", true);
             return;
        }

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
        // 1. Delete Firestore Document
        const employeeRef = doc(state.db, state.employee_path, uid);
        await deleteDoc(employeeRef);

        // 2. Delete Auth User (Optional but good practice; requires admin SDK on backend, so we skip for frontend)
        // await deleteUser(uid); // This requires Admin SDK. We skip for simplicity.

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
 */
export function toggleLogModal(logId) {
    const modal = document.getElementById('log-modal');
    const form = document.getElementById('log-edit-form');
    if (!modal || !form || !state.allEmployees) return;

    // Reset form
    form.reset();
    document.getElementById('log-title').textContent = 'Add New Time Log';
    document.getElementById('log-id').value = '';
    document.getElementById('log-employee-select').disabled = false;
    document.getElementById('log-photo-group').classList.add('hidden');

    // Populate Employee Select
    const employeeSelect = document.getElementById('log-employee-select');
    if (employeeSelect.children.length === 0 || employeeSelect.children[0].value === "") {
        employeeSelect.innerHTML = Object.values(state.allEmployees).map(emp =>
            `<option value="${emp.uid}">${emp.name}</option>`
        ).join('');
    }

    if (logId) {
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
        const viewPhotoBtn = document.getElementById('view-log-photo');
        if (log.photo) {
            photoGroup.classList.remove('hidden');
            // We use onclick attribute because it's safer in this single-file env
            viewPhotoBtn.setAttribute('onclick', `showPhotoModal('${log.photo}')`);
        } else {
            photoGroup.classList.add('hidden');
            viewPhotoBtn.removeAttribute('onclick');
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

            // Use setDoc with doc() to let Firestore generate the ID
            await setDoc(doc(logsCollection), newLog);

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
 */
export async function generatePayrollReport() {
    closeAllModals();

    if (!state.allLogs || !state.allEmployees) {
        setAuthMessage("Error: Data not fully loaded.", true);
        return;
    }

    const applyDeductions = document.getElementById('payroll-break-deductions').checked;

    const startDateFilter = document.getElementById('filter-start-date');
    const endDateFilter = document.getElementById('filter-end-date');

    // Use the current filtered and sorted logs from the rendering logic
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
                const breakDeductionMins = (applyDeductions ? employee?.breakDeductionMins : 0) || 0; // Only deduct if toggled

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
        
        // 2a. Apply Break Deduction (if applicable and shift > 6 hours)
        const breakTriggerHours = 6;
        const breakDeductionHours = (shift.breakDeductionMins > 0 && grossHours > breakTriggerHours) ? (shift.breakDeductionMins / 60) : 0;
        let netHours = grossHours - breakDeductionHours;

        let regularHours = 0;
        let dailyOvertime = 0;
        let weeklyOvertime = 0;

        // 2b. Daily Overtime Calculation
        const dailyLimit = shift.maxDailyHours;
        if (netHours > dailyLimit) {
            dailyOvertime = netHours - dailyLimit;
            netHours = dailyLimit; // Remaining hours for weekly calculation
        }

        // 2c. Weekly Overtime (needs weekly context)
        // Determine the ISO Week/Year for accurate tracking (Simplified to start of week)
        const shiftDate = shift.in;
        const startOfWeek = new Date(shiftDate);
        startOfWeek.setDate(shiftDate.getDate() - (shiftDate.getDay() === 0 ? 6 : shiftDate.getDay() - 1)); // Adjust to Monday
        startOfWeek.setHours(0, 0, 0, 0);
        const weekKey = `${shift.employeeUid}-${startOfWeek.getTime()}`; // Unique key per employee/week

        if (!weeklyHours[weekKey]) {
            weeklyHours[weekKey] = { totalHours: 0, regularCapacity: 40 };
        }

        const currentWeeklyTotal = weeklyHours[weekKey].totalHours;
        const remainingRegularCapacity = weeklyHours[weekKey].regularCapacity - currentWeeklyTotal;
        
        if (remainingRegularCapacity > 0) {
            // Hours that fit into regular 40-hour week
            const hoursForRegular = Math.min(netHours, remainingRegularCapacity);
            regularHours = hoursForRegular;

            const hoursRemainingAfterRegular = netHours - hoursForRegular;
            if (hoursRemainingAfterRegular > 0) {
                weeklyOvertime = hoursRemainingAfterRegular;
            }
        } else {
            // All remaining net hours are weekly overtime
            weeklyOvertime = netHours;
        }

        // Update the weekly total hours tracker
        weeklyHours[weekKey].totalHours += regularHours + weeklyOvertime;
        
        finalReport.push({
            name: shift.name,
            date: shift.date,
            inTime: formatTime(shift.in),
            outTime: formatTime(shift.out),
            grossHours: formatTotalHours(shift.shiftHours),
            breakDeduction: formatTotalHours(breakDeductionHours),
            netHours: formatTotalHours(shift.shiftHours - breakDeductionHours),
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
