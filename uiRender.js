// Filename: uiRender.js
import { state } from './state.js';
import { formatTimestamp } from './utils.js';
import { applyLogFilters } from './adminCrud.js';

/*
|--------------------------------------------------------------------------
| UI RENDERER AND NAVIGATION
|--------------------------------------------------------------------------
*/

export function renderUI() {
    // 1. Loading State
    const loader = document.getElementById('loading-overlay');
    loader.classList.toggle('hidden', !state.loading);

    // 2. Message Area
    const messageArea = document.getElementById('message-area');
    messageArea.textContent = state.message;
    messageArea.className = `fixed top-4 right-4 p-3 rounded-lg shadow-lg text-white z-50 ${
        state.messageType === 'success' ? 'bg-green-600' : 
        state.messageType === 'error' ? 'bg-red-600' : 'hidden'
    }`;
    messageArea.classList.toggle('hidden', state.message === '');


    // 3. User Authentication State
    const user = state.auth.currentUser;
    if (!user) {
        document.getElementById('current-user').textContent = 'Not Logged In';
    } else {
        document.getElementById('current-user').textContent = state.currentUser.name || state.currentUser.email;
        document.getElementById('current-user').title = state.currentUser.uid;
    }
    
    // 4. Navigation/View Toggle
    const views = ['login', 'kiosk', 'admin_dashboard'];
    views.forEach(view => {
        const element = document.getElementById(view);
        if (element) {
            element.classList.toggle('hidden', state.currentView !== view);
        }
    });

    // 5. Render View Specifics
    if (state.currentView === 'login') {
        // Clear login fields
        document.getElementById('email-input').value = '';
        document.getElementById('password-input').value = '';
    } else if (state.currentView === 'kiosk') {
        renderKioskDashboard();
    } else if (state.currentView === 'admin_dashboard') {
        renderAdminDashboard();
    }
}
window.renderUI = renderUI;

/*
|--------------------------------------------------------------------------
| KIOSK VIEW RENDERING
|--------------------------------------------------------------------------
*/

function renderKioskDashboard() {
    const user = state.currentUser;
    if (!user) return;
    
    const kioskDiv = document.getElementById('kiosk');
    if (!kioskDiv) return;

    // Display User Name
    document.getElementById('kiosk-user-name').textContent = user.name || user.email;

    // Display Current Status
    const statusDiv = document.getElementById('kiosk-status');
    const punchButton = document.getElementById('punch-button');
    
    if (user.status === 'in') {
        statusDiv.textContent = 'Clocked IN';
        statusDiv.className = 'text-center text-4xl font-bold text-green-600';
        punchButton.textContent = 'Clock OUT';
        punchButton.className = 'w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition duration-150 shadow-xl transform hover:scale-[1.02]';
    } else {
        statusDiv.textContent = 'Clocked OUT';
        statusDiv.className = 'text-center text-4xl font-bold text-red-600';
        punchButton.textContent = 'Clock IN';
        punchButton.className = 'w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition duration-150 shadow-xl transform hover:scale-[1.02]';
    }

    // Camera/Placeholder
    const video = document.getElementById('camera-preview');
    const placeholder = document.getElementById('camera-placeholder');
    const cameraSection = document.getElementById('camera-section');

    const cameraEnabled = user.cameraEnabled !== false;

    cameraSection.classList.toggle('hidden', !cameraEnabled);

    if (cameraEnabled) {
        if (state.cameraStream && state.cameraEnabled) {
             video.classList.remove('hidden');
             placeholder.classList.add('hidden');
        } else {
             // Camera is enabled for user, but hasn't started or failed
             video.classList.add('hidden');
             placeholder.classList.remove('hidden');
             placeholder.textContent = 'Camera is starting or permission pending...';
        }
    } else {
         video.classList.add('hidden');
         placeholder.classList.remove('hidden');
         placeholder.textContent = 'Photo verification is disabled for this user.';
    }

    // Render Recent Activity
    const activityBody = document.getElementById('recent-activity-body');
    activityBody.innerHTML = '';
    
    if (state.userLogs.length > 0) {
        state.userLogs.slice(0, 5).forEach(log => {
            const row = activityBody.insertRow();
            row.className = 'border-b hover:bg-gray-50';
            row.insertCell().textContent = log.type.toUpperCase();
            row.insertCell().textContent = formatTimestamp(log.timestamp);
        });
    } else {
        const row = activityBody.insertRow();
        row.insertCell().colSpan = 2;
        row.cells[0].textContent = 'No recent activity recorded.';
        row.cells[0].className = 'text-center italic text-gray-500 py-4';
    }
}

/*
|--------------------------------------------------------------------------
| ADMIN VIEW RENDERING
|--------------------------------------------------------------------------
*/

function renderAdminDashboard() {
    renderEmployeeList();
    renderTimeLogTable();
    renderAuditLogTable();
}

// Renders the main employee management table and filter dropdown
export function renderEmployeeList() {
    const employeeBody = document.getElementById('employee-table-body');
    const filterSelect = document.getElementById('filter-employee-uid');
    
    if (!employeeBody || !filterSelect) return;

    employeeBody.innerHTML = '';
    filterSelect.innerHTML = '<option value="all">All Employees</option>';

    state.employees.sort((a, b) => a.name.localeCompare(b.name)).forEach(employee => {
        // Table row
        const row = employeeBody.insertRow();
        row.className = 'border-b hover:bg-gray-50';
        row.insertCell().textContent = employee.name;
        row.insertCell().textContent = employee.email;
        row.insertCell().textContent = employee.status.toUpperCase();
        row.insertCell().textContent = employee.isAdmin ? 'Yes' : 'No';
        
        // Configuration Cell
        const configCell = row.insertCell();
        configCell.innerHTML = `
            <span class="text-sm block">Cam: ${employee.cameraEnabled ? 'On' : 'Off'}</span>
            <span class="text-sm block">Max Hrs: ${employee.maxDailyHours || '8'}</span>
            <span class="text-sm block">Break Min: ${employee.breakDeductionMinutes || '30'}</span>
        `;
        
        // Actions Cell
        const actionsCell = row.insertCell();
        actionsCell.className = 'flex space-x-2 justify-center py-3';
        actionsCell.innerHTML = `
            <button onclick="showEditEmployeeModal('${employee.uid}')" class="text-indigo-600 hover:text-indigo-900 text-sm p-1 border rounded">Edit</button>
            <button onclick="handleEmployeeDelete('${employee.uid}', '${employee.name}')" class="text-red-600 hover:text-red-900 text-sm p-1 border rounded">Delete</button>
        `;
        
        // Filter option
        const option = document.createElement('option');
        option.value = employee.uid;
        option.textContent = employee.name;
        filterSelect.appendChild(option);
    });

    // Restore selected filter state
    if (state.filterEmployeeUid && state.filterEmployeeUid !== 'all') {
        filterSelect.value = state.filterEmployeeUid;
    }
}

// Renders the time log table based on current filters
function renderTimeLogTable() {
    const logBody = document.getElementById('log-table-body');
    const startDate = state.filterStartDate ? new Date(state.filterStartDate) : null;
    const endDate = state.filterEndDate ? new Date(state.filterEndDate) : null;

    if (!logBody) return;
    logBody.innerHTML = '';

    const filteredLogs = state.allLogs
        .slice()
        .sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate()) // Newest first
        .filter(log => {
            const logTime = log.timestamp.toDate().getTime();
            
            // Employee filter
            if (state.filterEmployeeUid && state.filterEmployeeUid !== 'all' && log.employeeUid !== state.filterEmployeeUid) {
                return false;
            }
            // Date filter
            if (startDate && logTime < startDate.getTime()) return false;
            if (endDate && logTime > endDate.getTime() + 86400000) return false; // Add 24h to endDate for inclusivity
            
            return true;
        });

    filteredLogs.forEach(log => {
        const employee = state.employees.find(e => e.uid === log.employeeUid);
        const name = employee ? employee.name : 'Unknown User';
        
        const row = logBody.insertRow();
        row.className = 'border-b hover:bg-gray-50';
        row.insertCell().textContent = name;
        row.insertCell().textContent = log.type.toUpperCase();
        row.insertCell().textContent = formatTimestamp(log.timestamp);
        
        // Photo Status
        const photoCell = row.insertCell();
        if (log.photoData) {
            photoCell.textContent = 'Yes';
            photoCell.className = 'text-green-600';
        } else {
            photoCell.innerHTML = 'N/A <span title="Missing Photo" class="text-red-500 font-bold">&#9888;</span>';
            photoCell.className = 'text-red-500';
        }

        // Actions
        const actionsCell = row.insertCell();
        actionsCell.className = 'space-x-2 py-3';
        actionsCell.innerHTML = `
            <button onclick="showLogModal('${log.id}')" class="text-indigo-600 hover:text-indigo-900 text-sm p-1 border rounded">Edit</button>
            <button onclick="handleLogDelete('${log.id}')" class="text-red-600 hover:text-red-900 text-sm p-1 border rounded">Delete</button>
        `;
    });
}

// Renders the audit log table
function renderAuditLogTable() {
    const auditBody = document.getElementById('audit-log-body');
    if (!auditBody) return;
    
    auditBody.innerHTML = '';

    state.auditLogs.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate()).slice(0, 10).forEach(log => {
        const row = auditBody.insertRow();
        row.className = 'border-b hover:bg-gray-50';
        row.insertCell().textContent = formatTimestamp(log.timestamp);
        row.insertCell().textContent = log.action.toUpperCase();
        row.insertCell().textContent = log.adminEmail || 'System';
        row.insertCell().textContent = log.targetId;
        
        // Detail Cell (Show simplified details)
        const detailsCell = row.insertCell();
        if (log.action === 'EDIT') {
            const oldType = log.oldData?.type;
            const newType = log.newData?.type;
            detailsCell.textContent = `Type: ${oldType} -> ${newType}`;
        } else if (log.action === 'DELETE') {
            detailsCell.textContent = `Deleted Type: ${log.oldData?.type} at ${formatTimestamp(log.oldData?.timestamp)}`;
        } else if (log.action === 'EMPLOYEE_CREATE') {
            detailsCell.textContent = `New Employee: ${log.newData?.name} (${log.newData?.email})`;
        } else {
             detailsCell.textContent = 'N/A';
        }
    });
}

/*
|--------------------------------------------------------------------------
| MODAL CONTROL
|--------------------------------------------------------------------------
*/

export function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
}
window.closeLogModal = closeLogModal;

export function closeSignupModal() {
    document.getElementById('employee-signup-modal').classList.add('hidden');
}
window.closeSignupModal = closeSignupModal;

export function closeEditEmployeeModal() {
    document.getElementById('employee-edit-modal').classList.add('hidden');
}
window.closeEditEmployeeModal = closeEditEmployeeModal;

export function showPhotoModal(base64Data) {
    const img = document.getElementById('photo-preview-image');
    img.src = `data:image/jpeg;base64,${base64Data}`;
    document.getElementById('photo-modal').classList.remove('hidden');
}
window.showPhotoModal = showPhotoModal;

export function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
}
window.closePhotoModal = closePhotoModal;

// Initial render call on load (handled in main.js, but kept here for completeness)
// renderUI();
