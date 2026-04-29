-- Add session_id column to comments table
ALTER TABLE comments ADD COLUMN session_id VARCHAR REFERENCES time_sessions(id);

-- Create index for better query performance
CREATE INDEX idx_comments_session_id ON comments(session_id);
