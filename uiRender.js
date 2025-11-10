// Filename: uiRender.js
import { state, updateState } from './state.js';
import { handleClockAction, navigateTo } from './kioskLogic.js';
import { handleEmployeeSignup, deleteEmployee, toggleLogModal, handleLogSave, handleLogDelete, generatePayrollReport, toggleSettingsModal, handleEmployeeSettings, toggleSignupModal, applyFilters, handleAdminLogin } from './adminCrud.js';
import { formatTimestamp, formatTotalHours } from './utils.js';

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
        const views = ['login_view', 'kiosk_view', 'admin_dashboard_view'];
        
        // --- 1. View Switching ---
        views.forEach(viewId => {
            const el = document.getElementById(viewId);
            if (el) {
                el.style.display = (viewId === state.currentView) ? 'block' : 'none';
            }
        });

        // --- 2. Auth Status Message ---
        const authStatus = document.getElementById('auth-message-box');
        if (state.isAuthReady && state.currentUser) {
            authStatus.textContent = `Signed in as: ${state.currentUser.email} (${state.currentUser.name})`;
            authStatus.classList.remove('bg-red-200', 'hidden');
            authStatus.classList.add('bg-green-200');
        } else if (state.isAuthReady) {
            authStatus.textContent = `Please log in.`;
            authStatus.classList.remove('bg-green-200', 'hidden');
            authStatus.classList.add('bg-red-200');
        } else {
            authStatus.textContent = `Connecting to Firebase...`;
            authStatus.classList.remove('bg-red-200', 'bg-green-200', 'hidden');
        }


        // --- 3. View-Specific Rendering ---
        if (state.currentView === 'kiosk_view' && state.currentUser) {
            renderKiosk();
        }

        if (state.currentView === 'admin_dashboard_view') {
            // Admin Dashboard is built dynamically
            renderEmployeeList();
            renderTimeLogList();
            renderAuditLogList();
            // initTabSwitching(); // Removed, now called via onclick in index.html

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
        // CRITICAL: Logs the exact component/line that caused the crash.
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

    const kioskStatusBadge = document.getElementById('kiosk-status-badge');
    const clockButton = document.getElementById('clock-action-btn');
    const recentActivity = document.getElementById('recent-activity-list');
    const nameDisplay = document.getElementById('kiosk-employee-name');
    const currentStatus = state.currentUser.status || 'out';

    // Update Name and Status
    nameDisplay.textContent = state.currentUser.name;

    if (currentStatus === 'in') {
        kioskStatusBadge.textContent = 'Clocked In';
        kioskStatusBadge.classList.remove('bg-gray-200', 'bg-red-500');
        kioskStatusBadge.classList.add('bg-green-500', 'text-white');
        clockButton.textContent = 'Clock Out';
        clockButton.classList.remove('bg-green-500');
        clockButton.classList.add('bg-red-500', 'hover:bg-red-600');
    } else {
        kioskStatusBadge.textContent = 'Clocked Out';
        kioskStatusBadge.classList.remove('bg-green-500', 'text-white');
        kioskStatusBadge.classList.add('bg-gray-200');
        clockButton.textContent = 'Clock In';
        clockButton.classList.remove('bg-red-500');
        clockButton.classList.add('bg-green-500', 'hover:bg-green-600');
    }

    // Disable button if currently processing a clock action
    clockButton.disabled = state.isClocking;

    // --- Render Recent Activity ---
    if (recentActivity && state.currentUserLogs) {
        recentActivity.innerHTML = state.currentUserLogs.map(log => `
            <li class="flex justify-between items-center py-2 px-3 border-b last:border-b-0">
                <span class="${log.type === 'in' ? 'text-green-600' : 'text-red-600'} font-semibold">${log.type.toUpperCase()}</span>
                <span class="text-sm text-gray-600">${formatTimestamp(log.timestamp)}</span>
            </li>
        `).join('');
        if (state.currentUserLogs.length === 0) {
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
 * Initializes click handlers for Admin Tabs (run once on Admin Dashboard load).
 */
function initTabSwitching() {
    const tabsContainer = document.getElementById('admin-tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const target = e.target.closest('.tab-button');
            if (target) {
                switchTab(target.getAttribute('data-target'));
            }
        });
    }
    // Ensure the default tab is displayed on first load
    switchTab('employee-management');
}

/**
 * Switches the active tab on the Admin Dashboard.
 * @param {string} targetId - ID of the tab content to show.
 */
export function switchTab(targetId) {
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });
    document.getElementById(targetId).classList.remove('hidden');

    document.querySelectorAll('.tab-button').forEach(button => {
        if (button.getAttribute('data-target') === targetId) {
            button.classList.remove('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
            button.classList.add('text-indigo-600', 'border-indigo-500');
        } else {
            button.classList.remove('text-indigo-600', 'border-indigo-500');
            button.classList.add('text-gray-500', 'border-transparent', 'hover:text-gray-700', 'hover:border-gray-300');
        }
    });
}

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
            <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
                <button onclick="toggleSettingsModal('${emp.id}')" class="text-indigo-600 hover:text-indigo-900 mr-3">Edit Settings</button>
                <button onclick="toggleSignupModal('${emp.id}')" class="text-blue-600 hover:text-blue-900 mr-3">Edit Name/Email</button>
                <button onclick="deleteEmployee('${emp.id}')" class="text-red-600 hover:text-red-900">Delete</button>
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
    if (employeeFilter && employeeFilter.children.length <= 1) { // Only populate once
        const employees = Object.values(state.allEmployees).sort((a, b) => a.name.localeCompare(b.name));
        employeeFilter.innerHTML = '<option value="">-- All Employees --</option>' + employees.map(emp =>
            `<option value="${emp.id}">${emp.name}</option>`
        ).join('');
        // Re-set the selected value if it exists in state
        if (state.filterEmployeeUid) {
            employeeFilter.value = state.filterEmployeeUid;
        }
    }

    // --- Apply Filtering ---
    let filteredLogs = state.allLogs;
    const employeeUid = employeeFilter.value;
    const startDate = startDateFilter.value ? new Date(startDateFilter.value) : null;
    const endDate = endDateFilter.value ? new Date(endDateFilter.value) : null;

    // Filter by Employee UID
    if (employeeUid && employeeUid !== "") {
        filteredLogs = filteredLogs.filter(log => log.employeeUid === employeeUid);
    }

    // Filter by Date Range
    if (startDate) {
        // Start date should include the entire day, so we compare against start of day
        const startTimestamp = startDate.getTime();
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() >= startTimestamp);
    }

    if (endDate) {
        // End date should include the entire day, up to the last millisecond
        const endTimestamp = endDate.getTime() + 86400000; // Add 24 hours
        filteredLogs = filteredLogs.filter(log => log.timestamp.toMillis() < endTimestamp);
    }
    
    // Sort by timestamp descending (newest first)
    filteredLogs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());

    tableBody.innerHTML = filteredLogs.map(log => {
        const employee = state.allEmployees[log.employeeUid] || { name: 'Unknown', email: 'N/A' };
        const hasPhoto = !!log.photo; // Photo is null since feature was removed

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
                        `<span class="text-green-600">Yes</span>` :
                        `<span class="inline-flex items-center text-red-500 text-sm">
                            <i class="fas fa-camera-slash mr-1"></i>
                            N/A
                        </span>`
                    }
                </td>
                <td class="px-6 py-3 whitespace-nowrap text-right text-sm font-medium">
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
        const actionType = log.action.includes('EDIT') ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
        
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
| 4. MODAL AND FILTER CONTROLS
|--------------------------------------------------------------------------
*/

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}

export function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}

export function closeSettingsModal() {
    document.getElementById('employee-settings-modal').classList.add('hidden');
}

/**
 * Re-renders the time log list when filters are changed.
 */
export function applyFilters() {
    renderTimeLogList();
}

/**
 * Closes all active modals. Useful after a successful action.
 */
export function closeAllModals() {
    closeSignupModal();
    closeLogModal();
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
        authStatus.classList.remove('bg-green-200', 'bg-red-200', 'hidden');
        authStatus.classList.add(isError ? 'bg-red-200' : 'bg-green-200');

        // Clear the message after a delay
        setTimeout(() => {
            renderUI(); // Re-render the UI to restore the default status message
        }, 5000);
    }
}