const app = {
    users: [],

    async init() {
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

    async loadUsers() {
        try {
            this.users = await api.getUsers();
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    },

    showLogin() {
        document.getElementById('loginScreen').style.display = 'block';
        document.getElementById('dashboardScreen').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    },

    showRegister() {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    },

    showDashboard() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('dashboardScreen').style.display = 'block';
        document.getElementById('currentUser').textContent = auth.currentUser.username;
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

    renderArchive(tasks) {
        const container = document.getElementById('archiveList');

        if (tasks.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">Архив пуст</p>';
            return;
        }

        container.innerHTML = tasks.map(task => {
            const date = new Date(task.archived_at).toLocaleDateString('ru-RU');
            return `
                <div class="archive-item">
                    <h3>${this.escapeHtml(task.title)}</h3>
                    <p>${this.escapeHtml(task.description || 'Нет описания')}</p>
                    <p style="margin-top: 8px;"><strong>Архивирована:</strong> ${date}</p>
                </div>
            `;
        }).join('');
    },

    // Comments Modal
    closeCommentsModal() {
        comments.close();
    },

    // Postpone Modal
    closePostponeModal() {
        kanban.closePostponeModal();
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
