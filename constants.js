// Filename: constants.js

/*
|--------------------------------------------------------------------------
| 1. FIREBASE CONFIGURATION (Using Canvas Globals)
|--------------------------------------------------------------------------
*/

// Check for and use Canvas global variables
export const FIREBASE_CONFIG = typeof __firebase_config !== 'undefined' 
    ? JSON.parse(__firebase_config) 
    : { /* Fallback for local testing, though generally unused in Canvas */ };

// Retrieve the App ID from the global variable or use a fallback
export const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/*
|--------------------------------------------------------------------------
| 2. FIREBASE PATHS
|--------------------------------------------------------------------------
| Paths are constructed based on the required structure for shared/public data:
| /artifacts/{appId}/public/data/{collectionName}
*/

// BASE_PATH is derived from the global APP_ID
export const BASE_PATH = `artifacts/${APP_ID}/public/data`;

// The paths are defined here but are set into the state in firebase.js using the resolved BASE_PATH
export const timecards_employees_path = `${BASE_PATH}/employees`;
export const timecards_logs_path = `${BASE_PATH}/time_logs`;
export const timecards_audit_logs_path = `${BASE_PATH}/audit_logs`;

/*
|--------------------------------------------------------------------------
| 3. AUTH DEFAULTS
|--------------------------------------------------------------------------
*/

// Email used for the Admin account (needed for UI hint/logic checks)
export const ADMIN_EMAIL = 'admin@kiosk.com';