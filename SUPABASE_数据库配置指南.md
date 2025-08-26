# Supabase 数据库配置指南

## 问题描述
当前收款系统在从云端加载数据时出现错误：
```
从云端加载失败: {code: PGRST205, details: null, hint: null, message: Could not find the table 'public.debt_records' in the schema cache}
```

这个错误表明 Supabase 数据库中还没有创建 `debt_records` 表。

## 解决步骤

### 1. 登录 Supabase 控制台
1. 访问 [Supabase Dashboard](https://app.supabase.com)
2. 使用您的账户登录
3. 选择您的项目

### 2. 创建数据表
1. 在左侧菜单中点击 **"SQL Editor"**
2. 点击 **"New query"** 创建新的 SQL 查询
3. 复制 `CREATE_SUPABASE_TABLE.sql` 文件中的所有内容
4. 粘贴到 SQL 编辑器中
5. 点击 **"Run"** 按钮执行 SQL 脚本

### 3. 验证表创建
执行完 SQL 脚本后，您应该看到：
- ✅ 表 `debt_records` 创建成功
- ✅ 索引创建成功
- ✅ 触发器创建成功
- ✅ 行级安全策略启用
- ✅ 测试数据插入成功

### 4. 检查表结构
在 SQL 编辑器中运行以下查询来验证表结构：
```sql
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
```

### 5. 测试数据同步
表创建完成后，返回收款系统：
1. 刷新浏览器页面
2. 点击 **"从云端加载"** 按钮
3. 应该能看到测试数据加载成功
4. 尝试添加新的收账记录
5. 点击 **"手动同步"** 按钮测试数据上传

## 数据表结构说明

`debt_records` 表包含以下字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | BIGSERIAL | 主键，自动递增 |
| nf | VARCHAR(50) | 发票号码 |
| order_number | VARCHAR(100) | 订单号 |
| customer_name | VARCHAR(255) | 客户姓名（必填） |
| amount | DECIMAL(15,2) | 金额（必填） |
| order_date | DATE | 订单日期（必填） |
| credit_days | INTEGER | 信用天数，默认30天 |
| due_date | DATE | 到期日期（必填） |
| status | VARCHAR(20) | 状态，默认'pending' |
| notes | TEXT | 备注 |
| created_at | TIMESTAMP | 创建时间，自动设置 |
| updated_at | TIMESTAMP | 更新时间，自动更新 |

## 安全配置

### 行级安全策略（RLS）
- 已启用 RLS 保护数据安全
- 当前策略允许所有操作（适用于开发测试）
- **生产环境建议**：根据实际需求调整安全策略

### 建议的生产环境安全策略
```sql
-- 删除当前的宽松策略
DROP POLICY "Allow all operations on debt_records" ON public.debt_records;

-- 创建更严格的策略（示例）
CREATE POLICY "Users can view their own records" ON public.debt_records
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own records" ON public.debt_records
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own records" ON public.debt_records
    FOR UPDATE USING (auth.uid() = user_id);
```

## 故障排除

### 如果仍然出现错误
1. **检查项目 URL 和 API Key**：确认 `config.js` 中的配置正确
2. **检查网络连接**：确保能访问 Supabase 服务
3. **检查浏览器控制台**：查看详细错误信息
4. **重新加载页面**：清除缓存后重试

### 常见错误代码
- `PGRST205`：表不存在
- `PGRST301`：权限不足
- `PGRST116`：JSON 格式错误

## 联系支持
如果问题仍然存在，请：
1. 检查 Supabase 项目状态
2. 查看 Supabase 文档：https://supabase.com/docs
3. 联系 Supabase 支持团队

---

**注意**：请确保在执行 SQL 脚本前备份重要数据，虽然此脚本使用了 `IF NOT EXISTS` 来避免重复创建。