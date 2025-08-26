// 收账管理系统 JavaScript

// 全局变量
let records = JSON.parse(localStorage.getItem('accountRecords')) || [];
let editingIndex = -1;
let chatContext = {
    step: 'start',
    tempRecord: {},
    language: 'pt' // 默认葡萄牙语，'zh' 中文, 'pt' 葡萄牙语
};

// Supabase客户端和云同步相关变量
let supabase = null;
let isCloudEnabled = false;
let syncInProgress = false;
let autoSyncInterval = null;
let lastSyncTime = null;

// 初始化Supabase客户端
function initializeSupabase() {
    try {
        if (window.SUPABASE_CONFIG && window.supabase) {
            supabase = window.supabase.createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
            isCloudEnabled = true;
            console.log('Supabase客户端初始化成功');
            updateSyncStatus('已连接', 'success');
            
            // 启动自动同步
            if (window.SYNC_CONFIG && window.SYNC_CONFIG.autoSync) {
                startAutoSync();
            }
        } else {
            console.warn('Supabase配置未找到或库未加载');
            updateSyncStatus('配置错误', 'error');
        }
    } catch (error) {
        console.error('Supabase初始化失败:', error);
        updateSyncStatus('连接失败', 'error');
        isCloudEnabled = false;
    }
}



// 云同步功能实现

// 更新同步状态显示
function updateSyncStatus(status, type = 'info') {
    const statusElement = document.getElementById('syncStatus');
    const indicatorElement = document.getElementById('syncIndicator');
    
    if (statusElement) {
        statusElement.textContent = status;
    }
    
    if (indicatorElement) {
        indicatorElement.className = 'w-2 h-2 rounded-full';
        switch (type) {
            case 'success':
                indicatorElement.classList.add('bg-green-400');
                break;
            case 'error':
                indicatorElement.classList.add('bg-red-400');
                break;
            case 'warning':
                indicatorElement.classList.add('bg-yellow-400');
                break;
            case 'syncing':
                indicatorElement.classList.add('bg-blue-400', 'animate-pulse');
                break;
            default:
                indicatorElement.classList.add('bg-gray-400');
        }
    }
}

// 手动同步到云端
async function manualSync() {
    if (!isCloudEnabled || syncInProgress) {
        showNotification(chatContext.language === 'zh' ? '云同步不可用或正在同步中' : 'Sincronização em nuvem indisponível ou em progresso', 'warning');
        return;
    }
    
    try {
        syncInProgress = true;
        updateSyncStatus(chatContext.language === 'zh' ? '同步中...' : 'Sincronizando...', 'syncing');
        
        // 获取本地数据
        const localRecords = JSON.parse(localStorage.getItem('accountRecords')) || [];
        
        if (localRecords.length === 0) {
            showNotification(chatContext.language === 'zh' ? '没有本地数据需要同步' : 'Nenhum dado local para sincronizar', 'info');
            updateSyncStatus(chatContext.language === 'zh' ? '无数据' : 'Sem dados', 'warning');
            return;
        }
        
        // 转换数据格式以匹配数据库结构
        const recordsToSync = localRecords.map(record => ({
            nf: record.nf || null,
            order_number: record.orderNumber || null,
            customer_name: record.customerName,
            amount: parseFloat(record.amount) || 0,
            order_date: record.orderDate,
            credit_days: parseInt(record.creditDays) || 30,
            due_date: record.dueDate,
            status: record.status || 'pending',
            notes: record.notes || null,
            created_at: record.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        
        // 清空云端数据并插入新数据
        const { error: deleteError } = await supabase
            .from(window.DB_CONFIG.tableName)
            .delete()
            .neq('id', 0); // 删除所有记录
        
        if (deleteError) {
            console.warn('清空云端数据时出现警告:', deleteError);
        }
        
        // 插入新数据
        const { data, error } = await supabase
            .from(window.DB_CONFIG.tableName)
            .insert(recordsToSync)
            .select();
        
        if (error) {
            throw error;
        }
        
        lastSyncTime = new Date();
        updateSyncStatus(chatContext.language === 'zh' ? '同步成功' : 'Sincronizado', 'success');
        showNotification(
            chatContext.language === 'zh' 
                ? `成功同步 ${recordsToSync.length} 条记录到云端` 
                : `${recordsToSync.length} registros sincronizados com sucesso`,
            'success'
        );
        
    } catch (error) {
        console.error('同步失败:', error);
        updateSyncStatus(chatContext.language === 'zh' ? '同步失败' : 'Falha na sincronização', 'error');
        showNotification(
            chatContext.language === 'zh' 
                ? '同步失败: ' + error.message 
                : 'Falha na sincronização: ' + error.message,
            'error'
        );
    } finally {
        syncInProgress = false;
    }
}

// 从云端加载数据
async function loadFromCloud() {
    if (!isCloudEnabled || syncInProgress) {
        showNotification(chatContext.language === 'zh' ? '云同步不可用或正在同步中' : 'Sincronização em nuvem indisponível ou em progresso', 'warning');
        return;
    }
    
    try {
        syncInProgress = true;
        updateSyncStatus(chatContext.language === 'zh' ? '加载中...' : 'Carregando...', 'syncing');
        
        console.log('正在从云端加载数据...');
        console.log('表名:', window.DB_CONFIG.tableName);
        console.log('Supabase URL:', window.SUPABASE_CONFIG.url);
        
        const { data, error } = await supabase
            .from(window.DB_CONFIG.tableName)
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Supabase查询错误:', error);
            
            // 检查是否是表不存在的错误
            if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
                const errorMsg = chatContext.language === 'zh' 
                    ? `数据库表 '${window.DB_CONFIG.tableName}' 不存在。\n\n请按照以下步骤解决：\n1. 打开 Supabase 控制台\n2. 进入 SQL Editor\n3. 执行 CREATE_SUPABASE_TABLE.sql 文件中的脚本\n\n详细说明请查看 SUPABASE_数据库配置指南.md 文件`
                    : `A tabela '${window.DB_CONFIG.tableName}' não existe no banco de dados.\n\nPara resolver:\n1. Abra o console do Supabase\n2. Vá para SQL Editor\n3. Execute o script do arquivo CREATE_SUPABASE_TABLE.sql\n\nVeja o guia SUPABASE_数据库配置指南.md para detalhes`;
                
                alert(errorMsg);
                updateSyncStatus(chatContext.language === 'zh' ? '表不存在' : 'Tabela não existe', 'error');
                return;
            }
            
            throw error;
        }
        
        console.log('云端数据:', data);
        
        if (!data || data.length === 0) {
            showNotification(chatContext.language === 'zh' ? '云端没有数据' : 'Nenhum dado na nuvem', 'info');
            updateSyncStatus(chatContext.language === 'zh' ? '云端无数据' : 'Nuvem vazia', 'warning');
            return;
        }
        
        // 转换数据格式以匹配本地结构
        const cloudRecords = data.map(record => ({
            nf: record.nf,
            orderNumber: record.order_number,
            customerName: record.customer_name,
            amount: record.amount.toString(),
            orderDate: record.order_date,
            creditDays: record.credit_days.toString(),
            dueDate: record.due_date,
            status: record.status,
            notes: record.notes,
            createdAt: record.created_at,
            updatedAt: record.updated_at
        }));
        
        // 更新本地数据
        records = cloudRecords;
        localStorage.setItem('accountRecords', JSON.stringify(records));
        
        // 刷新界面
        updateTable();
        updateStatistics();
        
        lastSyncTime = new Date();
        updateSyncStatus(chatContext.language === 'zh' ? '加载成功' : 'Carregado', 'success');
        showNotification(
            chatContext.language === 'zh' 
                ? `成功从云端加载 ${cloudRecords.length} 条记录` 
                : `${cloudRecords.length} registros carregados da nuvem`,
            'success'
        );
        
    } catch (error) {
        console.error('从云端加载失败:', error);
        updateSyncStatus(chatContext.language === 'zh' ? '加载失败' : 'Falha no carregamento', 'error');
        showNotification(
            chatContext.language === 'zh' 
                ? '从云端加载失败: ' + error.message 
                : 'Falha ao carregar da nuvem: ' + error.message,
            'error'
        );
    } finally {
        syncInProgress = false;
    }
}

// 启动自动同步
function startAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
    }
    
    const interval = window.SYNC_CONFIG?.syncInterval || 30000;
    autoSyncInterval = setInterval(async () => {
        if (!syncInProgress && isCloudEnabled) {
            await manualSync();
        }
    }, interval);
}

// 停止自动同步
function stopAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
    }
}

// 添加完整的双语配置
const uiTexts = {
    zh: {
        navTitle: '收账管理系统',
        btnAdd: '添加收账记录',
        btnChat: '智能对话',
        btnImport: '批量导入',
        btnReport: '总结',
        thOrderNumber: '订单号',
        customerName: '客户名称',
        amount: '金额',
        orderDate: '订单日期',
        creditDays: '赊账天数',
        dueDate: '应收日期',
        status: '状态',
        notes: '备注',
        operations: '操作',
        statusPending: '待收账',
        statusPaid: '已收账',
        statusOverdue: '逾期',
        statusDueSoon: '即将到期',
        archive: '归档',
        archived: '已归档',
        // 统计卡片
        totalAmount: '总金额',
        paidAmount: '已收账',
        pendingAmount: '待收账',
        overdueCount: '逾期',
        // 搜索筛选
        customerSearch: '客户搜索',
        customerSearchPlaceholder: '输入客户名称',
        statusFilter: '状态筛选',
        allStatus: '全部状态',
        dateRange: '日期范围',
        dateTo: '至',
        recordsTable: '收账记录',
        // 表单相关
        modalTitle: '添加收账记录',
        modalTitleEdit: '编辑收账记录',
        nfLabel: 'NF',
        orderNumberLabel: '订单号',
        customerNameLabel: '客户名称',
        amountLabel: '金额',
        orderDateLabel: '订单日期',
        creditDaysLabel: '赊账天数',
        statusLabel: '状态',
        creditDays30: '30天',
        creditDays60: '60天',
        creditDays90: '90天',
        creditDaysCustom: '自定义',
        cancelButton: '取消',
        saveButton: '保存',
        nfPlaceholder: '例如：123456（可选）',
        orderNumberPlaceholder: '例如：ORD001（可选）',
        customerNamePlaceholder: '例如：张三',
        amountPlaceholder: '¥ 0.00',
        orderDatePlaceholder: 'DD/MM/YYYY 或 今天、明天',
        customDaysPlaceholder: '天数'
    },
    pt: {
        navTitle: 'Sistema de Gestão de Cobrança',
        btnAdd: 'Adicionar Registro',
        btnChat: 'Conversa Inteligente',
        btnImport: 'Importação em Lote',
        btnReport: 'Resumo',
        thOrderNumber: 'Nº DE PEDIDO',
        customerName: 'Cliente',
        amount: 'Valor',
        orderDate: 'Data de Emissão',
        creditDays: 'Dias de Crédito',
        dueDate: 'Data de Vencimento',
        status: 'Status',
        notes: 'Observações',
        operations: 'Operações',
        statusPending: 'Pendente',
        statusPaid: 'Pago',
        statusOverdue: 'Vencido',
        statusDueSoon: 'Vence em Breve',
        archive: 'Arquivar',
        archived: 'Arquivado',
        // 统计卡片
        totalAmount: 'Valor Total',
        paidAmount: 'Recebido',
        pendingAmount: 'Pendente',
        overdueCount: 'Vencido',
        // 搜索筛选
        customerSearch: 'Buscar Cliente',
        customerSearchPlaceholder: 'Digite o nome do cliente',
        statusFilter: 'Filtrar Status',
        allStatus: 'Todos os Status',
        dateRange: 'Período',
        dateTo: 'até',
        recordsTable: 'Registros de Cobrança',
        // 表单相关
        modalTitle: 'Adicionar Registro',
        modalTitleEdit: 'Editar Registro',
        nfLabel: 'NF',
        orderNumberLabel: 'Nº DE PEDIDO',
        customerNameLabel: 'Nome do Cliente',
        amountLabel: 'Valor',
        orderDateLabel: 'Data de Emissão',
        creditDaysLabel: 'Dias de Crédito',
        statusLabel: 'Status',
        creditDays30: '30 dias',
        creditDays60: '60 dias',
        creditDays90: '90 dias',
        creditDaysCustom: 'Personalizado',
        cancelButton: 'Cancelar',
        saveButton: 'Salvar',
        nfPlaceholder: 'Ex: 123456 (opcional)',
        orderNumberPlaceholder: 'Ex: ORD001 (opcional)',
        customerNamePlaceholder: 'Ex: João Silva',
        amountPlaceholder: 'R$ 0,00',
        orderDatePlaceholder: 'DD/MM/YYYY ou hoje, amanhã',
        customDaysPlaceholder: 'dias',
        // 报表相关翻译
        reportTitle: 'Relatório de Gestão de Cobrança',
        reportGeneratedTime: 'Hora de Geração',
        overallStats: 'Estatísticas Gerais',
        customerStats: 'Estatísticas por Cliente',
        monthlyStats: 'Estatísticas Mensais',
        totalAmountReport: 'Valor Total',
        paidAmountReport: 'Recebido',
        pendingAmountReport: 'Pendente',
        overdueCountReport: 'Qtd. Vencidos',
        customerNameReport: 'Nome do Cliente',
        overdueAmountReport: 'Valor Vencido',
        recordCountReport: 'Quantidade',
        monthReport: 'Mês',
        collectionRateReport: 'Taxa de Cobrança',
        exportPdfBtn: 'Exportar PDF',
        // 导入相关
        importModalTitle: 'Importação em Lote',
        importDescription: 'Suporte para formatos Excel (.xlsx, .xls) e CSV',
        templateTitle: 'Formato do modelo Excel:',
        dropText: 'Arraste o arquivo aqui ou clique para selecionar',
        supportedFormats: 'Suporte para formatos .xlsx, .xls, .csv',
        selectFileText: 'Selecionar Arquivo',
        cancelBtn: 'Cancelar',
        importBtnText: 'Importar'
    }
};

// 添加中文报表翻译
uiTexts.zh.exportPdfBtn = '导出PDF';
uiTexts.zh.reportTitle = '收账管理报表';
uiTexts.zh.reportGeneratedTime = '生成时间';
uiTexts.zh.overallStats = '总体统计';
uiTexts.zh.customerStats = '客户统计';
uiTexts.zh.monthlyStats = '月度统计';
uiTexts.zh.totalAmountReport = '总金额';
uiTexts.zh.paidAmountReport = '已收账';
uiTexts.zh.pendingAmountReport = '待收账';
uiTexts.zh.overdueCountReport = '逾期笔数';
uiTexts.zh.customerNameReport = '客户名称';
uiTexts.zh.overdueAmountReport = '逾期金额';
uiTexts.zh.recordCountReport = '笔数';
uiTexts.zh.monthReport = '月份';
uiTexts.zh.collectionRateReport = '收账率';
// 导入相关
uiTexts.zh.importModalTitle = '批量导入';
uiTexts.zh.importDescription = '支持Excel (.xlsx, .xls) 和 CSV 文件格式';
uiTexts.zh.templateTitle = 'Excel 模板格式：';
uiTexts.zh.dropText = '拖拽文件到此处或点击选择文件';
uiTexts.zh.supportedFormats = '支持 .xlsx, .xls, .csv 格式';
uiTexts.zh.selectFileText = '选择文件';
uiTexts.zh.cancelBtn = '取消';
uiTexts.zh.importBtnText = '导入';
// 云同步相关文本
uiTexts.zh.syncStatus = '同步状态';
uiTexts.zh.syncManual = '手动同步';
uiTexts.zh.syncLoad = '从云端加载';
uiTexts.zh.syncNotReady = '未同步';
uiTexts.zh.syncSuccess = '同步成功';
uiTexts.zh.syncFailed = '同步失败';
uiTexts.zh.syncInProgress = '同步中...';
uiTexts.zh.loadInProgress = '加载中...';
uiTexts.zh.noLocalData = '没有本地数据需要同步';
uiTexts.zh.noCloudData = '云端没有数据';
uiTexts.zh.syncUnavailable = '云同步不可用或正在同步中';

// 葡萄牙语云同步文本
uiTexts.pt.syncStatus = 'Status de Sincronização';
uiTexts.pt.syncManual = 'Sincronizar Manualmente';
uiTexts.pt.syncLoad = 'Carregar da Nuvem';
uiTexts.pt.syncNotReady = 'Não Sincronizado';
uiTexts.pt.syncSuccess = 'Sincronizado';
uiTexts.pt.syncFailed = 'Falha na Sincronização';
uiTexts.pt.syncInProgress = 'Sincronizando...';
uiTexts.pt.loadInProgress = 'Carregando...';
uiTexts.pt.noLocalData = 'Nenhum dado local para sincronizar';
uiTexts.pt.noCloudData = 'Nenhum dado na nuvem';
uiTexts.pt.syncUnavailable = 'Sincronização em nuvem indisponível ou em progresso';

// 语言切换函数
function changeLanguage() {
    const lang = document.getElementById('languageSelect').value;
    localStorage.setItem('selectedLanguage', lang);
    chatContext.language = lang;
    updateUILanguage(lang);
}

// 更新界面语言
function updateUILanguage(lang) {
    const texts = uiTexts[lang];
    
    // 更新导航栏
    const navTitle = document.getElementById('navTitle');
    const btnAdd = document.getElementById('btnAdd');
    const btnChat = document.getElementById('btnChat');
    const btnImport = document.getElementById('btnImport');
    const btnReport = document.getElementById('btnReport');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    
    if (navTitle) navTitle.textContent = texts.navTitle;
    if (btnAdd) btnAdd.textContent = texts.btnAdd;
    if (btnChat) btnChat.textContent = texts.btnChat;
    if (btnImport) btnImport.textContent = texts.btnImport;
    if (btnReport) btnReport.textContent = texts.btnReport;
    if (exportPdfBtn) exportPdfBtn.textContent = texts.exportPdfBtn;
    
    // 更新导入模态框
    const importModalTitle = document.getElementById('importModalTitle');
    const importDescription = document.getElementById('importDescription');
    const templateTitle = document.getElementById('templateTitle');
    const dropText = document.getElementById('dropText');
    const supportedFormats = document.getElementById('supportedFormats');
    const selectFileText = document.getElementById('selectFileText');
    const cancelBtn = document.getElementById('cancelBtn');
    const importBtnText = document.getElementById('importBtnText');
    
    if (importModalTitle) importModalTitle.textContent = texts.importModalTitle;
    if (importDescription) importDescription.textContent = texts.importDescription;
    if (templateTitle) templateTitle.textContent = texts.templateTitle;
    if (dropText) dropText.textContent = texts.dropText;
    if (supportedFormats) supportedFormats.textContent = texts.supportedFormats;
    if (selectFileText) selectFileText.textContent = texts.selectFileText;
    if (cancelBtn) cancelBtn.textContent = texts.cancelBtn;
    if (importBtnText) importBtnText.textContent = texts.importBtnText;
    
    // 更新云同步相关元素
    const syncManualBtn = document.querySelector('button[onclick="manualSync()"]');
    const syncLoadBtn = document.querySelector('button[onclick="loadFromCloud()"]');
    
    if (syncManualBtn) syncManualBtn.textContent = texts.syncManual;
    if (syncLoadBtn) syncLoadBtn.textContent = texts.syncLoad;
    
    // 更新表格标题
    const thOrderNumber = document.getElementById('thOrderNumber');
    const thCustomerName = document.getElementById('thCustomerName');
    const thAmount = document.getElementById('thAmount');
    const thOrderDate = document.getElementById('thOrderDate');
    const thCreditDays = document.getElementById('thCreditDays');
    const thDueDate = document.getElementById('thDueDate');
    const thStatus = document.getElementById('thStatus');
    const thNotes = document.getElementById('thNotes');
    const thOperations = document.getElementById('thOperations');
    
    if (thOrderNumber) thOrderNumber.textContent = texts.thOrderNumber;
    if (thCustomerName) thCustomerName.textContent = texts.customerName;
    if (thAmount) thAmount.textContent = texts.amount;
    if (thOrderDate) thOrderDate.textContent = texts.orderDate;
    if (thCreditDays) thCreditDays.textContent = texts.creditDays;
    if (thDueDate) thDueDate.textContent = texts.dueDate;
    if (thStatus) thStatus.textContent = texts.status;
    if (thNotes) thNotes.textContent = texts.notes;
    if (thOperations) thOperations.textContent = texts.operations;
    
    // 更新状态筛选选项
    const statusFilter = document.getElementById('statusFilter');
    if (statusFilter) {
        const options = statusFilter.options;
        if (options[0]) options[0].textContent = texts.allStatus;
        if (options[1]) options[1].textContent = texts.statusPending;
        if (options[2]) options[2].textContent = texts.statusPaid;
        if (options[3]) options[3].textContent = texts.statusOverdue;
        if (options[4]) options[4].textContent = texts.archived;
    }
    
    // 更新统计卡片标题
    const totalAmountLabel = document.getElementById('totalAmountLabel');
    const paidAmountLabel = document.getElementById('paidAmountLabel');
    const pendingAmountLabel = document.getElementById('pendingAmountLabel');
    const overdueCountLabel = document.getElementById('overdueCountLabel');
    
    if (totalAmountLabel) totalAmountLabel.textContent = texts.totalAmount;
    if (paidAmountLabel) paidAmountLabel.textContent = texts.paidAmount;
    if (pendingAmountLabel) pendingAmountLabel.textContent = texts.pendingAmount;
    if (overdueCountLabel) overdueCountLabel.textContent = texts.overdueCount;
    
    // 更新搜索筛选区域
    const customerSearchLabel = document.getElementById('customerSearchLabel');
    const customerSearchInput = document.getElementById('customerSearch');
    const statusFilterLabel = document.getElementById('statusFilterLabel');
    const allStatusOption = document.getElementById('allStatusOption');
    const dateRangeLabel = document.getElementById('dateRangeLabel');
    const dateToLabel = document.getElementById('dateToLabel');
    
    if (customerSearchLabel) customerSearchLabel.textContent = texts.customerSearch;
    if (customerSearchInput) customerSearchInput.placeholder = texts.customerSearchPlaceholder;
    if (statusFilterLabel) statusFilterLabel.textContent = texts.statusFilter;
    if (allStatusOption) allStatusOption.textContent = texts.allStatus;
    if (dateRangeLabel) dateRangeLabel.textContent = texts.dateRange;
    if (dateToLabel) dateToLabel.textContent = texts.dateTo;
    
    // 更新状态选项
    const statusPendingOption = document.getElementById('statusPendingOption');
    const statusPaidOption = document.getElementById('statusPaidOption');
    const statusOverdueOption = document.getElementById('statusOverdueOption');
    
    if (statusPendingOption) statusPendingOption.textContent = texts.statusPending;
    if (statusPaidOption) statusPaidOption.textContent = texts.statusPaid;
    if (statusOverdueOption) statusOverdueOption.textContent = texts.statusOverdue;
    
    // 更新表单元素
    const modalTitle = document.getElementById('modalTitle');
    const nfLabel = document.getElementById('nfLabel');
    const orderNumberLabel = document.getElementById('orderNumberLabel');
    const customerNameLabel = document.getElementById('customerNameLabel');
    const amountLabel = document.getElementById('amountLabel');
    const orderDateLabel = document.getElementById('orderDateLabel');
    const creditDaysLabel = document.getElementById('creditDaysLabel');
    const statusLabel = document.getElementById('statusLabel');
    const cancelButton = document.getElementById('cancelButton');
    const saveButton = document.getElementById('saveButton');
    
    if (nfLabel) nfLabel.textContent = texts.nfLabel;
    if (orderNumberLabel) orderNumberLabel.textContent = texts.orderNumberLabel;
    if (customerNameLabel) customerNameLabel.textContent = texts.customerNameLabel;
    if (amountLabel) amountLabel.textContent = texts.amountLabel;
    if (orderDateLabel) orderDateLabel.textContent = texts.orderDateLabel;
    if (creditDaysLabel) creditDaysLabel.textContent = texts.creditDaysLabel;
    if (statusLabel) statusLabel.textContent = texts.statusLabel;
    if (cancelButton) cancelButton.textContent = texts.cancelButton;
    if (saveButton) saveButton.textContent = texts.saveButton;
    
    // 更新表单选项
    const creditDays30 = document.getElementById('creditDays30');
    const creditDays60 = document.getElementById('creditDays60');
    const creditDays90 = document.getElementById('creditDays90');
    const creditDaysCustom = document.getElementById('creditDaysCustom');
    const modalStatusPending = document.getElementById('modalStatusPending');
    const modalStatusPaid = document.getElementById('modalStatusPaid');
    
    if (creditDays30) creditDays30.textContent = texts.creditDays30;
    if (creditDays60) creditDays60.textContent = texts.creditDays60;
    if (creditDays90) creditDays90.textContent = texts.creditDays90;
    if (creditDaysCustom) creditDaysCustom.textContent = texts.creditDaysCustom;
    if (modalStatusPending) modalStatusPending.textContent = texts.statusPending;
    if (modalStatusPaid) modalStatusPaid.textContent = texts.statusPaid;
    
    // 更新表单占位符
    const nfInput = document.getElementById('nf');
    const orderNumberInput = document.getElementById('orderNumber');
    const customerNameInput = document.getElementById('customerName');
    const amountInput = document.getElementById('amount');
    const orderDateInput = document.getElementById('orderDate');
    const customDaysInput = document.getElementById('customDays');
    
    if (nfInput) nfInput.placeholder = texts.nfPlaceholder;
    if (orderNumberInput) orderNumberInput.placeholder = texts.orderNumberPlaceholder;
    if (customerNameInput) customerNameInput.placeholder = texts.customerNamePlaceholder;
    if (amountInput) amountInput.placeholder = texts.amountPlaceholder;
    if (orderDateInput) orderDateInput.placeholder = texts.orderDatePlaceholder;
    if (customDaysInput) customDaysInput.placeholder = texts.customDaysPlaceholder;
    
    // 更新收账记录表格标题
    const recordsTableTitle = document.getElementById('recordsTableTitle');
    if (recordsTableTitle) {
        recordsTableTitle.innerHTML = '<i class="fas fa-table mr-2"></i>' + texts.recordsTable;
    }
    
    // 更新选择相关文本
    const selectedCountLabel = document.getElementById('selectedCountLabel');
    const selectedRecordsLabel = document.getElementById('selectedRecordsLabel');
    const selectedTotalLabel = document.getElementById('selectedTotalLabel');
    const generateReportLabel = document.getElementById('generateReportLabel');
    const clearSelectionLabel = document.getElementById('clearSelectionLabel');
    
    if (lang === 'pt') {
        if (selectedCountLabel) selectedCountLabel.textContent = 'Selecionados:';
        if (selectedRecordsLabel) selectedRecordsLabel.textContent = 'registros';
        if (selectedTotalLabel) selectedTotalLabel.textContent = 'Total Selecionado:';
        if (generateReportLabel) generateReportLabel.textContent = 'Gerar Relatório';
        if (clearSelectionLabel) clearSelectionLabel.textContent = 'Limpar Seleção';
    } else {
        if (selectedCountLabel) selectedCountLabel.textContent = '已选择:';
        if (selectedRecordsLabel) selectedRecordsLabel.textContent = '条记录';
        if (selectedTotalLabel) selectedTotalLabel.textContent = '选中总额:';
        if (generateReportLabel) generateReportLabel.textContent = '生成报表';
        if (clearSelectionLabel) clearSelectionLabel.textContent = '清除选择';
    }
    
    // 重新加载表格以更新状态显示和货币格式
    loadRecords();
    updateStatistics();
}

const languages = {
    zh: {
        welcome: '您好！我是智能助手，请告诉我客户信息和订单详情。',
        askCustomer: '请告诉我客户名称，例如："张三" 或 "客户：李四"',
        askAmount: '请输入金额，例如："1000" 或 "1000元"',
        askOrderDate: '请输入有效的日期，例如："今天"、"明天"、"24/08/2025"（DD/MM/YYYY格式）',
        askCreditDays: '请选择赊账天数：30天、60天、90天，或者告诉我具体天数。',
        invalidAmount: '请输入有效的金额，例如："1000" 或 "1000元"',
        invalidDate: '请输入有效的日期，例如："今天"、"明天"、"24/08/2025"（DD/MM/YYYY格式）',
        success: '智能对话录入成功',
        today: ['今天', '今日'],
        tomorrow: ['明天'],
        yesterday: ['昨天'],
        customer: '客户',
        amount: '金额',
        orderDate: '订单日期',
        creditDays: '赊账天数',
        dueDate: '应收日期',
        completed: '完成！已添加记录：'
    },
    pt: {
        welcome: 'Olá! Sou o assistente inteligente, por favor me informe os dados do cliente e detalhes do pedido.',
        askCustomer: 'Por favor me informe o nome do cliente, exemplo: "João" ou "Cliente: Maria"',
        askAmount: 'Por favor digite o valor, exemplo: "1000" ou "R$ 1000"',
        askOrderDate: 'Por favor digite uma data válida, exemplo: "hoje", "amanhã", "24/08/2025" (formato DD/MM/YYYY)',
        askCreditDays: 'Por favor escolha os dias de crédito: 30 dias, 60 dias, 90 dias, ou me informe um número específico.',
        invalidAmount: 'Por favor digite um valor válido, exemplo: "1000" ou "R$ 1000"',
        invalidDate: 'Por favor digite uma data válida, exemplo: "hoje", "amanhã", "24/08/2025" (formato DD/MM/YYYY)',
        success: 'Entrada por conversa inteligente bem-sucedida',
        today: ['hoje', 'hoy'],
        tomorrow: ['amanhã', 'mañana'],
        yesterday: ['ontem', 'ayer'],
        customer: 'cliente',
        amount: 'valor',
        orderDate: 'data do pedido',
        creditDays: 'dias de crédito',
        dueDate: 'data de vencimento',
        completed: 'Concluído! Registro adicionado:'
    }
};

// 检测语言
function detectLanguage(message) {
    const lowerMessage = message.toLowerCase();
    
    // 葡萄牙语关键词
    const ptKeywords = ['olá', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'cliente', 'valor', 'hoje', 'amanhã', 'ontem', 'dias', 'reais', 'real'];
    // 中文关键词
    const zhKeywords = ['你好', '客户', '金额', '今天', '明天', '昨天', '天', '元', '块'];
    
    let ptScore = 0;
    let zhScore = 0;
    
    ptKeywords.forEach(keyword => {
        if (lowerMessage.includes(keyword)) ptScore++;
    });
    
    zhKeywords.forEach(keyword => {
        if (lowerMessage.includes(keyword)) zhScore++;
    });
    
    // 检查字符类型
    const hasPortuguese = /[àáâãäåæçèéêëìíîïñòóôõöøùúûüý]/.test(lowerMessage);
    const hasChinese = /[\u4e00-\u9fff]/.test(message);
    
    if (hasPortuguese || ptScore > zhScore) {
        return 'pt';
    } else if (hasChinese || zhScore > ptScore) {
        return 'zh';
    }
    
    return chatContext.language; // 保持当前语言
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始化Supabase云同步
    initializeSupabase();
    
    // 初始化语言（默认为葡萄牙语）
    const savedLang = localStorage.getItem('selectedLanguage') || 'pt';
    chatContext.language = savedLang;
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.value = savedLang;
        updateUILanguage(savedLang);
    }
    
    loadRecords();
    updateStatistics();
    checkDueDates();
    
    // 设置表单提交事件
    const recordForm = document.getElementById('recordForm');
    if (recordForm) {
        recordForm.addEventListener('submit', handleFormSubmit);
    }
    
    // 定期检查到账日期（每小时检查一次）
    setInterval(checkDueDates, 3600000);
    
    // 监听自定义赊账天数选择
    const creditDaysSelect = document.getElementById('creditDays');
    if (creditDaysSelect) {
        creditDaysSelect.addEventListener('change', function() {
            const customInput = document.getElementById('customDays');
            if (this.value === 'custom') {
                customInput.classList.remove('hidden');
                customInput.required = true;
            } else {
                customInput.classList.add('hidden');
                customInput.required = false;
            }
        });
    }
    
    // 监听订单日期输入框双击事件
    const orderDateInput = document.getElementById('orderDate');
    if (orderDateInput) {
        orderDateInput.addEventListener('dblclick', function() {
            const datePicker = document.getElementById('orderDatePicker');
            if (datePicker) {
                datePicker.click();
            }
        });
    }
    
    // 添加金额输入字段的格式化监听器
    const amountInput = document.getElementById('amount');
    if (amountInput) {
        amountInput.addEventListener('input', function(e) {
            formatAmountInput(e.target);
        });
        amountInput.addEventListener('blur', function(e) {
            formatAmountInput(e.target);
        });
    }
});

// 显示添加记录模态框
function showAddModal() {
    editingIndex = -1;
    document.getElementById('modalTitle').textContent = '添加收账记录';
    document.getElementById('recordForm').reset();
    document.getElementById('recordModal').classList.remove('hidden');
}

// 显示编辑记录模态框
function showEditModal(index) {
    editingIndex = index;
    const record = records[index];
    
    document.getElementById('modalTitle').textContent = '编辑收账记录';
    document.getElementById('nf').value = record.nf || '';
    document.getElementById('orderNumber').value = record.orderNumber || '';
    document.getElementById('customerName').value = record.customerName;
    
    // 格式化金额为巴西货币格式
    const amountInput = document.getElementById('amount');
    if (record.amount && record.amount > 0) {
        const formattedAmount = record.amount.toFixed(2).replace('.', ',');
        amountInput.value = 'R$ ' + formattedAmount.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    } else {
        amountInput.value = '';
    }
    
    document.getElementById('orderDate').value = formatDate(record.orderDate) || '';
    
    // 设置日历选择器的值
    if (record.orderDate) {
        const dateObj = parseDDMMYYYYToDate(record.orderDate);
        if (dateObj) {
            const isoDate = dateObj.toISOString().split('T')[0];
            document.getElementById('orderDatePicker').value = isoDate;
        }
    }
    
    // 设置赊账天数
    const creditDaysSelect = document.getElementById('creditDays');
    const customDaysInput = document.getElementById('customDays');
    
    if (record.creditDays && [30, 60, 90].includes(record.creditDays)) {
        creditDaysSelect.value = record.creditDays.toString();
        customDaysInput.classList.add('hidden');
    } else if (record.creditDays) {
        creditDaysSelect.value = 'custom';
        customDaysInput.value = record.creditDays;
        customDaysInput.classList.remove('hidden');
    }
    

    document.getElementById('status').value = record.status;
    
    document.getElementById('recordModal').classList.remove('hidden');
}

// 关闭模态框
function closeModal() {
    document.getElementById('recordModal').classList.add('hidden');
    clearForm();
    editingIndex = -1;
}

// 清空表单
function clearForm() {
    document.getElementById('nf').value = '';
    document.getElementById('orderNumber').value = '';
    document.getElementById('customerName').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('orderDate').value = '';
    document.getElementById('orderDatePicker').value = '';
    document.getElementById('creditDays').value = '30';
    document.getElementById('customDays').value = '';
    document.getElementById('customDays').classList.add('hidden');

    editingIndex = -1;
}

// 关闭报表模态框
function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
}

// 处理表单提交
function handleFormSubmit(e) {
    e.preventDefault();
    
    // 获取表单数据并验证
    const nf = document.getElementById('nf').value.trim();
    const orderNumber = document.getElementById('orderNumber').value.trim();
    const customerName = document.getElementById('customerName').value.trim();
    const amount = parseAmountValue(document.getElementById('amount').value);
    
    // 验证必填字段
    if (!customerName) {
        showNotification('请输入客户名称！', 'error');
        return;
    }
    
    if (!amount || amount <= 0) {
        showNotification('请输入有效的金额！', 'error');
        return;
    }
    
    const creditDaysSelect = document.getElementById('creditDays');
    const customDaysInput = document.getElementById('customDays');
    
    let creditDays = 30; // 默认值
    if (creditDaysSelect && creditDaysSelect.value === 'custom') {
        creditDays = parseInt(customDaysInput.value) || 30;
    } else if (creditDaysSelect && creditDaysSelect.value) {
        creditDays = parseInt(creditDaysSelect.value) || 30;
    }
    
    // 处理订单日期
    const orderDateInput = document.getElementById('orderDate');
    let orderDate = new Date().toISOString().split('T')[0]; // 默认今天
    if (orderDateInput && orderDateInput.value.trim()) {
        const inputValue = orderDateInput.value.trim();
        const parsedDate = parseDate(inputValue);
        if (parsedDate) {
            orderDate = parsedDate;
        } else {
            // 如果parseDate返回null，尝试直接使用输入值
            // 检查是否是YYYY-MM-DD格式
            if (inputValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
                orderDate = inputValue;
            } else {
                // 其他格式保持原样，让calculateDueDateFromData处理
                orderDate = inputValue;
            }
        }
    }
    
    // 计算应收日期
    const dueDate = calculateDueDateFromData(orderDate, creditDays);
    
    const formData = {
        nf: nf,
        orderNumber: orderNumber,
        customerName: customerName,
        amount: amount,
        orderDate: orderDate,
        creditDays: creditDays,
        dueDate: dueDate,
        status: document.getElementById('status').value,
        createdAt: editingIndex === -1 ? new Date().toISOString() : records[editingIndex].createdAt,
        updatedAt: new Date().toISOString()
    };
    
    if (editingIndex === -1) {
        // 添加新记录
        records.push(formData);
        showNotification('收账记录添加成功！', 'success');
    } else {
        // 更新现有记录
        records[editingIndex] = formData;
        showNotification('收账记录更新成功！', 'success');
    }
    
    saveRecords();
    loadRecords();
    updateStatistics();
    closeModal();
}

// 删除记录
function deleteRecord(index) {
    if (confirm('确定要删除这条记录吗？')) {
        records.splice(index, 1);
        saveRecords();
        loadRecords();
        updateStatistics();
        showNotification('记录删除成功！', 'success');
    }
}

// 标记为已收账
function markAsPaid(index) {
    records[index].status = 'paid';
    records[index].updatedAt = new Date().toISOString();
    saveRecords();
    loadRecords();
    updateStatistics();
    showNotification('已标记为已收账！', 'success');
}

// 归档记录
function archiveRecord(index) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    const confirmMessage = lang === 'zh' ? '确定要归档这条记录吗？归档后将不在全部状态中显示。' : 'Tem certeza que deseja arquivar este registro? Após arquivar, não será exibido no status "Todos".';
    if (confirm(confirmMessage)) {
        records[index].archived = true;
        saveRecords();
        loadRecords();
        updateStatistics();
        showNotification(lang === 'zh' ? '记录已归档' : 'Registro arquivado', 'success');
    }
}

// 保存记录到本地存储
function saveRecords() {
    localStorage.setItem('accountRecords', JSON.stringify(records));
}

// 计算到账日期（跳过周末）- 使用当前日期作为订单日期
function calculateDueDate() {
    const creditDaysSelect = document.getElementById('creditDays');
    const customDaysInput = document.getElementById('customDays');
    const dueDateInput = document.getElementById('dueDate');
    const orderDateInput = document.getElementById('orderDate');
    
    // 检查元素是否存在
    if (!creditDaysSelect || !dueDateInput) {
        return;
    }
    
    let creditDays;
    if (creditDaysSelect.value === 'custom') {
        creditDays = parseInt(customDaysInput?.value) || 0;
    } else {
        creditDays = parseInt(creditDaysSelect.value) || 30;
    }
    
    if (creditDays <= 0) {
        dueDateInput.value = '';
        return;
    }
    
    // 获取订单日期
    let orderDate;
    if (orderDateInput && orderDateInput.value.trim()) {
        const parsedDate = parseDate(orderDateInput.value.trim());
        if (parsedDate) {
            orderDate = parseDDMMYYYYToDate(parsedDate);
        }
    }
    
    // 如果订单日期输入框已经是DD/MM/YYYY格式，直接解析
    if (!orderDate && orderDateInput && orderDateInput.value.trim()) {
        orderDate = parseDDMMYYYYToDate(orderDateInput.value.trim());
    }
    
    // 如果没有有效的订单日期，使用当前日期
    if (!orderDate) {
        orderDate = new Date();
        if (orderDateInput) {
            orderDateInput.value = formatDateToDDMMYYYY(orderDate);
        }
    }
    
    let dueDate = new Date(orderDate);
    dueDate.setDate(dueDate.getDate() + creditDays);
    
    // 跳过周末
    while (dueDate.getDay() === 0 || dueDate.getDay() === 6) {
        dueDate.setDate(dueDate.getDate() + 1);
    }
    
    dueDateInput.value = formatDateToDDMMYYYY(dueDate);
}

// 根据订单日期和赊账天数计算到账日期（用于数据处理）
function calculateDueDateFromData(orderDate, creditDays) {
    let order;
    
    // 处理DD/MM/YYYY格式的日期
    if (typeof orderDate === 'string' && orderDate.includes('/')) {
        order = parseDDMMYYYYToDate(orderDate);
    } else {
        order = new Date(orderDate);
    }
    
    // 检查日期是否有效
    if (isNaN(order.getTime())) {
        order = new Date(); // 如果日期无效，使用当前日期
    }
    
    let due = new Date(order);
    
    // 添加赊账天数
    due.setDate(due.getDate() + creditDays);
    
    // 跳过周末
    while (due.getDay() === 0 || due.getDay() === 6) {
        due.setDate(due.getDate() + 1);
    }
    
    return due.toISOString().split('T')[0];
}

// 加载并显示记录
function loadRecords() {
    const tbody = document.getElementById('recordsTable');
    tbody.innerHTML = '';
    
    const filteredRecords = getFilteredRecords();
    
    filteredRecords.forEach((record, index) => {
        const originalIndex = records.indexOf(record);
        const serialNumber = index + 1; // 序列号从1开始
        const row = createRecordRow(record, originalIndex, serialNumber);
        tbody.appendChild(row);
    });
    
    // 更新选择状态
    updateSelectionSummary();
}

// 更新表格显示
function updateTable() {
    const tbody = document.getElementById('recordsTable');
    tbody.innerHTML = '';

    const filteredRecords = getFilteredRecords();

    filteredRecords.forEach((record, index) => {
        const originalIndex = records.indexOf(record);
        const serialNumber = index + 1; // 序列号从1开始
        const row = createRecordRow(record, originalIndex, serialNumber);
        tbody.appendChild(row);
    });
    
    // 更新选择状态
    updateSelectionSummary();
}

// 创建记录行
function createRecordRow(record, index, serialNumber) {
    const row = document.createElement('tr');
    const today = new Date();
    const dueDate = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
    const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    // 确定实际状态
    let actualStatus = record.status;
    if (record.status === 'pending' && daysDiff < 0) {
        actualStatus = 'overdue';
    } else if (record.status === 'pending' && daysDiff <= 3) {
        actualStatus = 'due-soon';
    }
    
    // 设置行样式
    row.className = actualStatus;
    
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    // 状态选择下拉框
    const statusOptions = `
        <select onchange="updateRecordStatus(${index}, this.value)" class="text-xs px-2 py-1 border-0 rounded">
            <option value="pending" ${record.status === 'pending' ? 'selected' : ''}>${texts.statusPending}</option>
            <option value="paid" ${record.status === 'paid' ? 'selected' : ''}>${texts.statusPaid}</option>
        </select>
    `;
    
    const tooltipText = lang === 'zh' ? '双击编辑' : 'Clique duplo para editar';
    
    row.innerHTML = `
        <td class="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
            ${serialNumber}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell" data-field="nf" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.nf || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell" data-field="orderNumber" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.orderNumber || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 editable-cell" data-field="customerName" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.customerName}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell" data-field="amount" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${formatCurrency(record.amount)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell" data-field="orderDate" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${formatDate(record.orderDate) || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell" data-field="creditDays" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.creditDays || '-'}${lang === 'zh' ? '天' : ' dias'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            ${formatDate(record.dueDate) || '-'}
            ${daysDiff < 0 && record.status !== 'paid' ? `<br><small class="text-red-600">${lang === 'zh' ? '逾期' : 'Vencido'} ${Math.abs(daysDiff)} ${lang === 'zh' ? '天' : 'dias'}</small>` : 
              daysDiff <= 3 && record.status !== 'paid' ? `<br><small class="text-yellow-600">${daysDiff} ${lang === 'zh' ? '天后到期' : 'dias para vencer'}</small>` : ''}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            ${statusOptions}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <div class="flex items-center space-x-2">
                <button onclick="showEditModal(${index})" class="text-blue-600 hover:text-blue-900" title="${lang === 'zh' ? '编辑' : 'Editar'}">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="archiveRecord(${index})" class="text-yellow-600 hover:text-yellow-900" title="${texts.archive}">
                    <i class="fas fa-folder"></i>
                </button>
                <button onclick="deleteRecord(${index})" class="text-red-600 hover:text-red-900" title="${lang === 'zh' ? '删除' : 'Excluir'}">
                    <i class="fas fa-trash"></i>
                </button>
                <input type="checkbox" class="record-checkbox rounded border-gray-300 text-blue-600 focus:ring-blue-500 ml-2" 
                       data-index="${index}" onchange="updateSelectionSummary()">
            </div>
        </td>
    `;
    
    return row;
}

// 内联编辑功能
function editCell(cell) {
    const field = cell.dataset.field;
    const index = parseInt(cell.dataset.index);
    const currentValue = records[index][field] || '';
    
    // 如果已经在编辑状态，不重复创建输入框
    if (cell.querySelector('input')) {
        return;
    }
    
    // 保存原始内容
    const originalContent = cell.innerHTML;
    
    // 创建输入框
    let input;
    if (field === 'amount') {
        input = document.createElement('input');
        input.type = 'number';
        input.step = '0.01';
        input.value = currentValue;
    } else if (field === 'orderDate') {
        input = document.createElement('input');
        input.type = 'date';
        // 将DD/MM/YYYY格式转换为YYYY-MM-DD格式供date input使用
        if (currentValue) {
            const dateObj = parseDDMMYYYYToDate(currentValue);
            if (dateObj) {
                input.value = dateObj.toISOString().split('T')[0];
            }
        }
    } else if (field === 'creditDays') {
        input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.max = '365';
        input.value = currentValue;
    } else {
        input = document.createElement('input');
        input.type = 'text';
        input.value = currentValue;
    }
    
    input.className = 'w-full px-2 py-1 border border-blue-500 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
    
    // 替换单元格内容
    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();
    
    // 保存函数
    function saveEdit() {
        const newValue = input.value.trim();
        
        // 获取当前语言
         const lang = localStorage.getItem('selectedLanguage') || 'pt';
         
         // 验证输入
         if (field === 'customerName' && !newValue) {
             alert(lang === 'zh' ? '客户名称不能为空' : 'Nome do cliente não pode estar vazio');
             input.focus();
             return;
         }
         
         if (field === 'amount' && (!newValue || isNaN(parseFloat(newValue)) || parseFloat(newValue) <= 0)) {
             alert(lang === 'zh' ? '请输入有效的金额' : 'Por favor digite um valor válido');
             input.focus();
             return;
         }
         
         if (field === 'creditDays' && (!newValue || isNaN(parseInt(newValue)) || parseInt(newValue) <= 0)) {
             alert(lang === 'zh' ? '请输入有效的赊账天数' : 'Por favor digite dias de crédito válidos');
             input.focus();
             return;
         }
        
        // 更新记录
         if (field === 'amount') {
             records[index][field] = parseFloat(newValue);
         } else if (field === 'creditDays') {
             records[index][field] = parseInt(newValue);
             // 重新计算应收日期
             records[index].dueDate = calculateDueDateFromData(records[index].orderDate, records[index].creditDays);
         } else if (field === 'orderDate') {
             // 日期选择器返回YYYY-MM-DD格式，需要转换为DD/MM/YYYY格式
             if (!newValue) {
                 alert(lang === 'zh' ? '请选择一个日期' : 'Por favor selecione uma data');
                 input.focus();
                 return;
             }
             // 将YYYY-MM-DD转换为DD/MM/YYYY
             const dateParts = newValue.split('-');
             const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
             records[index][field] = formattedDate;
             // 重新计算应收日期
             records[index].dueDate = calculateDueDateFromData(records[index].orderDate, records[index].creditDays);
         } else {
             records[index][field] = newValue;
         }
        
        // 保存到本地存储
        saveRecords();
        
        // 直接更新当前单元格显示内容，而不是重新生成整个表格
        if (field === 'amount') {
            cell.innerHTML = formatCurrency(newValue);
        } else if (field === 'orderDate') {
            // 对于订单日期，直接显示已经格式化好的DD/MM/YYYY格式
            cell.innerHTML = records[index][field];
        } else if (field === 'dueDate') {
            // 对于应收日期，直接显示已经格式化好的DD/MM/YYYY格式
            cell.innerHTML = records[index][field];
        } else {
            cell.innerHTML = newValue;
        }
        
        // 如果修改了订单日期或赊账天数，需要更新应收日期列
        if (field === 'orderDate' || field === 'creditDays') {
            const row = cell.parentNode;
            const dueDateCell = row.children[6]; // 应收日期是第7列（索引6）
            dueDateCell.innerHTML = records[index].dueDate;
        }
        
        updateStatistics();
    }
    
    // 取消编辑函数
    function cancelEdit() {
        cell.innerHTML = originalContent;
    }
    
    // 事件监听
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveEdit();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    });
    
    input.addEventListener('blur', function() {
        saveEdit();
    });
}

// 添加状态更新函数
function updateRecordStatus(index, newStatus) {
    records[index].status = newStatus;
    records[index].updatedAt = new Date().toISOString();
    saveRecords();
    loadRecords();
    updateStatistics();
    
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const message = lang === 'zh' ? '状态更新成功！' : 'Status atualizado com sucesso!';
    showNotification(message, 'success');
}

// 添加状态更新函数
function updateRecordStatus(index, newStatus) {
    records[index].status = newStatus;
    records[index].updatedAt = new Date().toISOString();
    saveRecords();
    loadRecords();
    updateStatistics();
    
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const message = lang === 'zh' ? '状态更新成功！' : 'Status atualizado com sucesso!';
    showNotification(message, 'success');
}

// 获取筛选后的记录
function getFilteredRecords() {
    const customerSearch = document.getElementById('customerSearch').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    
    return records.filter(record => {
        // 排除归档记录（除非明确筛选归档状态）
        if (record.archived && statusFilter !== 'archived') {
            return false;
        }
        
        // 客户名称筛选
        if (customerSearch && !record.customerName.toLowerCase().includes(customerSearch)) {
            return false;
        }
        
        // 状态筛选
        if (statusFilter) {
            if (statusFilter === 'archived') {
                return record.archived === true;
            }
            
            const today = new Date();
            const dueDate = new Date(record.dueDate);
            const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            
            switch (statusFilter) {
                case 'pending':
                    if (record.status !== 'pending' || daysDiff < 0) return false;
                    break;
                case 'paid':
                    if (record.status !== 'paid') return false;
                    break;
                case 'overdue':
                    if (record.status === 'paid' || daysDiff >= 0) return false;
                    break;
            }
        }
        
        // 日期范围筛选
        if (dateFrom && record.dueDate < dateFrom) return false;
        if (dateTo && record.dueDate > dateTo) return false;
        
        return true;
    });
}

// 筛选记录
function filterRecords() {
    loadRecords();
}

// 格式化货币为巴西雷亚尔
function formatCurrency(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'R$ 0,00';
    }
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// 格式化金额输入字段为巴西货币格式
function formatAmountInput(input) {
    let value = input.value.replace(/[^\d,]/g, ''); // 只保留数字和逗号
    
    // 移除多余的逗号
    const commaIndex = value.indexOf(',');
    if (commaIndex !== -1) {
        const beforeComma = value.substring(0, commaIndex).replace(/,/g, '');
        const afterComma = value.substring(commaIndex + 1).replace(/,/g, '');
        if (afterComma.length > 2) {
            value = beforeComma + ',' + afterComma.substring(0, 2);
        } else {
            value = beforeComma + ',' + afterComma;
        }
    }
    
    // 添加千位分隔符
    if (commaIndex !== -1) {
        const parts = value.split(',');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        value = parts.join(',');
    } else {
        value = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    
    // 添加R$前缀
    if (value && value !== '') {
        input.value = 'R$ ' + value;
    } else {
        input.value = '';
    }
}

// 从格式化的金额字符串中提取数值
function parseAmountValue(formattedValue) {
    if (!formattedValue) return 0;
    // 移除R$和千位分隔符，将逗号替换为点
    const cleanValue = formattedValue.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
    return parseFloat(cleanValue) || 0;
}

// 更新统计信息
function updateStatistics() {
    const totalAmount = records.reduce((sum, record) => sum + record.amount, 0);
    const paidAmount = records.filter(r => r.status === 'paid').reduce((sum, record) => sum + record.amount, 0);
    const pendingAmount = totalAmount - paidAmount;
    
    const today = new Date();
    const overdueCount = records.filter(record => {
        const dueDate = new Date(record.dueDate);
        return record.status !== 'paid' && dueDate < today;
    }).length;
    
    // 使用巴西货币格式显示所有金额
    document.getElementById('totalAmount').textContent = formatCurrency(totalAmount);
    document.getElementById('paidAmount').textContent = formatCurrency(paidAmount);
    document.getElementById('pendingAmount').textContent = formatCurrency(pendingAmount);
    document.getElementById('overdueCount').textContent = overdueCount;
}

// 检查到账日期并发送提醒
function checkDueDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dueTomorrow = records.filter(record => {
        const dueDate = new Date(record.dueDate);
        return record.status !== 'paid' && 
               dueDate.toDateString() === tomorrow.toDateString();
    });
    
    const overdue = records.filter(record => {
        const dueDate = new Date(record.dueDate);
        return record.status !== 'paid' && dueDate < today;
    });
    
    if (dueTomorrow.length > 0) {
        showNotification(`提醒：明天有 ${dueTomorrow.length} 笔账款到期`, 'warning');
    }
    
    if (overdue.length > 0) {
        showNotification(`警告：有 ${overdue.length} 笔账款已逾期`, 'error');
    }
}

// 生成报表
function generateReport() {
    // 先显示报表模态框
    document.getElementById('reportModal').classList.remove('hidden');
    
    const reportContent = document.getElementById('reportContent');
    if (!reportContent) {
        console.error('reportContent element not found');
        return;
    }
    const today = new Date();
    const currentLang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[currentLang];
    const locale = currentLang === 'pt' ? 'pt-BR' : 'zh-CN';
    const currency = currentLang === 'pt' ? 'BRL' : 'CNY';
    const currencySymbol = currentLang === 'pt' ? 'R$' : '¥';
    
    // 按客户分组统计
    const customerStats = {};
    records.forEach(record => {
        if (!customerStats[record.customerName]) {
            customerStats[record.customerName] = {
                total: 0,
                paid: 0,
                pending: 0,
                overdue: 0,
                count: 0
            };
        }
        
        const stats = customerStats[record.customerName];
        stats.total += record.amount;
        stats.count++;
        
        if (record.status === 'paid') {
            stats.paid += record.amount;
        } else {
            const dueDate = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
            if (dueDate < today) {
                stats.overdue += record.amount;
            } else {
                stats.pending += record.amount;
            }
        }
    });
    
    // 月度统计
    const monthlyStats = {};
    records.forEach(record => {
        // 处理DD/MM/YYYY格式的日期
        const dateObj = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
        const month = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`; // MM/YYYY
        if (!monthlyStats[month]) {
            monthlyStats[month] = { total: 0, paid: 0, pending: 0 };
        }
        
        monthlyStats[month].total += record.amount;
        if (record.status === 'paid') {
            monthlyStats[month].paid += record.amount;
        } else {
            monthlyStats[month].pending += record.amount;
        }
    });
    
    reportContent.innerHTML = `
        <div class="space-y-6">
            <!-- 总体统计 -->
            <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold mb-4">${texts.overallStats}</h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="text-center">
                        <div class="text-2xl font-bold text-blue-600">${currencySymbol}${records.reduce((sum, r) => sum + r.amount, 0).toLocaleString(locale, {minimumFractionDigits: 2})}</div>
                        <div class="text-sm text-gray-600">${texts.totalAmountReport}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-green-600">${currencySymbol}${records.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount, 0).toLocaleString(locale, {minimumFractionDigits: 2})}</div>
                        <div class="text-sm text-gray-600">${texts.paidAmountReport}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-yellow-600">${currencySymbol}${records.filter(r => r.status !== 'paid').reduce((sum, r) => sum + r.amount, 0).toLocaleString(locale, {minimumFractionDigits: 2})}</div>
                        <div class="text-sm text-gray-600">${texts.pendingAmountReport}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-red-600">${records.filter(r => r.status !== 'paid' && (parseDDMMYYYYToDate(r.dueDate) || new Date(r.dueDate)) < today).length}</div>
                        <div class="text-sm text-gray-600">${texts.overdueCountReport}</div>
                    </div>
                </div>
            </div>
            
            <!-- 客户统计 -->
            <div>
                <h4 class="text-lg font-semibold mb-4">${texts.customerStats}</h4>
                <div class="overflow-x-auto">
                    <table class="w-full border border-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left">${texts.customerNameReport}</th>
                                <th class="px-4 py-2 text-right">${texts.totalAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.paidAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.pendingAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.overdueAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.recordCountReport}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(customerStats).map(([customer, stats]) => `
                                <tr class="border-t">
                                    <td class="px-4 py-2">${customer}</td>
                                    <td class="px-4 py-2 text-right">${currencySymbol}${stats.total.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right text-green-600">${currencySymbol}${stats.paid.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right text-yellow-600">${currencySymbol}${stats.pending.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right text-red-600">${currencySymbol}${stats.overdue.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right">${stats.count}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- 月度统计 -->
            <div>
                <h4 class="text-lg font-semibold mb-4">${texts.monthlyStats}</h4>
                <div class="overflow-x-auto">
                    <table class="w-full border border-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-2 text-left">${texts.monthReport}</th>
                                <th class="px-4 py-2 text-right">${texts.totalAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.paidAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.pendingAmountReport}</th>
                                <th class="px-4 py-2 text-right">${texts.collectionRateReport}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(monthlyStats).sort().reverse().map(([month, stats]) => `
                                <tr class="border-t">
                                    <td class="px-4 py-2">${month}</td>
                                    <td class="px-4 py-2 text-right">${currencySymbol}${stats.total.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right text-green-600">${currencySymbol}${stats.paid.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right text-yellow-600">${currencySymbol}${stats.pending.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right">${((stats.paid / stats.total) * 100).toFixed(1)}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('reportModal').classList.remove('hidden');
}

// 智能对话功能
function openChatModal() {
    document.getElementById('chatModal').classList.remove('hidden');
    resetChatContext();
    const lang = localStorage.getItem('selectedLanguage') || 'zh';
    const strings = languages[lang];
    addChatMessage(strings.welcome, 'bot');
}

function closeChatModal() {
    document.getElementById('chatModal').classList.add('hidden');
    document.getElementById('chatMessages').innerHTML = '';
}

function resetChatContext() {
    const currentLang = chatContext.language || 'zh';
    chatContext = {
        step: 'start',
        tempRecord: {},
        language: currentLang
    };
}

function addChatMessage(message, sender) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `mb-2 ${sender === 'user' ? 'text-right' : 'text-left'}`;
    
    messageDiv.innerHTML = `
        <div class="inline-block px-3 py-2 rounded-lg max-w-xs ${
            sender === 'user' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 text-gray-800'
        }">
            ${message}
        </div>
    `;
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function handleChatKeyPress(event) {
    if (event.key === 'Enter') {
        sendChatMessage();
    }
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    addChatMessage(message, 'user');
    input.value = '';
    
    // 处理用户消息
    processChatMessage(message);
}

function processChatMessage(message) {
    // 检测语言
    chatContext.language = detectLanguage(message);
    const lang = chatContext.language;
    const strings = languages[lang];
    
    const lowerMessage = message.toLowerCase();
    
    switch (chatContext.step) {
        case 'start':
            // 尝试从消息中提取客户名称
            const customerMatch = message.match(/客户[：:]?\s*([^，,\s]+)/) || 
                                message.match(/([^，,\s]+)客户/) ||
                                message.match(/cliente[：:]?\s*([^，,\s]+)/i) ||
                                message.match(/^([^，,\s]+)/);
            
            if (customerMatch) {
                chatContext.tempRecord.customerName = customerMatch[1];
                chatContext.step = 'amount';
                addChatMessage(lang === 'zh' ? `好的，客户是${customerMatch[1]}。请告诉我订单金额。` : `Ok, cliente é ${customerMatch[1]}. Por favor me informe o valor do pedido.`, 'bot');
            } else {
                addChatMessage(strings.askCustomer, 'bot');
            }
            break;
            
        case 'amount':
            // 提取金额
            const amountMatch = message.match(/(\d+(?:\.\d+)?)/) || 
                              message.match(/([一二三四五六七八九十百千万]+)/);
            
            if (amountMatch) {
                let amount = parseFloat(amountMatch[1]);
                if (isNaN(amount)) {
                    // 处理中文数字（简单实现）
                    amount = convertChineseNumber(amountMatch[1]);
                }
                
                if (amount > 0) {
                    chatContext.tempRecord.amount = amount;
                    chatContext.step = 'creditDays';
                    addChatMessage(lang === 'zh' ? `金额是${amount}元。请选择赊账天数：30天、60天、90天，或者告诉我具体天数。` : `Valor é ${amount}. Por favor escolha os dias de crédito: 30 dias, 60 dias, 90 dias, ou me informe um número específico.`, 'bot');
                } else {
                    addChatMessage(strings.invalidAmount, 'bot');
                }
            } else {
                addChatMessage(strings.askAmount, 'bot');
            }
            break;
            

        case 'creditDays':
            const daysMatch = message.match(/(\d+)/) || 
                            message.match(/(三十|六十|九十)/);
            
            let creditDays = 30; // 默认值
            
            if (daysMatch) {
                if (daysMatch[1] === '三十') creditDays = 30;
                else if (daysMatch[1] === '六十') creditDays = 60;
                else if (daysMatch[1] === '九十') creditDays = 90;
                else creditDays = parseInt(daysMatch[1]);
            } else if (lowerMessage.includes('30') || lowerMessage.includes('三十')) {
                creditDays = 30;
            } else if (lowerMessage.includes('60') || lowerMessage.includes('六十')) {
                creditDays = 60;
            } else if (lowerMessage.includes('90') || lowerMessage.includes('九十')) {
                creditDays = 90;
            }
            
            chatContext.tempRecord.creditDays = creditDays;
            
            // 计算到账日期（使用当前日期作为订单日期）
            let dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + creditDays);
            
            // 跳过周末
            while (dueDate.getDay() === 0 || dueDate.getDay() === 6) {
                dueDate.setDate(dueDate.getDate() + 1);
            }
            
            const dueDateStr = formatDateToDDMMYYYY(dueDate);
            chatContext.tempRecord.dueDate = dueDateStr;
            
            // 创建记录
            const record = {
                customerName: chatContext.tempRecord.customerName,
                amount: chatContext.tempRecord.amount,
                orderDate: formatDateToDDMMYYYY(new Date()),
                creditDays: creditDays,
                dueDate: dueDateStr,
                status: 'pending',
                notes: lang === 'zh' ? '智能对话添加' : 'Adicionado por conversa inteligente',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            records.push(record);
            saveRecords();
            loadRecords();
            updateStatistics();
            
            addChatMessage(`${strings.completed}\n${strings.customer}：${record.customerName}\n${strings.amount}：${lang === 'zh' ? '¥' : 'R$ '}${record.amount}\n${strings.orderDate}：${record.orderDate}\n${strings.creditDays}：${creditDays}${lang === 'zh' ? '天' : ' dias'}\n${strings.dueDate}：${dueDateStr}`, 'bot');
            
            setTimeout(() => {
                closeChatModal();
                showNotification(strings.success, 'success');
            }, 2000);
            break;
    }
}

function parseDate(dateStr) {
    const today = new Date();
    const lowerStr = dateStr.toLowerCase();
    const lang = chatContext.language;
    
    // 检查相对日期词汇
    const todayWords = languages[lang].today;
    const tomorrowWords = languages[lang].tomorrow;
    const yesterdayWords = languages[lang].yesterday;
    
    if (todayWords.some(word => lowerStr.includes(word))) {
        return formatDateToDDMMYYYY(today);
    }
    
    if (tomorrowWords.some(word => lowerStr.includes(word))) {
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return formatDateToDDMMYYYY(tomorrow);
    }
    
    if (yesterdayWords.some(word => lowerStr.includes(word))) {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return formatDateToDDMMYYYY(yesterday);
    }
    
    // 尝试解析DD/MM/YYYY格式
    const ddmmyyyyMatch = dateStr.match(/(\d{1,2})[\/](\d{1,2})[\/](\d{4})/);
    if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day) {
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
    }
    
    // 尝试解析DD/MM格式（当年）
    const ddmmMatch = dateStr.match(/(\d{1,2})[\/](\d{1,2})/);
    if (ddmmMatch) {
        const [, day, month] = ddmmMatch;
        const year = today.getFullYear();
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day) {
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
    }
    
    // 尝试解析YYYY-MM-DD格式（兼容旧格式）
    const yyyymmddMatch = dateStr.match(/(\d{4})[-](\d{1,2})[-](\d{1,2})/);
    if (yyyymmddMatch) {
        const [, year, month, day] = yyyymmddMatch;
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day) {
            return formatDateToDDMMYYYY(date);
        }
    }
    
    return null;
}

// 将Date对象格式化为DD/MM/YYYY
function formatDateToDDMMYYYY(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// 将DD/MM/YYYY格式转换为Date对象
function parseDDMMYYYYToDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // 月份从0开始
        const year = parseInt(parts[2]);
        return new Date(year, month, day);
    }
    return null;
}

function convertChineseNumber(chineseNum) {
    // 简单的中文数字转换（可以扩展）
    const map = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
        '百': 100, '千': 1000, '万': 10000
    };
    
    // 这里只是简单实现，实际可能需要更复杂的逻辑
    return parseFloat(chineseNum) || 0;
}

// 批量导入功能
function showImportHelp() {
    document.getElementById('importModal').classList.remove('hidden');
    initializeFileUpload();
}

function closeImportModal() {
    document.getElementById('importModal').classList.add('hidden');
    clearFile();
}

// 初始化文件上传功能
function initializeFileUpload() {
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('importFile');
    const selectFileBtn = document.getElementById('selectFileBtn');
    
    // 点击选择文件
    selectFileBtn.addEventListener('click', function() {
        fileInput.click();
    });
    
    // 点击拖拽区域选择文件
    dropArea.addEventListener('click', function() {
        fileInput.click();
    });
    
    // 文件选择事件
    fileInput.addEventListener('change', handleFileSelect);
    
    // 拖拽事件
    dropArea.addEventListener('dragover', handleDragOver);
    dropArea.addEventListener('dragleave', handleDragLeave);
    dropArea.addEventListener('drop', handleDrop);
}

// 处理文件选择
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        displayFileInfo(file);
    }
}

// 处理拖拽悬停
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('border-blue-400', 'bg-blue-50');
}

// 处理拖拽离开
function handleDragLeave(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
}

// 处理文件拖拽放置
function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        document.getElementById('importFile').files = files;
        displayFileInfo(file);
    }
}

// 显示文件信息
function displayFileInfo(file) {
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileInfo = document.getElementById('fileInfo');
    
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.remove('hidden');
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 清除文件
function clearFile() {
    document.getElementById('importFile').value = '';
    document.getElementById('fileInfo').classList.add('hidden');
}

// 处理文件导入
function processImport() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        const currentLang = localStorage.getItem('selectedLanguage') || 'zh';
        const message = currentLang === 'pt' ? 'Por favor, selecione um arquivo' : '请选择文件';
        showNotification(message, 'error');
        return;
    }
    
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let importedData = [];
            
            if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
                // 处理Excel文件
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                if (jsonData.length < 2) {
                    throw new Error('文件数据不足');
                }
                
                // 获取标题行并找到对应列的索引
                const headers = jsonData[0].map(h => h ? h.toString().trim() : '');
                const columnMap = {
                    nf: -1,
                    orderNumber: -1,
                    orderDate: -1,
                    customerName: -1,
                    amount: -1
                };
                
                // 查找列索引
                console.log('Excel headers found:', headers);
                headers.forEach((header, index) => {
                    const normalizedHeader = header.toLowerCase().replace(/\s+/g, '').replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c');
                    console.log(`Header "${header}" normalized to "${normalizedHeader}"`);
                    if (normalizedHeader === 'nf') {
                        columnMap.nf = index;
                        console.log('Found NF column at index:', index);
                    } else if (normalizedHeader === 'pedido') {
                        columnMap.orderNumber = index;
                        console.log('Found Pedido column at index:', index);
                    } else if (normalizedHeader === 'datadeemissao' || normalizedHeader === 'datadeemissão') {
                        columnMap.orderDate = index;
                        console.log('Found Data de Emissão column at index:', index);
                    } else if (normalizedHeader === 'cliente') {
                        columnMap.customerName = index;
                        console.log('Found Cliente column at index:', index);
                    } else if (normalizedHeader === 'valorfinal') {
                        columnMap.amount = index;
                        console.log('Found Valor Final column at index:', index);
                    }
                });
                
                console.log('Column mapping result:', columnMap);
                
                // 检查必需的列是否存在
                if (columnMap.customerName === -1 || columnMap.amount === -1) {
                    throw new Error('缺少必需的列：Cliente 和 Valor Final');
                }
                
                // 处理数据行
                for (let i = 1; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row && row.length > 0) {
                        const customerName = columnMap.customerName >= 0 ? (row[columnMap.customerName] || '').toString().trim() : '';
                        const amountValue = columnMap.amount >= 0 ? row[columnMap.amount] : 0;
                        
                        if (customerName && amountValue) {
                            // 处理日期数据
                            let orderDateValue = '';
                            if (columnMap.orderDate >= 0 && row[columnMap.orderDate] !== undefined && row[columnMap.orderDate] !== null) {
                                const rawDate = row[columnMap.orderDate];
                                console.log('Raw date value:', rawDate, 'Type:', typeof rawDate);
                                
                                if (typeof rawDate === 'number') {
                                    // Excel日期序列号转换
                                    const excelEpoch = new Date(1900, 0, 1);
                                    const days = rawDate - 2; // Excel日期从1900年1月1日开始，需要减去2天
                                    const jsDate = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
                                    orderDateValue = formatDateToDDMMYYYY(jsDate);
                                    console.log('Converted Excel date:', orderDateValue);
                                } else if (rawDate instanceof Date) {
                                    orderDateValue = formatDateToDDMMYYYY(rawDate);
                                    console.log('Date object converted:', orderDateValue);
                                } else {
                                    orderDateValue = rawDate.toString().trim();
                                    console.log('String date value:', orderDateValue);
                                }
                            }
                            
                            const recordData = {
                                nf: columnMap.nf >= 0 ? (row[columnMap.nf] || '').toString().trim() : '',
                                orderNumber: columnMap.orderNumber >= 0 ? (row[columnMap.orderNumber] || '').toString().trim() : '',
                                orderDate: orderDateValue,
                                customerName: customerName,
                                amount: parseFloat(amountValue) || 0
                            };
                            
                            console.log('Record data prepared:', recordData);
                            importedData.push(recordData);
                        }
                    }
                }
            } else if (fileName.endsWith('.csv')) {
                // 处理CSV文件
                const csvData = e.target.result;
                const lines = csvData.split('\n').filter(line => line.trim());
                
                if (lines.length < 2) {
                    throw new Error('文件数据不足');
                }
                
                // 获取标题行并找到对应列的索引
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                const columnMap = {
                    nf: -1,
                    orderNumber: -1,
                    orderDate: -1,
                    customerName: -1,
                    amount: -1
                };
                
                // 查找列索引
                console.log('CSV headers found:', headers);
                headers.forEach((header, index) => {
                    const normalizedHeader = header.toLowerCase().replace(/\s+/g, '').replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ç]/g, 'c');
                    console.log(`Header "${header}" normalized to "${normalizedHeader}"`);
                    if (normalizedHeader === 'nf') {
                        columnMap.nf = index;
                        console.log('Found NF column at index:', index);
                    } else if (normalizedHeader === 'pedido') {
                        columnMap.orderNumber = index;
                        console.log('Found Pedido column at index:', index);
                    } else if (normalizedHeader === 'datadeemissao' || normalizedHeader === 'datadeemissão') {
                        columnMap.orderDate = index;
                        console.log('Found Data de Emissão column at index:', index);
                    } else if (normalizedHeader === 'cliente') {
                        columnMap.customerName = index;
                        console.log('Found Cliente column at index:', index);
                    } else if (normalizedHeader === 'valorfinal') {
                        columnMap.amount = index;
                        console.log('Found Valor Final column at index:', index);
                    }
                });
                
                console.log('Column mapping result:', columnMap);
                
                // 检查必需的列是否存在
                if (columnMap.customerName === -1 || columnMap.amount === -1) {
                    throw new Error('缺少必需的列：Cliente 和 Valor Final');
                }
                
                // 处理数据行
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',').map(cell => cell.trim().replace(/"/g, ''));
                    if (row && row.length > 0) {
                        const customerName = columnMap.customerName >= 0 ? (row[columnMap.customerName] || '').toString().trim() : '';
                        const amountValue = columnMap.amount >= 0 ? row[columnMap.amount] : 0;
                        
                        if (customerName && amountValue) {
                            importedData.push({
                                nf: columnMap.nf >= 0 ? (row[columnMap.nf] || '').toString().trim() : '',
                                orderNumber: columnMap.orderNumber >= 0 ? (row[columnMap.orderNumber] || '').toString().trim() : '',
                                orderDate: columnMap.orderDate >= 0 ? (row[columnMap.orderDate] || '').toString().trim() : '',
                                customerName: customerName,
                                amount: parseFloat(amountValue) || 0
                            });
                        }
                    }
                }
            }
            
            if (importedData.length > 0) {
                let successCount = 0;
                let errorCount = 0;
                
                importedData.forEach((item, index) => {
                    try {
                        if (!item.customerName || item.amount <= 0) {
                            throw new Error('客户名称或金额无效');
                        }
                        
                        // 处理日期格式
                        let parsedOrderDate;
                        if (item.orderDate) {
                            if (item.orderDate.includes('/')) {
                                parsedOrderDate = item.orderDate;
                            } else {
                                const dateObj = new Date(item.orderDate);
                                if (!isNaN(dateObj.getTime())) {
                                    parsedOrderDate = formatDateToDDMMYYYY(dateObj);
                                } else {
                                    parsedOrderDate = formatDateToDDMMYYYY(new Date());
                                }
                            }
                        } else {
                            parsedOrderDate = formatDateToDDMMYYYY(new Date());
                        }
                        
                        // 计算应收日期（默认30天）
                        const orderDateObj = parseDDMMYYYYToDate(parsedOrderDate) || new Date();
                        const dueDateObj = new Date(orderDateObj);
                        dueDateObj.setDate(dueDateObj.getDate() + 30);
                        const dueDate = formatDateToDDMMYYYY(dueDateObj);
                        
                        const record = {
                            id: Date.now() + Math.random() + index,
                            nf: item.nf,
                            orderNumber: item.orderNumber,
                            customerName: item.customerName,
                            amount: item.amount,
                            orderDate: parsedOrderDate,
                            creditDays: 30,
                            dueDate: dueDate,
                            status: 'pending',
                            notes: '',
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        };
                        
                        records.push(record);
                        successCount++;
                    } catch (error) {
                        console.error(`第${index + 1}行导入失败:`, error.message);
                        errorCount++;
                    }
                });
                
                // 保存到本地存储
                saveRecords();
                
                // 更新显示
                loadRecords();
                updateStatistics();
                
                // 关闭模态框
                closeImportModal();
                
                // 显示结果
                const currentLang = localStorage.getItem('selectedLanguage') || 'zh';
                if (successCount > 0) {
                    const message = currentLang === 'pt' 
                        ? `${successCount} registros importados com sucesso${errorCount > 0 ? `, ${errorCount} falharam` : ''}` 
                        : `成功导入 ${successCount} 条记录${errorCount > 0 ? `，失败 ${errorCount} 条` : ''}`;
                    showNotification(message, 'success');
                } else {
                    const message = currentLang === 'pt' ? 'Falha na importação, verifique o formato dos dados' : '导入失败，请检查数据格式';
                    showNotification(message, 'error');
                }
            } else {
                const currentLang = localStorage.getItem('selectedLanguage') || 'zh';
                const message = currentLang === 'pt' ? 'Nenhum dado encontrado no arquivo' : '文件中未找到有效数据';
                showNotification(message, 'error');
            }
        } catch (error) {
            console.error('导入文件时出错:', error);
            const currentLang = localStorage.getItem('selectedLanguage') || 'zh';
            let message;
            if (error.message.includes('缺少必需的列')) {
                message = currentLang === 'pt' ? 'Colunas obrigatórias não encontradas: Cliente e Valor Final' : '缺少必需的列：Cliente 和 Valor Final';
            } else if (error.message.includes('文件数据不足')) {
                message = currentLang === 'pt' ? 'Dados insuficientes no arquivo' : '文件数据不足';
            } else {
                message = currentLang === 'pt' ? 'Erro ao importar arquivo. Verifique o formato.' : '导入文件时出错，请检查文件格式';
            }
            showNotification(message, 'error');
        }
    };
    
    // 根据文件类型选择读取方式
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

// 导出报表
function exportReport() {
    const reportContent = document.getElementById('reportContent').innerHTML;
    const currentLang = localStorage.getItem('selectedLanguage') || 'zh';
    const texts = uiTexts[currentLang];
    const locale = currentLang === 'pt' ? 'pt-BR' : 'zh-CN';
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${texts.reportTitle}</title>
            <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
            <style>
                @media print {
                    body { font-size: 12px; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body class="p-6">
            <h1 class="text-2xl font-bold mb-6">${texts.reportTitle}</h1>
            <p class="text-gray-600 mb-6">${texts.reportGeneratedTime}：${new Date().toLocaleString(locale)}</p>
            ${reportContent}
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// 导出PDF报表
function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const currentLang = localStorage.getItem('selectedLanguage') || 'zh';
    const texts = uiTexts[currentLang];
    const locale = currentLang === 'pt' ? 'pt-BR' : 'zh-CN';
    const currencySymbol = currentLang === 'pt' ? 'R$' : '¥';
    
    // 设置字体（支持中文）
    doc.setFont('helvetica');
    
    // 标题
    doc.setFontSize(20);
    doc.text(texts.reportTitle, 20, 30);
    
    // 生成时间
    doc.setFontSize(12);
    doc.text(`${texts.reportGeneratedTime}: ${new Date().toLocaleString(locale)}`, 20, 45);
    
    let yPosition = 65;
    
    // 总体统计
    doc.setFontSize(16);
    doc.text(texts.overallStats, 20, yPosition);
    yPosition += 15;
    
    const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);
    const paidAmount = records.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.amount, 0);
    const pendingAmount = records.filter(r => r.status !== 'paid').reduce((sum, r) => sum + r.amount, 0);
    const overdueCount = records.filter(r => r.status !== 'paid' && (parseDDMMYYYYToDate(r.dueDate) || new Date(r.dueDate)) < new Date()).length;
    
    doc.setFontSize(12);
    doc.text(`${texts.totalAmountReport}: ${currencySymbol}${totalAmount.toLocaleString(locale, {minimumFractionDigits: 2})}`, 20, yPosition);
    yPosition += 10;
    doc.text(`${texts.paidAmountReport}: ${currencySymbol}${paidAmount.toLocaleString(locale, {minimumFractionDigits: 2})}`, 20, yPosition);
    yPosition += 10;
    doc.text(`${texts.pendingAmountReport}: ${currencySymbol}${pendingAmount.toLocaleString(locale, {minimumFractionDigits: 2})}`, 20, yPosition);
    yPosition += 10;
    doc.text(`${texts.overdueCountReport}: ${overdueCount}`, 20, yPosition);
    yPosition += 20;
    
    // 客户统计
    doc.setFontSize(16);
    doc.text(texts.customerStats, 20, yPosition);
    yPosition += 15;
    
    // 按客户分组统计
    const customerStats = {};
    records.forEach(record => {
        if (!customerStats[record.customerName]) {
            customerStats[record.customerName] = {
                total: 0,
                paid: 0,
                pending: 0,
                overdue: 0,
                count: 0
            };
        }
        
        const stats = customerStats[record.customerName];
        stats.total += record.amount;
        stats.count++;
        
        if (record.status === 'paid') {
            stats.paid += record.amount;
        } else {
            const dueDate = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
            if (dueDate < new Date()) {
                stats.overdue += record.amount;
            } else {
                stats.pending += record.amount;
            }
        }
    });
    
    doc.setFontSize(10);
    Object.entries(customerStats).forEach(([customer, stats]) => {
        if (yPosition > 250) {
            doc.addPage();
            yPosition = 30;
        }
        doc.text(`${customer}: ${texts.totalAmountReport} ${currencySymbol}${stats.total.toLocaleString(locale, {minimumFractionDigits: 2})}, ${texts.paidAmountReport} ${currencySymbol}${stats.paid.toLocaleString(locale, {minimumFractionDigits: 2})}`, 20, yPosition);
        yPosition += 8;
    });
    
    yPosition += 10;
    
    // 月度统计
    if (yPosition > 220) {
        doc.addPage();
        yPosition = 30;
    }
    
    doc.setFontSize(16);
    doc.text(texts.monthlyStats, 20, yPosition);
    yPosition += 15;
    
    // 月度统计数据
    const monthlyStats = {};
    records.forEach(record => {
        const dateObj = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
        const month = `${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
        if (!monthlyStats[month]) {
            monthlyStats[month] = { total: 0, paid: 0, pending: 0 };
        }
        
        monthlyStats[month].total += record.amount;
        if (record.status === 'paid') {
            monthlyStats[month].paid += record.amount;
        } else {
            monthlyStats[month].pending += record.amount;
        }
    });
    
    doc.setFontSize(10);
    Object.entries(monthlyStats).sort().reverse().forEach(([month, stats]) => {
        if (yPosition > 250) {
            doc.addPage();
            yPosition = 30;
        }
        const collectionRate = ((stats.paid / stats.total) * 100).toFixed(1);
        doc.text(`${month}: ${texts.totalAmountReport} ${currencySymbol}${stats.total.toLocaleString(locale, {minimumFractionDigits: 2})}, ${texts.collectionRateReport} ${collectionRate}%`, 20, yPosition);
        yPosition += 8;
    });
    
    // 保存PDF
    const fileName = `${texts.reportTitle}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification px-4 py-3 rounded-lg shadow-lg text-white max-w-sm`;
    
    switch (type) {
        case 'success':
            notification.className += ' bg-green-500';
            break;
        case 'error':
            notification.className += ' bg-red-500';
            break;
        case 'warning':
            notification.className += ' bg-yellow-500';
            break;
        default:
            notification.className += ' bg-blue-500';
    }
    
    notification.innerHTML = `
        <div class="flex items-center space-x-2">
            <i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'times' : type === 'warning' ? 'exclamation-triangle' : 'info'}-circle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// 格式化日期为DD/MM/YYYY格式
function formatDate(dateString) {
    if (!dateString) return '';
    
    // 如果已经是DD/MM/YYYY格式，直接返回
    if (typeof dateString === 'string' && dateString.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        return dateString;
    }
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    return formatDateToDDMMYYYY(date);
}

// 处理日历选择器的日期设置
function setDateFromPicker() {
    const datePicker = document.getElementById('orderDatePicker');
    const dateInput = document.getElementById('orderDate');
    
    if (datePicker.value) {
        // 将YYYY-MM-DD格式转换为DD/MM/YYYY格式
        // 直接进行字符串转换，避免任何Date对象相关的时区问题
        const dateParts = datePicker.value.split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        const day = dateParts[2];
        const formattedDate = `${day}/${month}/${year}`;
        dateInput.value = formattedDate;
        
        // 触发计算应收日期
        calculateDueDate();
    }
}

// ========== 选择框相关功能 ==========

// 全选/取消全选
function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAll');
    // 只选择当前表格中可见的选择框
    const recordCheckboxes = document.querySelectorAll('#recordsTable .record-checkbox');
    
    recordCheckboxes.forEach(checkbox => {
        checkbox.checked = selectAllCheckbox.checked;
    });
    
    updateSelectionSummary();
}

// 更新选择统计
function updateSelectionSummary() {
    // 只计算当前表格中可见的选择框
    const recordCheckboxes = document.querySelectorAll('#recordsTable .record-checkbox');
    const selectedCheckboxes = document.querySelectorAll('#recordsTable .record-checkbox:checked');
    const selectAllCheckbox = document.getElementById('selectAll');
    const lang = localStorage.getItem('selectedLanguage') || 'zh';
    
    // 更新全选框状态（如果存在）
    if (selectAllCheckbox) {
        if (selectedCheckboxes.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedCheckboxes.length === recordCheckboxes.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }
    
    // 计算选中记录的总金额
    let selectedTotal = 0;
    const filteredRecords = getFilteredRecords();
    
    selectedCheckboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const record = records[index];
        if (record && record.amount) {
            // 解析金额（移除货币符号和格式化）
            const amount = parseFloat(record.amount.toString().replace(/[^\d.-]/g, ''));
            if (!isNaN(amount)) {
                selectedTotal += amount;
            }
        }
    });
    
    // 更新显示文本（支持葡萄牙语）
    const selectedCountLabel = document.getElementById('selectedCountLabel');
    const selectedRecordsLabel = document.getElementById('selectedRecordsLabel');
    const selectedTotalLabel = document.getElementById('selectedTotalLabel');
    const generateReportLabel = document.getElementById('generateReportLabel');
    const clearSelectionLabel = document.getElementById('clearSelectionLabel');
    
    if (lang === 'pt') {
        selectedCountLabel.textContent = 'Selecionados:';
        selectedRecordsLabel.textContent = 'registros';
        selectedTotalLabel.textContent = 'Total Selecionado:';
        generateReportLabel.textContent = 'Gerar Relatório';
        clearSelectionLabel.textContent = 'Limpar Seleção';
    } else {
        selectedCountLabel.textContent = '已选择:';
        selectedRecordsLabel.textContent = '条记录';
        selectedTotalLabel.textContent = '选中总额:';
        generateReportLabel.textContent = '生成报表';
        clearSelectionLabel.textContent = '清除选择';
    }
    
    document.getElementById('selectedCount').textContent = selectedCheckboxes.length;
    document.getElementById('selectedTotal').textContent = formatCurrency(selectedTotal);
    
    // 更新按钮状态
    const generateReportBtn = document.getElementById('generateReportBtn');
    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    
    if (selectedCheckboxes.length > 0) {
        generateReportBtn.disabled = false;
        clearSelectionBtn.disabled = false;
    } else {
        generateReportBtn.disabled = true;
        clearSelectionBtn.disabled = true;
    }
}

// 清除选择
function clearSelection() {
    // 清除所有选择框（包括不可见的），因为这是明确的清除操作
    const recordCheckboxes = document.querySelectorAll('.record-checkbox');
    const selectAllCheckbox = document.getElementById('selectAll');
    
    recordCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    
    updateSelectionSummary();
}

// 生成选中记录的报表
function generateSelectedReport() {
    // 只处理当前表格中可见的选中记录
    const selectedCheckboxes = document.querySelectorAll('#recordsTable .record-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        const lang = localStorage.getItem('selectedLanguage') || 'zh';
        alert(lang === 'zh' ? '请先选择要生成报表的记录' : 'Por favor, selecione os registros para gerar o relatório');
        return;
    }
    
    // 获取选中的记录
    const selectedRecords = [];
    selectedCheckboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const record = records[index];
        if (record) {
            selectedRecords.push(record);
        }
    });
    
    // 生成报表HTML
    const reportHtml = generateReportHTML(selectedRecords);
    
    // 显示报表模态框
    showReportModal(reportHtml);
}

// 生成报表HTML
function generateReportHTML(selectedRecords) {
    const lang = localStorage.getItem('selectedLanguage') || 'zh';
    const currentDate = new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'pt-BR');
    
    let totalAmount = 0;
    selectedRecords.forEach(record => {
        if (record.amount) {
            const amount = parseFloat(record.amount.toString().replace(/[^\d.-]/g, ''));
            if (!isNaN(amount)) {
                totalAmount += amount;
            }
        }
    });
    
    const reportTitle = lang === 'zh' ? '收账记录报表' : 'Relatório de Contas a Receber';
    const generatedDate = lang === 'zh' ? `生成日期: ${currentDate}` : `Data de Geração: ${currentDate}`;
    const recordCount = lang === 'zh' ? `记录数量: ${selectedRecords.length}` : `Número de Registros: ${selectedRecords.length}`;
    const totalLabel = lang === 'zh' ? '总金额:' : 'Valor Total:';
    
    let tableRows = '';
    selectedRecords.forEach((record, index) => {
        tableRows += `
            <tr>
                <td class="px-4 py-2 border">${index + 1}</td>
                <td class="px-4 py-2 border">${record.nf || '-'}</td>
                <td class="px-4 py-2 border">${record.orderNumber || '-'}</td>
                <td class="px-4 py-2 border">${record.customerName || '-'}</td>
                <td class="px-4 py-2 border">${formatDate(record.orderDate) || '-'}</td>
                <td class="px-4 py-2 border">${formatCurrency(record.amount)}</td>
            </tr>`;
    });
    
    return `
        <div class="p-6">
            <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-gray-300">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '序号' : 'Nº'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">NF</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '订单号' : 'Nº DE PEDIDO'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '客户' : 'Cliente'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '订单日期' : 'Data de Emissão'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '金额' : 'Valor'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                    <tfoot class="bg-gray-50">
                        <tr>
                            <td colspan="5" class="px-4 py-2 border border-gray-300 text-right font-bold">${totalLabel}</td>
                            <td class="px-4 py-2 border border-gray-300 font-bold">${formatCurrency(totalAmount)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    `;
}

// 显示报表模态框
function showReportModal(reportHtml) {
    const lang = localStorage.getItem('selectedLanguage') || 'zh';
    
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-screen overflow-y-auto">
            <div class="flex justify-between items-center p-4 border-b">
                <h3 class="text-lg font-semibold text-gray-800">${lang === 'zh' ? '报表预览' : 'Visualização do Relatório'}</h3>
                <div class="flex space-x-2">
                    <button onclick="printReport()" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                        <i class="fas fa-print mr-2"></i>${lang === 'zh' ? '打印' : 'Imprimir'}
                    </button>
                    <button onclick="closeReportModal()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div id="reportContent">
                ${reportHtml}
            </div>
        </div>
    `;
    
    modal.id = 'reportModal';
    document.body.appendChild(modal);
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeReportModal();
        }
    });
}

// 关闭报表模态框
function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

// 打印报表
function printReport() {
    const reportContent = document.getElementById('reportContent');
    if (reportContent) {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>收账记录报表</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        table { border-collapse: collapse; width: 100%; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f2f2f2; }
                        .text-center { text-align: center; }
                        .font-bold { font-weight: bold; }
                        .mb-6 { margin-bottom: 24px; }
                        .mb-2 { margin-bottom: 8px; }
                    </style>
                </head>
                <body>
                    ${reportContent.innerHTML}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
}