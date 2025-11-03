// Filename: main.js
import { initFirebase } from './firebase.js';
import { handleLogin, handleLogout, handleClockAction } from './kioskLogic.js';
import { toggleSignupModal, handleEmployeeSignup, handleEmployeeSettings, deleteEmployee, toggleSettingsModal, toggleLogModal, handleLogSave, handleLogDelete, generatePayrollReport } from './adminCrud.js';
import { closeSignupModal, closeLogModal, showPhotoModal, closePhotoModal, closeSettingsModal, applyFilters, closeAllModals } from './uiRender.js';

/*
|--------------------------------------------------------------------------
| APPLICATION BOOTSTRAP
|--------------------------------------------------------------------------
| This file is the entry point that runs when the HTML loads.
*/

window.onload = function() {
    // 1. Initialize Firebase services and set up the main Auth listener
    initFirebase();
    
    // 2. Expose all necessary functions to the global window object.
    // This allows them to be called directly from HTML onclick attributes.
    window.handleLogin = handleLogin;
    window.handleLogout = handleLogout;
    window.handleClockAction = handleClockAction;

    // Admin CRUD Functions
    window.toggleSignupModal = toggleSignupModal;
    window.handleEmployeeSignup = handleEmployeeSignup;
    window.handleEmployeeSettings = handleEmployeeSettings;
    window.deleteEmployee = deleteEmployee;
    window.toggleSettingsModal = toggleSettingsModal;
    window.toggleLogModal = toggleLogModal;
    window.handleLogSave = handleLogSave;
    window.handleLogDelete = handleLogDelete;
    window.generatePayrollReport = generatePayrollReport;

    // UI/Modal Functions
    window.closeSignupModal = closeSignupModal;
    window.closeLogModal = closeLogModal;
    window.showPhotoModal = showPhotoModal;
    window.closePhotoModal = closePhotoModal;
    window.closeSettingsModal = closeSettingsModal;
    window.applyFilters = applyFilters;
    window.closeAllModals = closeAllModals;
};
