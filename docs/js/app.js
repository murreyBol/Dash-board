const app = {
    users: [],

    async init() {
        // Check if pin code is verified
        const pinVerified = localStorage.getItem('pin_verified');

        if (!pinVerified) {
            this.showPinScreen();
            return;
        }

        const isAuthenticated = await auth.init();

        if (isAuthenticated) {
            this.showDashboard();
            await this.loadUsers();
            await kanban.init();
            websocket.connect();
            await notifications.init();
        } else {
            this.showLogin();
        }
    },

    showPinScreen() {
        document.getElementById('pinScreen').style.display = 'block';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'none';
    },

    showLogin() {
        document.getElementById('pinScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('dashboardScreen').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    },

    showRegister() {
        document.getElementById('pinScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('dashboardScreen').style.display = 'none';
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    },

    async checkPin() {
        const pinCode = document.getElementById('pinCode').value.trim();
        const pinError = document.getElementById('pinError');

        if (!pinCode) {
            pinError.textContent = 'Введите PIN-код';
            pinError.style.display = 'block';
            return;
        }

        try {
            const response = await fetch(`${api.baseUrl}/auth/check-pin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ pin_code: pinCode })
            });

            if (response.ok) {
                const data = await response.json();
                // Save access token
                localStorage.setItem('access_token', data.access_token);
                localStorage.setItem('pin_verified', 'true');
                document.getElementById('pinScreen').style.display = 'none';
                this.showLogin();
            } else {
                pinError.textContent = 'Неверный PIN-код';
                pinError.style.display = 'block';
                document.getElementById('pinCode').value = '';
            }
        } catch (error) {
            console.error('Pin check error:', error);
            pinError.textContent = 'Ошибка проверки PIN-кода';
            pinError.style.display = 'block';
        }
    },

    async loadUsers() {
        try {
            this.users = await api.getUsers();
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    },

    showDashboard() {
        document.getElementById('pinScreen').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'block';
        document.getElementById('currentUser').textContent = auth.currentUser.username;

        // Show admin button only for admins
        const adminBtn = document.getElementById('adminBtn');
        if (auth.currentUser.is_admin) {
            adminBtn.style.display = 'inline-block';
        } else {
            adminBtn.style.display = 'none';
        }
    },

    async login() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            alert('Заполните все поля');
            return;
        }

        const success = await auth.login(username, password);
        if (success) {
            this.showDashboard();
            await kanban.init();
            websocket.connect();
            await notifications.init();
        }
    },

    async register() {
        const username = document.getElementById('registerUsername').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value;

        if (!username || !email || !password) {
            alert('Заполните все поля');
            return;
        }

        const success = await auth.register(username, email, password);
        if (success) {
            this.showDashboard();
            await kanban.init();
            websocket.connect();
            await notifications.init();
        }
    },

    logout() {
        timer.stopAll();
        websocket.disconnect();
        auth.logout();
    },

    // Task Modal
    showCreateTaskModal() {
        document.getElementById('taskModalTitle').textContent = 'Создать задачу';
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskPriority').value = 'urgent';
        this.populateAssigneeSelect();
        document.getElementById('taskAssignee').value = '';
        kanban.currentEditingTask = null;
        document.getElementById('taskModal').style.display = 'block';
    },

    populateAssigneeSelect() {
        const select = document.getElementById('taskAssignee');
        select.innerHTML = '<option value="">Не назначена</option>';

        this.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            select.appendChild(option);
        });
    },

    closeTaskModal() {
        document.getElementById('taskModal').style.display = 'none';
    },

    async saveTask() {
        const title = document.getElementById('taskTitle').value.trim();
        const description = document.getElementById('taskDescription').value.trim();
        const priority = document.getElementById('taskPriority').value;
        const assignedTo = document.getElementById('taskAssignee').value || null;

        if (!title) {
            alert('Введите название задачи');
            return;
        }

        // Check column limit for new tasks
        if (!kanban.currentEditingTask) {
            const tasksInColumn = kanban.tasks.filter(t =>
                t.priority === priority && t.status !== 'archived'
            ).length;

            if (tasksInColumn >= 20) {
                alert(`Колонка "${this.getPriorityName(priority)}" заполнена (максимум 20 задач). Выберите другой приоритет или удалите старые задачи.`);
                return;
            }
        }

        try {
            let result;
            if (kanban.currentEditingTask) {
                result = await api.updateTask(kanban.currentEditingTask, { title, description, priority, assigned_to: assignedTo });
            } else {
                result = await api.createTask({ title, description, priority, assigned_to: assignedTo });
            }

            console.log('Task saved successfully:', result);
            this.closeTaskModal();
            await kanban.loadTasks();
        } catch (error) {
            console.error('Failed to save task:', error);
            console.error('Error details:', error.message, error.stack);
            alert('Ошибка сохранения задачи: ' + error.message);
        }
    },

    getPriorityName(priority) {
        const names = {
            urgent: 'Срочная',
            medium: 'Средняя срочность',
            low: 'Малая срочность',
            future: 'В будущем'
        };
        return names[priority] || priority;
    },

    // Settings Modal
    async showSettings() {
        const autoStart = auth.currentUser.auto_start_timer;
        document.getElementById('autoStartTimer').checked = autoStart;
        document.getElementById('settingsModal').style.display = 'block';
    },

    closeSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
    },

    async saveSettings() {
        const autoStartTimer = document.getElementById('autoStartTimer').checked;

        try {
            const updatedUser = await api.updateSettings({ auto_start_timer: autoStartTimer });
            auth.currentUser = updatedUser;
            this.closeSettingsModal();
            alert('Настройки сохранены');
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('Ошибка сохранения настроек');
        }
    },

    // Calendar Modal
    showCalendar() {
        calendar.show();
    },

    closeCalendarModal() {
        calendar.close();
    },

    // Overdue Modal
    async showOverdue() {
        try {
            const overdueTasks = await api.getOverdueTasks();
            this.renderOverdue(overdueTasks);
            document.getElementById('overdueModal').style.display = 'block';
        } catch (error) {
            console.error('Failed to load overdue tasks:', error);
            alert('Ошибка загрузки просроченных задач');
        }
    },

    closeOverdueModal() {
        document.getElementById('overdueModal').style.display = 'none';
    },

    renderOverdue(tasks) {
        const container = document.getElementById('overdueList');

        if (tasks.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">Нет просроченных задач</p>';
            return;
        }

        container.innerHTML = tasks.map(task => {
            const assignee = task.assigned_to ? 'Назначена' : 'Не назначена';
            const lastActivity = new Date(task.last_activity_at).toLocaleDateString('ru-RU');
            const inactiveDays = task.inactive_days;
            return `
                <div class="archive-item">
                    <h3>${this.escapeHtml(task.title)}</h3>
                    <p>${this.escapeHtml(task.description || 'Нет описания')}</p>
                    <p style="margin-top: 8px;"><strong>Статус:</strong> ${assignee}</p>
                    <p style="margin-top: 4px;"><strong>Последняя активность:</strong> ${lastActivity}</p>
                    <p style="margin-top: 4px; color: #e74c3c;"><strong>Неактивна:</strong> ${inactiveDays} дней</p>
                </div>
            `;
        }).join('');
    },

    // Archive Modal
    async showArchive() {
        try {
            const archivedTasks = await api.getArchivedTasks();
            this.renderArchive(archivedTasks);
            document.getElementById('archiveModal').style.display = 'block';
        } catch (error) {
            console.error('Failed to load archive:', error);
            alert('Ошибка загрузки архива');
        }
    },

    closeArchiveModal() {
        document.getElementById('archiveModal').style.display = 'none';
    },

    async deleteArchivedTask(taskId) {
        if (!confirm('Удалить задачу из архива? Это действие нельзя отменить.')) return;

        try {
            await api.deleteTask(taskId);
            // Reload archive
            await this.showArchive();
        } catch (error) {
            console.error('Failed to delete archived task:', error);
            alert('Ошибка удаления задачи: ' + (error.message || 'Неизвестная ошибка'));
        }
    },

    renderArchive(tasks) {
        const container = document.getElementById('archiveList');

        if (tasks.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">Архив пуст</p>';
            return;
        }

        container.innerHTML = tasks.map(task => {
            // Format date
            let dateStr = 'Дата не указана';
            if (task.completed_at) {
                dateStr = new Date(task.completed_at).toLocaleDateString('ru-RU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            } else if (task.archived_at) {
                dateStr = new Date(task.archived_at).toLocaleDateString('ru-RU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }

            // Format time spent
            const timeSpent = this.formatTimeSpent(task.total_time_seconds || 0);

            // Get assignee username
            const assignee = (app.users || []).find(u => u.id === task.assigned_to);
            const assigneeName = assignee?.username || 'Не назначена';

            return `
                <div class="archive-card">
                    <div class="archive-card-content" data-task-id="${this.escapeHtml(task.id)}" style="cursor: pointer; flex: 1;">
                        <h3>${this.escapeHtml(task.title)}</h3>
                        <p class="archive-meta">
                            <span>📅 Завершено: ${dateStr}</span>
                            <span>⏱️ Время: ${timeSpent}</span>
                            <span>👤 Исполнитель: ${this.escapeHtml(assigneeName)}</span>
                        </p>
                    </div>
                    <button class="btn-delete-archive" data-task-id="${this.escapeHtml(task.id)}" title="Удалить из архива">🗑️</button>
                </div>
            `;
        }).join('');

        // Add event listeners after rendering
        container.querySelectorAll('.archive-card-content').forEach(el => {
            el.addEventListener('click', () => {
                this.showTaskDetail(el.dataset.taskId);
            });
        });

        container.querySelectorAll('.btn-delete-archive').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteArchivedTask(btn.dataset.taskId);
            });
        });
    },

    formatTimeSpent(seconds) {
        if (seconds === 0) return 'Нет данных';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}ч ${minutes}мин`;
        if (minutes > 0) return `${minutes}мин`;
        return `${seconds}сек`;
    },

    async showTaskDetail(taskId) {
        try {
            // Get task details
            const task = await api.getTask(taskId);
            const comments = await api.getComments(taskId);

            const date = new Date(task.completed_at || task.archived_at).toLocaleDateString('ru-RU');
            const timeSpent = this.formatTimeSpent(task.total_time_seconds || 0);
            const assignee = app.users.find(u => u.id === task.assigned_to);
            const assigneeName = assignee ? assignee.username : 'Не назначена';

            // Render task detail modal
            const detailContainer = document.getElementById('taskDetailContent');
            detailContainer.innerHTML = `
                <h2>${this.escapeHtml(task.title)}</h2>
                <div class="task-detail-info">
                    <p><strong>Описание:</strong> ${this.escapeHtml(task.description || 'Нет описания')}</p>
                    <p><strong>Дата выполнения:</strong> ${date}</p>
                    <p><strong>Затраченное время:</strong> ${timeSpent}</p>
                    <p><strong>Исполнитель:</strong> ${this.escapeHtml(assigneeName)}</p>
                </div>
                <div class="task-detail-comments">
                    <h3>Комментарии и история</h3>
                    ${comments.length === 0 ? '<p style="color: #888;">Нет комментариев</p>' : ''}
                    ${comments.map(comment => {
                        const commentDate = new Date(comment.created_at).toLocaleString('ru-RU');
                        const username = comment.username || 'Пользователь';
                        let timeInfo = '';
                        if (comment.session_duration) {
                            const duration = timer.formatDuration(comment.session_duration);
                            timeInfo = ` <span style="color: #3498db;">(Время: ${duration})</span>`;
                        }
                        return `
                            <div class="detail-comment">
                                <div class="comment-header">
                                    <strong>${this.escapeHtml(username)}</strong>
                                    <span class="comment-date">${commentDate}</span>
                                </div>
                                <div class="comment-text">${this.escapeHtml(comment.text)}${timeInfo}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            document.getElementById('taskDetailModal').style.display = 'block';
        } catch (error) {
            console.error('Failed to load task details:', error);
            alert('Ошибка загрузки деталей задачи');
        }
    },

    closeTaskDetailModal() {
        document.getElementById('taskDetailModal').style.display = 'none';
    },

    async loadArchiveComments(taskId) {
        try {
            const comments = await api.getComments(taskId);
            const container = document.getElementById(`archive-comments-${taskId}`);

            if (comments.length === 0) {
                container.innerHTML = '<p style="color: #888; font-size: 14px;">Нет комментариев</p>';
                return;
            }

            container.innerHTML = comments.map(comment => {
                const date = new Date(comment.created_at).toLocaleString('ru-RU');
                const username = comment.username || 'Пользователь';
                return `
                    <div style="background: rgba(255, 255, 255, 0.05); padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                            <strong style="color: #3498db;">${this.escapeHtml(username)}</strong>
                            <span style="color: #95a5a6; font-size: 12px;">${date}</span>
                        </div>
                        <div style="color: #ecf0f1; font-size: 14px;">${this.escapeHtml(comment.text)}</div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Failed to load archive comments:', error);
            const container = document.getElementById(`archive-comments-${taskId}`);
            container.innerHTML = '<p style="color: #e74c3c;">Ошибка загрузки комментариев</p>';
        }
    },

    // Comments Modal
    closeCommentsModal() {
        comments.close();
    },

    addComment() {
        comments.addComment();
    },

    // Admin Panel
    async showAdminPanel() {
        try {
            const users = await api.getUsers();

            // Load current pin code
            try {
                const pinData = await api.getPinCode();
                document.getElementById('currentPin').textContent = pinData.pin_code;
            } catch (error) {
                console.error('Failed to load pin code:', error);
                document.getElementById('currentPin').textContent = '****';
            }

            this.renderAdminPanel(users);
            document.getElementById('adminModal').style.display = 'block';
        } catch (error) {
            console.error('Failed to load admin panel:', error);
            alert('Ошибка загрузки админ-панели');
        }
    },

    async updatePinCode() {
        const newPin = document.getElementById('newPinCode').value.trim();

        if (!newPin) {
            alert('Введите новый PIN-код');
            return;
        }

        if (newPin.length < 4) {
            alert('PIN-код должен содержать минимум 4 символа');
            return;
        }

        try {
            const result = await api.updatePinCode(newPin);
            document.getElementById('currentPin').textContent = result.pin_code;
            document.getElementById('newPinCode').value = '';
            alert('PIN-код успешно изменён!');
        } catch (error) {
            console.error('Failed to update pin code:', error);
            alert('Ошибка изменения PIN-кода');
        }
    },

    closeAdminModal() {
        document.getElementById('adminModal').style.display = 'none';
    },

    renderAdminPanel(users) {
        const container = document.getElementById('adminUserList');

        if (users.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">Нет пользователей</p>';
            return;
        }

        container.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 2px solid #0d7377;">
                        <th style="padding: 12px; text-align: left;">Пользователь</th>
                        <th style="padding: 12px; text-align: left;">Email</th>
                        <th style="padding: 12px; text-align: center;">Роль</th>
                        <th style="padding: 12px; text-align: center;">Дата регистрации</th>
                        <th style="padding: 12px; text-align: center;">Действия</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => {
                        const isCurrentUser = user.id === auth.currentUser.id;
                        const date = new Date(user.created_at).toLocaleDateString('ru-RU');
                        return `
                            <tr style="border-bottom: 1px solid #0f3460;">
                                <td style="padding: 12px;">${this.escapeHtml(user.username)}</td>
                                <td style="padding: 12px;">${this.escapeHtml(user.email)}</td>
                                <td style="padding: 12px; text-align: center;">
                                    ${user.is_admin ? '<span style="color: #f39c12;">👑 Админ</span>' : '<span style="color: #95a5a6;">Пользователь</span>'}
                                </td>
                                <td style="padding: 12px; text-align: center;">${date}</td>
                                <td style="padding: 12px; text-align: center;">
                                    ${!isCurrentUser ? `
                                        <button onclick="app.toggleUserAdmin('${user.id}')" style="margin-right: 8px; padding: 6px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                            ${user.is_admin ? 'Снять админа' : 'Сделать админом'}
                                        </button>
                                        <button onclick="app.deleteUser('${user.id}')" style="padding: 6px 12px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">
                                            Удалить
                                        </button>
                                    ` : '<span style="color: #95a5a6;">Вы</span>'}
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    async toggleUserAdmin(userId) {
        if (!confirm('Изменить права администратора для этого пользователя?')) return;

        try {
            await api.toggleAdmin(userId);
            await this.showAdminPanel(); // Refresh
        } catch (error) {
            console.error('Failed to toggle admin:', error);
            alert('Ошибка изменения прав: ' + error.message);
        }
    },

    async deleteUser(userId) {
        if (!confirm('Вы уверены что хотите удалить этого пользователя? Это действие необратимо!')) return;

        try {
            await api.deleteUser(userId);
            await this.showAdminPanel(); // Refresh
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Ошибка удаления пользователя: ' + error.message);
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

// Close modals on outside click
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Handle Enter key in login forms
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('loginForm').style.display !== 'none') {
            app.login();
        } else if (document.getElementById('registerForm').style.display !== 'none') {
            app.register();
        }
    }
});
