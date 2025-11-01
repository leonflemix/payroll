// Filename: firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, onSnapshot, collection, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { state, setDb, setAuth } from './state.js';
import { firebaseConfig, timecards_employees_path, timecards_logs_path, timecards_audit_logs_path } from './constants.js';
import { renderUI, navigateTo } from './uiRender.js';
import { stopCamera } from './utils.js';
import { setMessage } from './utils.js';

let app;

export async function initFirebase() {
    try {
        setLogLevel('debug');
        app = initializeApp(firebaseConfig);
        setDb(getFirestore(app));
        setAuth(getAuth(app));

        onAuthStateChanged(getAuth(app), async (user) => {
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

export async function fetchAndSetCurrentUser(uid) {
    const employeeDocRef = doc(getFirestore(app), timecards_employees_path, uid);
    const docSnap = await getDoc(employeeDocRef);

    if (docSnap.exists()) {
        state.currentUser = { uid, ...docSnap.data() };
    } else {
        // If doc doesn't exist for ANY user, sign them out.
        state.currentUser = null;
        signOut(getAuth(app)); 
        setMessage("User data missing in Firestore. Signed out.", 'error');
    }
}


function listenToEmployees() {
    const employeesRef = collection(getFirestore(app), timecards_employees_path);
    onSnapshot(employeesRef, (snapshot) => {
        const employees = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
        state.employees = employees;
        renderUI();
    }, (error) => {
        console.error("Error listening to employees:", error);
    });
}

function listenToAllLogs() {
    const logsRef = collection(getFirestore(app), timecards_logs_path);
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
    const auditRef = collection(getFirestore(app), timecards_audit_logs_path);
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

    const logsRef = collection(getFirestore(app), timecards_logs_path);
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
