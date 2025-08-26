-- 在Supabase控制台的SQL编辑器中执行此脚本来创建debt_records表

-- 创建debt_records表
CREATE TABLE IF NOT EXISTS public.debt_records (
    id BIGSERIAL PRIMARY KEY,
    nf VARCHAR(50),
    order_number VARCHAR(100),
    customer_name VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0,
    order_date DATE NOT NULL,
    credit_days INTEGER NOT NULL DEFAULT 30,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_debt_records_status ON public.debt_records(status);
CREATE INDEX IF NOT EXISTS idx_debt_records_due_date ON public.debt_records(due_date);
CREATE INDEX IF NOT EXISTS idx_debt_records_customer_name ON public.debt_records(customer_name);
CREATE INDEX IF NOT EXISTS idx_debt_records_created_at ON public.debt_records(created_at);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 创建触发器
DROP TRIGGER IF EXISTS update_debt_records_updated_at ON public.debt_records;
CREATE TRIGGER update_debt_records_updated_at
    BEFORE UPDATE ON public.debt_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 启用行级安全策略（RLS）
ALTER TABLE public.debt_records ENABLE ROW LEVEL SECURITY;

-- 创建允许所有操作的策略（在生产环境中应该根据实际需求调整）
CREATE POLICY "Allow all operations on debt_records" ON public.debt_records
    FOR ALL USING (true) WITH CHECK (true);

-- 验证表创建
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

-- 插入测试数据（可选）
INSERT INTO public.debt_records (
    nf, 
    order_number, 
    customer_name, 
    amount, 
    order_date, 
    credit_days, 
    due_date, 
    status, 
    notes
) VALUES 
(
    '123456',
    'ORD001',
    'João Silva',
    1500.00,
    CURRENT_DATE,
    30,
    CURRENT_DATE + INTERVAL '30 days',
    'pending',
    'Teste de sincronização'
),
(
    '123457',
    'ORD002',
    'Maria Santos',
    2500.00,
    CURRENT_DATE - INTERVAL '5 days',
    60,
    CURRENT_DATE + INTERVAL '55 days',
    'pending',
    'Pedido de teste'
);

-- 验证数据插入
SELECT COUNT(*) as total_records FROM public.debt_records;
SELECT * FROM public.debt_records ORDER BY created_at DESC LIMIT 5;