// Filename: firebase.js
import { FIREBASE_CONFIG, timecards_employees_path, timecards_logs_path, timecards_audit_logs_path } from './constants.js';
import { state, setAuth, setDb, setAppState } from './state.js';
import { navigateTo } from './kioskLogic.js';
import { renderUI, renderEmployeeList, renderTimeLogList, renderAuditLogList } from './uiRender.js';

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, onSnapshot, orderBy, where, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. INITIALIZATION & AUTHENTICATION SETUP
|--------------------------------------------------------------------------
*/

export function initFirebase() {
    try {
        const app = initializeApp(FIREBASE_CONFIG);
        const dbInstance = getFirestore(app);
        const authInstance = getAuth(app);

        setDb(dbInstance);
        setAuth(authInstance);

        // Set up the primary authentication listener
        onAuthStateChanged(state.auth, (user) => {
            if (user) {
                // User is signed in
                setAppState('isAuthReady', true);
                fetchAndSetCurrentUser(user.uid);
            } else {
                // User is signed out
                setAppState('isAuthReady', true);
                setAppState('currentUser', null);
                navigateTo('login_view');
                renderUI(); 
            }
        });

    } catch (error) {
        console.error("Firebase initialization failed:", error);
    }
}

/*
|--------------------------------------------------------------------------
| 2. USER DATA FETCHING
|--------------------------------------------------------------------------
*/

/**
 * Utility to wait for a given number of milliseconds.
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetches the user's employee document and sets it as the currentUser state.
 * Initiates data listeners if successful.
 * @param {string} uid - Firebase User UID
 */
export async function fetchAndSetCurrentUser(uid) {
    if (!state.db) return;
    
    try {
        const docRef = doc(state.db, timecards_employees_path, uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            // --- SUCCESS ---
            const userData = { uid: docSnap.id, ...docSnap.data() };
            setAppState('currentUser', userData);
            
            // Clear any previous Admin error
            setAppState('adminError', null); 
            
            // Start listening to the employee's logs
            listenToUserLogs(uid);
            
            let targetView = 'kiosk'; // Default to KIOSK view

            if (userData.isAdmin) {
                listenToAllData();
                targetView = 'admin_dashboard'; // Explicitly set Admin view
            }

            navigateTo(targetView); // Navigate to the correct view
            renderUI();

        } else {
            // --- CRITICAL FAILURE: DOCUMENT MISSING ---
            console.error(`CRITICAL ERROR: User profile document missing for Auth UID: ${uid}. Logging out.`);
            await state.auth.signOut();
        }

    } catch (error) {
        // --- FATAL ERROR: Permissions, Network, or other Firestore issue ---
        console.error("Fatal error fetching user data, logging out:", error);
        await state.auth.signOut();
    }
}

/*
|--------------------------------------------------------------------------
| 3. DATA LISTENERS (REAL-TIME UPDATES)
|--------------------------------------------------------------------------
*/

let unsubscribeUserLogs = () => {};
let unsubscribeAllData = () => {};
let unsubscribeAuditLogs = () => {};

/**
 * Attaches real-time listener for the currently logged-in user's logs (for kiosk view).
 * @param {string} uid 
 */
function listenToUserLogs(uid) {
    // Stop previous listener if it exists
    unsubscribeUserLogs(); 

    if (!state.db) return;

    // Diagnostic logging for the collection path
    console.log(`[DEBUG]: Attempting to listen to user logs at path: ${timecards_logs_path}`);

    // TEMPORARY FIX: We use a simplified query to ensure the app proceeds by removing the complex orderBy
    const logsQuery = query(collection(state.db, timecards_logs_path));
    // NOTE: This will fetch ALL logs and rely on client-side filtering/sorting below.

    unsubscribeUserLogs = onSnapshot(logsQuery, (snapshot) => {
        const userLogs = [];
        snapshot.forEach((doc) => {
            userLogs.push({ id: doc.id, ...doc.data() });
        });
        // We now filter and sort in-memory since the query is simplified
        const filteredLogs = userLogs
            .filter(log => log.employeeUid === uid)
            .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
            
        setAppState('currentUserLogs', filteredLogs.slice(0, 5));
        renderUI(); // Re-render the kiosk view
    }, (error) => {
        console.error(`[FATAL LISTENER ERROR - User Logs for ${uid}]:`, error);
        // Do NOT log out here, as this is just the current user's log failure, not a critical app failure.
    });
}

/**
 * Attaches real-time listener for ALL employees, ALL logs, and ALL audit logs (for admin view).
 */
function listenToAllData() {
    // Stop previous listeners if they exist
    unsubscribeAllData();
    unsubscribeAuditLogs();

    if (!state.db) return;
    const adminUid = state.currentUser ? state.currentUser.uid : 'UNKNOWN';

    // 1. Employee Listener - REMOVED ORDER BY
    console.log(`[DEBUG]: Attempting to listen to ALL employees at path: ${timecards_employees_path}`);
    const employeesQuery = query(collection(state.db, timecards_employees_path));
    const employeesUnsubscribe = onSnapshot(employeesQuery, (snapshot) => {
        setAppState('adminError', null); // Clear error on successful load
        const employeesMap = {};
        snapshot.forEach((doc) => {
            employeesMap[doc.id] = { uid: doc.id, ...doc.data() };
        });
        setAppState('allEmployees', employeesMap);
        renderEmployeeList(); // Renders employee table on change
        renderTimeLogList(); // Renders log filter dropdowns
    }, (error) => {
        console.error(`[CRITICAL ADMIN LISTENER FAILURE - Employees]:`, error);
        // DO NOT LOG OUT. Set error state to display to the admin.
        setAppState('adminError', `Employee Data Load Failed: ${error.message}`);
        renderUI();
    });

    // 2. All Logs Listener - REMOVED ORDER BY
    console.log(`[DEBUG]: Attempting to listen to ALL logs at path: ${timecards_logs_path}`);
    const logsQuery = query(collection(state.db, timecards_logs_path)); 
    const logsUnsubscribe = onSnapshot(logsQuery, (snapshot) => {
        setAppState('adminError', null); // Clear error on successful load
        const logs = [];
        snapshot.forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        setAppState('allLogs', logs);
        renderTimeLogList(); // Re-renders log table on change
    }, (error) => {
        console.error(`[CRITICAL ADMIN LISTENER FAILURE - All Logs]:`, error);
        // DO NOT LOG OUT. Set error state to display to the admin.
        setAppState('adminError', `Time Log Load Failed: ${error.message}`);
        renderUI();
    });

    // 3. Audit Logs Listener - REMOVED ORDER BY
    console.log(`[DEBUG]: Attempting to listen to ALL audit logs at path: ${timecards_audit_logs_path}`);
    const auditQuery = query(collection(state.db, timecards_audit_logs_path));
    const auditUnsubscribe = onSnapshot(auditQuery, (snapshot) => {
        setAppState('adminError', null); // Clear error on successful load
        const logs = [];
        snapshot.forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        setAppState('auditLogs', logs);
        renderAuditLogList(); // Renders audit table on change
    }, (error) => {
        console.error(`[CRITICAL ADMIN LISTENER FAILURE - Audit Logs]:`, error);
        // DO NOT LOG OUT. Set error state to display to the admin.
        setAppState('adminError', `Audit Log Load Failed: ${error.message}`);
        renderUI();
    });

    // Combine unsubscribes for easy cleanup on logout
    unsubscribeAllData = () => {
        employeesUnsubscribe();
        logsUnsubscribe();
    };
    unsubscribeAuditLogs = auditUnsubscribe;
}

/*
|--------------------------------------------------------------------------
| 4. STATUS SYNC UTILITY
|--------------------------------------------------------------------------
*/

/**
 * Recalculates and updates an employee's status after an admin log edit/delete.
 * @param {string} employeeUid 
 */
export async function updateEmployeeStatusAfterLogEdit(employeeUid) {
    if (!state.db) return;

    try {
        // Query for the single most recent log entry for the specified user
        // TEMPORARY FIX: Removed orderBy and where clause to rely on client-side sorting for stability
        // NOTE: This is INEFFICIENT but necessary to bypass the blocking index error during testing.
        const logsQuery = query(
            collection(state.db, timecards_logs_path)
            // Removed orderBy("timestamp", "desc") and where("employeeUid", "==", employeeUid)
        );
        
        const snapshot = await getDocs(logsQuery);
        let newStatus = 'out'; // Default status if no logs are found

        if (!snapshot.empty) {
            // Filter and sort client-side
            const allLogs = snapshot.docs.map(doc => doc.data());
            
            const employeeLogs = allLogs
                .filter(log => log.employeeUid === employeeUid)
                .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

            if (employeeLogs.length > 0) {
                 const latestLog = employeeLogs[0];
                 newStatus = latestLog.type;
            }
        }

        // Update the employee's status in the database
        const employeeDocRef = doc(state.db, timecards_employees_path, employeeUid);
        await updateDoc(employeeDocRef, { status: newStatus });

    } catch (error) {
        console.error("Failed to update employee status after log edit:", error);
    }
}
