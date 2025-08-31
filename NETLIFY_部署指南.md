# 云收账系统 - Netlify 部署指南

## 📋 部署前准备

### 1. 文件结构检查
确保您的项目包含以下文件：
```
云收账/
├── index.html          # 主页面
├── login.html          # 登录页面
├── script.js           # 主要JavaScript文件
├── config.js           # 配置文件
├── payment-functions.js # 支付功能
├── fix-unpaid-amount.js # 修复功能
├── responsive.css      # 响应式样式
├── YOUBAI.png         # Logo图片
├── netlify.toml       # Netlify配置文件
├── _redirects         # 重定向规则
└── 其他文件...
```

### 2. 配置文件说明
- `netlify.toml`: Netlify部署配置
- `_redirects`: 单页应用路由重定向规则

## 🚀 部署方法

### 方法一：通过Git仓库部署（推荐）

1. **创建Git仓库**
   ```bash
   cd 云收账
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **推送到GitHub/GitLab**
   ```bash
   git remote add origin https://github.com/yourusername/yunshouzang.git
   git branch -M main
   git push -u origin main
   ```

3. **在Netlify中连接仓库**
   - 登录 [Netlify](https://netlify.com)
   - 点击 "New site from Git"
   - 选择您的Git提供商（GitHub/GitLab/Bitbucket）
   - 选择您的仓库
   - 配置构建设置：
     - Build command: `echo 'No build required'`
     - Publish directory: `.`（当前目录）
   - 点击 "Deploy site"

### 方法二：手动拖拽部署

1. **准备部署文件**
   - 将整个 `云收账` 文件夹压缩为ZIP文件
   - 或者直接选择文件夹

2. **上传到Netlify**
   - 登录 [Netlify](https://netlify.com)
   - 将ZIP文件或文件夹拖拽到部署区域
   - 等待部署完成

## ⚙️ 部署配置

### 环境变量设置
在Netlify控制台中设置以下环境变量（如果需要）：

```
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
```

### 自定义域名
1. 在Netlify控制台中点击 "Domain settings"
2. 点击 "Add custom domain"
3. 输入您的域名
4. 按照提示配置DNS记录

### SSL证书
Netlify会自动为您的网站提供免费的Let's Encrypt SSL证书。

## 🔧 部署后配置

### 1. 测试功能
- 访问登录页面：`https://yoursite.netlify.app/login.html`
- 测试登录功能（使用预设账户）
- 验证主页面功能
- 测试语言切换功能

### 2. 性能优化
- 启用Netlify的资源压缩
- 配置缓存策略（已在netlify.toml中配置）
- 启用Netlify Analytics（可选）

### 3. 安全设置
- 启用表单垃圾邮件保护
- 配置访问控制（如果需要）
- 设置安全头部（已在netlify.toml中配置）

## 📊 监控和维护

### 部署日志
在Netlify控制台中查看：
- 部署历史
- 构建日志
- 错误报告

### 自动部署
连接Git仓库后，每次推送代码都会自动触发部署。

### 回滚
如果新版本有问题，可以在Netlify控制台中一键回滚到之前的版本。

## 🐛 常见问题

### 1. 页面刷新后404错误
**解决方案**：确保`_redirects`文件存在且配置正确。

### 2. 静态资源加载失败
**解决方案**：检查文件路径，确保所有资源文件都在正确位置。

### 3. 登录功能异常
**解决方案**：检查JavaScript文件是否正确加载，浏览器控制台是否有错误。

### 4. 数据库连接问题
**解决方案**：确保Supabase配置正确，环境变量设置无误。

## 📞 技术支持

如果遇到部署问题，可以：
1. 查看Netlify官方文档
2. 检查浏览器控制台错误
3. 查看Netlify部署日志
4. 联系技术支持

## 🎉 部署完成

部署成功后，您将获得：
- 一个免费的`.netlify.app`域名
- 自动SSL证书
- 全球CDN加速
- 自动部署功能

现在您可以通过生成的URL访问您的云收账系统了！