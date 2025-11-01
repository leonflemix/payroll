// Filename: uiRender.js
import { state } from './state.js';
import { updateEmployee, deleteEmployee, handleLogSave, handleLogDelete, generatePayrollReport, toggleSignupModal, toggleLogModal, toggleSettingsModal } from './adminCrud.js';
import { handleClockAction, handleLogin } from './kioskLogic.js';
import { formatTimestamp, calculateShiftTime, formatTime, formatTotalHours, pcmToWav, base64ToArrayBuffer } from './utils.js';

// ... (Imports remain unchanged)

/**
 * Main function to render the UI based on the current state.
 */
export function renderUI() {
    try { // <-- START OF NEW TRY/CATCH BLOCK
        const appContainer = document.getElementById('app-container');
        if (!appContainer) return;

        // Apply dark mode based on state.
        if (state.isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        // Display Auth status message
        const authStatus = document.getElementById('auth-status');
        if (state.isAuthReady && state.currentUser) {
            authStatus.innerHTML = `Signed in as: ${state.currentUser.email} (${state.currentUser.name})`;
            authStatus.classList.remove('text-red-500');
            authStatus.classList.add('text-green-500');
        } else if (state.isAuthReady) {
            authStatus.innerHTML = `Please login.`;
            authStatus.classList.add('text-red-500');
            authStatus.classList.remove('text-green-500');
        } else {
            authStatus.innerHTML = `Connecting to Firebase...`;
            authStatus.classList.remove('text-red-500', 'text-green-500');
        }
        
        // Render login/logout button
        document.getElementById('logout-button').classList.toggle('hidden', !state.currentUser);
        document.getElementById('login-form-container').classList.toggle('hidden', !!state.currentUser);


        // --- Render Kiosk View ---
        if (state.currentView === 'kiosk' && state.currentUser) {
            renderKiosk();
        }

        // --- Render Admin Dashboard ---
        if (state.currentView === 'admin_dashboard') {
            // The Admin Dashboard rendering functions will run here
            renderEmployeeList();
            renderTimeLogList();
            renderAuditLogList();

            // Display Admin Dashboard Error
            const adminErrorEl = document.getElementById('admin-error-message');
            if (state.adminError) {
                adminErrorEl.textContent = `CRITICAL ERROR: ${state.adminError}`;
                adminErrorEl.classList.remove('hidden');
            } else {
                adminErrorEl.classList.add('hidden');
            }
        }
        
        // Always render the main navigation/header elements regardless of view
        const headerUserName = document.getElementById('header-user-name');
        if (headerUserName) {
            headerUserName.textContent = state.currentUser ? state.currentUser.name : '';
        }

    } catch (error) {
        // CRITICAL: If renderUI fails, this logs the exact component/line that caused the crash.
        console.error("FATAL UI RENDERING ERROR. App is unstable:", error);
    } // <-- END OF NEW TRY/CATCH BLOCK
}

// ... (Rest of uiRender.js functions remain unchanged)
