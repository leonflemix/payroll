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

export const PUBLIC_PATH_ROOT = `artifacts`;

/*
|--------------------------------------------------------------------------
| 3. CAMERA & AUTH DEFAULTS
|--------------------------------------------------------------------------
*/

// Set to true to enable the camera stream and photo verification on clock actions.
export const ENABLE_CAMERA = false; 

// Email used for the Admin account (needed for UI hint/logic checks)
export const ADMIN_EMAIL = 'admin@kiosk.com';
