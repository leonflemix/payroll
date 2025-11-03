// Filename: uiRender.js
import { state, updateState } from './state.js';
import { handleClockAction, handleLogin, handleLogout, navigateTo } from './kioskLogic.js';
import { handleEmployeeSignup, handleEmployeeSettings, deleteEmployee, handleLogSave, handleLogDelete, generatePayrollReport, toggleSignupModal, toggleSettingsModal, toggleLogModal } from './adminCrud.js';
import { formatTimestamp, base64ToArrayBuffer, formatTotalHours, startCamera, stopCamera } from './utils.js';

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
        // --- 1. Set View Visibility ---
        const views = ['login_view', 'kiosk_view', 'admin_dashboard_view'];
        views.forEach(viewId => {
            const viewElement = document.getElementById(viewId);
            if (viewElement) {
                viewElement.style.display = (viewId === state.currentView) ? 'block' : 'none';
            }
        });

        // --- 2. Render View-Specific Content ---
        if (state.currentView === 'kiosk_view' && state.currentUser) {
            renderKiosk();
        }

        if (state.currentView === 'admin_dashboard_view') {
            // Render dashboard components regardless of loading state
            renderEmployeeList();
            renderTimeLogList();
            renderAuditLogList();

            // Display Admin Dashboard Error
            const adminErrorEl = document.getElementById('admin-error-message');
            if (adminErrorEl) {
                if (state.adminError) {
                    adminErrorEl.textContent = `CRITICAL DATA ERROR: ${state.adminError}`;
                    adminErrorEl.classList.remove('hidden');
                } else {
                    adminErrorEl.classList.add('hidden');
                }
            }
        }

        // --- 3. Set Global Listeners and Attach Functions ---
        const clockBtn = document.getElementById('clock-action-btn');
        if (clockBtn) {
            clockBtn.onclick = () => {
                const videoEl = document.getElementById('webcam-feed');
                handleClockAction(videoEl);
            };
        }
        
        const loginBtn = document.querySelector('#login_view button');
        if (loginBtn) {
            loginBtn.onclick = handleLogin;
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

    const nameDisplay = document.getElementById('kiosk-employee-name');
    const statusBadge = document.getElementById('kiosk-status-badge');
    const clockButton = document.getElementById('clock-action-btn');
    const recentActivity = document.getElementById('recent-activity-list');
    const currentStatus = state.currentUser.status || 'out';
    const cameraSection = document.getElementById('camera-section');

    // Update Name and Camera Visibility
    nameDisplay.textContent = state.currentUser.name;
    
    const showCamera = state.currentUser.cameraEnabled && state.ENABLE_CAMERA;
    if (cameraSection) {
        cameraSection.style.display = showCamera ? 'block' : 'none';
    }

    if (showCamera) {
        const videoElement = document.getElementById('webcam-feed');
        // Check if stream is already running to avoid unnecessary restarts
        if (!state.mediaStream) { 
            startCamera(videoElement);
        }
    } else {
        stopCamera();
    }

    // Update Status Badge and Button
    if (currentStatus === 'in') {
        statusBadge.textContent = 'Clocked In';
        statusBadge.classList.remove('status-out');
        statusBadge.classList.add('status-in');
        clockButton.textContent = 'Clock Out';
        clockButton.classList.remove('btn-success');
        clockButton.classList.add('btn-danger');
    } else {
        statusBadge.textContent = 'Clocked Out';
        statusBadge.classList.remove('status-in');
        statusBadge.classList.add('status-out');
        clockButton.textContent = 'Clock In';
        clockButton.classList.remove('btn-danger');
        clockButton.classList.add('btn-success');
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

    // Filter out the current user for security/integrity reasons when showing the list
    const employees = Object.values(state.allEmployees)
        .filter(emp => emp.uid !== state.currentUser?.uid) 
        .sort((a, b) => a.name.localeCompare(b.name));

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
            <td class="px-6 py-3 whitespace-nowrap text-sm font-medium">
                <button onclick="toggleSettingsModal('${emp.uid}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Settings</button>
                <button onclick="toggleSignupModal('${emp.uid}')" class="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                <button onclick="deleteEmployee('${emp.uid}')" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
        </tr>
    `).join('');
}


/**
 * Filters the main log data based on current admin settings and renders the table.
 */
export function renderTimeLogList() {
    const tableBody = document.getElementById('time-log-list-body');
    const employeeFilter = document.getElementById('filter-employee');
    const startDateFilter = document.getElementById('filter-start-date');
    const endDateFilter = document.getElementById('filter-end-date');
    if (!tableBody || !state.allLogs || !state.allEmployees) return;

    // --- Populate Employee Filter Dropdown ---
    if (employeeFilter && employeeFilter.children.length <= 1) { 
        const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));
        employeeFilter.innerHTML = '<option value="">All Employees</option>' + employees.map(emp =>
            `<option value="${emp.uid}">${emp.name}</option>`
        ).join('');
        if (state.filterEmployeeUid) {
            employeeFilter.value = state.filterEmployeeUid;
        }
    }

    // --- Apply Filtering ---
    let filteredLogs = state.allLogs;

    // Filter by Employee UID
    const currentFilterUid = employeeFilter?.value || null;
    updateState({ filterEmployeeUid: currentFilterUid });

    if (currentFilterUid) {
        filteredLogs = filteredLogs.filter(log => log.employeeUid === currentFilterUid);
    }

    // Filter by Date Range
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;

    if (startDate) {
        const startTimestamp = startDate.getTime();
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() >= startTimestamp);
    }

    if (endDate) {
        const endTimestamp = endDate.getTime() + 86400000; 
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() < endTimestamp);
    }
    
    // Sort by timestamp descending (newest first)
    filteredLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

    tableBody.innerHTML = filteredLogs.map(log => {
        const employee = state.allEmployees[log.employeeUid] || { name: 'Unknown', email: 'N/A' };
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
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 mr-1">
                                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.288 5.711A.75.75 0 0 0 7.5 6.444v7.112a.75.75 0 0 0 1.288.536l4.632-3.556a.75.75 0 0 0 0-1.293L8.788 5.711Z" clip-rule="evenodd" />
                            </svg>
                            N/A
                        </span>`
                    }
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-sm font-medium">
                    <button onclick="toggleLogModal('${log.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit</button>
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

    // Sort by timestamp descending (newest first) and take the last 10
    const recentLogs = state.auditLogs
        .sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())
        .slice(0, 10);

    tableBody.innerHTML = recentLogs.map(log => {
        const admin = state.allEmployees[log.adminUid] || { name: 'Unknown Admin' };
        const targetEmployee = state.allEmployees[log.targetUid] || { name: 'N/A' };
        const actionType = log.action.includes('EDIT') ? 'bg-yellow-100 text-yellow-800' : 
                         (log.action.includes('DELETE') ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800');
        
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-6 py-3 text-sm">${formatTimestamp(log.timestamp)}</td>
                <td class="px-6 py-3 font-medium text-gray-900">${admin.name}</td>
                <td class="px-6 py-3 text-sm">${targetEmployee.name}</td>
                <td class="px-6 py-3">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${actionType}">
                        ${log.action}
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
    const messageBox = document.getElementById('auth-message-box');
    if (messageBox) {
        messageBox.textContent = message;
        messageBox.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'text-green-800', 'text-red-800');
        
        messageBox.classList.add(isError ? 'bg-red-100' : 'bg-green-100');
        messageBox.classList.add(isError ? 'text-red-800' : 'text-green-800');

        // Show for 5 seconds
        setTimeout(() => {
            messageBox.classList.add('hidden');
        }, 5000);
    }
}
