// Filename: kioskLogic.js
import { state } from './state.js';
import { ADMIN_EMAIL } from './constants.js';
import { updateState } from './state.js';
import { setAuthMessage, closeAllModals, renderUI } from './uiRender.js';
import { takePhoto, stopCamera } from './utils.js';
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/*
|--------------------------------------------------------------------------
| 1. AUTHENTICATION AND NAVIGATION
|--------------------------------------------------------------------------
*/

/**
 * Handles the employee and admin login process.
 * @param {string} email - User's email address.
 * @param {string} password - User's password.
 */
export async function handleLogin(email, password) {
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
        navigateTo('login');
        setAuthMessage("You have been signed out.", false);
    } catch (error) {
        console.error("Logout failed:", error);
        setAuthMessage("Logout failed. Please try again.", true);
    }
}

/**
 * Changes the current view in the application.
 * @param {string} targetView - The name of the view to switch to ('login', 'kiosk', 'admin_dashboard').
 */
export function navigateTo(targetView) {
    try {
        state.currentView = targetView;
        renderUI();

        // Stop camera if leaving the kiosk view
        if (targetView !== 'kiosk') {
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
 * @param {HTMLVideoElement} videoElement - The video element for photo capture.
 */
export async function handleClockAction(videoElement) {
    if (!state.db || !state.currentUser) {
        setAuthMessage("System error: User or database not ready.", true);
        return;
    }

    const { status, uid, cameraEnabled } = state.currentUser;
    const type = status === 'in' ? 'out' : 'in';
    let photoData = null;

    if (cameraEnabled && state.ENABLE_CAMERA) {
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
            photo: photoData,
        };

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
