// Filename: uiRender.js
import { state, updateState } from './state.js';
import { startCamera, stopCamera, formatTimestamp, calculateShiftTime, formatTime, formatTotalHours, base64ToArrayBuffer } from './utils.js';
import { handleEmployeeSettings, toggleSettingsModal, handleEmployeeSignup, deleteEmployee, toggleSignupModal, toggleLogModal, handleLogSave, handleLogDelete, generatePayrollReport } from './adminCrud.js';

/*
|--------------------------------------------------------------------------
| 1. CORE UI RENDERING
|--------------------------------------------------------------------------
*/

/**
 * Main function to render the UI based on the current state.
 */
export function renderUI() {
    try {
        const appContainer = document.getElementById('app-container');
        if (!appContainer) return;

        // Display Auth status message (uses the old static div for consistency)
        const authStatus = document.getElementById('auth-message-box');
        if (state.isAuthReady && state.currentUser) {
            authStatus.innerHTML = `<p>Signed in as: ${state.currentUser.email} (${state.currentUser.name})</p>`;
            authStatus.classList.add('bg-green-100', 'text-green-800');
            authStatus.classList.remove('hidden');
        } else if (state.isAuthReady) {
            authStatus.innerHTML = `<p>Please login.</p>`;
            authStatus.classList.add('bg-red-100', 'text-red-800');
            authStatus.classList.remove('hidden');
        } else {
            authStatus.innerHTML = `<p>Connecting to Firebase...</p>`;
            authStatus.classList.remove('bg-green-100', 'bg-red-100', 'text-green-800', 'text-red-800');
            authStatus.classList.remove('hidden');
        }
        
        // --- View Switching ---
        const views = ['login_view', 'kiosk_view', 'admin_dashboard_view'];
        views.forEach(viewId => {
            const el = document.getElementById(viewId);
            if (el) {
                el.style.display = (viewId === state.currentView) ? 'block' : 'none';
            }
        });


        // --- Render Kiosk View ---
        if (state.currentView === 'kiosk_view' && state.currentUser) {
            renderKiosk();
        }

        // --- Render Admin Dashboard ---
        if (state.currentView === 'admin_dashboard_view' && state.currentUser?.isAdmin) {
            // Only attempt to render data tables if listeners have loaded (state.allEmployees is populated)
            if (Object.keys(state.allEmployees).length > 0) {
                renderEmployeeList();
                renderTimeLogList();
                renderAuditLogList();
            }

            // Display Admin Dashboard Error
            const adminErrorEl = document.getElementById('admin-error-message');
            if (state.adminError) {
                adminErrorEl.textContent = `CRITICAL DATA ERROR: ${state.adminError}`;
                adminErrorEl.classList.remove('hidden');
            } else {
                adminErrorEl.classList.add('hidden');
            }
        }
        
    } catch (error) {
        // CRITICAL: If renderUI fails, this logs the exact component/line that caused the crash.
        console.error("FATAL UI RENDERING ERROR. App is unstable:", error);
    }
}

/*
|--------------------------------------------------------------------------
| 2. KIOSK VIEW RENDERING
|--------------------------------------------------------------------------
*/

/**
 * Renders the employee Kiosk interface and recent activity.
 */
export function renderKiosk() {
    if (!state.currentUser) return;

    const kioskStatus = document.getElementById('kiosk-status-badge');
    const clockButton = document.getElementById('clock-action-btn');
    const recentActivity = document.getElementById('recent-activity-list');
    const nameDisplay = document.getElementById('kiosk-employee-name');
    const currentStatus = state.currentUser.status || 'out';
    const cameraSection = document.getElementById('camera-section');
    const webcamFeed = document.getElementById('webcam-feed');


    // Update Name and Camera Section Visibility
    nameDisplay.textContent = state.currentUser.name;
    const isCameraEnabled = state.currentUser.cameraEnabled && state.ENABLE_CAMERA;
    cameraSection.style.display = isCameraEnabled ? 'block' : 'none';

    // Start/Stop Camera
    if (isCameraEnabled && currentStatus === 'out') {
        startCamera(webcamFeed);
    } else {
        stopCamera();
    }


    // Update Status and Button
    if (currentStatus === 'in') {
        kioskStatus.textContent = 'Clocked In';
        kioskStatus.classList.remove('bg-gray-200');
        kioskStatus.classList.add('bg-green-500', 'text-white');
        clockButton.textContent = 'Clock Out';
        clockButton.classList.remove('bg-green-500');
        clockButton.classList.add('bg-red-500', 'hover:bg-red-600');
    } else {
        kioskStatus.textContent = 'Clocked Out';
        kioskStatus.classList.remove('bg-green-500', 'text-white');
        kioskStatus.classList.add('bg-gray-200');
        clockButton.textContent = 'Clock In';
        clockButton.classList.remove('bg-red-500');
        clockButton.classList.add('bg-green-500', 'hover:bg-green-600');
    }

    // Disable button if clocking is in progress
    clockButton.disabled = state.isClocking;
    if (state.isClocking) {
        clockButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    }


    // --- Render Recent Activity ---
    if (recentActivity) {
        recentActivity.innerHTML = state.recentLogs.map(log => `
            <li class="flex justify-between items-center py-2 px-3 border-b last:border-b-0">
                <span class="${log.type === 'in' ? 'text-green-600' : 'text-red-600'} font-semibold">${log.type.toUpperCase()}</span>
                <span class="text-sm text-gray-600">${formatTimestamp(log.timestamp)}</span>
            </li>
        `).join('');
        if (state.recentLogs.length === 0) {
            recentActivity.innerHTML = '<li class="p-3 text-center text-gray-500">No recent activity.</li>';
        }
    }
}

/*
|--------------------------------------------------------------------------
| 3. ADMIN DASHBOARD RENDERING
|--------------------------------------------------------------------------
*/

/**
 * Renders the Employee Management table.
 */
export function renderEmployeeList() {
    const tableBody = document.getElementById('employee-list-body');
    if (!tableBody || !state.allEmployees) return;

    const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));

    tableBody.innerHTML = employees.map(emp => `
        <tr class="border-b hover:bg-gray-50 ${emp.isAdmin ? 'bg-yellow-50/50' : ''}">
            <td class="px-6 py-3 font-medium text-gray-900">${emp.name}</td>
            <td class="px-6 py-3 text-gray-600">${emp.email}</td>
            <td class="px-6 py-3 text-sm text-center">
                <span class="inline-flex items-center">
                    <span class="h-3 w-3 rounded-full mr-2 ${emp.status === 'in' ? 'bg-green-500' : 'bg-red-500'}"></span>
                    ${emp.status.toUpperCase()}
                </span>
            </td>
            <td class="px-6 py-3 text-sm">
                <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.isAdmin ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
                    ${emp.isAdmin ? 'Admin' : 'Employee'}
                </span>
            </td>
            <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <button onclick="toggleSettingsModal('${emp.uid}')" class="text-indigo-600 hover:text-indigo-900">Edit Settings</button>
                <button onclick="toggleSignupModal('${emp.uid}')" class="text-blue-600 hover:text-blue-900">Edit Profile</button>
                <button onclick="deleteEmployee('${emp.uid}')" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
        </tr>
    `).join('');
}


/**
 * Renders the Time Log Management table, filtered by current admin settings.
 */
export function renderTimeLogList() {
    const tableBody = document.getElementById('time-log-list-body');
    const employeeFilter = document.getElementById('filter-employee-select');
    const startDateFilter = document.getElementById('filter-start-date');
    const endDateFilter = document.getElementById('filter-end-date');
    if (!tableBody || !state.allLogs || !state.allEmployees) return;

    // --- Populate Employee Filter Dropdown ---
    if (employeeFilter && employeeFilter.children.length <= 1) { 
        const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));
        employeeFilter.innerHTML = '<option value="">-- All Employees --</option>' + employees.map(emp =>
            `<option value="${emp.uid}">${emp.name}</option>`
        ).join('');
    }

    // --- Apply Filtering based on DOM values (since applyFilters is called) ---
    const employeeUid = employeeFilter.value;
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;


    let filteredLogs = state.allLogs;

    // Filter by Employee UID
    if (employeeUid && employeeUid !== "") {
        filteredLogs = filteredLogs.filter(log => log.employeeUid === employeeUid);
    }

    // Filter by Date Range
    if (startDate) {
        const startTimestamp = startDate.getTime();
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() >= startTimestamp);
    }

    if (endDate) {
        const endTimestamp = endDate.getTime() + 86400000; // End of the day
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() < endTimestamp);
    }
    
    // Sort by timestamp descending (newest first)
    filteredLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

    tableBody.innerHTML = filteredLogs.map(log => {
        const employee = state.allEmployees[log.employeeUid] || { name: 'Unknown' };
        const hasPhoto = !!log.photo;

        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-6 py-3 font-medium text-gray-900">${employee.name}</td>
                <td class="px-6 py-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="px-6 py-3">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${log.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                        ${log.type.toUpperCase()}
                    </span>
                </td>
                <td class="px-6 py-3 text-center">
                    ${hasPhoto ? 
                        `<button onclick="showPhotoModal('${log.photo}')" class="text-blue-600 hover:text-blue-900 text-sm">View Photo</button>` :
                        `<span class="inline-flex items-center text-red-500 text-sm">
                            <i class="fas fa-camera-slash mr-1"></i> N/A
                        </span>`
                    }
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button onclick="toggleLogModal('${log.id}')" class="text-indigo-600 hover:text-indigo-900">Edit</button>
                    <button onclick="handleLogDelete('${log.id}')" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    if (filteredLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-500">No time logs found for the current filters.</td></tr>';
    }
}

/**
 * Renders the Audit Log History table.
 */
export function renderAuditLogList() {
    const tableBody = document.getElementById('audit-log-list-body');
    if (!tableBody || !state.auditLogs || !state.allEmployees) return;

    // Use state.auditLogs which is already sorted and sliced to 10
    const recentLogs = state.auditLogs;

    tableBody.innerHTML = recentLogs.map(log => {
        const admin = state.allEmployees[log.adminUid] || { name: 'Unknown Admin' };
        const targetEmployee = state.allEmployees[log.targetUid] || { name: 'N/A' };
        const actionType = log.action === 'EDIT_LOG' || log.action === 'EDIT_SETTINGS' || log.action === 'EDIT_PROFILE' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-6 py-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="px-6 py-3 font-medium text-gray-900">${admin.name}</td>
                <td class="px-6 py-3 text-sm">${targetEmployee.name}</td>
                <td class="px-6 py-3">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${actionType}">
                        ${log.action.replace('_', ' ')}
                    </span>
                </td>
                <td class="px-6 py-3 text-sm text-gray-600 truncate max-w-xs">${log.details}</td>
            </tr>
        `;
    }).join('');
    
    if (recentLogs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-gray-500">No audit activity yet.</td></tr>';
    }
}

/*
|--------------------------------------------------------------------------
| 4. MODAL CONTROLS
|--------------------------------------------------------------------------
*/

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}

export function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}

export function showPhotoModal(base64Image) {
    const modal = document.getElementById('photo-modal');
    const imgEl = document.getElementById('photo-viewer-img');
    if (modal && imgEl) {
        imgEl.src = base64Image;
        modal.classList.remove('hidden');
    }
}

export function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
}

export function closeSettingsModal() {
    document.getElementById('employee-settings-modal').classList.add('hidden');
}

export function applyFilters() {
    // This is called from the HTML buttons to trigger a re-render of the log table
    renderTimeLogList();
}

/**
 * Closes all active modals. Useful after a successful action.
 */
export function closeAllModals() {
    closeSignupModal();
    closeLogModal();
    closePhotoModal();
    closeSettingsModal();
}

/**
 * Sets a temporary message (e.g., success or error) in the Auth Status area.
 * @param {string} message The message to display.
 * @param {boolean} isError If true, displays in red (error); otherwise, green (success).
 */
export function setAuthMessage(message, isError = false) {
    const authStatus = document.getElementById('auth-message-box');
    if (authStatus) {
        authStatus.textContent = message;
        authStatus.classList.remove('bg-green-100', 'bg-red-100', 'text-green-800', 'text-red-800', 'hidden');
        authStatus.classList.add(isError ? 'bg-red-100' : 'bg-green-100', isError ? 'text-red-800' : 'text-green-800');

        // Clear the message after a delay
        setTimeout(() => {
            // Re-render the UI to restore the default status message (handled by renderUI's initial check)
            if (authStatus.textContent === message) {
                authStatus.classList.add('hidden');
                authStatus.textContent = '';
            }
        }, 5000);
    }
}