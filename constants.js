// Filename: constants.js

/*
|--------------------------------------------------------------------------
| 1. FIREBASE CONFIGURATION (Project ID: payroll-52d0b)
|--------------------------------------------------------------------------
*/

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDkNNCV_5D9TpW3vhY2oTbnpGVCtlZC5n8",
    authDomain: "payroll-52d0b.firebaseapp.com",
    projectId: "payroll-52d0b",
    storageBucket: "payroll-52d0b.firebasestorage.app",
    messagingSenderId: "483678226011",
    appId: "1:483678226011:web:9ddbc595e4ec9e1325617e",
    measurementId: "G-SB0PVF2ZYV"
};

/*
|--------------------------------------------------------------------------
| 2. FIREBASE PATHS
|--------------------------------------------------------------------------
*/

const appId = FIREBASE_CONFIG.projectId; 
const BASE_PATH_ROOT = `artifacts/${appId}/public/data`; 

export const timecards_employees_path = `${BASE_PATH_ROOT}/employees`;
export const timecards_logs_path = `${BASE_PATH_ROOT}/time_logs`;
export const timecards_audit_logs_path = `${BASE_PATH_ROOT}/audit_logs`;

// Export the path root needed by firebase.js
export const BASE_PATH = BASE_PATH_ROOT;


/*
|--------------------------------------------------------------------------
| 3. CAMERA & AUTH DEFAULTS
|--------------------------------------------------------------------------
*/

// GLOBAL SETTING: Set to true to enable the camera stream and photo verification on clock actions.
// This must be TRUE to enable per-employee camera control.
export const ENABLE_CAMERA = true; 

// Email used for the Admin account (needed for UI hint/logic checks)
export const ADMIN_EMAIL = 'admin@kiosk.com';