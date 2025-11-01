// Filename: kioskLogic.js
import { state } from './state.js'; // Corrected to only import 'state'
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { updateDoc, doc, collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { setMessage, capturePhoto, stopCamera, startCamera } from './utils.js';
import { fetchAndSetCurrentUser } from './firebase.js';
import { renderUI } from './uiRender.js';
import { timecards_logs_path, timecards_employees_path, ADMIN_EMAIL } from './constants.js'; 

export async function navigateTo(newView) {
    if (newView === 'login') {
        if (state.auth.currentUser) await signOut(state.auth); // FIX: Use state.auth
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
window.navigateTo = navigateTo; // Expose globally for HTML

export async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    state.loading = true;
    renderUI();

    try {
        const userCredential = await signInWithEmailAndPassword(state.auth, email, password); // FIX: Use state.auth
        const uid = userCredential.user.uid;

        await fetchAndSetCurrentUser(uid);

        if (state.currentUser) {
            // Re-call startCamera here based on the user's specific setting
            if (state.currentUser.cameraEnabled) {
                 startCamera();
            } else {
                 stopCamera(); // Ensure it's stopped if the global was on but user's is off
            }

            if (state.currentUser.isAdmin) {
                navigateTo('admin_dashboard');
                setMessage('Admin access granted.', 'success');
            } else {
                navigateTo('kiosk');
                setMessage(`Welcome, ${state.currentUser.name}!`, 'success');
            }
        } else {
            await signOut(state.auth); // FIX: Use state.auth
            setMessage('Account setup incomplete. Contact admin.', 'error');
        }
    } catch (error) {
        console.error("Login failed:", error.code, error.message);
        setMessage('Login failed. Invalid Email or Password.', 'error');
        await signOut(state.auth); // FIX: Use state.auth
    }

    state.loading = false;
    renderUI();
}
window.handleLogin = handleLogin; // Expose globally for HTML

export async function handleClockAction() {
    if (state.isClocking || !state.currentUser) return;
    state.isClocking = true;
    renderUI();

    const type = state.currentUser.status === 'out' ? 'in' : 'out';
    const actionText = type === 'in' ? 'Clocking In' : 'Clocking Out';

    setMessage(`${actionText}... Please wait.`, 'success');

    // Only capture photo if the employee is configured to do so
    const photoData = state.currentUser.cameraEnabled ? capturePhoto() : '';

    try {
        const logsRef = collection(state.db, timecards_logs_path); // FIX: Use state.db

        await addDoc(logsRef, {
            employeeUid: state.currentUser.uid,
            employeeName: state.currentUser.name,
            type: type,
            timestamp: new Date(),
            photoData: photoData, 
        });

        const employeeDocRef = doc(state.db, timecards_employees_path, state.currentUser.uid); // FIX: Use state.db
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
window.handleClockAction = handleClockAction; // Expose globally for HTML

export function handleAdminLogin() {
    const email = document.getElementById('admin-email').value;
    const pin = document.getElementById('admin-pin').value;

    // Re-use the main login function
    document.getElementById('login-email').value = email;
    document.getElementById('login-password').value = pin;
    handleLogin();
}
window.handleAdminLogin = handleAdminLogin; // Expose globally for HTML
