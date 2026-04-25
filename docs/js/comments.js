const comments = {
    currentTaskId: null,

    async show(taskId) {
        this.currentTaskId = taskId;
        await this.loadComments(taskId);
        document.getElementById('commentsModal').style.display = 'block';
    },

    close() {
        this.currentTaskId = null;
        document.getElementById('commentsModal').style.display = 'none';
        document.getElementById('commentsList').innerHTML = '';
        document.getElementById('newComment').value = '';
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

            return `
                <div class="comment-item" data-comment-id="${comment.id}">
                    <div class="comment-header">
                        <span class="comment-author">Пользователь ${comment.user_id.substring(0, 8)}</span>
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
            await api.createComment(this.currentTaskId, text);
            document.getElementById('newComment').value = '';
            await this.loadComments(this.currentTaskId);
        } catch (error) {
            console.error('Failed to add comment:', error);
            alert('Ошибка добавления комментария');
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

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
