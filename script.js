// Filename: script.js
/*
|--------------------------------------------------------------------------
| 1. FIREBASE IMPORTS & INITIALIZATION
|--------------------------------------------------------------------------
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, Timestamp, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Initialize Firebase instances
let app, db, auth;

/*
|--------------------------------------------------------------------------
| 2. CONFIGURATION & CONSTANTS
|--------------------------------------------------------------------------
*/

// Firebase Configuration (PROVIDED BY USER)
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDkNNCV_5D9TpW3vhY2oTbnpGVCtlZC5n8",
    authDomain: "payroll-52d0b.firebaseapp.com",
    projectId: "payroll-52d0b",
    storageBucket: "payroll-52d0b.firebasestorage.app",
    messagingSenderId: "483678226011",
    appId: "1:483678226011:web:9ddbc595e4ec9e1325617e",
    measurementId: "G-SB0PVF2ZYV"
};

// Use the environment's __app_id for Firestore paths, falling back to the projectId.
const appId = typeof __app_id !== 'undefined' ? __app_id : FIREBASE_CONFIG.projectId;
const firebaseConfig = FIREBASE_CONFIG;

// App Constants
const ADMIN_EMAIL = 'admin@kiosk.com';
// ADMIN access is determined by the 'isAdmin: true' field in the user's Firestore document.
const EMPLOYEE_COLLECTION_NAME = 'employees';
const LOG_COLLECTION_NAME = 'logs';
const AUDIT_COLLECTION_NAME = 'audit_logs'; 

// Firestore Paths (Public Data)
const timecards_employees_path = `artifacts/${appId}/public/data/${EMPLOYEE_COLLECTION_NAME}`;
const timecards_logs_path = `artifacts/${appId}/public/data/${LOG_COLLECTION_NAME}`;
const timecards_audit_logs_path = `artifacts/${appId}/public/data/${AUDIT_COLLECTION_NAME}`; 

// Payroll Constants
const STANDARD_WORK_DAY_HOURS = 8;
const STANDARD_WORK_WEEK_HOURS = 40;
const BREAK_TRIGGER_HOURS = 6; // Mandatory break after 6 hours
const BREAK_DEDUCTION_MINUTES = 30; // 30 minutes unpaid break

// ** FLAG: Set to true to enable photo captures **
const ENABLE_CAMERA = false; 

// Mock Employee Data removed, relying on manual creation.


/*
|--------------------------------------------------------------------------
| 3. GLOBAL STATE & DOM ELEMENTS
|--------------------------------------------------------------------------
*/
const state = {
    view: 'login', // 'login', 'kiosk', 'report_login', 'admin_dashboard'
    isAuthReady: false,
    currentUser: null, // { uid, email, name, status, isAdmin }
    logs: [], // Current user's last 5 logs
    allLogs: [], // All logs for admin view
    auditLogs: [], // Audit logs for admin view
    videoStream: null,
    loading: false,
    message: null,
    isClocking: false,
    employees: [],
    filterStartDate: null,
    filterEndDate: null,
    filterEmployeeUid: 'all', // For filtering admin logs
};

const $messageBox = document.getElementById('message-box');


/*
|--------------------------------------------------------------------------
| 4. UTILITY FUNCTIONS
|--------------------------------------------------------------------------
*/

function setMessage(text, type = 'success') {
    state.message = { text, type };
    renderUI();
    setTimeout(() => {
        state.message = null;
        renderUI();
    }, 5000);
}

function formatTimestamp(timestamp, includeDate = true) {
    if (!timestamp) return 'N/A';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    if (!includeDate) return timePart;
    return date.toLocaleDateString() + ' ' + timePart;
}

function toDatetimeLocal(timestamp) {
    if (!timestamp) return '';
    const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Returns a unique week key (YYYY-WW) based on the ISO week date standard.
 * Used for grouping shifts for weekly overtime calculation.
 */
function getWeekNumber(d) {
    d = new Date(d); // Clone the date to prevent modification
    d.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    d.setDate(d.getDate() + 3 - (d.getDay() || 7));
    // January 4 is always in week 1.
    const week1 = new Date(d.getFullYear(), 0, 4);
    // Adjust to Thursday and get days in between.
    const weekNo = 1 + Math.ceil((((d - week1) / 86400000) - 3 + (week1.getDay() || 7)) / 7);
    return d.getFullYear() + '-' + String(weekNo).padStart(2, '0');
}

function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        setMessage("Your browser does not support downloading files.", 'error');
    }
}

// Function to write audit logs
async function writeAuditLog(action, targetLogId, oldData, newData = null) {
    if (!state.currentUser || !state.currentUser.isAdmin) return; // Only log admin actions

    try {
        const auditRef = collection(db, timecards_audit_logs_path);
        await addDoc(auditRef, {
            timestamp: new Date(),
            adminUid: state.currentUser.uid,
            adminEmail: state.currentUser.email,
            action: action, // 'EDIT' or 'DELETE'
            targetLogId: targetLogId,
            oldData: oldData, // Full log data before change
            newData: newData, // New data after change (only for EDIT)
        });
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}

/*
|--------------------------------------------------------------------------
| 5. CAMERA FUNCTIONS
|--------------------------------------------------------------------------
*/
async function startCamera() {
    const video = document.getElementById('video-feed');
    if (!video) return;

    if (!ENABLE_CAMERA) {
        document.getElementById('camera-status').textContent = 'Camera disabled by admin.';
        return;
    }

    if (state.videoStream) stopCamera();
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 400, height: 300 } });
        state.videoStream = stream;
        video.srcObject = stream;
        video.play();
        document.getElementById('camera-status').textContent = 'Camera ready';
    } catch (err) {
        console.error("Error accessing camera:", err);
        document.getElementById('camera-status').textContent = 'Camera blocked or unavailable.';
    }
}

function stopCamera() {
    if (!ENABLE_CAMERA) return;
    if (state.videoStream) {
        state.videoStream.getTracks().forEach(track => track.stop());
        state.videoStream = null;
    }
}

function capturePhoto() {
    if (!ENABLE_CAMERA) return '';
    const video = document.getElementById('video-feed');
    if (!video || !state.videoStream) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
}


/*
|--------------------------------------------------------------------------
| 6. FIREBASE LISTENERS & INITIAL DATA SETUP
|--------------------------------------------------------------------------
*/

async function initFirebase() {
    try {
        setLogLevel('debug');
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Mock data setup removed. App relies on manual user creation.
        // await setupInitialData(); 

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                await fetchAndSetCurrentUser(user.uid);
                listenToEmployees();
                listenToAllLogs(); 
                listenToAuditLogs(); 
                if (state.currentUser && !state.currentUser.isAdmin) {
                    listenToUserLogs(); 
                }
            } else {
                state.currentUser = null;
                state.view = 'login';
                stopCamera();
            }
            state.isAuthReady = true;
            renderUI(); // Initial render after auth check
        });
    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        setMessage("Failed to initialize database.", 'error');
    }
}

async function fetchAndSetCurrentUser(uid) {
    const employeeDocRef = doc(db, timecards_employees_path, uid);
    const docSnap = await getDoc(employeeDocRef);

    if (docSnap.exists()) {
        state.currentUser = { uid, ...docSnap.data() };
    } else {
        // If doc doesn't exist for ANY user (including admin), sign them out.
        state.currentUser = null;
        signOut(auth); 
        setMessage("User data missing in Firestore. Signed out.", 'error');
    }
}

// setupInitialData function removed


function listenToEmployees() {
    const employeesRef = collection(db, timecards_employees_path);
    onSnapshot(employeesRef, (snapshot) => {
        const employees = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        state.employees = employees;
        renderUI();
    }, (error) => {
        console.error("Error listening to employees:", error);
    });
}

function listenToAllLogs() {
    const logsRef = collection(db, timecards_logs_path);
    const q = query(logsRef); 
    onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        logs.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
        state.allLogs = logs; 
        renderUI();
    }, (error) => {
        console.error("Error listening to all logs:", error);
    });
}

function listenToAuditLogs() {
    const auditRef = collection(db, timecards_audit_logs_path);
    const q = query(auditRef);
    onSnapshot(q, (snapshot) => {
        const auditLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        auditLogs.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
        state.auditLogs = auditLogs;
        renderUI();
    }, (error) => {
        console.error("Error listening to audit logs:", error);
    });
}


function listenToUserLogs() {
    if (!state.currentUser || state.currentUser.isAdmin) return;

    const logsRef = collection(db, timecards_logs_path);
    const q = query(logsRef, where('employeeUid', '==', state.currentUser.uid));

    onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Corrected sort to compare 'b' to 'a' to get newest logs first (descending).
        logs.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
        state.logs = logs.slice(0, 5);
        renderUI();
    }, (error) => {
        console.error("Error listening to user logs:", error);
    });
}


/*
|--------------------------------------------------------------------------
| 7. KIOSK CORE LOGIC (LOGIN & CLOCKING)
|--------------------------------------------------------------------------
*/

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    state.loading = true;
    renderUI();

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        await fetchAndSetCurrentUser(uid);

        if (state.currentUser) {
            if (state.currentUser.isAdmin) {
                navigateTo('admin_dashboard');
                setMessage('Admin access granted.', 'success');
            } else {
                navigateTo('kiosk');
                setMessage(`Welcome, ${state.currentUser.name}!`, 'success');
            }
        } else {
            await signOut(auth);
            setMessage('Account setup incomplete. Contact admin.', 'error');
        }
    } catch (error) {
        console.error("Login failed:", error.code, error.message);
        setMessage('Login failed. Invalid Email or Password.', 'error');
        await signOut(auth);
    }

    state.loading = false;
    renderUI();
}
window.handleLogin = handleLogin;

async function handleClockAction() {
    if (state.isClocking || !state.currentUser) return;
    state.isClocking = true;
    renderUI();

    const type = state.currentUser.status === 'out' ? 'in' : 'out';
    const actionText = type === 'in' ? 'Clocking In' : 'Clocking Out';

    setMessage(`${actionText}... Please wait.`, 'success');

    const photoData = capturePhoto();

    try {
        const logsRef = collection(db, timecards_logs_path);

        await addDoc(logsRef, {
            employeeUid: state.currentUser.uid,
            employeeName: state.currentUser.name,
            type: type,
            timestamp: new Date(),
            photoData: photoData || '', 
        });

        const employeeDocRef = doc(db, timecards_employees_path, state.currentUser.uid);
        await updateDoc(employeeDocRef, { status: type });

        state.currentUser.status = type;
        state.isClocking = false;
        setMessage(`Successfully Clocked ${type.toUpperCase()}.`, 'success');

    } catch (error) {
        console.error("Clock action failed:", error);
        setMessage(`Failed to Clock ${type.toUpperCase()}. Check console.`, 'error');
        state.isClocking = false;
    }
    renderUI();
}
window.handleClockAction = handleClockAction;

async function navigateTo(newView) {
    if (newView === 'login') {
        if (auth.currentUser) await signOut(auth);
        state.currentUser = null;
        stopCamera();
    } else if (newView === 'kiosk') {
        if (!state.currentUser) newView = 'login';
        startCamera();
    } else if (newView === 'report_login' || newView === 'admin_dashboard') {
        stopCamera();
    }
    state.view = newView;
    renderUI();
}
window.navigateTo = navigateTo;

function handleAdminLogin() {
    const email = document.getElementById('admin-email').value;
    const pin = document.getElementById('admin-pin').value;

    // Re-use the main login function
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = pin;
    handleLogin();
}
window.handleAdminLogin = handleAdminLogin;


/*
|--------------------------------------------------------------------------
| 8. ADMIN CRUD FUNCTIONS (Employee Management)
|--------------------------------------------------------------------------
*/

function showSignupModal() {
    const modal = document.getElementById('employee-signup-modal');
    modal.querySelector('#employee-modal-title').textContent = 'Sign Up New Employee';
    modal.querySelector('#employee-name').value = '';
    modal.querySelector('#employee-email').value = '';
    modal.querySelector('#employee-password').value = '';
    modal.classList.remove('hidden');
}
window.showSignupModal = showSignupModal;

function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}
window.closeSignupModal = closeSignupModal;

async function handleEmployeeSignup() {
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

async function handleEmployeeDelete(uidToDelete) {
    // Note: Cannot use confirm in an iframe, but retaining for simulated interaction
    // In a real app, this would be a custom modal.
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
| 9. LOG MANAGEMENT & REPORTING
|--------------------------------------------------------------------------
*/

/**
 * Recalculates and updates the employee's current status (in/out) 
 * based on their most recent log entry after an admin edit or deletion.
 * @param {string} employeeUid The UID of the employee to update.
 */
async function updateEmployeeStatusAfterLogEdit(employeeUid) {
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


function updateAdminLogFilters() {
    const start = document.getElementById('filter-start-date').value;
    const end = document.getElementById('filter-end-date').value;
    const employeeUid = document.getElementById('filter-employee-uid').value; // NEW

    state.filterStartDate = start || null;
    state.filterEndDate = end || null;
    state.filterEmployeeUid = employeeUid; // NEW

    renderUI();
    setMessage('Log table filter applied.', 'success');
}
window.updateAdminLogFilters = updateAdminLogFilters;

function getFilteredLogs() {
    let logs = state.allLogs;

    // Date Filtering (Existing)
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

    // Employee Filtering (NEW)
    if (state.filterEmployeeUid && state.filterEmployeeUid !== 'all') {
        logs = logs.filter(log => log.employeeUid === state.filterEmployeeUid);
    }

    return logs;
}

function generatePayrollReport() {
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

function showLogModal(logId, log = null) {
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

function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}
window.closeLogModal = closeLogModal;

async function handleLogSave() {
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
        await writeAuditLog('EDIT', logId, oldData, newData); // Write audit log FIRST

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

async function handleLogDelete(idToDelete) {
     // Note: Cannot use confirm in an iframe, but retaining for simulated interaction
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

// --- Photo Modal Functions ---
function showPhotoModal(base64Image) {
    const modal = document.getElementById('photo-modal');
    const img = document.getElementById('modal-photo');
    img.src = base64Image;
    modal.classList.remove('hidden');
}
window.showPhotoModal = showPhotoModal;

function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
    document.getElementById('modal-photo').src = '';
}
window.closePhotoModal = closeLogModal;


/*
|--------------------------------------------------------------------------
| 10. UI RENDERING (The largest function, organized internally)
|--------------------------------------------------------------------------
*/
function renderUI() {
    const $appContainer = document.getElementById('app-container');

    const messageClasses = state.message?.type === 'error' 
        ? 'bg-red-500 text-white' 
        : 'bg-green-500 text-white';

    const $messageBox = document.getElementById('message-box');
    if ($messageBox) { // Ensure element exists before writing
        $messageBox.innerHTML = state.message 
            ? `<div class="p-3 text-center rounded-lg shadow-xl ${messageClasses}">${state.message.text}</div>` 
            : '';
    }

    if (state.loading || !state.isAuthReady) {
         $appContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen">
                <i class="fas fa-spinner fa-spin text-6xl text-indigo-600"></i>
                <p class="mt-4 text-xl font-semibold text-gray-700">Loading application data...</p>
            </div>
        `;
        return;
    }

    let contentHTML = '';

    // --- A. Login View ---
    if (state.view === 'login') {
        contentHTML = `
            <div class="max-w-md w-full p-8 space-y-6 bg-white rounded-xl shadow-2xl">
                <h2 class="text-3xl font-extrabold text-gray-900 text-center">Employee Kiosk Login</h2>
                <p class="text-sm text-center text-gray-500">Use your registered email and password.</p>
                <form onsubmit="event.preventDefault(); handleLogin();" class="space-y-4">
                    <div>
                        <label for="login-email" class="block text-sm font-medium text-gray-700">Email</label>
                        <input id="login-email" type="email" required
                            class="mt-1 block w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    </div>
                    <div>
                        <label for="login-password" class="block text-sm font-medium text-gray-700">Password</label>
                        <input id="login-password" type="password" required
                            class="mt-1 block w-full py-3 px-4 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    </div>
                    <button type="submit" class="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150">
                        Clock In / Out
                    </button>
                </form>
                <div class="text-center pt-4">
                    <button onclick="document.getElementById('admin-link-block').classList.toggle('hidden')" class="text-xs text-gray-500 hover:text-indigo-600 transition">
                        <i class="fas fa-user-shield"></i> Admin Access
                    </button>
                    <div id="admin-link-block" class="mt-2 p-3 bg-gray-100 rounded-lg hidden">
                        <p class="font-semibold text-sm mb-2">Admin Login</p>
                        <p class="text-xs text-red-500 mb-2">Admin Email: ${ADMIN_EMAIL} (Use your own password)</p>
                        <form onsubmit="event.preventDefault(); handleAdminLogin();" class="space-y-2">
                            <input id="admin-email" type="email" value="${ADMIN_EMAIL}" required class="w-full py-2 px-3 border rounded-lg text-sm" placeholder="Admin Email">
                            <input id="admin-pin" type="password" required class="w-full py-2 px-3 border rounded-lg text-sm" placeholder="Admin Password">
                            <button type="submit" class="w-full py-2 px-4 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-800 transition">
                                Go to Dashboard
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;
    } 

    // --- B. Kiosk View ---
    else if (state.view === 'kiosk' && state.currentUser) {
        const buttonText = state.currentUser.status === 'out' ? 'Clock In' : 'Clock Out';
        const buttonColor = state.currentUser.status === 'out' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';

        const kioskLogHTML = state.logs.length > 0
            ? state.logs.map(log => `
                <li class="flex justify-between items-center p-3 border-b border-gray-200">
                    <span class="font-semibold text-gray-700">${log.employeeName}</span>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${log.type === 'in' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}">
                        ${log.type.toUpperCase()}
                    </span>
                    <span class="text-sm text-gray-500">${formatTimestamp(log.timestamp, false)}</span>
                    ${log.photoData ? `<button onclick="showPhotoModal('${log.photoData}')" class="text-indigo-600 hover:text-indigo-800 ml-1"><i class="fas fa-camera"></i></button>` : `<span class="text-xs text-red-500 ml-1"><i class="fas fa-exclamation-circle"></i> N/A</span>`}
                </li>
            `).join('')
            : '<p class="text-center text-gray-500 py-4">No recent punches found. Clock in to see your activity!</p>';

        contentHTML = `
            <div class="max-w-4xl w-full p-6 space-y-6 bg-white rounded-xl shadow-2xl">
                <div class="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 class="text-3xl font-bold text-gray-900">Welcome, ${state.currentUser.name}</h2>
                    <button onclick="navigateTo('login')" class="text-sm font-medium text-red-500 hover:text-red-700 transition">
                        <i class="fas fa-sign-out-alt mr-1"></i> Log Out
                    </button>
                </div>
                <p class="text-xs text-gray-500">Signed in as: ${state.currentUser.email}</p>

                <div class="grid md:grid-cols-2 gap-6">
                    <div class="flex flex-col items-center">
                        <h3 class="text-xl font-semibold mb-3 text-gray-700">Live Camera Feed</h3>
                        ${ENABLE_CAMERA ? `
                            <video id="video-feed" autoplay playsinline class="mb-4"></video>
                            <p id="camera-status" class="text-xs text-gray-500 mb-4">Starting camera...</p>
                        ` : `
                            <div class="w-full max-w-sm h-72 bg-gray-200 flex items-center justify-center rounded-xl mb-4 shadow-inner">
                                <i class="fas fa-camera-slash text-4xl text-gray-500"></i>
                            </div>
                            <p id="camera-status" class="text-xs text-red-500 mb-4">Camera feature is currently disabled.</p>
                        `}
                        <div id="kiosk-button" class="w-full">
                            <button onclick="handleClockAction()" 
                                    ${state.isClocking ? 'disabled' : ''}
                                    class="w-full text-2xl font-bold py-6 px-4 rounded-xl shadow-lg transition duration-150 ease-in-out ${buttonColor} text-white disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]">
                                <i class="fas fa-clock mr-3"></i> 
                                ${state.isClocking ? '<i class="fas fa-spinner fa-spin"></i> Processing...' : buttonText}
                            </button>
                        </div>
                        <p class="mt-3 text-sm text-gray-500">Current Status: 
                            <span class="font-bold uppercase ${state.currentUser.status === 'in' ? 'text-green-600' : 'text-red-600'}">
                                ${state.currentUser.status}
                            </span>
                        </p>
                    </div>

                    <div>
                        <h3 class="text-xl font-semibold mb-3 text-gray-700">Recent Activity (Last 5 Punches)</h3>
                        <div class="bg-gray-50 p-4 rounded-xl shadow-inner h-96 overflow-y-auto">
                            <ul id="kiosk-log" class="divide-y divide-gray-200">
                                ${kioskLogHTML}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        `;
        if (ENABLE_CAMERA) {
            startCamera(); 
        }

    } 

    // --- C. Admin Dashboard View ---
    else if (state.view === 'admin_dashboard') {
        const employeeTableRows = state.employees.map(e => `
            <tr class="border-b hover:bg-indigo-50/50">
                <td class="p-3 font-semibold">${e.name}</td>
                <td class="p-3 text-sm font-mono">${e.email}</td>
                <td class="p-3">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${e.status === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${e.status.toUpperCase()}
                    </span>
                </td>
                <td class="p-3">
                    <button onclick="handleEmployeeDelete('${e.uid}')" class="text-red-600 hover:text-red-800"><i class="fas fa-trash-alt"></i></button>
                </td>
            </tr>
        `).join('');

        const filteredLogs = getFilteredLogs();
        const logTableRows = filteredLogs.map(log => `
            <tr class="border-b hover:bg-indigo-50/50">
                <td class="p-3 font-semibold">${log.employeeName}</td>
                <td class="p-3 text-sm">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${log.type === 'in' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}">
                        ${log.type.toUpperCase()}
                    </span>
                </td>
                <td class="p-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="p-3 space-x-2">
                    <button onclick="showLogModal('${log.id}')" class="text-indigo-600 hover:text-indigo-800"><i class="fas fa-edit"></i></button>
                    ${log.photoData && ENABLE_CAMERA ? 
                        `<button onclick="showPhotoModal('${log.photoData}')" class="text-gray-600 hover:text-gray-800"><i class="fas fa-camera"></i></button>` : 
                        `<span title="Missing Photo Data" class="text-red-500"><i class="fas fa-times-circle"></i> N/A</span>`
                    }
                </td>
            </tr>
        `).join('');

        // Audit Log Rendering
        const auditLogHTML = state.auditLogs.slice(0, 10).map(log => {
            // Safety check for optional data access
            const oldType = log.oldData?.type || 'N/A';
            const newType = log.newData?.type || 'N/A';
            const oldTimestamp = log.oldData?.timestamp ? formatTimestamp(log.oldData.timestamp) : 'N/A';

            const details = log.action === 'EDIT' 
                ? `Old Type: ${oldType}, New Type: ${newType}` 
                : `Deleted Type: ${oldType}, Time: ${oldTimestamp}`;

            return `
                <li class="p-3 border-b border-gray-100 ${log.action === 'DELETE' ? 'bg-red-50' : 'bg-yellow-50'} rounded-lg mb-1">
                    <div class="flex justify-between items-center text-xs font-semibold">
                        <span class="px-2 py-1 rounded-full ${log.action === 'DELETE' ? 'bg-red-200 text-red-800' : 'bg-yellow-200 text-yellow-800'}">
                            ${log.action}
                        </span>
                        <span class="text-gray-500">${formatTimestamp(log.timestamp)}</span>
                    </div>
                    <p class="text-sm mt-1 text-gray-700">
                        Admin: ${log.adminEmail} | Target Log ID: ${log.targetLogId.substring(0, 8)}...
                    </p>
                    <p class="text-xs text-gray-500">${details}</p>
                </li>
            `;
        }).join('');


        contentHTML = `
            <div class="max-w-6xl w-full p-8 space-y-8 bg-white rounded-xl shadow-2xl">
                <div class="flex justify-between items-center border-b pb-4">
                    <h2 class="text-3xl font-bold text-gray-900"><i class="fas fa-tools mr-2"></i> Admin Dashboard</h2>
                    <button onclick="navigateTo('login')" class="py-2 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition duration-150">
                        <i class="fas fa-sign-out-alt mr-1"></i> Log Out Admin
                    </button>
                </div>

                <!-- Payroll Report & Filter Section -->
                <div class="p-4 bg-indigo-50 rounded-xl shadow-inner space-y-3">
                    <h3 class="text-xl font-semibold text-indigo-800">Payroll Report Generation & Filtering</h3>

                    <!-- Filter Inputs -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <!-- Employee Filter (NEW) -->
                        <div class="flex flex-col space-y-1">
                            <label for="filter-employee-uid" class="text-sm font-medium text-gray-700">Filter Employee:</label>
                            <select id="filter-employee-uid" class="py-1 px-3 border rounded-lg shadow-sm text-sm focus:ring-indigo-500" value="${state.filterEmployeeUid || 'all'}">
                                <option value="all">All Employees</option>
                                ${state.employees.filter(e => e.email !== ADMIN_EMAIL).map(e => `
                                    <option value="${e.uid}" ${state.filterEmployeeUid === e.uid ? 'selected' : ''}>${e.name}</option>
                                `).join('')}
                            </select>
                        </div>
                        <!-- Start Date Filter -->
                        <div class="flex flex-col space-y-1">
                            <label for="filter-start-date" class="text-sm font-medium text-gray-700">Start Date:</label>
                            <input type="date" id="filter-start-date" value="${state.filterStartDate || ''}" class="py-1 px-3 border rounded-lg shadow-sm text-sm focus:ring-indigo-500">
                        </div>
                        <!-- End Date Filter -->
                        <div class="flex flex-col space-y-1">
                            <label for="filter-end-date" class="text-sm font-medium text-gray-700">End Date:</label>
                            <input type="date" id="filter-end-date" value="${state.filterEndDate || ''}" class="py-1 px-3 border rounded-lg shadow-sm text-sm focus:ring-indigo-500">
                        </div>

                        <button onclick="updateAdminLogFilters()" class="w-full py-2 px-4 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition shadow self-end">
                            <i class="fas fa-filter mr-1"></i> Apply Filter
                        </button>
                    </div>

                    <!-- Payroll Action -->
                    <div class="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-4 items-center pt-3">
                        <div class="flex items-center space-x-2">
                            <input type="checkbox" id="apply-break-deduction" class="form-checkbox text-indigo-600 h-5 w-5 rounded-md border-gray-300 focus:ring-indigo-500">
                            <label for="apply-break-deduction" class="text-sm font-medium text-gray-700 whitespace-nowrap">
                                Apply 30 min break deduction (shifts > 6 hrs)
                            </label>
                        </div>
                        <button onclick="generatePayrollReport()" class="w-full md:w-auto py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition duration-150">
                            <i class="fas fa-file-csv mr-1"></i> Generate Filtered CSV
                        </button>
                    </div>
                    <p class="text-xs text-indigo-600 pt-1">The Payroll CSV and Time Log table below use the applied filters.</p>
                </div>


                <!-- Employee Management Section -->
                <div class="space-y-4">
                    <div class="flex justify-between items-center">
                        <h3 class="text-xl font-semibold text-gray-700"><i class="fas fa-users mr-1"></i> Employee Management (${state.employees.length} Total)</h3>
                        <button onclick="showSignupModal()" class="py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition duration-150">
                            <i class="fas fa-user-plus mr-1"></i> Sign Up Employee
                        </button>
                    </div>
                    <div class="overflow-x-auto shadow-lg rounded-xl border border-gray-200">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th class="p-3">Name</th>
                                    <th class="p-3">Email</th>
                                    <th class="p-3">Current Status</th>
                                    <th class="p-3">Delete</th>
                                </tr>
                            </thead>
                            <tbody id="employee-table-body" class="bg-white divide-y divide-gray-200">
                                ${employeeTableRows}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Time Log Management Section -->
                <div class="space-y-4">
                    <h3 class="text-xl font-semibold text-gray-700"><i class="fas fa-history mr-1"></i> Time Log Management (${filteredLogs.length} Filtered Logs)</h3>
                    <div class="overflow-x-auto shadow-lg rounded-xl border border-gray-200">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr class="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <th class="p-3">Employee</th>
                                    <th class="p-3">Type</th>
                                    <th class="p-3">Timestamp</th>
                                    <th class="p-3">Actions / Photo</th>
                                </tr>
                            </thead>
                            <tbody id="log-table-body" class="bg-white divide-y divide-gray-200">
                                ${logTableRows}
                            </tbody>
                        </table>
                    </div>
                    ${filteredLogs.length === 0 ? `<p class="text-center text-gray-500 py-4">No logs found for the applied filter range.</p>` : ''}
                </div>

                <!-- Audit History Section (NEW) -->
                <div class="space-y-4">
                    <h3 class="text-xl font-semibold text-gray-700"><i class="fas fa-clipboard-list mr-1"></i> Audit History (Last 10 Admin Changes)</h3>
                    <div class="bg-gray-100 p-4 rounded-xl shadow-inner border border-gray-200 h-80 overflow-y-auto">
                        <ul id="audit-log-list" class="space-y-2">
                            ${state.auditLogs.length > 0 ? auditLogHTML : '<p class="text-center text-gray-500 py-4">No recent administrative changes recorded.</p>'}
                        </ul>
                    </div>
                </div>
            </div>
        `;
    } else {
         contentHTML = `
            <div class="flex flex-col items-center justify-center min-h-screen">
                <i class="fas fa-exclamation-triangle text-4xl text-red-600"></i>
                <p class="mt-4 text-xl font-semibold text-gray-700">Application Error: Unknown View or Authentication Failure.</p>
                <button onclick="navigateTo('login')" class="mt-4 py-2 px-4 bg-indigo-600 text-white rounded-lg">Go to Login</button>
            </div>
        `;
    }

    $appContainer.innerHTML = contentHTML;
}

/*
|--------------------------------------------------------------------------
| 11. INITIAL EXECUTION
|--------------------------------------------------------------------------
*/
document.addEventListener('DOMContentLoaded', async () => {
    await initFirebase();
});
