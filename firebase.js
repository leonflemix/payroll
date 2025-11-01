// Filename: firebase.js
import { state, setDb, setAuth, setCurrentUser, setUserLogs, setEmployees, setAllLogs, setAuditLogs, setLoading, setMessage } from './state.js';
import { FIREBASE_CONFIG, timecards_employees_path, timecards_logs_path, timecards_audit_logs_path } from './constants.js';
import { navigateTo } from './kioskLogic.js';
import { renderUI } from './uiRender.js';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot, limit, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. FIREBASE INITIALIZATION
|--------------------------------------------------------------------------
*/

export function initFirebase() {
    try {
        const app = initializeApp(FIREBASE_CONFIG);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);

        setAuth(authInstance);
        setDb(dbInstance);

        // This listener tracks login/logout state changes
        onAuthStateChanged(state.auth, async (user) => {
            if (user) {
                // User is signed in, fetch their details and start listeners
                await fetchAndSetCurrentUser(user.uid);
                listenToAllEmployees();
                listenToUserLogs(user.uid);
                listenToAllLogs(); // Needed for Admin Dashboard Log Table
                listenToAuditLogs(); // Needed for Admin Dashboard Audit Table
                
                // Navigate based on admin status
                if (state.currentUser.isAdmin) {
                    navigateTo('admin_dashboard');
                } else {
                    navigateTo('kiosk');
                }

            } else {
                // User is signed out
                setCurrentUser({});
                setUserLogs([]);
                setEmployees([]);
                setAllLogs([]);
                setAuditLogs([]);
                navigateTo('login');
            }
            renderUI();
        });

    } catch (error) {
        console.error("Firebase Initialization Failed:", error);
        setMessage(`Critical error: ${error.message}`, 'error');
    }
}
window.initFirebase = initFirebase; // Expose globally for main.js

/*
|--------------------------------------------------------------------------
| 2. USER/DATA FETCHING
|--------------------------------------------------------------------------
*/

async function fetchAndSetCurrentUser(uid) {
    if (!state.db) return;

    try {
        const docRef = doc(state.db, timecards_employees_path, uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            setCurrentUser({ id: docSnap.id, ...docSnap.data() });
            setMessage(`Welcome back, ${state.currentUser.name}!`, 'success');
        } else {
            // User exists in Auth but not in Employees collection (Should only happen if manually deleted)
            setMessage('User profile data missing. Access Denied.', 'error');
            await state.auth.signOut();
        }

    } catch (error) {
        console.error("Error fetching current user data:", error);
        setMessage('Error fetching profile data.', 'error');
    }
}

/*
|--------------------------------------------------------------------------
| 3. REAL-TIME LISTENERS
|--------------------------------------------------------------------------
*/

// Listener for all employee records (used by Kiosk and Admin)
function listenToAllEmployees() {
    if (!state.db) return;
    const employeesRef = collection(state.db, timecards_employees_path);

    onSnapshot(employeesRef, (snapshot) => {
        const employeesList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setEmployees(employeesList);
        // Important: Update the current user object with the latest state if it exists
        if (state.currentUser.uid) {
             const latestUser = employeesList.find(e => e.uid === state.currentUser.uid);
             if (latestUser) setCurrentUser(latestUser);
        }
        renderUI();
    }, (error) => {
        console.error("Employee listener failed:", error);
        setMessage("Real-time employee data failed to load.", 'error');
    });
}

// Listener for the current user's last 5 logs (for Kiosk dashboard)
function listenToUserLogs(uid) {
    if (!state.db || !uid) return;
    const logsRef = collection(state.db, timecards_logs_path);
    
    // Query: Filter by UID, order by timestamp descending, limit to 5
    const q = query(logsRef, where('employeeUid', '==', uid), orderBy('timestamp', 'desc'), limit(5));

    onSnapshot(q, (snapshot) => {
        const logsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setUserLogs(logsList);
        renderUI();
    }, (error) => {
        console.error("User logs listener failed:", error);
    });
}

// Listener for all time logs (for Admin dashboard)
function listenToAllLogs() {
    if (!state.db) return;
    const logsRef = collection(state.db, timecards_logs_path);
    
    // Order by timestamp ascending (needed for payroll calculation)
    const q = query(logsRef, orderBy('timestamp', 'asc')); 

    onSnapshot(q, (snapshot) => {
        const logsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setAllLogs(logsList);
        renderUI();
    }, (error) => {
        console.error("All logs listener failed:", error);
    });
}

// Listener for audit logs (for Admin dashboard)
function listenToAuditLogs() {
    if (!state.db) return;
    const logsRef = collection(state.db, timecards_audit_logs_path);
    
    // Order by timestamp descending, limit to 10 for quick display
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(10)); 

    onSnapshot(q, (snapshot) => {
        const auditList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        setAuditLogs(auditList);
        renderUI();
    }, (error) => {
        console.error("Audit logs listener failed:", error);
    });
}


/*
|--------------------------------------------------------------------------
| 4. EMPLOYEE STATUS SYNC (Used by Admin CRUD)
|--------------------------------------------------------------------------
*/

// Recalculates and updates an employee's status based on their latest log entry.
export async function updateEmployeeStatusAfterLogEdit(employeeUid) {
    if (!state.db) return;
    try {
        const logsRef = collection(state.db, timecards_logs_path);
        // Query for the *single* latest log entry for the specified user
        const q = query(
            logsRef,
            where('employeeUid', '==', employeeUid),
            orderBy('timestamp', 'desc'),
            limit(1)
        );
        const snapshot = await getDocs(q);

        let newStatus = 'out'; // Default to 'out'
        if (!snapshot.empty) {
            const latestLog = snapshot.docs[0].data();
            newStatus = latestLog.type; // Should be 'in' or 'out'
        }

        // Update the employee's status field
        const employeeDocRef = doc(state.db, timecards_employees_path, employeeUid);
        await updateDoc(employeeDocRef, {
            status: newStatus
        });

    } catch (error) {
        console.error("Failed to update employee status after edit:", error);
        setMessage("Warning: Could not sync employee status.", 'warning');
    }
}
