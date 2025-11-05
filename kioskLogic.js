// Filename: kioskLogic.js
import { state, updateState } from './state.js';
import { ENABLE_CAMERA } from './constants.js'; // Import global camera flag
import { setAuthMessage, closeAllModals, renderUI } from './uiRender.js';
import { takePhoto, stopCamera, startCamera } from './utils.js';
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. AUTHENTICATION AND NAVIGATION
|--------------------------------------------------------------------------
*/

/**
 * Handles the employee and admin login process.
 * Reads email/password from the DOM.
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
        stopCamera();
        await signOut(state.auth);
        closeAllModals();
        navigateTo('login_view');
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
        renderUI();

        // Stop camera if leaving the kiosk view
        if (targetView !== 'kiosk_view') {
            stopCamera();
        }

        // Auto-scroll logic for mobile (defensive)
        const targetElement = document.getElementById(targetView);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

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
 * Exports the main clock in/out action handler.
 */
export async function handleClockAction() {
    if (!state.db || !state.currentUser) {
        setAuthMessage("System error: User or database not ready.", true);
        return;
    }

    const videoElement = document.getElementById('webcam-feed');

    const { status, uid, cameraEnabled } = state.currentUser;
    const type = status === 'in' ? 'out' : 'in';
    let photoData = null;

    // Check if both global flag AND user setting are enabled
    if (cameraEnabled && ENABLE_CAMERA) { 
        setAuthMessage(`Capturing photo for clock ${type}...`, false);
        photoData = takePhoto(videoElement);

        if (!photoData) {
            setAuthMessage("Photo capture failed. Please ensure camera access is enabled.", true);
            return;
        }
    }

    try {
        const timecardsCollection = collection(state.db, state.timecards_logs_path);

        const logEntry = {
            employeeUid: uid,
            type: type,
            timestamp: Timestamp.now(),
            photo: photoData, // Null if camera disabled
        };

        // Use a Firestore auto-generated ID for new logs
        await setDoc(doc(timecardsCollection), logEntry);

        // Update local status for immediate UI feedback
        updateState({
            currentUser: {
                ...state.currentUser,
                status: type
            }
        });

        // Clear message and stop camera
        stopCamera();
        setAuthMessage(`Clock ${type.toUpperCase()} successful at ${new Date().toLocaleTimeString()}.`, false);

    } catch (error) {
        console.error("Clock action failed:", error);
        setAuthMessage(`Clock action failed: ${error.message}`, true);
    }
}