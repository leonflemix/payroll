// Filename: firebase.js
import { state, updateState, setDb, setAuth, setUserId, setAdminError } from './state.js';
import { FIREBASE_CONFIG, BASE_PATH } from './constants.js';
import { navigateTo } from './kioskLogic.js';
import { renderUI, setAuthMessage } from './uiRender.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot, Timestamp, updateDoc, setDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
        const pathRoot = BASE_PATH;
        updateState({
            employee_path: `${pathRoot}/employees`,
            timecards_logs_path: `${pathRoot}/time_logs`,
            audit_logs_path: `${pathRoot}/audit_logs`
        });

        // Start listening for Authentication changes
        onAuthStateChanged(state.auth, (user) => {
            updateState({ isAuthReady: true });
            if (user) {
                // User is signed in
                console.log("Login successful...");
                fetchAndSetCurrentUser(user);
            } else {
                // User is signed out (or initial state)
                updateState({ currentUser: null });
                setUserId(null);
                navigateTo('login_view');
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
            const userData = { ...docSnap.data(), uid: user.uid, email: user.email };
            updateState({ currentUser: userData });
            setUserId(user.uid);

            if (userData.isAdmin) {
                listenToAllData();
            } else {
                listenToUserLogs(user.uid);
            }

            // Navigate based on role and render the UI immediately
            navigateTo(userData.isAdmin ? 'admin_dashboard_view' : 'kiosk_view');

        } else {
            console.error(`CRITICAL ERROR: User profile document missing for Auth UID: ${user.uid}. Logging out.`);
            setAuthMessage("Profile not found. Contact administrator.", true);
            await signOut(state.auth);
        }
    } catch (error) {
        console.error("Fatal error fetching user data, logging out:", error);
        setAuthMessage(`Data Error: ${error.message}. Logging out.`, true);
        await signOut(state.auth);
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
            // We rely on client-side sorting as orderBy requires a composite index
        );

        const querySnapshot = await getDocs(q);
        let logsArray = [];

        querySnapshot.forEach(doc => {
            logsArray.push({ id: doc.id, ...doc.data() });
        });

        // Client-side sort to find the latest log
        logsArray.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

        const latestLog = logsArray.length > 0 ? logsArray[0] : null;

        // Status is the OPPOSITE of the latest log type
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
        const logsCollection = collection(state.db, state.timecards_logs_path);
        const logsQuery = query(
            logsCollection,
            where("employeeUid", "==", uid),
            // Client-side sort is preferred to avoid index requirement
        );

        onSnapshot(logsQuery, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Client-side sort by timestamp descending (newest first)
            logs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

            updateState({ currentUserLogs: logs.slice(0, 5) });
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
    
    // Clear any previous error message
    setAdminError(null);

    try {
        // --- 1. Employees Listener ---
        onSnapshot(collection(state.db, state.employee_path), (snapshot) => {
            const employees = {};
            snapshot.docs.forEach(doc => {
                employees[doc.id] = { id: doc.id, ...doc.data(), email: doc.data().email || 'N/A' };
            });
            updateState({ allEmployees: employees });
            renderUI();
        }, (error) => {
            setAdminError("Employee Load Failed: " + error.message);
            console.error(`[FATAL ADMIN LISTENER ERROR - All Employees]:`, error);
            renderUI();
        });


        // --- 2. All Time Logs Listener ---
        onSnapshot(collection(state.db, state.timecards_logs_path), (snapshot) => {
            updateState({ allLogs: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
            setAdminError(null); // Clear error if this succeeds
            renderUI();
        }, (error) => {
            setAdminError("Time Log Load Failed: " + error.message);
            console.error(`[FATAL ADMIN LISTENER ERROR - All Logs]:`, error);
            renderUI();
        });


        // --- 3. Audit Logs Listener ---
        const auditQuery = query(collection(state.db, state.audit_logs_path));
        onSnapshot(auditQuery, (snapshot) => {
            const auditLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Client-side sort by timestamp descending (newest first)
            auditLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
            updateState({ auditLogs: auditLogs.slice(0, 10) });
            setAdminError(null); // Clear error if this succeeds
            renderUI();
        }, (error) => {
            setAdminError("Audit Log Load Failed: " + error.message);
            console.error(`[FATAL ADMIN LISTENER ERROR - Audit Logs]:`, error);
            renderUI();
        });

    } catch (e) {
        console.error("Error initializing Admin listeners:", e);
        setAdminError("Critical data listener initialization failed.");
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