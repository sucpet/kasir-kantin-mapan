-- Tambah kolom stok ke menu_items
ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS stock integer,
  ADD COLUMN IF NOT EXISTS stock_threshold integer NOT NULL DEFAULT 3;

-- ================================================================
-- Trigger 1: Decrease stock saat order di-UPDATE dari open → paid
-- (untuk customer orders dan kasir open-tab yang dikonfirmasi)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_decrease_stock_on_pay()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status != 'paid' AND NEW.status = 'paid' THEN
    UPDATE menu_items m
    SET stock = GREATEST(0, m.stock - oi.qty)
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.menu_item_id = m.id
      AND m.stock IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_decrease_stock_on_pay ON orders;
CREATE TRIGGER trg_decrease_stock_on_pay
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_decrease_stock_on_pay();

-- ================================================================
-- Trigger 2: Decrease stock saat order_item di-INSERT ke order yg
-- sudah 'paid' (untuk kasir immediate-pay: INSERT langsung sebagai paid)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_decrease_stock_on_item_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM orders WHERE id = NEW.order_id;
  IF v_status = 'paid' AND NEW.menu_item_id IS NOT NULL THEN
    UPDATE menu_items
    SET stock = GREATEST(0, stock - NEW.qty)
    WHERE id = NEW.menu_item_id
      AND stock IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_decrease_stock_on_item_insert ON order_items;
CREATE TRIGGER trg_decrease_stock_on_item_insert
  AFTER INSERT ON order_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_decrease_stock_on_item_insert();
