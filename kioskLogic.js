// Filename: kioskLogic.js
import { state, setAppState } from './state.js';
import { renderUI } from './uiRender.js';
import { updateEmployeeStatusAfterLogEdit } from './firebase.js';

/*
|--------------------------------------------------------------------------
| 1. NAVIGATION CONTROL
|--------------------------------------------------------------------------
*/

/**
 * Switches the displayed view and updates the state.
 * @param {string} viewName - The ID of the view to show (e.g., 'login_view', 'kiosk', 'admin_dashboard').
 */
export function navigateTo(viewName) {
    try {
        setAppState('currentView', viewName);
        
        // Hide all major view containers first
        const views = ['login_view', 'kiosk_view', 'admin_dashboard'];
        views.forEach(viewId => {
            const viewElement = document.getElementById(viewId);
            if (viewElement) {
                viewElement.classList.add('hidden');
            }
        });

        // Show the target view
        const targetElement = document.getElementById(viewName);
        if (targetElement) {
            targetElement.classList.remove('hidden');
        } else {
            // CRITICAL CHECK: If the target element is missing, log a warning
            console.error(`CRITICAL NAVIGATION ERROR: Target view element '${viewName}' not found in the DOM.`);
            // Fallback to login view if target is missing
            setAppState('currentView', 'login_view');
            document.getElementById('login_view').classList.remove('hidden');
        }
    } catch (error) {
        // Catch any uncaught errors during the synchronous navigation process
        console.error("Fatal error during synchronous navigation:", error);
    }
}

// ... (Rest of the kioskLogic.js file remains unchanged)
