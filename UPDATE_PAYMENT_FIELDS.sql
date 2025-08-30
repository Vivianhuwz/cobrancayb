-- 更新debt_records表以支持付款记录
-- 在Supabase控制台的SQL编辑器中执行此脚本

-- 添加付款相关字段
ALTER TABLE public.debt_records 
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(15,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'::jsonb;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_debt_records_paid_amount ON public.debt_records(paid_amount);
CREATE INDEX IF NOT EXISTS idx_debt_records_payments ON public.debt_records USING GIN(payments);

-- 更新现有记录，确保paid_amount和payments字段有默认值
UPDATE public.debt_records 
SET 
    paid_amount = COALESCE(paid_amount, 0),
    payments = COALESCE(payments, '[]'::jsonb)
WHERE paid_amount IS NULL OR payments IS NULL;

-- 验证字段添加
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'debt_records'
AND column_name IN ('paid_amount', 'payments')
ORDER BY ordinal_position;

-- 显示更新后的表结构
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'debt_records'
ORDER BY ordinal_position;

SELECT 'Database schema updated successfully for payment records' as status;