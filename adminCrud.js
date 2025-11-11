// Filename: adminCrud.js
import { state, updateState } from './state.js';
import { renderEmployeeList, renderTimeLogList, renderAuditLogList, closeAllModals, setAuthMessage, closeSignupModal, closeLogModal, closeSettingsModal } from './uiRender.js';
import { writeAuditLog, updateEmployeeStatusAfterLogEdit } from './firebase.js';
import { formatTotalHours, formatTime, formatTimestamp, calculateShiftTime } from './utils.js';
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
        document.getElementById('signup-title').textContent = `Edit Employee Profile: ${emp.name}`;
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
    document.getElementById('settings-uid').value = uid;
    document.getElementById('settings-admin').checked = emp.isAdmin;
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
    
    const employee = state.allEmployees[uid];
    if (!employee) {
        setAuthMessage("Error: Employee not found.", true);
        return;
    }

    try {
        // 1. Delete Firestore Document
        const employeeRef = doc(state.db, state.employee_path, uid);
        await deleteDoc(employeeRef);

        await writeAuditLog('DELETE_PROFILE', `Deleted employee profile for ${employee.name}`, uid, JSON.stringify(employee));
        setAuthMessage(`Employee ${employee.name} profile deleted. NOTE: Firebase Auth user is NOT deleted.`, false);
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
    const employeeSelect = document.getElementById('log-employee-select');
    const deleteBtn = document.getElementById('delete-log-btn');
    if (!modal || !form || !state.allEmployees || !employeeSelect) return;

    // Reset form
    form.reset();
    document.getElementById('log-title').textContent = 'Add New Time Log';
    document.getElementById('log-id').value = '';
    employeeSelect.disabled = false;
    deleteBtn.classList.add('hidden'); // Hide delete button by default for new log

    // Populate Employee Select
    employeeSelect.innerHTML = Object.values(state.allEmployees).map(emp =>
        `<option value="${emp.uid}">${emp.name}</option>`
    ).join('');


    if (logId) {
        // --- Edit Existing Log ---
        const log = state.allLogs.find(l => l.id === logId);
        if (!log) return;

        document.getElementById('log-title').textContent = 'Edit Time Log';
        document.getElementById('log-id').value = log.id;
        employeeSelect.value = log.employeeUid;
        employeeSelect.disabled = true; // Cannot change employee of an existing log
        deleteBtn.classList.remove('hidden'); // Show delete button for existing log

        // Format timestamp for datetime-local input
        const date = log.timestamp.toDate();
        const datePart = date.toISOString().substring(0, 10);
        // Correctly format time part including seconds (required by step="1" in HTML)
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        const timePart = `${hours}:${minutes}:${seconds}`;

        document.getElementById('log-datetime').value = `${datePart}T${timePart}`;
        document.getElementById('log-type').value = log.type;

    } else {
        // Default values for new log
        const now = new Date();
        const datePart = now.toISOString().substring(0, 10);
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const timePart = `${hours}:${minutes}:${seconds}`;
        
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
            
            await updateEmployeeStatusAfterLogEdit(employeeUid);
            setAuthMessage("Time log updated successfully.", false);

        } else {
            // --- Add New Log ---
            const logsCollection = collection(state.db, state.timecards_logs_path);
            
            const employee = state.allEmployees[employeeUid];
            if (!employee) throw new Error("Employee data not found.");

            // Use doc(collection) to get a new document reference with an auto-generated ID
            const logRef = doc(logsCollection); 
            
            const newLog = {
                employeeUid: employeeUid,
                employeeName: employee.name, 
                type: type,
                timestamp: newTimestamp,
                photo: null 
            };

            await setDoc(logRef, newLog);

            await writeAuditLog('ADD_LOG', `New log added by Admin: ${type} at ${formatTimestamp(newTimestamp)}`, employeeUid);
            
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
    const log = state.allLogs.find(l => l.id === logId);
    if (!log) {
        setAuthMessage("Error: Log record not found.", true);
        return;
    }

    try {
        // Close modal if open (this is the delete action from the modal)
        closeLogModal(); 

        const logRef = doc(state.db, state.timecards_logs_path, logId);
        await deleteDoc(logRef);

        await writeAuditLog('DELETE_LOG', `Deleted log: ${log.type} at ${formatTimestamp(log.timestamp)}`, log.employeeUid, JSON.stringify(log));
        
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
 * Re-renders the time log list when filters are changed.
 */
export function applyFilters() {
    renderTimeLogList();
}


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

    // Since the checkbox for deductions is not included in the updated HTML,
    // we'll assume a default state or ignore it for now. I'll re-add it 
    // to the time-logs-tab in index.html to fix this.
    // **Correction:** I added an optional "Break Deduction" checkbox to the filter section in index.html.

    const applyDeductions = document.getElementById('payroll-break-deductions')?.checked ?? true;

    const startDateFilter = document.getElementById('filter-start-date');
    const endDateFilter = document.getElementById('filter-end-date');
    const employeeFilter = document.getElementById('filter-employee-select'); 

    // Update state based on current filters for consistency
    const employeeUid = employeeFilter.value || null;

    let filteredLogs = state.allLogs;

    // Filter by Employee UID
    if (employeeUid && employeeUid !== "") {
        filteredLogs = filteredLogs.filter(log => log.employeeUid === employeeUid);
    }

    // Filter by Date Range
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;

    if (startDate) {
        const startTimestamp = startDate.getTime();
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() >= startTimestamp);
    }

    if (endDate) {
        // End date should include the entire day, up to the last millisecond
        const endTimestamp = endDate.getTime() + 86400000; // Add 24 hours
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
                const shiftHours = shiftDurationMs / 3600000;

                const employee = state.allEmployees[current.employeeUid];
                const maxDailyHours = employee?.maxDailyHours || 8;
                const breakDeductionMins = (applyDeductions ? employee?.breakDeductionMins : 0) || 0; 

                shifts.push({
                    employeeUid: current.employeeUid,
                    name: employee.name,
                    in: current.timestamp.toDate(),
                    out: nextOut.timestamp.toDate(),
                    shiftHours: shiftHours,
                    maxDailyHours: maxDailyHours,
                    breakDeductionMins: breakDeductionMins,
                    date: current.timestamp.toDate().toDateString()
                });
                i = nextOutIndex;
            } else {
                unpairedPunches.push(current);
            }
        } else {
            unpairedPunches.push(current);
        }
    }

    // --- 2. Calculate Overtime (Daily and Weekly) ---
    const finalReport = [];
    // Reset weekly hours tracking on each report generation
    const weeklyHours = {}; 

    for (const shift of shifts) {
        let grossHours = shift.shiftHours;
        
        const breakTriggerHours = 6;
        // Check if break deduction applies (non-zero setting AND shift duration > trigger)
        const breakDeductionHours = (shift.breakDeductionMins > 0 && grossHours > breakTriggerHours) ? (shift.breakDeductionMins / 60) : 0;
        let netHours = grossHours - breakDeductionHours;

        let regularHours = 0;
        let dailyOvertime = 0;
        let weeklyOvertime = 0;

        // Daily Overtime Calculation
        const dailyLimit = shift.maxDailyHours;
        if (netHours > dailyLimit) {
            dailyOvertime = netHours - dailyLimit;
        }

        let hoursForWeeklySplit = netHours - dailyOvertime; // This is the regular portion of the day (max dailyLimit)

        // Weekly Overtime 
        const shiftDate = shift.in;
        // Calculate the starting day of the week (Monday)
        const dayOfWeek = shiftDate.getDay(); // 0 is Sunday, 1 is Monday
        const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days. Else, go back day-1 days.
        
        const startOfWeek = new Date(shiftDate);
        startOfWeek.setDate(shiftDate.getDate() - daysToSubtract); 
        startOfWeek.setHours(0, 0, 0, 0);
        const weekKey = `${shift.employeeUid}-${startOfWeek.getTime()}`; 

        if (!weeklyHours[weekKey]) {
            // totalHours tracks cumulative NET hours (post-break, pre-OT split)
            weeklyHours[weekKey] = { totalHours: 0, regularCapacity: 40 }; 
        }
        
        // This is the amount of hours *not* yet counted as weekly OT
        const currentWeeklyTotal = weeklyHours[weekKey].totalHours; 
        const remainingRegularCapacity = weeklyHours[weekKey].regularCapacity - currentWeeklyTotal;
        
        if (remainingRegularCapacity > 0) {
            const hoursForRegular = Math.min(hoursForWeeklySplit, remainingRegularCapacity);
            regularHours = hoursForRegular;
            weeklyOvertime = hoursForWeeklySplit - hoursForRegular;
        } else {
            // All hours are weekly OT
            weeklyOvertime = hoursForWeeklySplit;
        }

        // Update the running weekly total
        weeklyHours[weekKey].totalHours += hoursForWeeklySplit;


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
            // FIX: Use single newline character
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