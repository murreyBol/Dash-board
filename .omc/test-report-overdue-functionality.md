# Overdue Button Functionality Test Report

**Date:** 2026-04-25  
**Tester:** worker-4  
**Task:** #10 - Test overdue button functionality

## Executive Summary

**Status:** ❌ CRITICAL ISSUES FOUND - Backend implementation missing

The overdue button functionality is **NOT working** because the backend endpoint `/tasks/overdue` does not exist. The frontend code expects this endpoint but the backend has not implemented it.

## Test Results

### 1. Backend Endpoint Verification ❌ FAILED

**Expected:** `GET /tasks/overdue` endpoint exists in `backend/main.py`  
**Actual:** Endpoint does not exist

**Evidence:**
- Searched `backend/main.py` (369 lines) - no `/tasks/overdue` route found
- Frontend `api.js` line 200-202 expects this endpoint:
  ```javascript
  async getOverdueTasks() {
      return this.request('/tasks/overdue');
  }
  ```

### 2. Inactivity Calculation Logic ❌ NOT IMPLEMENTED

**Expected:** Function in `backend/crud.py` to calculate 7+ days of inactivity  
**Actual:** No such function exists

**Evidence:**
- Searched `backend/crud.py` (220 lines) - no overdue calculation logic
- No function to check `updated_at`, `comments`, or `time_sessions` for activity

**Required Logic:**
A task should be considered overdue if:
- Last activity (task update, comment, or timer session) was 7+ days ago
- Task is not archived (`status != 'archived'`)
- Task is not completed (`status != 'completed'`)

### 3. Frontend Implementation ⚠️ PARTIALLY CORRECT

**File:** `docs/js/app.js` lines 150-185

**Current Implementation:**
```javascript
async showOverdue() {
    try {
        const overdueTasks = kanban.tasks.filter(task =>
            task.priority === 'overdue' && task.status !== 'archived'
        );
        this.renderOverdue(overdueTasks);
        document.getElementById('overdueModal').style.display = 'block';
    } catch (error) {
        console.error('Failed to load overdue tasks:', error);
        alert('Ошибка загрузки просроченных задач');
    }
}
```

**Issues:**
1. ❌ Filters by `priority === 'overdue'` instead of calling backend API
2. ❌ "overdue" is not a valid priority in `models.py` (only: urgent, medium, low, future)
3. ✅ Modal display logic is correct
4. ✅ Renders tasks correctly with `renderOverdue()`

### 4. Modal Display ✅ CORRECT

**File:** `docs/index.html` lines 173-179

```html
<div id="overdueModal" class="modal">
    <div class="modal-content">
        <span class="close" onclick="app.closeOverdueModal()">&times;</span>
        <h2>⏰ Просроченные задачи</h2>
        <div id="overdueList"></div>
    </div>
</div>
```

**Status:** ✅ Modal structure is correct

### 5. Button Integration ✅ CORRECT

**File:** `docs/index.html` line 41

```html
<button onclick="app.showOverdue()">⏰ Просрочка</button>
```

**Status:** ✅ Button correctly calls `app.showOverdue()`

## Edge Cases Analysis

### Test Case 1: Task with exactly 7 days inactivity
**Expected:** Should appear in overdue list  
**Actual:** Cannot test - backend not implemented

### Test Case 2: Task with comments but no updates
**Expected:** Comment activity should reset inactivity timer  
**Actual:** Cannot test - backend not implemented

### Test Case 3: Task with timer sessions
**Expected:** Timer activity should reset inactivity timer  
**Actual:** Cannot test - backend not implemented

### Test Case 4: Archived tasks
**Expected:** Should NOT appear in overdue list  
**Actual:** Frontend filters correctly, but backend needed

### Test Case 5: Completed tasks
**Expected:** Should NOT appear in overdue list  
**Actual:** Cannot test - backend not implemented

## Database Schema Analysis

**File:** `backend/models.py`

**Task Model Fields:**
- `updated_at` - Last task update timestamp ✅
- `created_at` - Task creation timestamp ✅
- `status` - Task status (todo, in_progress, completed, postponed, archived) ✅
- `priority` - Task priority (urgent, medium, low, future) ⚠️ NO "overdue" priority

**Related Models:**
- `Comment` - Has `created_at` for activity tracking ✅
- `TimeSession` - Has `started_at` and `ended_at` for activity tracking ✅

## Required Implementation

### Backend Changes Needed:

1. **Add endpoint to `backend/main.py`:**
```python
@app.get("/tasks/overdue", response_model=List[schemas.Task])
async def get_overdue_tasks(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    return crud.get_overdue_tasks(db)
```

2. **Add function to `backend/crud.py`:**
```python
def get_overdue_tasks(db: Session):
    # Calculate tasks with 7+ days of inactivity
    # Check: task.updated_at, latest comment, latest time_session
    # Exclude: archived and completed tasks
    pass
```

3. **Add schema to `backend/schemas.py`** (if needed)

### Frontend Changes Needed:

1. **Update `docs/js/app.js` line 150-161:**
```javascript
async showOverdue() {
    try {
        const overdueTasks = await api.getOverdueTasks();
        this.renderOverdue(overdueTasks);
        document.getElementById('overdueModal').style.display = 'block';
    } catch (error) {
        console.error('Failed to load overdue tasks:', error);
        alert('Ошибка загрузки просроченных задач');
    }
}
```

2. **Update `renderOverdue()` to show last activity date** (line 167-185)

## Blockers

1. ❌ Backend endpoint `/tasks/overdue` does not exist
2. ❌ Inactivity calculation logic not implemented
3. ⚠️ Frontend uses incorrect filter (`priority === 'overdue'`)

## Recommendations

1. **Implement backend first** - Tasks #8 (inactivity detection) must be completed
2. **Update frontend** - Task #9 (update showOverdue) must be completed
3. **Remove "overdue" priority** - Task #7 (remove from priorities) must be completed
4. **Add last activity date** - Display in modal for user visibility
5. **Add integration tests** - Test full flow from backend to frontend

## Conclusion

The overdue button functionality **CANNOT be tested** in its current state because:
- Backend endpoint is missing
- Inactivity calculation logic is not implemented
- Frontend uses incorrect filtering logic

**Blocking Tasks:**
- Task #7: Remove "Просрочка" from task priorities
- Task #8: Implement 7-day inactivity detection logic
- Task #9: Update showOverdue() to use inactivity calculation

**Next Steps:**
1. Complete backend implementation (Task #8)
2. Update frontend to call backend API (Task #9)
3. Remove "overdue" from priority enum (Task #7)
4. Re-test full functionality

---

**Test Status:** ❌ BLOCKED - Cannot proceed without backend implementation
