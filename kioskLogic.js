// Filename: kioskLogic.js
import { state, setAppState } from './state.js';
import { setStatusMessage, setAuthMessage } from './uiRender.js';
import { ADMIN_EMAIL, ENABLE_CAMERA, timecards_logs_path, timecards_employees_path } from './constants.js';
import { addDoc, collection, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { startCamera, stopCamera, captureImage } from './utils.js';

/*
|--------------------------------------------------------------------------
| 1. NAVIGATION
|--------------------------------------------------------------------------
*/

export function navigateTo(viewName) {
    if (viewName === 'kiosk' && state.currentUser.isAdmin) {
        viewName = 'admin_dashboard';
    }

    if (viewName === 'kiosk' && state.currentUser.cameraEnabled) {
        startCamera();
    } else {
        stopCamera();
    }

    setAppState('currentView', viewName);
    setStatusMessage(''); // Clear general messages on navigation
}

/*
|--------------------------------------------------------------------------
| 2. LOGIN / LOGOUT HANDLERS
|--------------------------------------------------------------------------
*/

// Handles user login via email and password
export async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        setAuthMessage('Please enter both email and password.', 'error');
        return;
    }

    try {
        await signInWithEmailAndPassword(state.auth, email, password);
        // AuthStateChanged listener in firebase.js handles navigation and data loading
        setAuthMessage('Login successful...', 'success');
        document.getElementById('login-password').value = ''; // Clear password field

    } catch (error) {
        console.error("Login failed:", error);
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            setAuthMessage('Invalid email or password.', 'error');
        } else if (error.code === 'auth/too-many-requests') {
            setAuthMessage('Too many login attempts. Try again later.', 'error');
        } else {
            setAuthMessage(`Login error: ${error.message}`, 'error');
        }
    }
}

// Handles user logout
export async function handleLogout() {
    try {
        await signOut(state.auth);
        // AuthStateChanged listener in firebase.js handles navigation cleanup
    } catch (error) {
        console.error("Logout failed:", error);
        setAuthMessage('Logout error.', 'error');
    }
}

/*
|--------------------------------------------------------------------------
| 3. CLOCK IN/OUT HANDLER
|--------------------------------------------------------------------------
*/

export async function handleClockAction() {
    if (!state.currentUser || !state.currentUser.uid) {
        setStatusMessage('Authentication error. Please log out and log back in.', 'error');
        return;
    }

    const currentStatus = state.currentUser.status;
    const nextStatus = currentStatus === 'in' ? 'out' : 'in';
    let photoData = null;

    if (state.currentUser.cameraEnabled && ENABLE_CAMERA) {
        try {
            photoData = captureImage();
        } catch (error) {
            console.error("Camera capture failed:", error);
            setStatusMessage('Failed to capture photo. Clock action cancelled.', 'error');
            return;
        }
    }

    try {
        // 1. Write the new log entry
        const logData = {
            employeeUid: state.currentUser.uid,
            timestamp: new Date(),
            type: nextStatus,
            photo: photoData, // base64 string or null
            name: state.currentUser.name
        };
        await addDoc(collection(state.db, timecards_logs_path), logData);

        // 2. Update the employee's status in their profile
        const employeeDocRef = doc(state.db, timecards_employees_path, state.currentUser.uid);
        await updateDoc(employeeDocRef, {
            status: nextStatus
        });

        // 3. Provide feedback
        const action = nextStatus === 'out' ? 'Clocked OUT' : 'Clocked IN';
        setStatusMessage(`${action} successfully at ${new Date().toLocaleTimeString()}.`, 'success');

    } catch (error) {
        console.error("Clock action failed:", error);
        setStatusMessage('Clock action failed: Please check your connection and permissions.', 'error');
    }
}

// Attach handlers to the window for DOM access
window.navigateTo = navigateTo;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleClockAction = handleClockAction;
