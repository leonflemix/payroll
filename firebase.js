// Filename: firebase.js
import { state } from './state.js';
import { FIREBASE_CONFIG, PUBLIC_PATH_ROOT } from './constants.js';
import { navigateTo } from './kioskLogic.js';
import { setDb, setAuth, setUserId, updateState, setAdminError } from './state.js';
import { renderUI, setAuthMessage } from './uiRender.js';
import { formatTotalHours } from './utils.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot, Timestamp, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. INITIALIZATION
|--------------------------------------------------------------------------
*/

/**
 * Initializes Firebase App, Auth, and Firestore services.
 */
export async function initFirebase() {
    console.log("Initializing Firebase...");
    try {
        const app = initializeApp(FIREBASE_CONFIG);
        setDb(getFirestore(app));
        setAuth(getAuth(app));

        // Define Firestore Collection Paths based on Project ID
        const appId = FIREBASE_CONFIG.projectId || 'default-app-id';
        const pathRoot = `${PUBLIC_PATH_ROOT}/${appId}/public/data`;
        updateState({
            employee_path: `${pathRoot}/employees`,
            timecards_logs_path: `${pathRoot}/time_logs`,
            audit_logs_path: `${pathRoot}/audit_logs`
        });

        // Start listening for Authentication changes
        onAuthStateChanged(state.auth, (user) => {
            if (user) {
                // User is signed in
                console.log("Login successful...");
                fetchAndSetCurrentUser(user);
            } else {
                // User is signed out (or initial state)
                state.currentUser = null;
                setUserId(null);
                navigateTo('login');
                renderUI();
            }
        });

    } catch (error) {
        console.error("Firebase Initialization Failed:", error);
        setAuthMessage(`Initialization Failed: ${error.message}`, true);
    }
}

/*
|--------------------------------------------------------------------------
| 2. USER/PROFILE MANAGEMENT
|--------------------------------------------------------------------------
*/

/**
 * Fetches the current user's profile from Firestore and updates global state.
 * @param {Object} user - The Firebase Auth User object.
 */
export async function fetchAndSetCurrentUser(user) {
    if (!state.db) return;

    try {
        const docRef = doc(state.db, state.employee_path, user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const userData = { ...docSnap.data(), uid: user.uid };
            state.currentUser = userData;
            setUserId(user.uid);

            if (userData.isAdmin) {
                console.warn("ADMIN LISTENERS SKIPPED: Testing for instant failure.");
                // navigateTo('admin_dashboard'); // Navigated by renderUI
                listenToAllData();
            } else {
                listenToUserLogs(user.uid);
            }

            // Navigate based on role and render the UI immediately
            navigateTo(userData.isAdmin ? 'admin_dashboard' : 'kiosk');
            renderUI();

        } else {
            console.error(`CRITICAL ERROR: User profile document missing for Auth UID: ${user.uid}. Logging out.`);
            setAuthMessage("Profile not found. Contact administrator.", true);
            await state.auth.signOut();
        }
    } catch (error) {
        console.error("Fatal error fetching user data, logging out:", error);
        setAuthMessage(`Data Error: ${error.message}. Logging out.`, true);
        await state.auth.signOut();
    }
}

/**
 * Updates the employee's status after an admin edit/delete to ensure next punch is correct.
 * @param {string} employeeUid - The UID of the employee to check.
 */
export async function updateEmployeeStatusAfterLogEdit(employeeUid) {
    if (!state.db) return;

    try {
        const logsCollection = collection(state.db, state.timecards_logs_path);
        const q = query(
            logsCollection,
            where("employeeUid", "==", employeeUid),
            // Use client-side sort for simplicity and to avoid index issues
        );

        const querySnapshot = await getDocs(q);
        let latestLog = null;
        let logsArray = [];

        querySnapshot.forEach(doc => {
            logsArray.push({ ...doc.data(), id: doc.id });
        });

        // Client-side sort to find the latest log
        logsArray.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

        latestLog = logsArray.length > 0 ? logsArray[0] : null;

        const newStatus = latestLog ? (latestLog.type === 'in' ? 'out' : 'in') : 'out';

        const employeeRef = doc(state.db, state.employee_path, employeeUid);
        await updateDoc(employeeRef, { status: newStatus });

    } catch (error) {
        console.error("Error updating employee status after log edit:", error);
        // Do not fail the entire app, just log the status update failure
    }
}

/*
|--------------------------------------------------------------------------
| 3. REAL-TIME LISTENERS
|--------------------------------------------------------------------------
*/

/**
 * Listener for the current employee's recent activity (Kiosk View).
 * @param {string} uid - The UID of the current user.
 */
export function listenToUserLogs(uid) {
    if (!state.db || !uid) return;

    try {
        // Query to get only the current user's logs
        const logsCollection = collection(state.db, state.timecards_logs_path);
        const logsQuery = query(
            logsCollection,
            where("employeeUid", "==", uid),
            // ORDER BY is commented out to bypass index issue. Sort client-side.
        );

        onSnapshot(logsQuery, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Client-side sort by timestamp descending (newest first)
            logs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

            state.recentLogs = logs.slice(0, 5);
            renderUI();
        }, (error) => {
            console.error(`[FATAL KIOSK LISTENER ERROR - User Logs for ${uid}]:`, error);
        });

    } catch (e) {
        console.error("Error initializing user log listener:", e);
    }
}


/**
 * Initializes all admin-level real-time listeners for dashboard data.
 */
export function listenToAllData() {
    if (!state.db) return;

    try {
        // --- 1. Employees Listener ---
        console.log(`[DEBUG]: Attempting to listen to ALL employees at path: ${state.employee_path}`);
        onSnapshot(collection(state.db, state.employee_path), (snapshot) => {
            const employees = {};
            snapshot.docs.forEach(doc => {
                employees[doc.id] = { id: doc.id, ...doc.data() };
            });
            state.allEmployees = employees;
            renderUI();
        }, (error) => {
            state.adminError = "Employee Load Failed: " + error.message;
            console.error(`[FATAL ADMIN LISTENER ERROR - All Employees]:`, error);
            renderUI();
        });


        // --- 2. All Time Logs Listener ---
        console.log(`[DEBUG]: Attempting to listen to ALL logs at path: ${state.timecards_logs_path}`);
        onSnapshot(collection(state.db, state.timecards_logs_path), (snapshot) => {
            state.allLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            state.adminError = null; // Clear error if this succeeds
            renderUI();
        }, (error) => {
            state.adminError = "Time Log Load Failed: " + error.message;
            console.error(`[FATAL ADMIN LISTENER ERROR - All Logs]:`, error);
            renderUI();
        });


        // --- 3. Audit Logs Listener ---
        const auditQuery = query(collection(state.db, state.audit_logs_path));
        console.log(`[DEBUG]: Attempting to listen to ALL audit logs at path: ${state.audit_logs_path}`);
        onSnapshot(auditQuery, (snapshot) => {
            const auditLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Client-side sort by timestamp descending (newest first)
            auditLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
            state.auditLogs = auditLogs.slice(0, 10);
            state.adminError = null; // Clear error if this succeeds
            renderUI();
        }, (error) => {
            state.adminError = "Audit Log Load Failed: " + error.message;
            console.error(`[FATAL ADMIN LISTENER ERROR - Audit Logs]:`, error);
            renderUI();
        });

    } catch (e) {
        console.error("Error initializing Admin listeners:", e);
        state.adminError = "Critical data listener initialization failed.";
        renderUI();
    }
}

/*
|--------------------------------------------------------------------------
| 4. AUDIT UTILITY
|--------------------------------------------------------------------------
*/

/**
 * Writes an administrative action to the audit log collection.
 * @param {string} action - The action type (e.g., 'EDIT_LOG', 'DELETE_PROFILE').
 * @param {string} details - A human-readable description of the change.
 * @param {string} targetUid - The UID of the employee affected.
 * @param {string} [oldData] - Optional JSON string of old data.
 */
export async function writeAuditLog(action, details, targetUid, oldData = null) {
    if (!state.db) return;

    try {
        const auditCollection = collection(state.db, state.audit_logs_path);

        const logEntry = {
            timestamp: Timestamp.now(),
            adminUid: state.currentUser.uid,
            adminName: state.currentUser.name || 'Admin',
            action: action,
            details: details,
            targetUid: targetUid,
            oldData: oldData,
        };

        await setDoc(doc(auditCollection), logEntry);
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}
