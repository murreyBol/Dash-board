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

        // Update counts with limit indicator
        Object.keys(counts).forEach(priority => {
            const countEl = document.querySelector(`[data-priority="${priority}"] .task-count`);
            if (countEl) {
                const count = counts[priority];
                countEl.textContent = `${count}/20`;
                if (count >= 20) {
                    countEl.style.color = '#e74c3c';
                    countEl.style.fontWeight = 'bold';
                } else {
                    countEl.style.color = '';
                    countEl.style.fontWeight = '';
                }
            }
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
        if (task.status === 'in_progress') {
            statusBadges.push('<span class="status-badge in-progress">▶ В работе</span>');
        }

        // Get assignee username
        let assigneeHtml = '';
        if (task.assigned_to) {
            const assignee = app.users.find(u => u.id === task.assigned_to);
            const username = assignee ? assignee.username : 'Пользователь';
            const initials = username.substring(0, 2).toUpperCase();
            assigneeHtml = `
                <div class="task-assignee-badge">
                    <div class="assignee-avatar-small">${initials}</div>
                    <span class="assignee-name">${this.escapeHtml(username)}</span>
                </div>
            `;
        } else {
            assigneeHtml = '<div class="task-assignee-badge unassigned">Не назначена</div>';
        }

        const isTimerRunning = timer.isRunning(task.id);
        const timerHtml = isTimerRunning ? '<div class="task-timer"></div>' : '';

        card.innerHTML = `
            ${assigneeHtml}
            <div class="task-header">
                <div class="task-title clickable" onclick="kanban.toggleComments('${task.id}')">
                    <span class="expand-icon">▶</span> ${this.escapeHtml(task.title)}
                </div>
                <div class="task-status">${statusBadges.join('')}</div>
            </div>
            ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
            <div class="task-comments-section" id="comments-${task.id}" style="display: none;">
                <div class="comments-loading">Загрузка комментариев...</div>
            </div>
            <div class="task-meta">
                ${timerHtml}
            </div>
            <div class="task-actions">
                <button class="btn-edit" onclick="kanban.editTask('${task.id}')">✏️ Редактировать</button>
                ${!task.assigned_to || task.assigned_to !== auth.currentUser.id ?
                    `<button class="btn-assign" onclick="kanban.assignToMe('${task.id}')">Взять</button>` : ''}
                ${task.assigned_to === auth.currentUser.id && task.status !== 'completed' ? `
                    <button class="btn-timer" onclick="kanban.toggleTimer('${task.id}')">
                        ${isTimerRunning ? '⏸ Стоп' : '▶ Старт'}
                    </button>
                ` : ''}
                ${task.status !== 'completed' ?
                    `<button class="btn-complete" onclick="kanban.completeTask('${task.id}')">✓ Выполнено</button>` : ''}
                ${task.status === 'completed' ?
                    `<button class="btn-archive" onclick="kanban.archiveTask('${task.id}')">📦 Архив</button>` : ''}
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
            // Check if target column has space
            const tasksInColumn = this.tasks.filter(t =>
                t.priority === newPriority && t.status !== 'archived' && t.id !== taskId
            ).length;

            if (tasksInColumn >= 20) {
                alert('Колонка заполнена (максимум 20 задач)');
                return;
            }

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

    editTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        this.currentEditingTask = taskId;
        document.getElementById('taskModalTitle').textContent = 'Редактировать задачу';
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskPriority').value = task.priority;
        app.populateAssigneeSelect();
        document.getElementById('taskAssignee').value = task.assigned_to || '';
        document.getElementById('taskModal').style.display = 'block';
    },

    async toggleComments(taskId) {
        const commentsSection = document.getElementById(`comments-${taskId}`);
        const expandIcon = event.target.closest('.task-title').querySelector('.expand-icon');

        if (!commentsSection) return;

        if (commentsSection.style.display === 'none') {
            // Expand - load and show comments
            commentsSection.style.display = 'block';
            expandIcon.textContent = '▼';
            await this.loadCommentsInline(taskId);
        } else {
            // Collapse
            commentsSection.style.display = 'none';
            expandIcon.textContent = '▶';
        }
    },

    async loadCommentsInline(taskId) {
        const commentsSection = document.getElementById(`comments-${taskId}`);
        if (!commentsSection) return;

        try {
            const comments = await api.getComments(taskId);

            if (comments.length === 0) {
                commentsSection.innerHTML = '<div class="no-comments">Нет комментариев</div>';
                return;
            }

            const commentsHtml = comments.map(comment => {
                const date = new Date(comment.created_at).toLocaleString('ru-RU');
                const username = comment.username || 'Пользователь';

                // Format session duration if available
                let timeInfo = '';
                if (comment.session_duration) {
                    const duration = timer.formatDuration(comment.session_duration);
                    timeInfo = ` <span style="color: #3498db;">(Время: ${duration})</span>`;
                }

                return `
                    <div class="inline-comment">
                        <div class="comment-header">
                            <strong>${this.escapeHtml(username)}</strong>
                            <span class="comment-date">${date}</span>
                        </div>
                        <div class="comment-text">${this.escapeHtml(comment.text)}${timeInfo}</div>
                    </div>
                `;
            }).join('');

            commentsSection.innerHTML = commentsHtml;
        } catch (error) {
            console.error('Failed to load comments:', error);
            commentsSection.innerHTML = '<div class="error-comments">Ошибка загрузки комментариев</div>';
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
