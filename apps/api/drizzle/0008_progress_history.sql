CREATE INDEX attempt_history_day_idx ON justgo.attempts (user_id, completion_date, ended_at, id) WHERE status = 'completed';
