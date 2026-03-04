-- SQLite schema for Family Organizer
-- This file documents the logical schema. Authoritative source is backend/prisma/schema.prisma.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    pin_hash TEXT,
    role TEXT NOT NULL DEFAULT 'MEMBER',
    auth_provider TEXT NOT NULL DEFAULT 'local',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    color_hex TEXT,
    last_login_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE TABLE user_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT NOT NULL DEFAULT 'default',
    dashboard_config TEXT,
    hidden_tabs TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_secrets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    secret_type TEXT NOT NULL,
    encrypted_value BLOB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, secret_type)
);

CREATE TABLE google_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    display_name TEXT,
    encrypted_refresh_token BLOB NOT NULL,
    last_synced_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, email)
);

CREATE TABLE linked_calendars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_account_id INTEGER REFERENCES google_accounts(id) ON DELETE SET NULL,
    google_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    color_hex TEXT,
    access_role TEXT NOT NULL,
    sync_token TEXT,
    last_synced_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, google_id)
);

CREATE TABLE family_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    linked_calendar_id INTEGER REFERENCES linked_calendars(id) ON DELETE SET NULL,
    source TEXT NOT NULL CHECK (source IN ('GOOGLE','LOCAL')),
    source_event_id TEXT,
    title TEXT NOT NULL,
    description TEXT,
    start_at DATETIME NOT NULL,
    end_at DATETIME NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL,
    color_hex TEXT,
    location TEXT,
    attendees TEXT,
    etag TEXT,
    visibility TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_family_events_range ON family_events(start_at, end_at);

CREATE TABLE task_recurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    frequency TEXT NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    by_day TEXT,
    by_month_day TEXT,
    until DATETIME,
    count INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_at DATETIME,
    priority INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN',
    recurrence_id INTEGER REFERENCES task_recurrences(id) ON DELETE SET NULL,
    labels TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at DATETIME
);

CREATE TABLE task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'OPEN',
    progress_note TEXT,
    completed_at DATETIME,
    UNIQUE(task_id, user_id)
);
CREATE INDEX idx_task_assignments_user ON task_assignments(user_id, status);

CREATE TABLE task_status_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_task_status_changes ON task_status_changes(task_id, created_at);

CREATE TABLE chores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    rotation_type TEXT NOT NULL CHECK (rotation_type IN ('ROUND_ROBIN','WEIGHTED','MANUAL')),
    frequency TEXT NOT NULL,
    interval INTEGER NOT NULL DEFAULT 1,
    eligible_user_ids TEXT NOT NULL,
    weight_map_json TEXT,
    reward_points INTEGER DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chore_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chore_id INTEGER NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    window_start DATETIME NOT NULL,
    window_end DATETIME NOT NULL,
    state TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | IN_PROGRESS | COMPLETED | SNOOZED | SKIPPED
    rotation_order INTEGER,
    notes TEXT,
    completed_at DATETIME,
    verified_by_id INTEGER REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_chore_assignments_state ON chore_assignments(state);

CREATE TABLE grocery_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    store TEXT,
    preset_key TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE grocery_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    quantity REAL DEFAULT 1,
    unit TEXT,
    state TEXT NOT NULL DEFAULT 'NEEDED',  -- NEEDED | CLAIMED | IN_CART | PURCHASED
    assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    claimed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    pantry_item_key TEXT,
    sort_order INTEGER,
    notes TEXT,
    moved_to_inventory_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_grocery_items_state ON grocery_items(state);

CREATE TABLE inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit TEXT,
    pantry_item_key TEXT UNIQUE,
    low_stock_threshold REAL,
    notes TEXT,
    date_added DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_inventory_items_name ON inventory_items(name);

CREATE TABLE reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    title TEXT NOT NULL,
    message TEXT,
    channel_mask INTEGER NOT NULL DEFAULT 1,
    lead_time_minutes INTEGER DEFAULT 0,
    quiet_hours_start TEXT,
    quiet_hours_end TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reminder_triggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
    channel TEXT NOT NULL,
    next_fire_at DATETIME NOT NULL,
    last_attempt_at DATETIME,
    last_status TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_reminder_triggers_next ON reminder_triggers(next_fire_at);

CREATE TABLE attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    content_type TEXT,
    byte_size INTEGER,
    checksum TEXT,
    linked_entity_type TEXT,
    linked_entity_id INTEGER,
    scanned INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE notification_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reminder_id INTEGER REFERENCES reminders(id) ON DELETE SET NULL,
    channel TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    error_detail TEXT,
    sent_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notification_logs_user ON notification_logs(user_id, created_at);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);

CREATE TABLE household_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,  -- JSON-serialized value
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id INTEGER,
    payload TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE search_index (
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX idx_search_index_content ON search_index(content);
