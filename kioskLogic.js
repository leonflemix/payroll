// Filename: kioskLogic.js
import { state, updateState } from './state.js';
import { ADMIN_EMAIL, ENABLE_CAMERA } from './constants.js';
import { setAuthMessage, closeAllModals, renderUI } from './uiRender.js';
import { takePhoto, stopCamera, startCamera, delay } from './utils.js';
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
        
        // Navigation is handled by onAuthStateChanged in firebase.js
        setAuthMessage("You have been signed out.", false);
    } catch (error) {
        console.error("Logout failed:", error);
        setAuthMessage("Logout failed. Please try again.", true);
    }
}

/**
 * Changes the current view in the application.
 * NOTE: This function is simplified because the majority of navigation 
 * happens inside firebase.js after auth checks.
 * @param {string} targetView - The name of the view to switch to ('login', 'kiosk', 'admin_dashboard').
 */
export function navigateTo(targetView) {
    try {
        updateState({ currentView: targetView });
        renderUI();

        // Handle Camera State
        if (targetView === 'kiosk' && state.currentUser?.cameraEnabled && ENABLE_CAMERA) {
            // Camera start is initiated during renderUI if ENABLE_CAMERA is true
        } else {
            stopCamera();
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
 * Handles the main clock in/out action handler.
 */
export async function handleClockAction() {
    if (!state.db || !state.currentUser) {
        setAuthMessage("System error: User or database not ready.", true);
        return;
    }

    // Defensive check to prevent double-punching
    if (state.isClocking) return; 
    updateState({ isClocking: true });

    const videoElement = document.getElementById('webcam-feed');
    const { status, uid, cameraEnabled } = state.currentUser;
    const type = status === 'in' ? 'out' : 'in';
    let photoData = null;

    if (cameraEnabled && ENABLE_CAMERA) {
        setAuthMessage(`Capturing photo for clock ${type}...`, false);
        
        // --- Defensive Camera Stream Check ---
        if (!state.mediaStream && videoElement) {
            startCamera(videoElement);
            await delay(500); // Wait 0.5s for stream to stabilize
        }
        
        if (state.mediaStream) {
            photoData = takePhoto(videoElement);
        }

        if (!photoData) {
            // Revert status and inform user if photo fails
            updateState({ isClocking: false });
            setAuthMessage("Photo capture failed. Please ensure camera access is enabled.", true);
            console.error("CRITICAL CAMERA FAILURE: mediaStream is NULL despite browser permission being granted.");
            return;
        }
    }

    try {
        const timecardsCollection = collection(state.db, state.timecards_logs_path);

        const logEntry = {
            employeeUid: uid,
            employeeName: state.currentUser.name,
            type: type,
            timestamp: Timestamp.now(),
            photo: photoData, // Note: storing as 'photo' for consistency
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
    
    updateState({ isClocking: false });
}