-- Startowa biblioteka najczęściej używanych instrumentów CFD/Forex (sekcja 6.4).
-- Wartości (tick/kontrakt/pip) to typowe wartości referencyjne dla standardowych
-- kontraktów CFD - użytkownik może je dowolnie edytować lub dodać własne instrumenty,
-- to tylko punkt startowy, nie gwarancja zgodności z konkretnym brokerem.

INSERT INTO instruments (
    id, symbol, name, category, decimal_places, tick_size, tick_value_per_lot,
    contract_size, pip_size, quote_currency, settlement_currency, min_lot, lot_step,
    is_active, created_at, updated_at
) VALUES
('01978e6b-0001-7000-8000-000000000001', 'EURUSD', 'Euro / Dolar amerykański', 'forex', 5, '0.00001', '1', '100000', '0.0001', 'USD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000002', 'GBPUSD', 'Funt brytyjski / Dolar amerykański', 'forex', 5, '0.00001', '1', '100000', '0.0001', 'USD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000003', 'USDJPY', 'Dolar amerykański / Jen japoński', 'forex', 3, '0.001', '100', '100000', '0.01', 'JPY', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000004', 'USDCHF', 'Dolar amerykański / Frank szwajcarski', 'forex', 5, '0.00001', '1', '100000', '0.0001', 'CHF', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000005', 'AUDUSD', 'Dolar australijski / Dolar amerykański', 'forex', 5, '0.00001', '1', '100000', '0.0001', 'USD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000006', 'USDCAD', 'Dolar amerykański / Dolar kanadyjski', 'forex', 5, '0.00001', '1', '100000', '0.0001', 'CAD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000007', 'XAUUSD', 'Złoto / Dolar amerykański', 'metale', 2, '0.01', '1', '100', '0.01', 'USD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000008', 'XAGUSD', 'Srebro / Dolar amerykański', 'metale', 3, '0.001', '5', '5000', '0.001', 'USD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000009', 'US30', 'Dow Jones Industrial Average (CFD)', 'indeksy', 1, '1', '1', '1', '1', 'USD', 'USD', '0.1', '0.1', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000010', 'US500', 'S&P 500 (CFD)', 'indeksy', 1, '0.1', '1', '1', '0.1', 'USD', 'USD', '0.1', '0.1', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('01978e6b-0001-7000-8000-000000000011', 'BTCUSD', 'Bitcoin / Dolar amerykański', 'kryptowaluty', 2, '0.01', '0.01', '1', '1', 'USD', 'USD', '0.01', '0.01', 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
