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
 * @param {string} targetView - The name of the view to switch to ('login', 'kiosk', 'admin_dashboard').
 */
export function navigateTo(targetView) {
    try {
        updateState({ currentView: targetView });
        renderUI();

        // Handle Camera State (Note: startCamera is now handled in uiRender based on view change)
        if (targetView !== 'kiosk_view') { // Use the actual view ID
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
    
    const videoElement = document.getElementById('webcam-feed');
    const { status, uid, cameraEnabled, name } = state.currentUser;
    const type = status === 'in' ? 'out' : 'in';
    let photoData = null;
    let cameraWarning = false;

    updateState({ isClocking: true }); // Start processing state

    if (cameraEnabled && ENABLE_CAMERA) {
        if (state.mediaStream) {
            // Attempt to capture photo if stream is active
            photoData = takePhoto(videoElement);

            if (!photoData) {
                // Photo capture failed, but stream was active. Log and continue.
                cameraWarning = true;
                console.warn("Warning: Photo failed to process. Proceeding without image.");
            }
        } else {
            // Stream was NULL (CRITICAL CAMERA FAILURE). Log and continue without photo.
            cameraWarning = true;
            console.error("CRITICAL CAMERA FAILURE: mediaStream is NULL. Proceeding without photo.");
        }
    }

    try {
        const timecardsCollection = collection(state.db, state.timecards_logs_path);

        const logEntry = {
            employeeUid: uid,
            employeeName: name, // Ensure employee name is logged
            type: type,
            timestamp: Timestamp.now(),
            photo: photoData, // Null if capture failed or stream was inactive
        };

        await setDoc(doc(timecardsCollection), logEntry);

        // Update local status for immediate UI feedback
        updateState({
            currentUser: {
                ...state.currentUser,
                status: type
            },
            isClocking: false
        });

        // Clear message and stop camera
        stopCamera();
        const successMessage = cameraWarning 
            ? `Clock ${type.toUpperCase()} successful. (Camera Warning in Console)`
            : `Clock ${type.toUpperCase()} successful at ${new Date().toLocaleTimeString()}.`;
            
        // Use setAuthMessage to confirm success, only log warning in console
        setAuthMessage(successMessage, cameraWarning);

    } catch (error) {
        console.error("Clock action failed:", error);
        setAuthMessage(`Clock action failed: ${error.message}`, true);
        updateState({ isClocking: false });
    }
}