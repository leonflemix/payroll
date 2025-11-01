// Filename: state.js
// Centralized application state
export const state = {
    // Firebase objects
    db: null,
    auth: null,

    // Auth status
    isAuthReady: false,
    currentUser: null, // Full user object from employees collection
    
    // UI status
    loading: true,
    view: 'login', // 'login', 'kiosk', 'admin_dashboard'
    message: null, // { text: '...', type: 'success' | 'error' }
    isClocking: false, // Prevents multiple clock actions

    // Data stores
    employees: [], // All employee documents
    allLogs: [], // All time logs for admin use
    logs: [], // Current user's recent logs (max 5)
    auditLogs: [], // Recent audit logs (max 10)

    // Admin Filters
    filterStartDate: null,
    filterEndDate: null,
    filterEmployeeUid: 'all',

    // Camera
    videoStream: null,
};

// Setters for Firebase objects
export function setDb(dbInstance) { state.db = dbInstance; }
export function setAuth(authInstance) { state.auth = authInstance; }
