const comments = {
    currentTaskId: null,
    currentSessionId: null,
    isCompletionMode: false,

    async show(taskId) {
        this.currentTaskId = taskId;
        this.currentSessionId = null;
        this.isCompletionMode = false;
        await this.loadComments(taskId);
        document.getElementById('commentsModal').style.display = 'block';
    },

    showForCompletion(taskId, sessionId) {
        this.currentTaskId = taskId;
        this.currentSessionId = sessionId || null;
        this.isCompletionMode = true;

        // Change modal title
        const modalTitle = document.querySelector('#commentsModal h2');
        if (modalTitle) {
            modalTitle.textContent = 'Добавить комментарий';
        }

        // Hide comments list, show only input
        document.getElementById('commentsList').style.display = 'none';

        // Show skip button
        const skipBtn = document.getElementById('skipCommentBtn');
        if (skipBtn) {
            skipBtn.style.display = 'block';
        }

        document.getElementById('commentsModal').style.display = 'block';

        // Focus on textarea
        const textarea = document.getElementById('newComment');
        if (textarea) {
            textarea.focus();
        }
    },

    close() {
        this.currentTaskId = null;
        this.isCompletionMode = false;
        document.getElementById('commentsModal').style.display = 'none';
        document.getElementById('commentsList').innerHTML = '';
        document.getElementById('commentsList').style.display = 'block';
        document.getElementById('newComment').value = '';

        // Hide skip button
        const skipBtn = document.getElementById('skipCommentBtn');
        if (skipBtn) {
            skipBtn.style.display = 'none';
        }

        // Reset modal title
        const modalTitle = document.querySelector('#commentsModal h2');
        if (modalTitle) {
            modalTitle.textContent = 'Комментарии';
        }
    },

    async loadComments(taskId) {
        try {
            const commentsList = await api.getComments(taskId);
            this.renderComments(commentsList);
        } catch (error) {
            console.error('Failed to load comments:', error);
        }
    },

    renderComments(commentsList) {
        const container = document.getElementById('commentsList');

        if (commentsList.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center;">Комментариев пока нет</p>';
            return;
        }

        container.innerHTML = commentsList.map(comment => {
            const date = new Date(comment.created_at).toLocaleString('ru-RU');
            const isOwner = comment.user_id === auth.currentUser.id;
            const username = comment.username || 'Пользователь';

            return `
                <div class="comment-item" data-comment-id="${comment.id}">
                    <div class="comment-header">
                        <span class="comment-author">${this.escapeHtml(username)}</span>
                        <span class="comment-date">${date}</span>
                    </div>
                    <div class="comment-text">${this.escapeHtml(comment.text)}</div>
                    ${isOwner ? `
                        <div class="comment-actions">
                            <button onclick="comments.editComment('${comment.id}', '${this.escapeHtml(comment.text)}')">Редактировать</button>
                            <button onclick="comments.deleteComment('${comment.id}')">Удалить</button>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    },

    async addComment() {
        const text = document.getElementById('newComment').value.trim();
        if (!text) return;

        try {
            // Add comment with session_id if available
            await api.createComment(this.currentTaskId, text, this.currentSessionId);
            document.getElementById('newComment').value = '';

            if (this.isCompletionMode) {
                // Complete the task automatically
                await api.completeTask(this.currentTaskId);

                // Reload tasks to show updated status
                await kanban.loadTasks();

                // Close modal only after successful completion
                this.close();
            } else {
                // Reload comments in modal
                await this.loadComments(this.currentTaskId);
            }
        } catch (error) {
            console.error('Failed to add comment:', error);
            alert('Ошибка добавления комментария: ' + (error.message || 'Неизвестная ошибка'));
        }
    },

    async editComment(commentId, currentText) {
        const newText = prompt('Редактировать комментарий:', currentText);
        if (!newText || newText === currentText) return;

        try {
            await api.updateComment(commentId, newText);
            await this.loadComments(this.currentTaskId);
        } catch (error) {
            console.error('Failed to update comment:', error);
            alert('Ошибка обновления комментария');
        }
    },

    async deleteComment(commentId) {
        if (!confirm('Удалить комментарий?')) return;

        try {
            await api.deleteComment(commentId);
            await this.loadComments(this.currentTaskId);
        } catch (error) {
            console.error('Failed to delete comment:', error);
            alert('Ошибка удаления комментария');
        }
    },

    async skipComment() {
        if (!this.isCompletionMode || !this.currentTaskId) return;

        try {
            // Complete the task without comment
            await api.completeTask(this.currentTaskId);

            // Reload tasks
            await kanban.loadTasks();

            // Close modal only after successful completion
            this.close();
        } catch (error) {
            console.error('Failed to complete task:', error);
            alert('Ошибка завершения задачи: ' + (error.message || 'Неизвестная ошибка'));
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
