-- LearnSnap - Clean Up Test Devices
-- Run this in Neon SQL Editor to remove test data
-- This will NOT affect real user data

-- ============================================
-- Preview: Show test devices that will be deleted
-- ============================================
SELECT device_id, pages_remaining, total_pages_used, created_at
FROM page_credits
WHERE device_id LIKE 'test-%'
   OR device_id LIKE 'smoke-%'
   OR device_id LIKE 'idempotency-%'
   OR device_id LIKE 'payment-test-%'
   OR device_id LIKE 'new-device-%'
   OR device_id LIKE 'google_%'
ORDER BY created_at DESC;

-- ============================================
-- Delete test devices from page_credits
-- ============================================
DELETE FROM page_credits
WHERE device_id LIKE 'test-%'
   OR device_id LIKE 'smoke-%'
   OR device_id LIKE 'idempotency-%'
   OR device_id LIKE 'payment-test-%'
   OR device_id LIKE 'new-device-%'
   OR device_id LIKE 'google_%';

-- ============================================
-- Verify cleanup
-- ============================================
SELECT 
    'Remaining real devices' as description,
    COUNT(*) as count
FROM page_credits
WHERE device_id NOT LIKE 'test-%'
  AND device_id NOT LIKE 'smoke-%'
  AND device_id NOT LIKE 'idempotency-%'
  AND device_id NOT LIKE 'payment-test-%'
  AND device_id NOT LIKE 'new-device-%'
  AND device_id NOT LIKE 'google_%';

-- Show remaining devices
SELECT device_id, pages_remaining, total_pages_used, is_early_adopter
FROM page_credits
ORDER BY created_at DESC;
