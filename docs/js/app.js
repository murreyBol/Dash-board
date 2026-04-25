const app = {
    async init() {
        const isAuthenticated = await auth.init();

        if (isAuthenticated) {
            this.showDashboard();
            await kanban.init();
            websocket.connect();
            await notifications.init();
        } else {
            this.showLogin();
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
        kanban.currentEditingTask = null;
        document.getElementById('taskModal').style.display = 'block';
    },

    closeTaskModal() {
        document.getElementById('taskModal').style.display = 'none';
    },

    async saveTask() {
        const title = document.getElementById('taskTitle').value.trim();
        const description = document.getElementById('taskDescription').value.trim();
        const priority = document.getElementById('taskPriority').value;

        if (!title) {
            alert('Введите название задачи');
            return;
        }

        try {
            if (kanban.currentEditingTask) {
                await api.updateTask(kanban.currentEditingTask, { title, description, priority });
            } else {
                await api.createTask({ title, description, priority });
            }

            this.closeTaskModal();
            await kanban.loadTasks();
        } catch (error) {
            console.error('Failed to save task:', error);
            alert('Ошибка сохранения задачи');
        }
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
