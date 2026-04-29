const websocket = {
    ws: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: Infinity, // Unlimited reconnection attempts
    reconnectDelay: 1000,
    reconnectButtonShown: false,
    reconnectTimeout: null,

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return;
        }

        try {
            const wsUrl = api.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
            const token = localStorage.getItem('token');
            if (!token) {
                console.error('No authentication token available for WebSocket');
                return;
            }
            // Connect without token in URL for security
            this.ws = new WebSocket(`${wsUrl}/ws`);

            this.ws.onopen = () => {
                console.log('WebSocket connected, sending authentication...');
                // Send token in first message after connection
                this.ws.send(JSON.stringify({
                    type: 'auth',
                    token: token
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);

                    // Handle authentication success
                    if (message.type === 'auth_success') {
                        console.log('WebSocket authenticated successfully');
                        this.reconnectAttempts = 0;
                        this.reconnectButtonShown = false;
                        this.hideReconnectButton();
                        if (typeof notifications !== 'undefined') {
                            notifications.show('Подключено', 'WebSocket соединение восстановлено');
                        }
                        return;
                    }

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
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30s delay
        console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

        // Show reconnect button after 3 failed attempts
        if (this.reconnectAttempts >= 3 && !this.reconnectButtonShown) {
            this.showReconnectButton();
        }

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
        }, delay);
    },

    showReconnectButton() {
        this.reconnectButtonShown = true;
        if (typeof notifications !== 'undefined') {
            notifications.show('Соединение потеряно', 'Попытка переподключения... Вы можете обновить страницу вручную.');
        }

        // Add reconnect button to header if not exists
        const header = document.querySelector('.header');
        if (header && !document.getElementById('manualReconnectBtn')) {
            const btn = document.createElement('button');
            btn.id = 'manualReconnectBtn';
            btn.textContent = '🔄 Переподключить';
            btn.className = 'btn-reconnect';
            btn.style.cssText = 'margin-left: 10px; padding: 8px 16px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;';
            btn.onclick = () => {
                this.reconnectAttempts = 0;
                this.connect();
            };
            header.appendChild(btn);
        }
    },

    hideReconnectButton() {
        const btn = document.getElementById('manualReconnectBtn');
        if (btn) {
            btn.remove();
        }
    },

    disconnect() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
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

            case 'task_archived':
                kanban.removeTask(data.task.id);
                break;

            case 'task_restored':
                kanban.updateTask(data.task);
                notifications.show('Задача восстановлена', `${data.user.username} восстановил задачу: ${data.task.title}`);
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
