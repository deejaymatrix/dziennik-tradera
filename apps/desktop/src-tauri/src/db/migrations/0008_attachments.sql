-- Faza 6 modyfikacji przed instalatorem: załączniki (zdjęcia i linki) na transakcji.
-- Tabela `attachments` istnieje od 0001_init (kind/file_path/url/sha256/size_bytes/tag), ale
-- nigdy nie miała ani opisu (zdjęcia) / nazwy (linku), ani kolejności - obie kolumny dodane tu
-- w miejscu (ALTER TABLE), bez DROP+recreate, bo tabela ma już żywe odwołanie FK z `trades`.
ALTER TABLE attachments ADD COLUMN label TEXT;
ALTER TABLE attachments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_attachments_trade_sort ON attachments (trade_id, sort_order);
