// Filename: state.js

export const state = {
    view: 'login', // 'login', 'kiosk', 'report_login', 'admin_dashboard'
    isAuthReady: false,
    currentUser: null, // { uid, email, name, status, isAdmin }
    logs: [], // Current user's last 5 logs
    allLogs: [], // All logs for admin view
    auditLogs: [], // Audit logs for admin view
    videoStream: null,
    loading: false,
    message: null,
    isClocking: false,
    employees: [],
    filterStartDate: null,
    filterEndDate: null,
    filterEmployeeUid: 'all', // For filtering admin logs
};

export let db = null;
export let auth = null;

export function setDb(newDb) {
    db = newDb;
}

export function setAuth(newAuth) {
    auth = newAuth;
}
