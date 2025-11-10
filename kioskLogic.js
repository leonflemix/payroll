// Filename: kioskLogic.js
import { state, updateState } from './state.js';
import { ADMIN_EMAIL } from './constants.js';
import { setAuthMessage, closeAllModals, renderUI } from './uiRender.js'; // navigateTo removed from import here
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. AUTHENTICATION AND NAVIGATION
|--------------------------------------------------------------------------
*/

/**
 * Handles the employee and admin login process.
 */
export async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!state.auth) {
        setAuthMessage("Error: Application not fully initialized.", true);
        return;
    }

    try {
        setAuthMessage("Logging in...", false);
        await signInWithEmailAndPassword(state.auth, email, password);
        // Auth state listener in firebase.js handles successful login and navigation.

    } catch (error) {
        console.error("Login failed:", error);
        setAuthMessage(`Login failed: ${error.message.replace('Firebase: Error (auth/', '').replace(').', '')}`, true);
    }
}

/**
 * Handles the sign-out process.
 */
export async function handleLogout() {
    if (!state.auth) return;

    try {
        await signOut(state.auth);
        closeAllModals();
        
        // Navigation is handled by onAuthStateChanged in firebase.js
        setAuthMessage("You have been signed out.", false);
    } catch (error) {
        console.error("Logout failed:", error);
        setAuthMessage("Logout failed. Please try again.", true);
    }
}

/**
 * Changes the current view in the application.
 * @param {string} targetView - The name of the view to switch to ('login_view', 'kiosk_view', 'admin_dashboard_view').
 */
export function navigateTo(targetView) {
    try {
        updateState({ currentView: targetView });
        renderUI(); // Call renderUI to switch view

    } catch (error) {
        console.error("CRITICAL NAVIGATION ERROR:", error);
    }
}


/*
|--------------------------------------------------------------------------
| 2. KIOSK PUNCH LOGIC
|--------------------------------------------------------------------------
*/

/**
 * Handles the main clock in/out action handler.
 */
export async function handleClockAction() {
    if (!state.db || !state.currentUser || state.isClocking) {
        setAuthMessage("System error or busy. Please wait.", true);
        return;
    }

    const { status, uid, name } = state.currentUser;
    const type = status === 'in' ? 'out' : 'in';
    
    // Start processing state to prevent double-punching
    updateState({ isClocking: true }); 

    try {
        const timecardsCollection = collection(state.db, state.timecards_logs_path);

        const logEntry = {
            employeeUid: uid,
            employeeName: name, 
            type: type,
            timestamp: Timestamp.now(),
            photo: null, // Camera removed, always set to null
        };

        await setDoc(doc(timecardsCollection), logEntry);

        // Update local status for immediate UI feedback
        updateState({
            currentUser: {
                ...state.currentUser,
                status: type
            },
            isClocking: false // End processing state
        });
            
        const successMessage = `Clock ${type.toUpperCase()} successful at ${new Date().toLocaleTimeString()}.`;
        setAuthMessage(successMessage, false);

    } catch (error) {
        console.error("Clock action failed:", error);
        setAuthMessage(`Clock action failed: ${error.message}`, true);
        updateState({ isClocking: false });
    }
}