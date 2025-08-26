// Supabase配置
// 收账管理系统云同步配置
window.SUPABASE_CONFIG = {
  url: 'https://zmattivirzwoiryrqlnv.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptYXR0aXZpcnp3b2lyeXJxbG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxNDY2ODcsImV4cCI6MjA3MTcyMjY4N30.FGieFplfH4jxLkskzjVffstGrm5a5Jmf6GeWFNgwoH0'
};

// 数据库表配置
window.DB_CONFIG = {
  tableName: 'debt_records',
  columns: {
    id: 'id',
    nf: 'nf',
    order_number: 'order_number',
    customer_name: 'customer_name',
    amount: 'amount',
    order_date: 'order_date',
    credit_days: 'credit_days',
    due_date: 'due_date',
    status: 'status',
    notes: 'notes',
    created_at: 'created_at',
    updated_at: 'updated_at'
  }
};

// 同步配置
window.SYNC_CONFIG = {
  autoSync: true,
  syncInterval: 30000, // 30秒自动同步
  retryAttempts: 3,
  retryDelay: 2000 // 2秒重试延迟
};

// 注意：在生产环境中，建议使用环境变量来存储敏感信息
// 在Netlify中，您可以在站点设置的Environment variables中设置这些值