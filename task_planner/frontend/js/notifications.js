const notifications = {
    permission: 'default',

    async init() {
        if ('Notification' in window) {
            this.permission = Notification.permission;
            if (this.permission === 'default') {
                this.permission = await Notification.requestPermission();
            }
        }
    },

    show(title, body) {
        if (this.permission === 'granted') {
            new Notification(title, {
                body: body,
                icon: '/favicon.ico',
                badge: '/favicon.ico'
            });
        }
    },

    async requestPermission() {
        if ('Notification' in window && this.permission !== 'granted') {
            this.permission = await Notification.requestPermission();
            return this.permission === 'granted';
        }
        return false;
    }
};
