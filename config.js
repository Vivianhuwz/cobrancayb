// Supabase配置
// 收账管理系统云同步配置
const defaultSupabaseConfig = {
  url: 'https://ptofzaqttafyfirpwtab.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0b2Z6YXF0dGFmeWZpcnB3dGFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzQ2NjIsImV4cCI6MjA5MzMxMDY2Mn0.soaBZnh8PbxapB0igCUDVAmMM1S93YdfCP9vcIr9myk'
};

const storedSupabaseUrl = localStorage.getItem('CLOUD_SUPABASE_URL');
const storedSupabaseAnonKey = localStorage.getItem('CLOUD_SUPABASE_ANON_KEY');

window.SUPABASE_CONFIG = {
  url: storedSupabaseUrl || defaultSupabaseConfig.url,
  anonKey: storedSupabaseAnonKey || defaultSupabaseConfig.anonKey
};

window.CLOUD_CONFIG = {
  provider: localStorage.getItem('CLOUD_PROVIDER') || 'supabase'
};

window.setSupabaseConfig = function (url, anonKey) {
  if (typeof url === 'string' && url.trim()) {
    localStorage.setItem('CLOUD_SUPABASE_URL', url.trim());
  }
  if (typeof anonKey === 'string' && anonKey.trim()) {
    localStorage.setItem('CLOUD_SUPABASE_ANON_KEY', anonKey.trim());
  }
  localStorage.setItem('CLOUD_PROVIDER', 'supabase');
  window.location.reload();
};

window.disableCloudSync = function () {
  localStorage.setItem('CLOUD_PROVIDER', 'none');
  window.location.reload();
};

window.enableNeonSync = function (syncToken) {
  if (typeof syncToken === 'string' && syncToken.trim()) {
    localStorage.setItem('CLOUD_SYNC_TOKEN', syncToken.trim());
  }
  localStorage.setItem('CLOUD_PROVIDER', 'neon');
  window.location.reload();
};

window.clearCloudConfig = function () {
  localStorage.removeItem('CLOUD_SUPABASE_URL');
  localStorage.removeItem('CLOUD_SUPABASE_ANON_KEY');
  localStorage.removeItem('CLOUD_SYNC_TOKEN');
  localStorage.removeItem('CLOUD_PROVIDER');
  window.location.reload();
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
