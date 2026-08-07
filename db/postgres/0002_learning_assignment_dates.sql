CREATE OR REPLACE VIEW learning_assignments_view AS
SELECT t.id, t.training_program, t.employee_id, t.completion_status, t.completion_date,
  t.training_hours, t.assessment_score, t.department, t.data_source, t.updated_at,
  COALESCE(w.due_at, w.details_json::jsonb ->> 'dueDate') AS due_date,
  COALESCE(w.assigned_at, w.created_at, t.updated_at) AS assigned_at
FROM training_records t
LEFT JOIN workflow_requests w ON w.id = t.id AND w.type = 'training'
UNION ALL
SELECT a.id, c.title, a.employee_id, a.status, a.completed_at, a.assigned_hours,
  a.assessment_score, COALESCE(e.department, ''), a.data_source, a.updated_at,
  a.due_date, a.assigned_at
FROM course_assignments a
JOIN learning_courses c ON c.id = a.course_id
LEFT JOIN employees e ON e.employee_id = a.employee_id
WHERE NOT EXISTS (SELECT 1 FROM training_records t WHERE t.id = a.id);
