// Filename: kioskLogic.js
import { state, auth, db } from './state.js';
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { updateDoc, doc, collection, addDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { setMessage, capturePhoto, stopCamera, startCamera } from './utils.js';
import { fetchAndSetCurrentUser } from './firebase.js';
import { renderUI } from './uiRender.js';
import { timecards_logs_path, timecards_employees_path } from './constants.js';

export async function navigateTo(newView) {
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
window.navigateTo = navigateTo; // Expose globally for HTML

export async function handleLogin() {
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
window.handleLogin = handleLogin; // Expose globally for HTML

export async function handleClockAction() {
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
