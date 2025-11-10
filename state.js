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
    
    // Admin Filter State
    filterEmployeeUid: null,
    filterStartDate: null,
    filterEndDate: null,

    // Processing State
    isClocking: false,
    adminError: null,
    
    // Camera State (Removed for Stability)
    // mediaStream: null,
};

/*
|--------------------------------------------------------------------------
| 2. STATE SETTERS
|--------------------------------------------------------------------------
| Functions to safely update the state object.
*/

export function setAppState(key, value) {
    state[key] = value;
}

export function setDb(dbInstance) {
    state.db = dbInstance;
}

export function setAuth(authInstance) {
    state.auth = authInstance;
}

export function updateState(newState) {
    Object.assign(state, newState);
}

export function setUserId(uid) {
    if (state.currentUser) {
        state.currentUser.uid = uid;
    }
}

export function setAdminError(message) {
    state.adminError = message;
}