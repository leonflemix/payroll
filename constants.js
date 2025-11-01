// Filename: constants.js

// Firebase Configuration (PROVIDED BY USER)
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDkNNCV_5D9TpW3vhY2oTbnpGVCtlZC5n8",
    authDomain: "payroll-52d0b.firebaseapp.com",
    projectId: "payroll-52d0b",
    storageBucket: "payroll-52d0b.firebasestorage.app",
    messagingSenderId: "483678226011",
    appId: "1:483678226011:web:9ddbc595e4ec9e1325617e",
    measurementId: "G-SB0PVF2ZYV"
};

// Use the environment's __app_id for Firestore paths, falling back to the projectId.
export const appId = typeof __app_id !== 'undefined' ? __app_id : FIREBASE_CONFIG.projectId;
export const firebaseConfig = FIREBASE_CONFIG;

// App Constants
export const ADMIN_EMAIL = 'admin@kiosk.com';
export const EMPLOYEE_COLLECTION_NAME = 'employees';
export const LOG_COLLECTION_NAME = 'logs';
export const AUDIT_COLLECTION_NAME = 'audit_logs'; 

// Firestore Paths (Public Data)
export const timecards_employees_path = `artifacts/${appId}/public/data/${EMPLOYEE_COLLECTION_NAME}`;
export const timecards_logs_path = `artifacts/${appId}/public/data/${LOG_COLLECTION_NAME}`;
export const timecards_audit_logs_path = `artifacts/${appId}/public/data/${AUDIT_COLLECTION_NAME}`; 

// Payroll Constants
export const STANDARD_WORK_DAY_HOURS = 8;
export const STANDARD_WORK_WEEK_HOURS = 40;
export const BREAK_TRIGGER_HOURS = 6; // Mandatory break after 6 hours
export const BREAK_DEDUCTION_MINUTES = 30; // 30 minutes unpaid break

// ** FLAG: Set to true to enable photo captures **
export const ENABLE_CAMERA = false; 

// The name of the main component used for rendering
export const APP_CONTAINER_ID = 'app-container';
export const MESSAGE_BOX_ID = 'message-box';
