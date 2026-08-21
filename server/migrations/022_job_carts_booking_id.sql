-- Add booking_id to job_carts to link a job cart back to its originating booking
ALTER TABLE job_carts
  ADD COLUMN booking_id INT UNSIGNED NULL AFTER created_by,
  ADD INDEX idx_booking_id (booking_id);
