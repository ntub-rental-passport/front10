CREATE TABLE IF NOT EXISTS inspection_photo_details (
  record_id INT NOT NULL PRIMARY KEY,
  item_id INT NOT NULL,
  angle VARCHAR(20) NOT NULL DEFAULT 'other',
  provenance JSON NOT NULL,
  superseded_by INT NULL,
  removed_at TIMESTAMP NULL,
  INDEX ix_inspection_photo_details_item_id (item_id),
  FOREIGN KEY (record_id) REFERENCES inspection_records(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES inspection_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
