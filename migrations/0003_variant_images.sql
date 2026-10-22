-- Per-color images: when set, they replace the product images for that variant (JSON array: [front, back, ...]).
ALTER TABLE variants ADD COLUMN images TEXT;
