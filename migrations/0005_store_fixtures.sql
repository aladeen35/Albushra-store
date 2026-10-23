-- How each section is shown in the 3D store room: rack (hanging rail), kids (low rail),
-- shelf (shoe shelves) or pegboard (caps and hats).
ALTER TABLE categories ADD COLUMN display TEXT NOT NULL DEFAULT 'rack';
UPDATE categories SET display = 'pegboard' WHERE slug = 'hats';
INSERT INTO categories (slug, name, sort_order, display) VALUES
  ('formal', 'رجالي رسمي', 8, 'rack'),
  ('kids', 'أطفالي', 9, 'kids'),
  ('shoes', 'أحذية', 10, 'shelf');
