-- Migration: Add file_changes column to tasks table (P5-5: Code Review)
-- Run this to update existing databases
-- Command: sqlite3 ~/.ralph/web/ralph.db < backend/ralph-web-server/migrations/add_file_changes.sql

-- Add file_changes column to tasks table
ALTER TABLE tasks ADD COLUMN file_changes TEXT;

-- Create index on file_changes for faster queries (optional)
-- CREATE INDEX idx_tasks_file_changes ON tasks(file_changes);
