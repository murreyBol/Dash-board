# -*- coding: utf-8 -*-
"""
Планировщик задач с таймером для Windows
- Добавление задач с галочками
- Зачёркивание выполненных задач
- Таймер для отслеживания времени по каждой задаче
Использует только встроенный tkinter - установка пакетов не требуется.
"""

import tkinter as tk
from tkinter import ttk, font as tkfont
import json
from datetime import datetime
from pathlib import Path

DATA_FILE = Path(__file__).parent / "tasks_data.json"


class TaskPlannerApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Планировщик задач")
        self.geometry("700x650")
        self.minsize(500, 500)
        self.configure(bg="#2b2b2b")

        self.tasks = []
        self.time_tracking = {}
        self.timer_running = False
        self.current_task_id = None
        self.timer_seconds = 0
        self.after_id = None

        self.load_data()
        self.create_ui()

    def create_ui(self):
        style = {"bg": "#2b2b2b", "fg": "white", "font": ("Segoe UI", 10)}
        frame_style = {"bg": "#3d3d3d", "padx": 15, "pady": 15}

        main = tk.Frame(self, bg="#2b2b2b", padx=20, pady=20)
        main.pack(fill="both", expand=True)

        # === ТАЙМЕР ===
        timer_fr = tk.Frame(main, bg="#3d3d3d", padx=15, pady=15)
        timer_fr.pack(fill="x", pady=(0, 15))

        tk.Label(timer_fr, text="Таймер", bg="#3d3d3d", fg="white", font=("Segoe UI", 14, "bold")).pack(anchor="w")

        row1 = tk.Frame(timer_fr, bg="#3d3d3d")
        row1.pack(fill="x", pady=10)

        self.task_var = tk.StringVar(value="Выберите задачу")
        self.task_dropdown = ttk.Combobox(row1, textvariable=self.task_var, width=28, state="readonly")
        self.task_dropdown.pack(side="left", padx=(0, 10))
        self.task_dropdown.bind("<<ComboboxSelected>>", self._on_dropdown_select)

        self.timer_label = tk.Label(row1, text="00:00:00", bg="#3d3d3d", fg="white", font=("Segoe UI", 20, "bold"))
        self.timer_label.pack(side="left", padx=10)

        self.start_btn = tk.Button(row1, text="Старт", command=self.start_timer, width=10, bg="#0d7377", fg="white", relief="flat", cursor="hand2")
        self.start_btn.pack(side="left", padx=5)
        self.stop_btn = tk.Button(row1, text="Стоп", command=self.stop_timer, width=10, bg="#555", fg="white", relief="flat", state="disabled", cursor="hand2")
        self.stop_btn.pack(side="left", padx=5)

        # === ЗАДАЧИ ===
        tasks_hdr = tk.Frame(main, bg="#2b2b2b")
        tasks_hdr.pack(fill="x", pady=(0, 10))

        tk.Label(tasks_hdr, text="Мои задачи", bg="#2b2b2b", fg="white", font=("Segoe UI", 14, "bold")).pack(side="left")

        self.add_task_entry = tk.Entry(tasks_hdr, width=30, font=("Segoe UI", 11), bg="#3d3d3d", fg="white", insertbackground="white")
        self.add_task_entry.pack(side="left", padx=10)
        self.add_task_entry.bind("<Return>", lambda e: self.add_task())

        tk.Button(tasks_hdr, text="+ Добавить", command=self.add_task, width=12, bg="#0d7377", fg="white", relief="flat", cursor="hand2").pack(side="left")

        # Список задач с прокруткой
        list_container = tk.Frame(main, bg="#3d3d3d")
        list_container.pack(fill="both", expand=True, pady=(0, 15))

        canvas = tk.Canvas(list_container, bg="#3d3d3d", highlightthickness=0)
        scrollbar = ttk.Scrollbar(list_container)
        self.tasks_frame = tk.Frame(canvas, bg="#3d3d3d")
        self.tasks_frame_window = canvas.create_window((0, 0), window=self.tasks_frame, anchor="nw")

        scrollbar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=canvas.yview)
        canvas.config(yscrollcommand=scrollbar.set)

        def _config_scroll(*args):
            canvas.configure(scrollregion=canvas.bbox("all"))
        self.tasks_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda e: canvas.itemconfig(self.tasks_frame_window, width=e.width))

        # === ВРЕМЯ ПО ЗАДАЧАМ ===
        time_fr = tk.Frame(main, bg="#3d3d3d", padx=15, pady=15)
        time_fr.pack(fill="x")

        tk.Label(time_fr, text="Время по задачам", bg="#3d3d3d", fg="white", font=("Segoe UI", 12, "bold")).pack(anchor="w", pady=(0, 8))

        self.time_list_frame = tk.Frame(time_fr, bg="#3d3d3d")
        self.time_list_frame.pack(fill="x")

        self.refresh_ui()

    def _on_dropdown_select(self, event=None):
        choice = self.task_var.get()
        if choice == "Выберите задачу":
            self.current_task_id = None
            return
        for t in self.tasks:
            if t["text"] == choice:
                self.current_task_id = t["id"]
                break

    def load_data(self):
        if DATA_FILE.exists():
            try:
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    self.tasks = data.get("tasks", [])
                    self.time_tracking = data.get("time_tracking", {})
            except Exception:
                self.tasks = []
                self.time_tracking = {}

    def save_data(self):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump({"tasks": self.tasks, "time_tracking": self.time_tracking}, f, ensure_ascii=False, indent=2)

    def add_task(self):
        text = self.add_task_entry.get().strip()
        if not text:
            return
        task_id = str(datetime.now().timestamp())
        self.tasks.append({"id": task_id, "text": text, "completed": False})
        self.add_task_entry.delete(0, "end")
        self.save_data()
        self.refresh_ui()

    def toggle_task(self, task_id):
        for t in self.tasks:
            if t["id"] == task_id:
                t["completed"] = not t["completed"]
                break
        self.save_data()
        self.refresh_ui()

    def delete_task(self, task_id):
        self.tasks = [t for t in self.tasks if t["id"] != task_id]
        if self.current_task_id == task_id:
            self.stop_timer()
        self.save_data()
        self.refresh_ui()

    def start_timer(self):
        if self.current_task_id is None or self.timer_running:
            return
        self.timer_running = True
        self.start_btn.config(state="disabled")
        self.stop_btn.config(state="normal")
        self.tick_timer()

    def stop_timer(self):
        if not self.timer_running:
            return
        self.timer_running = False
        self.start_btn.config(state="normal")
        self.stop_btn.config(state="disabled")
        if self.after_id:
            self.after_cancel(self.after_id)
            self.after_id = None
        if self.current_task_id and self.timer_seconds > 0:
            tid = self.current_task_id
            self.time_tracking[tid] = self.time_tracking.get(tid, 0) + self.timer_seconds
            self.save_data()
        self.timer_seconds = 0
        self.update_timer_display()
        self.refresh_time_list()

    def tick_timer(self):
        if self.timer_running:
            self.timer_seconds += 1
            self.update_timer_display()
            self.after_id = self.after(1000, self.tick_timer)

    def update_timer_display(self):
        h = self.timer_seconds // 3600
        m = (self.timer_seconds % 3600) // 60
        s = self.timer_seconds % 60
        self.timer_label.config(text=f"{h:02d}:{m:02d}:{s:02d}")

    def format_time(self, seconds):
        h = seconds // 3600
        m = (seconds % 3600) // 60
        s = seconds % 60
        if h > 0:
            return f"{h} ч {m} мин"
        elif m > 0:
            return f"{m} мин {s} сек"
        return f"{s} сек"

    def refresh_ui(self):
        for w in self.tasks_frame.winfo_children():
            w.destroy()

        task_texts = ["Выберите задачу"]
        for t in self.tasks:
            row = tk.Frame(self.tasks_frame, bg="#3d3d3d")
            row.pack(fill="x", pady=3)

            var = tk.BooleanVar(value=t["completed"])
            cb = tk.Checkbutton(
                row, variable=var, bg="#3d3d3d", activebackground="#3d3d3d",
                selectcolor="#0d7377", command=lambda tid=t["id"]: self.toggle_task(tid)
            )
            cb.pack(side="left", padx=(0, 10), pady=5)

            fnt = tkfont.Font(family="Segoe UI", size=11, overstrike=t["completed"])
            lbl = tk.Label(row, text=t["text"], font=fnt, bg="#3d3d3d", fg="white", anchor="w")
            lbl.pack(side="left", fill="x", expand=True, padx=(0, 10), pady=5)

            tk.Button(row, text="X", command=lambda tid=t["id"]: self.delete_task(tid),
                      width=3, bg="#555", fg="white", relief="flat", cursor="hand2").pack(side="right", pady=5)

            task_texts.append(t["text"])

        self.task_dropdown["values"] = task_texts
        if self.task_var.get() not in task_texts:
            self.task_var.set("Выберите задачу")
            self.current_task_id = None

        self.refresh_time_list()

    def refresh_time_list(self):
        for w in self.time_list_frame.winfo_children():
            w.destroy()

        if not self.time_tracking:
            tk.Label(self.time_list_frame, text="Пока нет данных о времени", bg="#3d3d3d", fg="gray").pack(anchor="w")
            return

        task_by_id = {t["id"]: t["text"] for t in self.tasks}
        for tid, seconds in sorted(self.time_tracking.items(), key=lambda x: -x[1]):
            name = task_by_id.get(tid, "(удалённая задача)")
            tk.Label(self.time_list_frame, text=f"  {name}: {self.format_time(seconds)}",
                     bg="#3d3d3d", fg="white", font=("Segoe UI", 10)).pack(anchor="w", pady=2)


def main():
    app = TaskPlannerApp()
    app.mainloop()


if __name__ == "__main__":
    main()
