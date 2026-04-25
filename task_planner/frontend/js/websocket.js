const websocket = {
    ws: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    reconnectDelay: 1000,

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            this.ws = new WebSocket('ws://localhost:8000/ws');

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.reconnectAttempts = 0;
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.reconnect();
            };
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.reconnect();
        }
    },

    reconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`Reconnecting in ${delay}ms...`);
            setTimeout(() => this.connect(), delay);
        }
    },

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    },

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    },

    handleMessage(message) {
        const { type, data } = message;

        switch (type) {
            case 'task_created':
                kanban.addTask(data.task);
                break;

            case 'task_updated':
                kanban.updateTask(data.task);
                break;

            case 'task_deleted':
                kanban.removeTask(data.task_id);
                break;

            case 'task_assigned':
                kanban.updateTask(data.task);
                if (data.assigned_to_me) {
                    notifications.show('Вам назначена задача', data.task.title);
                }
                break;

            case 'task_completed':
                kanban.updateTask(data.task);
                break;

            case 'task_postponed':
                kanban.updateTask(data.task);
                break;

            case 'timer_started':
                kanban.updateTask(data.task);
                break;

            case 'timer_stopped':
                kanban.updateTask(data.task);
                break;

            case 'comment_added':
                if (data.is_my_task && data.user.id !== auth.currentUser.id) {
                    notifications.show('Новый комментарий', `${data.user.username} прокомментировал вашу задачу`);
                }
                if (comments.currentTaskId === data.task.id) {
                    comments.loadComments(data.task.id);
                }
                break;

            case 'comment_updated':
                if (comments.currentTaskId === data.task_id) {
                    comments.loadComments(data.task_id);
                }
                break;

            case 'comment_deleted':
                if (comments.currentTaskId === data.task_id) {
                    comments.loadComments(data.task_id);
                }
                break;

            case 'user_online':
                console.log('User online:', data.username);
                break;

            case 'user_offline':
                console.log('User offline:', data.user_id);
                break;

            default:
                console.log('Unknown message type:', type);
        }
    }
};
