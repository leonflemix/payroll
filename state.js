// Filename: state.js

/*
|--------------------------------------------------------------------------
| 1. APPLICATION STATE
|--------------------------------------------------------------------------
| Central mutable object to hold application state, including Firebase instances
| and user data. This is imported by all modules.
*/

export const state = {
    // Firebase Instances (set after initialization)
    db: null,
    auth: null,
    
    // Auth and User Data
    isAuthReady: false,
    currentUser: null, // Full employee document of the logged-in user
    
    // UI State
    currentView: 'login_view',
    
    // Data Caches
    allEmployees: {},
    allLogs: [],
    auditLogs: [],
    
    // Path Caches (set during initialization)
    employee_path: null,
    timecards_logs_path: null,
    audit_logs_path: null,

    // Admin UI State
    adminError: null,
    filterEmployeeUid: null, // UID currently selected in the admin filter
    isDarkMode: false, // Example of UI settings
    
    // Kiosk Data
    mediaStream: null, // Stores the active camera stream
    recentLogs: [], // Last 5 logs for current user
    isClocking: false, // Prevents double-punching
};

/*
|--------------------------------------------------------------------------
| 2. STATE SETTERS
|--------------------------------------------------------------------------
| Functions to safely update the state object.
*/

/**
 * Updates a single key in the state object.
 * @param {string} key - The state property to update.
 * @param {*} value - The new value.
 */
export function setAppState(key, value) {
    state[key] = value;
}

/**
 * Updates multiple properties in the state object.
 * @param {Object} updates - An object containing properties to update.
 */
export function updateState(updates) {
    Object.assign(state, updates);
}

export function setDb(dbInstance) {
    state.db = dbInstance;
}

export function setAuth(authInstance) {
    state.auth = authInstance;
}

export function setUserId(uid) {
    // No direct need for userId state, but helpful for debugging
}

export function setAdminError(error) {
    state.adminError = error;
}