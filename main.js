// Filename: main.js
import { initFirebase } from './firebase.js';
import { handleLogin, handleLogout, handleClockAction } from './kioskLogic.js';
import { toggleSignupModal, handleEmployeeSignup, deleteEmployee, toggleLogModal, handleLogSave, handleLogDelete, generatePayrollReport, toggleSettingsModal, handleEmployeeSettings, applyFilters } from './adminCrud.js';
import { closeSignupModal, closeLogModal, closeSettingsModal, closeAllModals, switchTab } from './uiRender.js';

/*
|--------------------------------------------------------------------------
| APPLICATION BOOTSTRAP
|--------------------------------------------------------------------------
| This file is the entry point that runs when the HTML loads.
| It attaches necessary functions to the global scope for HTML onclick events.
*/

window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleClockAction = handleClockAction;

// Admin CRUD functions exposed to global scope
window.toggleSignupModal = toggleSignupModal;
window.handleEmployeeSignup = handleEmployeeSignup;
window.deleteEmployee = deleteEmployee;
window.toggleLogModal = toggleLogModal;
window.handleLogSave = handleLogSave;
window.handleLogDelete = handleLogDelete;
window.generatePayrollReport = generatePayrollReport;
window.toggleSettingsModal = toggleSettingsModal;
window.handleEmployeeSettings = handleEmployeeSettings;
window.applyFilters = applyFilters;
window.switchTab = switchTab;

// Modal utility functions
window.closeSignupModal = closeSignupModal;
window.closeLogModal = closeLogModal;
window.closeSettingsModal = closeSettingsModal;
window.closeAllModals = closeAllModals;


window.onload = function() {
    // Initialize Firebase services and set up the main Auth listener
    initFirebase();
};