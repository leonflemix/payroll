// Filename: constants.js

// 1. FIREBASE CONFIGURATION (Must match your Firebase project)
export const firebaseConfig = {
    apiKey: "AIzaSyDkNNCV_5D9TpW3vhY2oTbnpGVCtlZC5n8",
    authDomain: "payroll-52d0b.firebaseapp.com",
    projectId: "payroll-52d0b",
    storageBucket: "payroll-52d0b.firebasestorage.app",
    messagingSenderId: "483678226011",
    appId: "1:483678226011:web:9ddbc595e4ec9e1325617e",
    measurementId: "G-SB0PVF2ZYV"
};

// 2. GLOBAL CONFIGURATION & DEFAULTS
export const ADMIN_EMAIL = 'admin@kiosk.com'; 
export const ENABLE_CAMERA = false; // Master switch for camera functionality

// 3. FIRESTORE COLLECTION PATHS
const APP_ID = firebaseConfig.projectId; 
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

export const timecards_employees_path = `${BASE_PATH}/employees`;
export const timecards_logs_path = `${BASE_PATH}/logs`;
export const timecards_audit_logs_path = `${BASE_PATH}/audit_logs`;

// NOTE: Global defaults are kept here only for new employee creation, 
// but individual employee settings (max hours, break time) should override these.
export const DEFAULT_MAX_REGULAR_HOURS_DAY = 8;
export const DEFAULT_BREAK_MINUTES = 30; // Break is deducted if shift > 6 hours
export const BREAK_TRIGGER_HOURS = 6;
export const STANDARD_WORK_WEEK_HOURS = 40;
