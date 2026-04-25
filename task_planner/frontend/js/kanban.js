const kanban = {
    tasks: [],
    currentEditingTask: null,
    currentPostponeTask: null,

    async init() {
        await this.loadTasks();
        this.setupDragAndDrop();
    },

    async loadTasks() {
        try {
            this.tasks = await api.getTasks();
            this.render();
        } catch (error) {
            console.error('Failed to load tasks:', error);
        }
    },

    render() {
        const columns = {
            urgent: document.getElementById('urgent-tasks'),
            medium: document.getElementById('medium-tasks'),
            low: document.getElementById('low-tasks'),
            future: document.getElementById('future-tasks')
        };

        // Clear columns
        Object.values(columns).forEach(col => col.innerHTML = '');

        // Count tasks per column
        const counts = { urgent: 0, medium: 0, low: 0, future: 0 };

        // Render tasks
        this.tasks.forEach(task => {
            if (task.status === 'archived') return;

            const column = columns[task.priority];
            if (column) {
                column.appendChild(this.createTaskCard(task));
                counts[task.priority]++;
            }
        });

        // Update counts
        Object.keys(counts).forEach(priority => {
            const countEl = document.querySelector(`[data-priority="${priority}"] .task-count`);
            if (countEl) countEl.textContent = counts[priority];
        });

        // Show empty state if no tasks
        Object.entries(columns).forEach(([priority, column]) => {
            if (column.children.length === 0) {
                column.innerHTML = '<div class="empty-state"><p>Нет задач</p></div>';
            }
        });
    },

    createTaskCard(task) {
        const card = document.createElement('div');
        card.className = `task-card ${task.priority}`;
        card.draggable = true;
        card.dataset.taskId = task.id;

        const statusBadges = [];
        if (task.status === 'completed') {
            statusBadges.push('<span class="status-badge completed">✓ Выполнен</span>');
        }
        if (task.status === 'postponed') {
            statusBadges.push('<span class="status-badge postponed">⏸ Отложен</span>');
        }
        if (task.status === 'in_progress') {
            statusBadges.push('<span class="status-badge in-progress">▶ В работе</span>');
        }

        const assigneeHtml = task.assigned_to ? `
            <div class="task-assignee">
                <div class="assignee-avatar">${task.assigned_to.substring(0, 2).toUpperCase()}</div>
                <span>Назначена</span>
            </div>
        ` : '<span style="color: #888;">Не назначена</span>';

        const isTimerRunning = timer.isRunning(task.id);
        const timerHtml = isTimerRunning ? '<div class="task-timer"></div>' : '';

        card.innerHTML = `
            <div class="task-header">
                <div class="task-title">${this.escapeHtml(task.title)}</div>
                <div class="task-status">${statusBadges.join('')}</div>
            </div>
            ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
                ${assigneeHtml}
                ${timerHtml}
            </div>
            <div class="task-actions">
                ${!task.assigned_to || task.assigned_to !== auth.currentUser.id ?
                    `<button class="btn-assign" onclick="kanban.assignToMe('${task.id}')">Взять</button>` : ''}
                ${task.assigned_to === auth.currentUser.id && task.status !== 'completed' ? `
                    <button class="btn-timer" onclick="kanban.toggleTimer('${task.id}')">
                        ${isTimerRunning ? '⏸ Стоп' : '▶ Старт'}
                    </button>
                ` : ''}
                ${task.status !== 'completed' ?
                    `<button class="btn-complete" onclick="kanban.completeTask('${task.id}')">✓ Выполнить</button>` : ''}
                ${task.status !== 'postponed' && task.status !== 'completed' ?
                    `<button class="btn-postpone" onclick="kanban.showPostponeModal('${task.id}')">⏸ Отложить</button>` : ''}
                <button class="btn-comments" onclick="comments.show('${task.id}')">💬 Комментарии</button>
                <button class="btn-archive" onclick="kanban.archiveTask('${task.id}')">📦 Архив</button>
                <button class="btn-delete" onclick="kanban.deleteTask('${task.id}')">✕</button>
            </div>
        `;

        return card;
    },

    setupDragAndDrop() {
        document.querySelectorAll('.column-content').forEach(column => {
            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                column.classList.add('drag-over');
            });

            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });

            column.addEventListener('drop', async (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');

                const taskId = e.dataTransfer.getData('text/plain');
                const newPriority = column.closest('.kanban-column').dataset.priority;

                await this.updateTaskPriority(taskId, newPriority);
            });
        });

        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('task-card')) {
                e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
                e.target.classList.add('dragging');
            }
        });

        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('task-card')) {
                e.target.classList.remove('dragging');
            }
        });
    },

    async updateTaskPriority(taskId, newPriority) {
        try {
            await api.updateTask(taskId, { priority: newPriority });
            await this.loadTasks();
        } catch (error) {
            console.error('Failed to update task priority:', error);
            alert('Ошибка обновления приоритета');
        }
    },

    async assignToMe(taskId) {
        try {
            await api.assignTask(taskId, auth.currentUser.id);

            // Auto-start timer if enabled
            if (auth.currentUser.auto_start_timer) {
                await timer.start(taskId);
            }

            await this.loadTasks();
        } catch (error) {
            console.error('Failed to assign task:', error);
            alert('Ошибка назначения задачи');
        }
    },

    async toggleTimer(taskId) {
        if (timer.isRunning(taskId)) {
            await timer.stop(taskId);
        } else {
            await timer.start(taskId);
        }
        this.render();
    },

    async completeTask(taskId) {
        try {
            // Stop timer if running
            if (timer.isRunning(taskId)) {
                await timer.stop(taskId);
            }

            await api.completeTask(taskId);
            await this.loadTasks();
        } catch (error) {
            console.error('Failed to complete task:', error);
            alert('Ошибка завершения задачи');
        }
    },

    showPostponeModal(taskId) {
        this.currentPostponeTask = taskId;
        document.getElementById('postponeModal').style.display = 'block';
    },

    async postponeTask() {
        const reason = document.getElementById('postponeReason').value.trim();
        if (!reason) {
            alert('Укажите причину отложения');
            return;
        }

        try {
            await api.postponeTask(this.currentPostponeTask, reason);
            this.closePostponeModal();
            await this.loadTasks();
        } catch (error) {
            console.error('Failed to postpone task:', error);
            alert('Ошибка отложения задачи');
        }
    },

    closePostponeModal() {
        this.currentPostponeTask = null;
        document.getElementById('postponeModal').style.display = 'none';
        document.getElementById('postponeReason').value = '';
    },

    async archiveTask(taskId) {
        if (!confirm('Архивировать задачу?')) return;

        try {
            await api.archiveTask(taskId);
            await this.loadTasks();
        } catch (error) {
            console.error('Failed to archive task:', error);
            alert('Ошибка архивирования задачи');
        }
    },

    async deleteTask(taskId) {
        if (!confirm('Удалить задачу?')) return;

        try {
            await api.deleteTask(taskId);
            await this.loadTasks();
        } catch (error) {
            console.error('Failed to delete task:', error);
            alert('Ошибка удаления задачи');
        }
    },

    addTask(task) {
        const existing = this.tasks.find(t => t.id === task.id);
        if (!existing) {
            this.tasks.push(task);
            this.render();
        }
    },

    updateTask(task) {
        const index = this.tasks.findIndex(t => t.id === task.id);
        if (index !== -1) {
            this.tasks[index] = task;
            this.render();
        }
    },

    removeTask(taskId) {
        this.tasks = this.tasks.filter(t => t.id !== taskId);
        this.render();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
