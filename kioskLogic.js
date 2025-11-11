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
    const newType = status === 'in' ? 'out' : 'in';
    
    // Start processing state to prevent double-punching
    updateState({ isClocking: true }); 

    // --- OPTIMISTIC UI UPDATE ---
    // 1. Immediately update UI to the new status. This makes the punch feel instant.
    updateState({
        currentUser: {
            ...state.currentUser,
            status: newType
        }
    });
    renderUI(); // Re-render the button and status badge immediately
    const successMessage = `Clock ${newType.toUpperCase()} successful at ${new Date().toLocaleTimeString()}.`;
    setAuthMessage(`Punching ${newType.toUpperCase()}... (Processing)`, false);

    try {
        const timecardsCollection = collection(state.db, state.timecards_logs_path);

        const logEntry = {
            employeeUid: uid,
            employeeName: name, 
            type: newType,
            timestamp: Timestamp.now(),
            photo: null, // Camera removed, always set to null
        };

        // 2. Wait for the database write to complete
        await setDoc(doc(timecardsCollection), logEntry);

        // 3. Complete processing state (status already updated optimistically)
        updateState({
            isClocking: false // End processing state
        });
            
        // Final success message (the UI status is already correct)
        setAuthMessage(successMessage, false);


    } catch (error) {
        // --- REVERT CHANGES ON FAILURE ---
        console.error("Clock action failed:", error);
        
        // Revert status back to the original status
        updateState({
            currentUser: {
                ...state.currentUser,
                status: status // Original status
            },
            isClocking: false 
        });
        renderUI(); // Revert the UI status badge

        setAuthMessage(`Clock action failed. Please try again.`, true);
    }
}