// Filename: uiRender.js
import { state } from './state.js';
import { ADMIN_EMAIL, ENABLE_CAMERA } from './constants.js';
import { formatTime, formatDate } from './utils.js';
import { handleSignup, showSettingsModal, handleDeleteEmployee, showLogModal, handleDeleteLog } from './adminCrud.js';

/*
|--------------------------------------------------------------------------
| 1. MESSAGE HANDLERS
|--------------------------------------------------------------------------
*/

/**
 * Sets a temporary message in the authentication message box.
 * @param {string} message - The message text.
 * @param {string} type - 'success', 'error', 'warning', or 'info'.
 * @param {string} elementId - The ID of the message container (e.g., 'auth-message', 'signup-message', 'settings-message', 'log-message').
 */
export function setAuthMessage(message, type, elementId = 'auth-message') {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.className = 'mb-4 p-3 rounded-lg text-sm'; // Reset classes
    element.classList.remove('hidden');

    switch (type) {
        case 'success':
            element.classList.add('bg-green-100', 'text-green-800');
            break;
        case 'error':
            element.classList.add('bg-red-100', 'text-red-800');
            break;
        case 'warning':
            element.classList.add('bg-yellow-100', 'text-yellow-800');
            break;
        default:
            element.classList.add('bg-gray-100', 'text-gray-800');
            break;
    }
    
    // Auto-hide after 5 seconds for non-critical messages
    if (type !== 'error') {
        setTimeout(() => { element.classList.add('hidden'); }, 5000);
    }
}

/**
 * Sets a message on the main Kiosk dashboard.
 */
export function setStatusMessage(message, type = 'info') {
    const element = document.getElementById('kiosk-message');
    if (!element) return;

    element.textContent = message;
    element.className = 'mt-4 text-sm font-medium'; // Reset classes

    switch (type) {
        case 'success':
            element.classList.add('text-green-600');
            break;
        case 'error':
            element.classList.add('text-red-600');
            break;
        default:
            element.classList.add('text-gray-600');
            break;
    }
}

/**
 * Sets a message inside the log editing modal.
 */
export function setLogMessage(message, type, elementId = 'log-message') {
    setAuthMessage(message, type, elementId);
}

/*
|--------------------------------------------------------------------------
| 2. MODAL CONTROL
|--------------------------------------------------------------------------
*/

export function showSignupModal() {
    document.getElementById('employee-signup-modal').classList.remove('hidden');
    document.getElementById('signup-message').classList.add('hidden');
    // Clear fields
    document.getElementById('signup-name').value = '';
    document.getElementById('signup-email').value = '';
    document.getElementById('signup-password').value = '';
    document.getElementById('signup-is-admin').checked = false;
}

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}

export function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}

export function closeSettingsModal() {
    document.getElementById('employee-settings-modal').classList.add('hidden');
}

export function showPhotoModal(base64Image) {
    if (!base64Image) {
        alert("No verification photo available for this entry.");
        return;
    }
    document.getElementById('photo-viewer-img').src = base64Image;
    document.getElementById('photo-modal').classList.remove('hidden');
}

export function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
}

export function closeAllModals() {
    closeSignupModal();
    closeLogModal();
    closeSettingsModal();
    closePhotoModal();
}

/*
|--------------------------------------------------------------------------
| 3. MAIN UI RENDERER
|--------------------------------------------------------------------------
*/

export function renderUI() {
    // Hide all main views
    ['login_view', 'kiosk_view', 'admin_dashboard_view'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });

    const currentView = state.currentView;

    // Show the active view
    const activeView = document.getElementById(currentView);
    if (activeView) {
        activeView.style.display = 'block';
    } else {
        // Fallback to login if state is bad
        document.getElementById('login_view').style.display = 'block';
    }

    // Render content based on view
    if (currentView === 'kiosk') {
        renderKioskDashboard();
    } else if (currentView === 'admin_dashboard') {
        renderAdminDashboard();
    } else if (currentView === 'login_view') {
        // Render login message hint
        const loginEmailEl = document.getElementById('login-email');
        if (loginEmailEl) loginEmailEl.placeholder = `Admin: ${ADMIN_EMAIL}`;
    }
}

function renderKioskDashboard() {
    if (!state.currentUser) return;

    const nameEl = document.getElementById('kiosk-employee-name');
    const statusBadge = document.getElementById('kiosk-status-badge');
    const clockBtn = document.getElementById('clock-action-btn');
    const cameraSection = document.getElementById('camera-section');

    nameEl.textContent = state.currentUser.name;
    const currentStatus = state.currentUser.status;
    const nextAction = currentStatus === 'in' ? 'Clock OUT' : 'Clock IN';

    // Status Badge
    statusBadge.textContent = `Status: ${currentStatus.toUpperCase()}`;
    statusBadge.classList.remove('status-in', 'status-out');
    statusBadge.classList.add(currentStatus === 'in' ? 'status-in' : 'status-out');

    // Clock Button
    clockBtn.textContent = nextAction;
    clockBtn.classList.remove('btn-success', 'btn-danger');
    clockBtn.classList.add(currentStatus === 'in' ? 'btn-danger' : 'btn-success');

    // Camera Section
    const shouldShowCamera = state.currentUser.cameraEnabled && ENABLE_CAMERA;
    cameraSection.classList.toggle('hidden', !shouldShowCamera);

    // Recent Activity
    const activityList = document.getElementById('recent-activity-list');
    activityList.innerHTML = '';
    if (state.currentUserLogs && state.currentUserLogs.length > 0) {
        state.currentUserLogs.forEach(log => {
            const time = formatTime(log.timestamp);
            const date = formatDate(log.timestamp);
            const statusClass = log.type === 'in' ? 'text-green-600' : 'text-yellow-600';
            activityList.innerHTML += `
                <div class="flex justify-between p-2 border-b border-gray-100">
                    <span>${date} ${time}</span>
                    <span class="${statusClass} font-semibold">${log.type.toUpperCase()}</span>
                </div>
            `;
        });
    } else {
        activityList.innerHTML = '<p class="text-center text-gray-500">No recent punches found.</p>';
    }
}

function renderAdminDashboard() {
    // Admin dashboard rendering is mostly handled by the listeners in firebase.js
    // which call renderEmployeeList, renderTimeLogList, and renderAuditLogList.
    // Set up tabs
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');

    const activateTab = (target) => {
        tabs.forEach(tab => {
            tab.classList.remove('text-indigo-600', 'border-indigo-500');
            tab.classList.add('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
        });
        contents.forEach(content => content.classList.add('hidden'));

        const activeTab = document.querySelector(`[data-target="${target}"]`);
        activeTab.classList.add('text-indigo-600', 'border-indigo-500');
        activeTab.classList.remove('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
        document.getElementById(target).classList.remove('hidden');
    };

    tabs.forEach(tab => {
        tab.onclick = () => activateTab(tab.dataset.target);
    });
    
    // Initialize to the first tab if no tabs are active
    if (!document.querySelector('.tab-button.text-indigo-600')) {
        activateTab('employee-management');
    }
}

/*
|--------------------------------------------------------------------------
| 4. ADMIN DATA RENDERING
|--------------------------------------------------------------------------
*/

export function renderEmployeeList() {
    const tbody = document.getElementById('employee-list-body');
    const filterSelect = document.getElementById('filter-employee');
    if (!tbody || !filterSelect) return;

    tbody.innerHTML = '';
    filterSelect.innerHTML = '<option value="">-- All Employees --</option>'; // Reset filter dropdown

    const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));

    employees.forEach(emp => {
        // Employee List Table
        const statusClass = emp.status === 'in' ? 'bg-green-500' : 'bg-yellow-500';
        tbody.innerHTML += `
            <tr data-uid="${emp.uid}">
                <td class="py-2">${emp.name}</td>
                <td>${emp.email}</td>
                <td>
                    <span class="px-2 py-1 text-xs font-semibold rounded-full text-white ${statusClass}">
                        ${emp.status.toUpperCase()}
                    </span>
                </td>
                <td>${emp.isAdmin ? 'Yes' : 'No'}</td>
                <td>
                    <button onclick="showSettingsModal('${emp.uid}')" class="text-indigo-600 hover:text-indigo-900 text-sm mr-2"><i class="fas fa-edit"></i> Edit</button>
                    <button onclick="handleDeleteEmployee('${emp.uid}')" class="text-red-600 hover:text-red-900 text-sm"><i class="fas fa-trash-alt"></i> Delete</button>
                </td>
            </tr>
        `;

        // Employee Filter Dropdown
        filterSelect.innerHTML += `<option value="${emp.uid}">${emp.name}</option>`;
    });

    // Re-apply filters if necessary after list is rendered
    applyFilters();
}

// Function triggered by the listeners and filter change events
export function renderTimeLogList() {
    const tbody = document.getElementById('time-log-list-body');
    if (!tbody) return;

    const filterUid = document.getElementById('filter-employee')?.value;
    const startDateStr = document.getElementById('filter-start-date')?.value;
    const endDateStr = document.getElementById('filter-end-date')?.value;
    
    const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
    const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59') : null;

    tbody.innerHTML = '';

    // Filter the logs in memory
    const filteredLogs = state.allLogs.filter(log => {
        const logDate = log.timestamp.toDate();
        let passesFilter = true;

        if (filterUid && log.employeeUid !== filterUid) {
            passesFilter = false;
        }

        if (startDate && logDate < startDate) {
            passesFilter = false;
        }

        if (endDate && logDate > endDate) {
            passesFilter = false;
        }

        return passesFilter;
    });

    filteredLogs.forEach(log => {
        const employeeName = state.allEmployees[log.employeeUid]?.name || 'Unknown Employee';
        const typeClass = log.type === 'in' ? 'text-green-600' : 'text-yellow-600';
        const photoIcon = log.photo ? '<i class="fas fa-check-circle text-green-500"></i>' : '<i class="fas fa-times-circle text-red-500"></i> N/A';

        tbody.innerHTML += `
            <tr>
                <td class="py-2">${formatDate(log.timestamp)} ${formatTime(log.timestamp)}</td>
                <td>${employeeName}</td>
                <td class="${typeClass} font-semibold">${log.type.toUpperCase()}</td>
                <td>${photoIcon}</td>
                <td>
                    <button onclick="showLogModal('${log.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm mr-2"><i class="fas fa-edit"></i> Edit</button>
                    <button onclick="handleDeleteLog('${log.id}')" class="text-red-600 hover:text-red-900 text-sm"><i class="fas fa-trash-alt"></i> Delete</button>
                </td>
            </tr>
        `;
    });
}

export function renderAuditLogList() {
    const tbody = document.getElementById('audit-log-list-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Only display the last 10 audit logs
    const recentLogs = state.auditLogs.slice(0, 10);

    recentLogs.forEach(log => {
        const dateTime = `${formatDate(log.timestamp)} ${formatTime(log.timestamp)}`;
        let actionClass = 'text-gray-700';
        if (log.action.includes('DELETE')) actionClass = 'text-red-600';
        if (log.action.includes('ADD')) actionClass = 'text-green-600';
        if (log.action.includes('EDIT')) actionClass = 'text-indigo-600';

        tbody.innerHTML += `
            <tr>
                <td class="py-2">${dateTime}</td>
                <td>${log.adminName}</td>
                <td class="${actionClass} font-semibold">${log.action.replace(/_/g, ' ')}</td>
                <td>${log.target}</td>
            </tr>
        `;
    });
}

// Helper to trigger a full log table render when filters change
export function applyFilters() {
    renderTimeLogList();
}


// Attach handlers to the window for DOM access
window.showSignupModal = showSignupModal;
window.closeSignupModal = closeSignupModal;
window.closeLogModal = closeLogModal;
window.closeSettingsModal = closeSettingsModal;
window.showPhotoModal = showPhotoModal;
window.closePhotoModal = closePhotoModal;
window.closeAllModals = closeAllModals;
window.handleSignup = handleSignup;
window.showSettingsModal = showSettingsModal;
window.handleDeleteEmployee = handleDeleteEmployee;
window.showLogModal = showLogModal;
window.handleDeleteLog = handleDeleteLog;
window.applyFilters = applyFilters;
