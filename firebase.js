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
 * Initiates data listeners if successful. Includes a retry mechanism for robustness.
 * @param {string} uid - Firebase User UID
 */
export async function fetchAndSetCurrentUser(uid) {
    if (!state.db) return;
    const MAX_RETRIES = 3;
    let success = false;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const docRef = doc(state.db, timecards_employees_path, uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const userData = { uid: docSnap.id, ...docSnap.data() };
                setAppState('currentUser', userData);
                
                // Start listening to the employee's logs
                listenToUserLogs(uid);
                
                let targetView = 'kiosk'; // Default to KIOSK view

                if (userData.isAdmin) {
                    listenToAllData();
                    targetView = 'admin_dashboard'; // Explicitly set Admin view
                }

                navigateTo(targetView); // Navigate to the correct view
                renderUI();
                success = true;
                break; // Exit loop on success

            } else {
                console.warn(`[Attempt ${attempt + 1}] Employee document not found for UID: ${uid}. Retrying...`);
                lastError = `Employee document missing.`;
            }

        } catch (error) {
            console.error(`[Attempt ${attempt + 1}] Error fetching user data:`, error);
            lastError = error.message;
        }

        if (!success && attempt < MAX_RETRIES - 1) {
            // Wait with exponential backoff before next retry
            await delay(500 * (attempt + 1));
        }
    }

    if (!success) {
        // If all retries fail, log out and inform the user
        console.error(`Failed to fetch user profile after ${MAX_RETRIES} attempts. Logging out. Last error: ${lastError}`);
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

    const logsQuery = query(
        collection(state.db, timecards_logs_path),
        where("employeeUid", "==", uid),
        orderBy("timestamp", "desc")
    );

    unsubscribeUserLogs = onSnapshot(logsQuery, (snapshot) => {
        const userLogs = [];
        snapshot.forEach((doc) => {
            userLogs.push({ id: doc.id, ...doc.data() });
        });
        setAppState('currentUserLogs', userLogs.slice(0, 5));
        renderUI(); // Re-render the kiosk view
    }, (error) => {
        console.error("Error listening to user logs:", error);
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

    // 1. Employee Listener
    const employeesQuery = query(collection(state.db, timecards_employees_path));
    const employeesUnsubscribe = onSnapshot(employeesQuery, (snapshot) => {
        const employeesMap = {};
        snapshot.forEach((doc) => {
            employeesMap[doc.id] = { uid: doc.id, ...doc.data() };
        });
        setAppState('allEmployees', employeesMap);
        renderEmployeeList(); // Renders employee table on change
        renderTimeLogList(); // Renders log filter dropdowns
    }, (error) => {
        console.error("Error listening to all employees:", error);
    });

    // 2. All Logs Listener
    const logsQuery = query(collection(state.db, timecards_logs_path), orderBy("timestamp", "desc"));
    const logsUnsubscribe = onSnapshot(logsQuery, (snapshot) => {
        const logs = [];
        snapshot.forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        setAppState('allLogs', logs);
        renderTimeLogList(); // Renders log table on change
    }, (error) => {
        console.error("Error listening to all logs:", error);
    });

    // 3. Audit Logs Listener
    const auditQuery = query(collection(state.db, timecards_audit_logs_path), orderBy("timestamp", "desc"));
    const auditUnsubscribe = onSnapshot(auditQuery, (snapshot) => {
        const logs = [];
        snapshot.forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() });
        });
        setAppState('auditLogs', logs);
        renderAuditLogList(); // Renders audit table on change
    }, (error) => {
        console.error("Error listening to audit logs:", error);
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
        const logsQuery = query(
            collection(state.db, timecards_logs_path),
            where("employeeUid", "==", employeeUid),
            orderBy("timestamp", "desc")
        );
        
        const snapshot = await getDocs(logsQuery);
        let newStatus = 'out'; // Default status if no logs are found

        if (!snapshot.empty) {
            const latestLog = snapshot.docs[0].data();
            newStatus = latestLog.type;
        }

        // Update the employee's status in the database
        const employeeDocRef = doc(state.db, timecards_employees_path, employeeUid);
        await updateDoc(employeeDocRef, { status: newStatus });

    } catch (error) {
        console.error("Failed to update employee status after log edit:", error);
    }
}
