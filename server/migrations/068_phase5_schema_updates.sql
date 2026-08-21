ALTER TABLE users ADD COLUMN custom_role_id INT NULL;
ALTER TABLE users ADD CONSTRAINT fk_users_custom_role FOREIGN KEY (custom_role_id) REFERENCES v2_roles(id);
ALTER TABLE users ADD COLUMN base_salary DECIMAL(10,2) DEFAULT 15000.00;

ALTER TABLE v2_review_requests ADD COLUMN feedback_token VARCHAR(64) NULL;

INSERT IGNORE INTO v2_permissions (permission_key, module, action, description) VALUES
('tasks.view', 'tasks', 'view', 'View tasks assigned or all tasks'),
('tasks.create', 'tasks', 'create', 'Assign tasks to staff'),
('tasks.edit', 'tasks', 'edit', 'Update task status or details'),
('leaves.view', 'leaves', 'view', 'View leave applications'),
('leaves.create', 'leaves', 'create', 'Request leaves'),
('leaves.approve', 'leaves', 'approve', 'Approve/reject leave requests'),
('payroll.view', 'payroll', 'view', 'View payroll details and slips'),
('payroll.process', 'payroll', 'process', 'Process staff salaries'),
('feedback.view', 'feedback', 'view', 'View customer feedback'),
('feedback.reply', 'feedback', 'reply', 'Reply to customer feedback'),
('feedback.publish', 'feedback', 'publish', 'Publish feedback to public site');
