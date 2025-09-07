// 收账管理系统 JavaScript

// 全局变量
let records = JSON.parse(localStorage.getItem('accountRecords')) || [];
let editingIndex = -1;
let chatContext = {
    step: 'start',
    tempRecord: {},
    language: 'zh' // 默认中文，'zh' 中文, 'pt' 葡萄牙语
};

// 排序状态
let sortState = {
    column: null,
    direction: 'asc' // 'asc' 或 'desc'
};

// 数据验证和修复机制
let dataValidationEnabled = true;
let validationErrors = [];
let lastValidationTime = null;

// 数据验证函数
function validateRecord(record, index) {
    const errors = [];
    const recordId = record.orderNumber || record.orderId || record.id || `Record_${index}`;
    
    // Validar campos básicos
    if (!record.amount || isNaN(parseFloat(record.amount))) {
        errors.push(`${recordId}: Valor do pedido inválido`);
    }
    
    if (!record.customerName || record.customerName.trim() === '') {
        errors.push(`${recordId}: Nome do cliente vazio`);
    }
    
    // Validar consistência dos dados de pagamento
    const orderAmount = parseFloat(record.amount || 0);
    const paidAmountField = parseFloat(record.paidAmount || 0);
    const calculatedFromPayments = record.payments && Array.isArray(record.payments) ? 
        record.payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0) : 0;
    
    // Verificar inconsistência entre paidAmount e payments
    if (Math.abs(paidAmountField - calculatedFromPayments) > 0.01) {
        errors.push(`${recordId}: paidAmount(${paidAmountField.toFixed(2)}) != cálculo payments(${calculatedFromPayments.toFixed(2)})`);
    }
    
    // Verificar registros de pagamento ausentes
    if (paidAmountField > 0 && (!record.payments || !Array.isArray(record.payments) || record.payments.length === 0)) {
        errors.push(`${recordId}: Tem paidAmount mas falta array payments`);
    }
    
    // Verificar valor de pagamento excede valor do pedido
    if (calculatedFromPayments > orderAmount + 0.01) {
        errors.push(`${recordId}: Valor do pagamento(${calculatedFromPayments.toFixed(2)}) excede valor do pedido(${orderAmount.toFixed(2)})`);
    }
    
    return errors;
}

// Validar todos os registros
function validateAllRecords() {
    if (!dataValidationEnabled) return [];
    
    validationErrors = [];
    lastValidationTime = new Date();
    
    records.forEach((record, index) => {
        const recordErrors = validateRecord(record, index);
        validationErrors.push(...recordErrors);
    });
    
    if (validationErrors.length > 0) {
        console.warn(`Validação de dados encontrou ${validationErrors.length} problemas:`, validationErrors);
    } else {
        console.log('Validação de dados aprovada, todos os registros consistentes');
    }
    
    return validationErrors;
}

// Corrigir automaticamente problemas de inconsistência de dados
function autoFixDataInconsistencies() {
    let fixedCount = 0;
    let dataChanged = false;
    
    records.forEach((record, index) => {
        const recordId = record.orderNumber || record.orderId || record.id || `Record_${index}`;
        let recordFixed = false;
        
        // Garantir que existe array payments
        if (!record.payments || !Array.isArray(record.payments)) {
            record.payments = [];
        }
        
        const oldPaidAmount = parseFloat(record.paidAmount || 0);
        
        // Se tem paidAmount mas não tem registros payments, criar um
        if (oldPaidAmount > 0 && record.payments.length === 0) {
            const paymentRecord = {
                id: `PAY_${recordId}_AUTO_${Date.now()}`,
                date: new Date().toLocaleDateString('pt-BR'),
                amount: oldPaidAmount,
                method: 'transfer',
                remark: 'Registro automático de pagamento'
            };
            record.payments.push(paymentRecord);
            recordFixed = true;
            console.log(`${recordId}: Registro de pagamento adicionado automaticamente R$ ${oldPaidAmount.toFixed(2)}`);
        }
        
        // Recalcular paidAmount
        const calculatedPaidAmount = record.payments.reduce((sum, payment) => {
            return sum + parseFloat(payment.amount || 0);
        }, 0);
        
        if (Math.abs(oldPaidAmount - calculatedPaidAmount) > 0.01) {
            record.paidAmount = calculatedPaidAmount;
            recordFixed = true;
            console.log(`${recordId}: Corrigir paidAmount ${oldPaidAmount.toFixed(2)} → ${calculatedPaidAmount.toFixed(2)}`);
        }
        
        if (recordFixed) {
            fixedCount++;
            dataChanged = true;
        }
    });
    
    if (dataChanged) {
        localStorage.setItem('accountRecords', JSON.stringify(records));
        console.log(`Correção automática concluída: ${fixedCount} registros corrigidos`);
        
        // Disparar evento de armazenamento para notificar outros componentes
        window.dispatchEvent(new StorageEvent('storage', {
            key: 'accountRecords',
            newValue: JSON.stringify(records)
        }));
    }
    
    return fixedCount;
}

// Exibir erros de validação
function displayValidationErrors() {
    // Avisos de validação de dados desabilitados
    return;
}

// Cliente Supabase e variáveis relacionadas à sincronização na nuvem
let supabase = null;
let isCloudEnabled = false;
let syncInProgress = false;
let autoSyncInterval = null;
let lastSyncTime = null;

// Inicializar cliente Supabase
function initializeSupabase() {
    try {
        if (window.SUPABASE_CONFIG && window.supabase) {
            supabase = window.supabase.createClient(
                window.SUPABASE_CONFIG.url,
                window.SUPABASE_CONFIG.anonKey
            );
            isCloudEnabled = true;
            console.log('Cliente Supabase inicializado com sucesso');
            updateSyncStatus('Conectado', 'success');
            
            // Carregar dados automaticamente da nuvem
            setTimeout(async () => {
                try {
                    await loadFromCloud();
                    console.log('Carregamento automático de dados da nuvem concluído');
                } catch (error) {
                    console.log('Falha no carregamento automático de dados da nuvem:', error.message);
                }
            }, 1000); // Atraso de 1 segundo para garantir que a página seja totalmente carregada
            
            // Iniciar sincronização automática
            if (window.SYNC_CONFIG && window.SYNC_CONFIG.autoSync) {
                startAutoSync();
            }
        } else {
            console.warn('Configuração Supabase não encontrada ou biblioteca não carregada');
            updateSyncStatus('Erro de configuração', 'error');
        }
    } catch (error) {
        console.error('Falha na inicialização do Supabase:', error);
        updateSyncStatus('Falha na conexão', 'error');
        isCloudEnabled = false;
    }
}



// Implementação da funcionalidade de sincronização na nuvem

// Atualizar exibição do status de sincronização
function updateSyncStatus(status, type = 'info') {
    const statusElement = document.getElementById('syncStatus');
    const indicatorElement = document.getElementById('syncIndicator');
    
    if (statusElement) {
        statusElement.textContent = status;
        // Redefinir classes de cor do texto
        statusElement.className = 'text-sm';
        switch (type) {
            case 'success':
                statusElement.classList.add('text-green-600');
                break;
            case 'error':
                statusElement.classList.add('text-red-600');
                break;
            case 'warning':
                statusElement.classList.add('text-yellow-600');
                break;
            case 'syncing':
                statusElement.classList.add('text-blue-600');
                break;
            default:
                statusElement.classList.add('text-gray-600');
        }
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

// Converter formato de data para formato ISO (compatível com PostgreSQL)
function convertDateToISO(dateStr) {
    if (!dateStr) return null;
    
    // Se já está no formato ISO, retornar diretamente
    if (dateStr.includes('T') && dateStr.includes('Z')) {
        return dateStr;
    }
    
    // Processar formato DD/MM/YYYY
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2];
            
            // Validar validade da data
            const date = new Date(year, month - 1, day);
            if (date.getFullYear() == year && date.getMonth() == month - 1 && date.getDate() == day) {
                return date.toISOString().split('T')[0]; // Retornar formato YYYY-MM-DD
            }
        }
    }
    
    // Tentar análise direta
    try {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
        }
    } catch (e) {
        console.warn('Não é possível converter formato de data:', dateStr);
    }
    
    return null;
}

// Converter formato de data ISO para formato DD/MM/YYYY (exibição local)
function convertISOToDisplayDate(isoDateStr) {
    if (!isoDateStr) return '';
    
    try {
        // Processar formato YYYY-MM-DD
        if (isoDateStr.includes('-') && !isoDateStr.includes('T')) {
            const parts = isoDateStr.split('-');
            if (parts.length === 3) {
                const year = parts[0];
                const month = parts[1];
                const day = parts[2];
                return `${day}/${month}/${year}`;
            }
        }
        
        // Processar formato ISO completo
        const date = new Date(isoDateStr);
        if (!isNaN(date.getTime())) {
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        }
    } catch (e) {
        console.warn('Não é possível converter formato de data ISO:', isoDateStr);
    }
    
    return isoDateStr; // Se a conversão falhar, retornar valor original
}

// Sincronização manual para a nuvem
async function manualSync() {
    if (!isCloudEnabled || syncInProgress) {
        showNotification(chatContext.language === 'zh' ? '云同步不可用或正在同步中' : 'Sincronização em nuvem indisponível ou em progresso', 'warning');
        return;
    }
    
    try {
        syncInProgress = true;
        updateSyncStatus(chatContext.language === 'zh' ? '同步中...' : 'Sincronizando...', 'syncing');
        
        // Obter dados locais
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
            order_date: convertDateToISO(record.orderDate),
            credit_days: parseInt(record.creditDays) || 30,
            due_date: convertDateToISO(record.dueDate),
            status: record.status || 'pending',
            notes: record.notes || null,
            paid_amount: parseFloat(record.paidAmount) || 0,
            payments: record.payments || [],
            created_at: record.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));
        
        // 清空云端数据并插入新数据
        const { error: deleteError } = await supabase
            .from(window.DB_CONFIG.tableName)
            .delete()
            .neq('id', 0); // 删除所有记录
        
        if (deleteError) {
            console.warn('Aviso ao limpar dados da nuvem:', deleteError);
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
        console.error('Falha na sincronização:', error);
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
        
        console.log('Carregando dados da nuvem...');
        console.log('Nome da tabela:', window.DB_CONFIG.tableName);
        console.log('Supabase URL:', window.SUPABASE_CONFIG.url);
        
        const { data, error } = await supabase
            .from(window.DB_CONFIG.tableName)
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Erro de consulta Supabase:', error);
            
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
        
        console.log('Dados da nuvem:', data);
        
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
            orderDate: convertISOToDisplayDate(record.order_date),
            creditDays: record.credit_days.toString(),
            dueDate: convertISOToDisplayDate(record.due_date),
            status: record.status,
            notes: record.notes,
            paidAmount: record.paid_amount || 0,
            payments: record.payments || [],
            createdAt: record.created_at,
            updatedAt: record.updated_at
        }));
        
        // 合并本地和云端数据，保留本地付款记录
        const existingLocalRecords = JSON.parse(localStorage.getItem('accountRecords')) || [];
        const mergedRecords = [];
        const processedRecords = new Set(); // 用于跟踪已处理的记录，避免重复
        
        // 创建更精确的记录匹配函数
        function createRecordKey(record) {
            // 使用多个字段组合创建更唯一的键
            const customerName = (record.customerName || '').trim().toLowerCase();
            const orderNumber = (record.orderNumber || '').trim();
            const nf = (record.nf || '').trim();
            const amount = parseFloat(record.amount) || 0;
            const orderDate = record.orderDate || '';
            
            // 优先使用orderNumber，其次使用nf，最后使用客户名+金额+日期组合
            if (orderNumber) {
                return `${customerName}_order_${orderNumber}`;
            } else if (nf) {
                return `${customerName}_nf_${nf}`;
            } else {
                return `${customerName}_${amount}_${orderDate}`;
            }
        }
        
        // 创建云端记录的映射，用于快速查找
        const cloudRecordMap = new Map();
        cloudRecords.forEach(cloudRecord => {
            const key = createRecordKey(cloudRecord);
            cloudRecordMap.set(key, cloudRecord);
        });
        
        // 合并逻辑：优先保留本地付款记录
        existingLocalRecords.forEach(localRecord => {
            const key = createRecordKey(localRecord);
            
            // 检查是否已经处理过这个记录
            if (processedRecords.has(key)) {
                console.warn('Registro local duplicado encontrado, pulando:', localRecord);
                return;
            }
            
            const cloudRecord = cloudRecordMap.get(key);
            
            if (cloudRecord) {
                // 如果云端有对应记录，智能合并付款记录
                const localPayments = localRecord.payments || [];
                const cloudPayments = cloudRecord.payments || [];
                
                // 合并付款记录，去重
                const paymentKeys = new Set();
                const mergedPayments = [];
                
                // 添加本地付款记录
                localPayments.forEach(payment => {
                    const paymentKey = `${payment.date}_${payment.amount}_${payment.method || 'transfer'}_${payment.remark || ''}`;
                    if (!paymentKeys.has(paymentKey)) {
                        mergedPayments.push(payment);
                        paymentKeys.add(paymentKey);
                    }
                });
                
                // 添加云端付款记录（去重）
                cloudPayments.forEach(payment => {
                    const paymentKey = `${payment.date}_${payment.amount}_${payment.method || 'transfer'}_${payment.remark || ''}`;
                    if (!paymentKeys.has(paymentKey)) {
                        mergedPayments.push(payment);
                        paymentKeys.add(paymentKey);
                    }
                });
                
                // 重新计算总付款金额
                const totalPaidAmount = mergedPayments.reduce((sum, payment) => {
                    return sum + (parseFloat(payment.amount) || 0);
                }, 0);
                
                const mergedRecord = {
                    ...cloudRecord,
                    // 使用合并后的付款数据
                    paidAmount: totalPaidAmount,
                    payments: mergedPayments,
                    // 如果本地有更新的时间戳，使用本地的
                    updatedAt: (localRecord.updatedAt && new Date(localRecord.updatedAt) > new Date(cloudRecord.updatedAt)) 
                        ? localRecord.updatedAt : cloudRecord.updatedAt
                };
                mergedRecords.push(mergedRecord);
                cloudRecordMap.delete(key); // 标记为已处理
            } else {
                // 如果云端没有对应记录，保留本地记录
                mergedRecords.push(localRecord);
            }
            
            processedRecords.add(key);
        });
        
        // 添加云端独有的记录
        cloudRecordMap.forEach((cloudRecord, key) => {
            if (!processedRecords.has(key)) {
                mergedRecords.push(cloudRecord);
                processedRecords.add(key);
            }
        });
        
        // 更新本地数据
        records = mergedRecords;
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
        console.error('Falha ao carregar da nuvem:', error);
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
        appTitle: '账目管理',
        btnAdd: '收账记录',
        btnChat: '智能对话',
        btnImport: '导入',
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
        balance: '余额',
        // 搜索筛选
        customerSearch: '客户搜索',
        customerSearchPlaceholder: '输入客户名称',
        statusFilter: '状态筛选',
        allStatus: '全部状态',
        dateRange: '日期范围',
        dateTo: '至',
        recordsTable: '收账记录',
        // 表单相关
        modalTitle: '收账记录',
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
        amountPlaceholder: 'R$ 0,00',
        orderDatePlaceholder: 'DD/MM/YYYY 或 今天、明天',
        customDaysPlaceholder: '天数',
        // 付款模态框
        paymentModalTitle: '记录付款',
        paymentRecordLabel: '选择记录',
        paymentDateLabel: '付款日期',
        paymentAmountLabel: '付款金额',
        paymentMethodLabel: '付款方式',
        paymentRemarkLabel: '备注',
        cancelPaymentLabel: '取消',
        savePaymentLabel: '记录付款',
        selectRecordPlaceholder: '请选择要付款的记录',
        paymentAmountPlaceholder: '0.00',
        paymentRemarkPlaceholder: '添加付款备注信息...',
        // 付款方式选项
        paymentMethodPix: 'PIX',
        paymentMethodTransfer: '转账',
        paymentMethodCash: '现金',
        paymentMethodOther: '其他',
        // 付款通知消息
        recordNotFound: '记录不存在',
        recordAlreadyPaid: '该记录已经付款完成',
        selectRecordsFirst: '请先选择要记录付款的记录',
        fillRequiredFields: '请填写所有必填字段并确保金额有效',
        recordNotFoundError: '找不到对应的记录',
        paymentExceedsRemaining: '付款金额不能超过剩余未付金额',
        paymentRecordSuccess: '付款记录添加成功',
        // 客户详情页面统计卡片
        totalOrders: '总订单',
        paidOrders: '已付款',
        unpaidOrders: '未付款',
        orderRecords: '订单记录',
        paymentRecords: '付款记录',
        // 登录登出
        btnLogout: '退出登录'
    },
    pt: {
        navTitle: 'Sistema de Gestão de Cobrança',
        appTitle: 'Cobrança',
        btnAdd: 'Registro',
        btnChat: 'Chat AI',
        btnImport: 'Excel',
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
        modalTitle: 'Registro',
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
        // 付款模态框
        paymentModalTitle: 'Registrar Pagamento',
        paymentRecordLabel: 'Selecionar Registro',
        paymentDateLabel: 'Data do Pagamento',
        paymentAmountLabel: 'Valor do Pagamento',
        paymentMethodLabel: 'Método de Pagamento',
        paymentRemarkLabel: 'Observações',
        cancelPaymentLabel: 'Cancelar',
        savePaymentLabel: 'Registrar Pagamento',
        selectRecordPlaceholder: 'Selecione o registro para pagamento',
        paymentAmountPlaceholder: '0,00',
        paymentRemarkPlaceholder: 'Adicionar observações do pagamento...',
        // 付款方式选项
        paymentMethodPix: 'PIX',
        paymentMethodTransfer: 'Transferência',
        paymentMethodCash: 'Dinheiro',
        paymentMethodOther: 'Outros',
        // 付款通知消息
        recordNotFound: 'Registro não encontrado',
        recordAlreadyPaid: 'Este registro já foi pago completamente',
        selectRecordsFirst: 'Selecione primeiro os registros para pagamento',
        fillRequiredFields: 'Preencha todos os campos obrigatórios e certifique-se de que o valor é válido',
        recordNotFoundError: 'Registro correspondente não encontrado',
        paymentExceedsRemaining: 'O valor do pagamento não pode exceder o valor restante não pago',
        paymentRecordSuccess: 'Registro de pagamento adicionado com sucesso',
        // 客户详情页面统计卡片
        totalOrders: 'Total de Pedidos',
        paidOrders: 'Pagos',
        unpaidOrders: 'Não Pagos',
        orderRecords: 'Registros de Pedidos',
        paymentRecords: 'Registros de Pagamentos',
        // 登录登出
        btnLogout: 'Sair',
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
        importModalTitle: 'Importar',
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
uiTexts.zh.importModalTitle = '导入';
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

// 客户管理相关葡萄牙语翻译
uiTexts.pt.customerManagement = 'Clientes';
uiTexts.pt.customerList = 'Lista de Clientes';
uiTexts.pt.customerDetails = 'Detalhes do Cliente';
uiTexts.pt.addCustomer = 'Adicionar Cliente';
uiTexts.pt.addOrder = 'Adicionar Pedido';
uiTexts.pt.addPayment = 'Adicionar Pagamento';
uiTexts.pt.customerSearch = 'Buscar Cliente';
uiTexts.pt.customerSearchPlaceholder = 'Digite o nome do cliente, contato ou telefone';
uiTexts.pt.noCustomerSelected = 'Selecione um cliente para ver os detalhes';
uiTexts.pt.totalOrderAmount = 'Valor Total dos Pedidos';
uiTexts.pt.totalPaidAmount = 'Valor Pago';
uiTexts.pt.totalUnpaidAmount = 'Valor Não Pago';
uiTexts.pt.ordersTab = 'Pedidos';
uiTexts.pt.paymentsTab = 'Registros de Pagamento';
uiTexts.pt.customerName = 'Nome do Cliente';
uiTexts.pt.contactPerson = 'Contato';
uiTexts.pt.contactPhone = 'Telefone';
uiTexts.pt.customerRemark = 'Observações';
uiTexts.pt.orderNumber = 'Número do Pedido';
uiTexts.pt.orderDate = 'Data do Pedido';
uiTexts.pt.orderAmount = 'Valor do Pedido';
uiTexts.pt.orderDueDate = 'Data de Vencimento';
uiTexts.pt.orderProducts = 'Informações do Produto';
uiTexts.pt.orderRemark = 'Observações';
uiTexts.pt.paymentOrder = 'Selecionar Pedido';
uiTexts.pt.paymentDate = 'Data do Pagamento';
uiTexts.pt.paymentAmount = 'Valor do Pagamento';
uiTexts.pt.paymentMethod = 'Método de Pagamento';
uiTexts.pt.paymentRemark = 'Observações';
uiTexts.pt.addOrderModalTitle = 'Adicionar Pedido';
uiTexts.pt.recordPaymentModalTitle = 'Registrar Pagamento';
uiTexts.pt.addOrderBtn = 'Adicionar Pedido';
uiTexts.pt.recordPaymentBtn = 'Registrar Pagamento';
uiTexts.pt.ordersTabLabel = 'Registros de Pedidos';
uiTexts.pt.paymentsTabLabel = 'Registros de Pagamento';
uiTexts.pt.contactPersonLabel = 'Contato';
uiTexts.pt.contactPhoneLabel = 'Telefone';
uiTexts.pt.customerRemarkLabel = 'Observações';
uiTexts.pt.orderRemarkLabel = 'Observações';
uiTexts.pt.addOrderSubmitBtn = 'Adicionar Pedido';
uiTexts.pt.recordPaymentSubmitBtn = 'Registrar Pagamento';
uiTexts.pt.paymentRemarkInputLabel = 'Observações';

// 客户管理相关文本
uiTexts.zh.customerManagement = '客户管理';
uiTexts.zh.customerList = '客户列表';
uiTexts.zh.customerDetails = '客户详情';
uiTexts.zh.addCustomer = '添加客户';
uiTexts.zh.addOrder = '添加订单';
uiTexts.zh.addPayment = '添加付款';
uiTexts.zh.customerSearch = '搜索客户';
uiTexts.zh.customerSearchPlaceholder = '输入客户名称、联系人或电话';
uiTexts.zh.noCustomerSelected = '请选择客户查看详情';
uiTexts.zh.totalOrderAmount = '总订单金额';
uiTexts.zh.totalPaidAmount = '已付金额';
uiTexts.zh.totalUnpaidAmount = '未付金额';
uiTexts.zh.ordersTab = '订单记录';
uiTexts.zh.paymentsTab = '付款记录';
uiTexts.zh.customerName = '客户名称';
uiTexts.zh.contactPerson = '联系人';
uiTexts.zh.contactPhone = '联系电话';
uiTexts.zh.customerRemark = '备注';
uiTexts.zh.orderNumber = '订单号';
uiTexts.zh.orderDate = '订单日期';
uiTexts.zh.orderAmount = '订单金额';
uiTexts.zh.orderDueDate = '预计付款日期';
uiTexts.zh.orderProducts = '产品信息';
uiTexts.zh.orderRemark = '备注';
uiTexts.zh.paymentOrder = '选择订单';
uiTexts.zh.paymentDate = '付款日期';
uiTexts.zh.paymentAmount = '付款金额';
uiTexts.zh.paymentMethod = '付款方式';
uiTexts.zh.paymentRemark = '备注';
uiTexts.zh.paymentProgress = '付款进度';
uiTexts.zh.remainingAmount = '余额';
uiTexts.zh.overdue = '逾期';
uiTexts.zh.order = '订单';
uiTexts.zh.customerNameRequired = '客户名称';
uiTexts.zh.contactPersonOptional = '联系人';
uiTexts.zh.contactPhoneOptional = '联系电话';
uiTexts.zh.customerRemarkOptional = '备注';
uiTexts.zh.orderNumberRequired = '订单号';
uiTexts.zh.orderDateRequired = '订单日期';
uiTexts.zh.orderAmountRequired = '订单金额';
uiTexts.zh.orderDueDateOptional = '预计付款日期';
uiTexts.zh.orderProductsRequired = '产品信息';
uiTexts.zh.orderRemarkOptional = '备注';
uiTexts.zh.paymentOrderRequired = '选择订单';
uiTexts.zh.paymentDateRequired = '付款日期';
uiTexts.zh.paymentAmountRequired = '付款金额';
uiTexts.zh.paymentMethodOptional = '付款方式';
uiTexts.zh.paymentRemarkOptional = '备注';
uiTexts.zh.customerNamePlaceholder = '请输入客户名称';
uiTexts.zh.contactPersonPlaceholder = '请输入联系人姓名';
uiTexts.zh.contactPhonePlaceholder = '请输入联系电话';
uiTexts.zh.customerRemarkPlaceholder = '请输入备注信息';
uiTexts.zh.orderNumberPlaceholder = '请输入订单号';
uiTexts.zh.orderAmountPlaceholder = '0.00';
uiTexts.zh.orderProductsPlaceholder = '请输入产品信息';
uiTexts.zh.orderRemarkPlaceholder = '请输入备注信息';
uiTexts.zh.paymentOrderPlaceholder = '请选择订单';
uiTexts.zh.paymentAmountPlaceholder = '0.00';
uiTexts.zh.paymentRemarkPlaceholder = '请输入备注信息';
uiTexts.zh.addCustomerModalTitle = '添加客户';
uiTexts.zh.addOrderModalTitle = '添加订单';
uiTexts.zh.addPaymentModalTitle = '添加付款';
uiTexts.zh.cancelCustomerBtn = '取消';
uiTexts.zh.saveCustomerBtn = '保存';
uiTexts.zh.cancelOrderBtn = '取消';
uiTexts.zh.saveOrderBtn = '保存';
uiTexts.zh.cancelPaymentModalBtn = '取消';
uiTexts.zh.savePaymentModalBtn = '保存';
uiTexts.zh.customerAddedSuccess = '客户添加成功';
uiTexts.zh.orderAddedSuccess = '订单添加成功';
uiTexts.zh.paymentAddedSuccess = '付款记录添加成功';
uiTexts.zh.selectCustomerFirst = '请先选择客户';
uiTexts.zh.selectValidOrder = '请选择有效订单';
uiTexts.zh.paymentExceedsRemaining = '付款金额不能超过剩余金额';
uiTexts.zh.ordersCount = '个订单';
uiTexts.zh.paidLabel = '已付';
uiTexts.zh.products = '产品';
uiTexts.zh.accountingRecords = '收账记录';
uiTexts.zh.accountingRecordsTab = '收账记录';
uiTexts.zh.accountingInfo = '收账记录信息';
uiTexts.zh.totalRecords = '记录总数';
uiTexts.zh.overdueAmount = '逾期金额';
uiTexts.zh.balance = '余额';

uiTexts.pt.customerList = 'Lista de Clientes';
uiTexts.pt.customerDetails = 'Detalhes do Cliente';
uiTexts.pt.addCustomer = 'Adicionar Cliente';
uiTexts.pt.addOrder = 'Adicionar Pedido';
uiTexts.pt.addPayment = 'Adicionar Pagamento';
uiTexts.pt.customerSearch = 'Buscar Cliente';
uiTexts.pt.customerSearchPlaceholder = 'Digite nome, contato ou telefone';
uiTexts.pt.noCustomerSelected = 'Selecione um cliente para ver detalhes';
uiTexts.pt.totalOrderAmount = 'Valor Total dos Pedidos';
uiTexts.pt.totalPaidAmount = 'Valor Pago';
uiTexts.pt.totalUnpaidAmount = 'Valor Não Pago';
uiTexts.pt.ordersTab = 'Pedidos';
uiTexts.pt.paymentsTab = 'Registros de Pagamento';
uiTexts.pt.customerName = 'Nome do Cliente';
uiTexts.pt.contactPerson = 'Pessoa de Contato';
uiTexts.pt.contactPhone = 'Telefone de Contato';
uiTexts.pt.customerRemark = 'Observações';
uiTexts.pt.orderNumber = 'Número do Pedido';
uiTexts.pt.orderDate = 'Data do Pedido';
uiTexts.pt.orderAmount = 'Valor do Pedido';
uiTexts.pt.orderDueDate = 'Data Prevista de Pagamento';
uiTexts.pt.orderProducts = 'Informações do Produto';
uiTexts.pt.orderRemark = 'Observações';
uiTexts.pt.paymentOrder = 'Selecionar Pedido';
uiTexts.pt.paymentDate = 'Data do Pagamento';
uiTexts.pt.paymentAmount = 'Valor do Pagamento';
uiTexts.pt.paymentMethod = 'Método de Pagamento';
uiTexts.pt.paymentRemark = 'Observações';
uiTexts.pt.paymentProgress = 'Progresso do Pagamento';
uiTexts.pt.remainingAmount = 'Saldo';
uiTexts.pt.overdue = 'Vencido';
uiTexts.pt.order = 'Pedido';
uiTexts.pt.customerNameRequired = 'Nome do Cliente';
uiTexts.pt.contactPersonOptional = 'Pessoa de Contato';
uiTexts.pt.contactPhoneOptional = 'Telefone de Contato';
uiTexts.pt.customerRemarkOptional = 'Observações';
uiTexts.pt.orderNumberRequired = 'Número do Pedido';
uiTexts.pt.orderDateRequired = 'Data do Pedido';
uiTexts.pt.orderAmountRequired = 'Valor do Pedido';
uiTexts.pt.orderDueDateOptional = 'Data Prevista de Pagamento';
uiTexts.pt.orderProductsRequired = 'Informações do Produto';
uiTexts.pt.orderRemarkOptional = 'Observações';
uiTexts.pt.paymentOrderRequired = 'Selecionar Pedido';
uiTexts.pt.paymentDateRequired = 'Data do Pagamento';
uiTexts.pt.paymentAmountRequired = 'Valor do Pagamento';
uiTexts.pt.paymentMethodOptional = 'Método de Pagamento';
uiTexts.pt.paymentRemarkOptional = 'Observações';
uiTexts.pt.customerNamePlaceholder = 'Digite o nome do cliente';
uiTexts.pt.contactPersonPlaceholder = 'Digite o nome da pessoa de contato';
uiTexts.pt.contactPhonePlaceholder = 'Digite o telefone de contato';
uiTexts.pt.customerRemarkPlaceholder = 'Digite informações de observação';
uiTexts.pt.orderNumberPlaceholder = 'Digite o número do pedido';
uiTexts.pt.orderAmountPlaceholder = '0,00';
uiTexts.pt.orderProductsPlaceholder = 'Digite as informações do produto';
uiTexts.pt.orderRemarkPlaceholder = 'Digite informações de observação';
uiTexts.pt.paymentOrderPlaceholder = 'Selecione o pedido';
uiTexts.pt.paymentAmountPlaceholder = '0,00';
uiTexts.pt.paymentRemarkPlaceholder = 'Digite informações de observação';
uiTexts.pt.addCustomerModalTitle = 'Adicionar Cliente';
uiTexts.pt.addOrderModalTitle = 'Adicionar Pedido';
uiTexts.pt.addPaymentModalTitle = 'Adicionar Pagamento';
uiTexts.pt.cancelCustomerBtn = 'Cancelar';
uiTexts.pt.saveCustomerBtn = 'Salvar';
uiTexts.pt.cancelOrderBtn = 'Cancelar';
uiTexts.pt.saveOrderBtn = 'Salvar';
uiTexts.pt.cancelPaymentModalBtn = 'Cancelar';
uiTexts.pt.savePaymentModalBtn = 'Salvar';
uiTexts.pt.customerAddedSuccess = 'Cliente adicionado com sucesso';
uiTexts.pt.orderAddedSuccess = 'Pedido adicionado com sucesso';
uiTexts.pt.paymentAddedSuccess = 'Registro de pagamento adicionado com sucesso';
uiTexts.pt.selectCustomerFirst = 'Selecione primeiro um cliente';
uiTexts.pt.selectValidOrder = 'Selecione um pedido válido';
uiTexts.pt.paymentExceedsRemaining = 'O valor do pagamento não pode exceder o valor restante';
uiTexts.pt.ordersCount = 'pedidos';
uiTexts.pt.paidLabel = 'Pago';
uiTexts.pt.products = 'Produto';
uiTexts.pt.accountingRecords = 'Registros de Cobrança';
uiTexts.pt.accountingRecordsTab = 'Registros de Cobrança';
uiTexts.pt.accountingInfo = 'Informações de Cobrança';
uiTexts.pt.totalRecords = 'Total de Registros';
uiTexts.pt.overdueAmount = 'Valor Vencido';


// 初始化语言选择器
function initLanguageSelector() {
    // 检测浏览器语言，如果是中文环境则默认中文，否则葡萄牙语
    const browserLang = navigator.language || navigator.userLanguage;
    const defaultLang = browserLang.startsWith('zh') ? 'zh' : 'pt';
    const savedLang = localStorage.getItem('selectedLanguage') || defaultLang;
    chatContext.language = savedLang;
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) {
        languageSelect.value = savedLang;
        updateUILanguage(savedLang);
    }
}

// 语言切换函数
function changeLanguage() {
    // 获取触发事件的选择器
    const desktopSelect = document.getElementById('languageSelect');
    const mobileSelect = document.getElementById('languageSelectMobile');
    
    // 确定当前选择的语言
    let lang;
    if (event && event.target) {
        lang = event.target.value;
    } else if (desktopSelect) {
        lang = desktopSelect.value;
    } else if (mobileSelect) {
        lang = mobileSelect.value;
    } else {
        lang = 'pt'; // 默认葡萄牙语
    }
    
    // 同步两个选择器的值
    if (desktopSelect && desktopSelect.value !== lang) {
        desktopSelect.value = lang;
    }
    if (mobileSelect && mobileSelect.value !== lang) {
        mobileSelect.value = lang;
    }
    
    localStorage.setItem('selectedLanguage', lang);
    chatContext.language = lang;
    updateUILanguage(lang);
    
    // 触发语言变更事件，通知其他模块更新语言
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    
    // 更新客户管理模块语言
    if (typeof updateCustomerUILanguage === 'function') {
        updateCustomerUILanguage();
    }
}

// 更新界面语言
function updateUILanguage(lang) {
    const texts = uiTexts[lang];
    
    // 更新小程序标题
    const appTitle = document.getElementById('appTitle');
    if (appTitle) appTitle.textContent = texts.appTitle;
    
    // 更新导航栏
    const btnAdd = document.getElementById('btnAdd');
    const btnChat = document.getElementById('btnChat');
    const btnImport = document.getElementById('btnImport');
    const btnReport = document.getElementById('btnReport');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const btnLogout = document.getElementById('btnLogout');
    if (btnAdd) btnAdd.textContent = texts.btnAdd;
    if (btnChat) btnChat.textContent = texts.btnChat;
    if (btnImport) btnImport.textContent = texts.btnImport;
    if (btnReport) btnReport.textContent = texts.btnReport;
    if (exportPdfBtn) exportPdfBtn.textContent = texts.exportPdfBtn;
    if (btnLogout) btnLogout.textContent = texts.btnLogout;
    
    // 更新下拉菜单中的退出按钮文本
    const menuLogoutText = document.getElementById('menuLogoutText');
    if (menuLogoutText) menuLogoutText.textContent = texts.btnLogout;
    
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
    // 保持云加载按钮只显示图标，不显示文本
    // if (syncLoadBtn) syncLoadBtn.textContent = texts.syncLoad;
    
    // 更新表格标题
    const thOrderNumber = document.getElementById('thOrderNumber');
    const thCustomerName = document.getElementById('thCustomerName');
    const thAmount = document.getElementById('thAmount');
    const thBalance = document.getElementById('thBalance');
    const thOrderDate = document.getElementById('thOrderDate');
    const thCreditDays = document.getElementById('thCreditDays');
    const thDueDate = document.getElementById('thDueDate');
    const thStatus = document.getElementById('thStatus');
    const thNotes = document.getElementById('thNotes');
    const thOperations = document.getElementById('thOperations');
    
    if (thOrderNumber) thOrderNumber.textContent = texts.thOrderNumber;
    if (thCustomerName) thCustomerName.textContent = texts.customerName;
    if (thAmount) thAmount.textContent = texts.amount;
    if (thBalance) thBalance.textContent = texts.balance;
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
    
    // 更新头部状态筛选选项
    const statusFilterHeader = document.getElementById('statusFilterHeader');
    if (statusFilterHeader) {
        const headerOptions = statusFilterHeader.options;
        if (headerOptions[0]) headerOptions[0].textContent = texts.allStatus;
        if (headerOptions[1]) headerOptions[1].textContent = texts.statusPending;
        if (headerOptions[2]) headerOptions[2].textContent = texts.statusPaid;
        if (headerOptions[3]) headerOptions[3].textContent = texts.statusOverdue;
        if (headerOptions[4]) headerOptions[4].textContent = texts.archived;
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
    
    // 更新客户摘要标签
    const summaryTotalOrdersLabel = document.getElementById('summaryTotalOrdersLabel');
    const summaryPaidLabel = document.getElementById('summaryPaidLabel');
    const summaryUnpaidLabel = document.getElementById('summaryUnpaidLabel');
    const orderDateLabel = document.getElementById('orderDateLabel');
    const orderDueDateLabel = document.getElementById('orderDueDateLabel');
    
    if (summaryTotalOrdersLabel) summaryTotalOrdersLabel.textContent = texts.totalOrderAmount;
    if (summaryPaidLabel) summaryPaidLabel.textContent = texts.totalPaidAmount;
    if (summaryUnpaidLabel) summaryUnpaidLabel.textContent = texts.totalUnpaidAmount;
    if (orderDateLabel) orderDateLabel.innerHTML = texts.orderDateRequired + ' <span class="text-red-500">*</span>';
    if (orderDueDateLabel) orderDueDateLabel.textContent = texts.orderDueDateOptional;
    
    // 更新移动端导航按钮
    const mobileNavAdd = document.getElementById('mobileNavAdd');
    const mobileNavChat = document.getElementById('mobileNavChat');
    const mobileNavImport = document.getElementById('mobileNavImport');
    const mobileNavReport = document.getElementById('mobileNavReport');
    
    if (mobileNavAdd) mobileNavAdd.textContent = texts.btnAdd;
    if (mobileNavChat) mobileNavChat.textContent = texts.btnChat;
    if (mobileNavImport) mobileNavImport.textContent = texts.btnImport;
    if (mobileNavReport) mobileNavReport.textContent = texts.btnReport;
    
    // 更新付款方式选项
    const paymentMethodTransferOption = document.getElementById('paymentMethodTransferOption');
    const paymentMethodTransferOption2 = document.getElementById('paymentMethodTransferOption2');
    
    if (paymentMethodTransferOption) paymentMethodTransferOption.textContent = texts.paymentMethodTransfer;
    if (paymentMethodTransferOption2) paymentMethodTransferOption2.textContent = texts.paymentMethodTransfer;
    
    // 更新订单相关元素
    const orderNumberModalLabel = document.getElementById('orderNumberModalLabel');
    const orderAmountModalLabel = document.getElementById('orderAmountModalLabel');
    const selectOrderLabel = document.getElementById('selectOrderLabel');
    const selectOrderPlaceholder = document.getElementById('selectOrderPlaceholder');
    
    if (orderNumberModalLabel) orderNumberModalLabel.textContent = texts.orderNumber;
    if (orderAmountModalLabel) orderAmountModalLabel.innerHTML = texts.orderAmount + ' <span class="text-red-500">*</span>';
    if (selectOrderLabel) selectOrderLabel.innerHTML = texts.paymentOrder + ' <span class="text-red-500">*</span>';
    if (selectOrderPlaceholder) selectOrderPlaceholder.textContent = texts.paymentOrderPlaceholder;
    
    // 更新搜索筛选区域

    const statusFilterLabel = document.getElementById('statusFilterLabel');
    const allStatusOption = document.getElementById('allStatusOption');

    

    if (statusFilterLabel) statusFilterLabel.textContent = texts.statusFilter;
    if (allStatusOption) allStatusOption.textContent = texts.allStatus;

    
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
    
    // 更新付款模态框
    const paymentModalTitle = document.getElementById('paymentModalTitle');
    const paymentRecordLabel = document.getElementById('paymentRecordLabel');
    const paymentDateLabel = document.getElementById('paymentDateLabel');
    const paymentAmountLabel = document.getElementById('paymentAmountLabel');
    const paymentMethodLabel = document.getElementById('paymentMethodLabel');
    const paymentRemarkLabel = document.getElementById('paymentRemarkLabel');
    const cancelPaymentLabel = document.getElementById('cancelPaymentLabel');
    const savePaymentLabel = document.getElementById('savePaymentLabel');
    
    if (paymentModalTitle) paymentModalTitle.textContent = texts.paymentModalTitle;
    if (paymentRecordLabel) paymentRecordLabel.innerHTML = texts.paymentRecordLabel + ' <span class="text-red-500">*</span>';
    if (paymentDateLabel) paymentDateLabel.innerHTML = texts.paymentDateLabel + ' <span class="text-red-500">*</span>';
    if (paymentAmountLabel) paymentAmountLabel.innerHTML = texts.paymentAmountLabel + ' <span class="text-red-500">*</span>';
    if (paymentMethodLabel) paymentMethodLabel.textContent = texts.paymentMethodLabel;
    if (paymentRemarkLabel) paymentRemarkLabel.textContent = texts.paymentRemarkLabel;
    if (cancelPaymentLabel) cancelPaymentLabel.textContent = texts.cancelPaymentLabel;
    if (savePaymentLabel) savePaymentLabel.textContent = texts.savePaymentLabel;
    
    // 更新付款方式选项
    const paymentMethod = document.getElementById('paymentMethod');
    if (paymentMethod) {
        const options = paymentMethod.options;
        if (options[0]) options[0].textContent = texts.paymentMethodPix;
        if (options[1]) options[1].textContent = texts.paymentMethodTransfer;
        if (options[2]) options[2].textContent = texts.paymentMethodCash;
        if (options[3]) options[3].textContent = texts.paymentMethodOther;
    }
    
    // 更新付款表单占位符
    const paymentAmountInput = document.getElementById('paymentAmount');
    const paymentRemarkInput = document.getElementById('paymentRemark');
    
    if (paymentAmountInput) paymentAmountInput.placeholder = texts.paymentAmountPlaceholder;
    if (paymentRemarkInput) paymentRemarkInput.placeholder = texts.paymentRemarkPlaceholder;
    
    // 更新客户管理相关文本
    const customerManagementTitle = document.getElementById('customerManagementTitle');
    const addCustomerBtn = document.getElementById('addCustomerBtn');
    const addCustomerModalTitle = document.getElementById('addCustomerModalTitle');
    const addCustomerSubmitBtn = document.getElementById('addCustomerSubmitBtn');
    const customerSearch = document.getElementById('customer-search');
    const addOrderBtn = document.getElementById('addOrderBtn');
    const recordPaymentBtn = document.getElementById('recordPaymentBtn');
    const ordersTabLabel = document.getElementById('ordersTabLabel');
    const paymentsTabLabel = document.getElementById('paymentsTabLabel');
    const contactPersonLabel = document.getElementById('contactPersonLabel');
    const contactPhoneLabel = document.getElementById('contactPhoneLabel');
    const customerRemarkLabel = document.getElementById('customerRemarkLabel');
    const addOrderModalTitle = document.getElementById('addOrderModalTitle');
    const orderRemarkLabel = document.getElementById('orderRemarkLabel');
    const addOrderSubmitBtn = document.getElementById('addOrderSubmitBtn');
    const recordPaymentModalTitle = document.getElementById('recordPaymentModalTitle');
    const paymentRemarkInputLabel = document.getElementById('paymentRemarkInputLabel');
    const recordPaymentSubmitBtn = document.getElementById('recordPaymentSubmitBtn');
    
    if (customerManagementTitle) customerManagementTitle.innerHTML = '<i class="fas fa-users mr-2"></i>' + texts.customerManagement;
    if (addCustomerBtn) addCustomerBtn.innerHTML = '<i class="fas fa-plus mr-2"></i>' + texts.addCustomer;
    if (addCustomerModalTitle) addCustomerModalTitle.textContent = texts.addCustomer;
    if (addCustomerSubmitBtn) addCustomerSubmitBtn.textContent = texts.addCustomer;
    if (customerSearch) customerSearch.placeholder = texts.customerSearchPlaceholder;
    if (addOrderBtn) addOrderBtn.textContent = texts.addOrderBtn;
    if (recordPaymentBtn) recordPaymentBtn.textContent = texts.recordPaymentBtn;
    if (ordersTabLabel) ordersTabLabel.textContent = texts.ordersTabLabel;
    if (paymentsTabLabel) paymentsTabLabel.textContent = texts.paymentsTabLabel;
    if (contactPersonLabel) contactPersonLabel.textContent = texts.contactPersonLabel;
    if (contactPhoneLabel) contactPhoneLabel.textContent = texts.contactPhoneLabel;
    if (customerRemarkLabel) customerRemarkLabel.textContent = texts.customerRemarkLabel;
    if (addOrderModalTitle) addOrderModalTitle.textContent = texts.addOrderModalTitle;
    if (orderRemarkLabel) orderRemarkLabel.textContent = texts.orderRemarkLabel;
    if (addOrderSubmitBtn) addOrderSubmitBtn.textContent = texts.addOrderSubmitBtn;
    if (recordPaymentModalTitle) recordPaymentModalTitle.textContent = texts.recordPaymentModalTitle;
    if (paymentRemarkInputLabel) paymentRemarkInputLabel.textContent = texts.paymentRemarkInputLabel;
    if (recordPaymentSubmitBtn) recordPaymentSubmitBtn.textContent = texts.recordPaymentSubmitBtn;
    
    // 更新占位符文本
    const customerRemarkInput = document.getElementById('customerRemarkInput');
    const orderRemarkInput = document.getElementById('orderRemarkInput');
    const paymentRemarkInputField = document.getElementById('paymentRemarkInput');
    
    if (customerRemarkInput) customerRemarkInput.placeholder = lang === 'zh' ? '添加客户备注信息...' : 'Adicionar observações do cliente...';
    if (orderRemarkInput) orderRemarkInput.placeholder = lang === 'zh' ? '添加订单备注信息...' : 'Adicionar observações do pedido...';
    if (paymentRemarkInputField) paymentRemarkInputField.placeholder = lang === 'zh' ? '添加付款备注信息...' : 'Adicionar observações do pagamento...';
    
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
    document.getElementById('modalTitle').textContent = '收账记录';
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
        const numericAmount = parseFloat(record.amount) || 0;
        const formattedAmount = numericAmount.toFixed(2).replace('.', ',');
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
    const modal = document.getElementById('reportModal');
    if (modal) {
        document.body.removeChild(modal);
    }
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
        // 添加新记录前检查是否存在重复记录
        const isDuplicate = records.some(record => {
            // 使用更严格的重复检查条件
            const sameCustomer = record.customerName.trim().toLowerCase() === customerName.trim().toLowerCase();
            const sameAmount = Math.abs(record.amount - amount) < 0.01; // 允许小数点误差
            const sameOrderDate = record.orderDate === orderDate;
            
            // 如果有订单号或NF号，必须匹配
            let sameOrderIdentifier = true;
            if (orderNumber && record.orderNumber) {
                sameOrderIdentifier = record.orderNumber.trim() === orderNumber.trim();
            } else if (nf && record.nf) {
                sameOrderIdentifier = record.nf.trim() === nf.trim();
            }
            
            return sameCustomer && sameAmount && sameOrderDate && sameOrderIdentifier;
        });
        
        if (isDuplicate) {
            showNotification('检测到重复记录，请检查客户名称、金额、订单日期和订单号是否已存在！', 'error');
            return;
        }
        
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
    
    // 触发客户数据同步
    if (typeof syncCustomersWithRecords === 'function') {
        syncCustomersWithRecords();
    }
    
    // 分发recordsUpdated事件
    window.dispatchEvent(new CustomEvent('recordsUpdated'));
    
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
    
    return formatDateToDDMMYYYY(due);
}

// 加载并显示记录
function loadRecords() {
    // 重新从localStorage加载数据
    records = JSON.parse(localStorage.getItem('accountRecords')) || [];
    
    // 强制数据验证和自动修复（每次loadRecords都执行）
    if (dataValidationEnabled) {
        console.log('Executando verificação e reparo de validação de dados...');
        
        // 先进行数据验证
        const errors = validateAllRecords();
        
        // 无论是否有错误都尝试自动修复，确保数据一致性
        const fixedCount = autoFixDataInconsistencies();
        
        if (fixedCount > 0) {
            console.log(`Reparados automaticamente ${fixedCount} problemas de dados`);
            // 修复后重新加载数据
            records = JSON.parse(localStorage.getItem('accountRecords')) || [];
        }
        
        // 修复后重新验证
        const remainingErrors = validateAllRecords();
        
        if (remainingErrors.length > 0) {
            console.warn(`Após o reparo ainda há ${remainingErrors.length} problemas que precisam ser tratados manualmente`);
            displayValidationErrors();
        } else {
            console.log('Validação de dados aprovada, todos os cálculos estão corretos');
            // 隐藏之前的错误提示
            const errorContainer = document.getElementById('validationErrors');
            if (errorContainer) {
                errorContainer.style.display = 'none';
            }
        }
        
        // 特别检查订单2516407的数据
        const order2516407 = records.find(r => r.orderNumber === '2516407' || r.orderId === '2516407');
        if (order2516407) {
            const orderAmount = parseFloat(order2516407.amount || 0);
            // 从payments数组计算实际已付金额
            const actualPaidFromPayments = order2516407.payments ? 
                order2516407.payments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0) : 0;
            const currentPaidAmount = parseFloat(order2516407.paidAmount || 0);
            const unpaidAmount = Math.max(0, orderAmount - actualPaidFromPayments);
            console.log(`Verificação pedido 2516407: Total=${orderAmount.toFixed(2)}, Pago atual=${currentPaidAmount.toFixed(2)}, Pago real=${actualPaidFromPayments.toFixed(2)}, Não pago=${unpaidAmount.toFixed(2)}`);
            
            // 如果paidAmount字段与payments数组不一致，强制修复
            if (Math.abs(currentPaidAmount - actualPaidFromPayments) > 0.01) {
                console.warn(`Dados do pedido 2516407 inconsistentes, reparando paidAmount: ${currentPaidAmount} -> ${actualPaidFromPayments}`);
                order2516407.paidAmount = actualPaidFromPayments;
                localStorage.setItem('accountRecords', JSON.stringify(records));
            }
        }
    }
    
    // 同步付款数据：确保paidAmount字段与payments数组一致（保留原有逻辑作为备用）
    let dataChanged = false;
    records.forEach(record => {
        if (record.payments && Array.isArray(record.payments) && record.payments.length > 0) {
            const calculatedPaidAmount = record.payments.reduce((sum, payment) => 
                sum + (parseFloat(payment.amount) || 0), 0
            );
            // 如果paidAmount字段不存在或不正确，更新它
            if (!record.paidAmount || Math.abs(record.paidAmount - calculatedPaidAmount) > 0.01) {
                record.paidAmount = calculatedPaidAmount;
                dataChanged = true;
            }
        }
    });
    
    // 如果数据有变化，保存回localStorage
    if (dataChanged) {
        localStorage.setItem('accountRecords', JSON.stringify(records));
        console.log('Sincronização de dados concluída, salva no localStorage');
    }
    
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
    // 确保统计卡片在数据加载后刷新
    if (typeof updateStatistics === 'function') {
        updateStatistics();
    }
}

// 更新表格显示
function updateTable() {
    // 同步付款数据：确保paidAmount字段与payments数组一致
    let dataChanged = false;
    records.forEach(record => {
        if (record.payments && Array.isArray(record.payments) && record.payments.length > 0) {
            const calculatedPaidAmount = record.payments.reduce((sum, payment) => 
                sum + (parseFloat(payment.amount) || 0), 0
            );
            // 如果paidAmount字段不存在或不正确，更新它
            if (!record.paidAmount || Math.abs(record.paidAmount - calculatedPaidAmount) > 0.01) {
                record.paidAmount = calculatedPaidAmount;
                dataChanged = true;
            }
        }
    });
    
    // 如果数据有变化，保存回localStorage
    if (dataChanged) {
        localStorage.setItem('accountRecords', JSON.stringify(records));
        console.log('Sincronização de dados concluída durante atualização da tabela, salva no localStorage');
    }
    
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
    // 刷新统计卡片
    if (typeof updateStatistics === 'function') {
        updateStatistics();
    }
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
    
    // 状态选择下拉框和付款信息
    // 强制从payments数组重新计算实际付款金额，确保数据准确性
    const actualPaidAmount = record.payments ? record.payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) : 0;
    const paidAmount = actualPaidAmount; // 使用实际计算的金额而不是存储的字段
    const remainingAmount = Math.max(0, parseFloat(record.amount || 0) - actualPaidAmount); // 使用实际付款金额计算剩余金额
    
    // 强制同步paidAmount字段与payments数组
    const storedPaidAmount = parseFloat(record.paidAmount || 0);
    if (Math.abs(storedPaidAmount - actualPaidAmount) > 0.01) {
        console.log(`🔧 Pedido ${record.id || record.orderNumber || 'desconhecido'}: reparando paidAmount de ${storedPaidAmount.toFixed(2)} para ${actualPaidAmount.toFixed(2)}`);
        record.paidAmount = actualPaidAmount;
        
        // 立即更新localStorage中的数据
        const currentRecords = JSON.parse(localStorage.getItem('accountRecords') || '[]');
        const recordIndex = currentRecords.findIndex(r => 
            (r.id && r.id === record.id) || 
            (r.orderNumber && r.orderNumber === record.orderNumber) ||
            (r.orderId && r.orderId === record.orderId)
        );
        
        if (recordIndex !== -1) {
            currentRecords[recordIndex].paidAmount = actualPaidAmount;
            localStorage.setItem('accountRecords', JSON.stringify(currentRecords));
            console.log(`✅ Pedido ${record.orderNumber || record.id} paidAmount sincronizado e atualizado`);
        }
    }
    
    const statusOptions = `
        <div>
            <select onchange="updateRecordStatus(${index}, this.value)" class="text-xs px-2 py-1 border-0 rounded mb-1">
                <option value="pending" ${record.status === 'pending' ? 'selected' : ''}>${texts.statusPending}</option>
                <option value="paid" ${record.status === 'paid' ? 'selected' : ''}>${texts.statusPaid}</option>
            </select>
            ${paidAmount > 0 ? `
                <div class="text-xs mt-1">
                    <div class="text-green-600">${lang === 'zh' ? '已付' : 'Pago'}: ${formatCurrency(paidAmount)}</div>
                    ${remainingAmount > 0 ? `<div class="text-orange-600">${lang === 'zh' ? '剩余' : 'Restante'}: ${formatCurrency(remainingAmount)}</div>` : ''}
                </div>
            ` : `<div class="text-xs text-gray-500 mt-1">${lang === 'zh' ? '未付款' : 'Não pago'}</div>`}
        </div>
    `;
    
    const tooltipText = lang === 'zh' ? '双击编辑' : 'Clique duplo para editar';
    
    row.innerHTML = `
        <td class="px-3 py-4 whitespace-nowrap text-center text-sm text-gray-500">
            ${serialNumber}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell hide-mobile" data-field="nf" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.nf || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell hide-mobile" data-field="orderNumber" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.orderNumber || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 editable-cell" data-field="customerName" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.customerName}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell" data-field="amount" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${formatCurrency(record.amount)}
        </td>


        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell hide-mobile" data-field="orderDate" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${formatDate(record.orderDate) || '-'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 editable-cell hide-mobile" data-field="creditDays" data-index="${index}" data-tooltip="${tooltipText}" ondblclick="editCell(this)">
            ${record.creditDays || '-'}${lang === 'zh' ? '天' : ' dias'}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 hide-mobile">
            ${formatDate(record.dueDate) || '-'}
            ${daysDiff < 0 && record.status !== 'paid' ? `<br><small class="text-red-600">${lang === 'zh' ? '逾期' : 'Vencido'} ${Math.abs(daysDiff)} ${lang === 'zh' ? '天' : 'dias'}</small>` : 
              daysDiff <= 3 && record.status !== 'paid' ? `<br><small class="text-yellow-600">${daysDiff} ${lang === 'zh' ? '天后到期' : 'dias para vencer'}</small>` : ''}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
            ${statusOptions}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <div class="action-buttons flex items-center space-x-2">
                <button onclick="showEditModal(${index})" class="text-blue-600 hover:text-blue-900" title="${lang === 'zh' ? '编辑' : 'Editar'}">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="openPaymentModal(${index})" class="text-green-600 hover:text-green-900" title="${lang === 'zh' ? '记录付款' : 'Registrar Pagamento'}">
                    <i class="fas fa-money-bill-wave"></i>
                </button>
                <button onclick="viewPaymentRecords(${index})" class="text-purple-600 hover:text-purple-900" title="${lang === 'zh' ? '查看付款记录' : 'Ver Registros de Pagamento'}">
                    <i class="fas fa-receipt"></i>
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
    
    // 触发客户数据同步
    if (typeof syncCustomersWithRecords === 'function') {
        syncCustomersWithRecords();
    }
    
    // 分发recordsUpdated事件
    window.dispatchEvent(new CustomEvent('recordsUpdated'));
    
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const message = lang === 'zh' ? '状态更新成功！' : 'Status atualizado com sucesso!';
    showNotification(message, 'success');
}

// 获取筛选后的记录
function getFilteredRecords() {

    const statusFilterHeaderElement = document.getElementById('statusFilterHeader');

    
    // 使用头部状态筛选器的值
    const activeStatusFilter = statusFilterHeaderElement ? statusFilterHeaderElement.value : '';
    
    let filteredRecords = records.filter(record => {
        // 排除归档记录（除非明确筛选归档状态）
        if (record.archived && activeStatusFilter !== 'archived') {
            return false;
        }
        

        
        // 状态筛选
        if (activeStatusFilter) {
            if (activeStatusFilter === 'archived') {
                return record.archived === true;
            }
            
            const today = new Date();
            const dueDate = new Date(record.dueDate);
            const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            
            switch (activeStatusFilter) {
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
        

        
        return true;
    });
    
    // 应用排序
    if (sortState.column) {
        filteredRecords = sortRecords(filteredRecords, sortState.column, sortState.direction);
    }
    
    return filteredRecords;
}

// 排序记录
function sortRecords(records, column, direction) {
    return records.sort((a, b) => {
        let valueA, valueB;
        
        switch (column) {
            case 'nf':
                valueA = a.nf || '';
                valueB = b.nf || '';
                break;
            case 'orderNumber':
                valueA = a.orderNumber || '';
                valueB = b.orderNumber || '';
                break;
            case 'customerName':
                valueA = a.customerName || '';
                valueB = b.customerName || '';
                break;
            case 'amount':
                valueA = parseFloat(a.amount) || 0;
                valueB = parseFloat(b.amount) || 0;
                break;
            case 'orderDate':
                valueA = new Date(a.orderDate);
                valueB = new Date(b.orderDate);
                break;
            case 'creditDays':
                valueA = parseInt(a.creditDays) || 0;
                valueB = parseInt(b.creditDays) || 0;
                break;
            case 'dueDate':
                valueA = new Date(a.dueDate);
                valueB = new Date(b.dueDate);
                break;
            case 'status':
                valueA = a.status || '';
                valueB = b.status || '';
                break;
            default:
                return 0;
        }
        
        // 处理字符串比较
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            valueA = valueA.toLowerCase();
            valueB = valueB.toLowerCase();
        }
        
        let comparison = 0;
        if (valueA > valueB) {
            comparison = 1;
        } else if (valueA < valueB) {
            comparison = -1;
        }
        
        return direction === 'desc' ? -comparison : comparison;
    });
}

// 处理表头点击排序
function handleSort(column) {
    if (sortState.column === column) {
        // 如果点击的是同一列，切换排序方向
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // 如果点击的是不同列，设置新列并默认升序
        sortState.column = column;
        sortState.direction = 'asc';
    }
    
    // 更新排序指示器
    updateSortIndicators();
    
    // 重新渲染表格
    updateTable();
}

// 更新排序指示器
function updateSortIndicators() {
    // 清除所有排序指示器
    const headers = document.querySelectorAll('th[data-sort]');
    headers.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
    });
    
    // 添加当前排序指示器
    if (sortState.column) {
        const currentHeader = document.querySelector(`th[data-sort="${sortState.column}"]`);
        if (currentHeader) {
            currentHeader.classList.add(`sort-${sortState.direction}`);
        }
    }
}

// 筛选记录


// 格式化货币为巴西雷亚尔
function formatCurrency(value) {
    if (value === undefined || value === null || isNaN(value)) {
        return 'R$ 0,00';
    }
    
    // 统一使用巴西雷亚尔格式，无论语言环境如何
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
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let overdueCount = 0;
    const today = new Date();
    
    // 遍历所有记录计算统计数据
    records.forEach(record => {
        // 计算总金额
        const amount = parseFloat(record.amount) || 0;
        totalAmount += amount;
        
        // 从payments数组计算实际已付金额
        let actualPaid = 0;
        if (record.payments && Array.isArray(record.payments)) {
            actualPaid = record.payments.reduce((sum, payment) => {
                return sum + (parseFloat(payment.amount) || 0);
            }, 0);
        }
        paidAmount += actualPaid;
        
        // 计算未付金额
        const remainingAmount = amount - actualPaid;
        if (remainingAmount > 0) {
            pendingAmount += remainingAmount;
        }
        
        // 计算逾期订单数量
        const dueDate = parseDDMMYYYYToDate(record.dueDate);
        if (remainingAmount > 0 && dueDate && dueDate < today) {
            overdueCount++;
        }
    });
    
    // 更新页面显示
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
        const dueDate = parseDDMMYYYYToDate(record.dueDate);
        return record.status !== 'paid' && dueDate &&
               dueDate.toDateString() === tomorrow.toDateString();
    });
    
    const overdue = records.filter(record => {
        const dueDate = parseDDMMYYYYToDate(record.dueDate);
        return record.status !== 'paid' && dueDate && dueDate < today;
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
    const today = new Date();
    const currentLang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[currentLang];
    const locale = currentLang === 'pt' ? 'pt-BR' : 'zh-CN';
    const currency = currentLang === 'pt' ? 'BRL' : 'CNY';
    const currencySymbol = 'R$';
    
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
        const amount = typeof record.amount === 'number' ? record.amount : parseFloat(record.amount) || 0;
        stats.total += amount;
        stats.count++;
        
        // 从payments数组计算实际已付金额
        const actualPaidAmount = record.payments ? record.payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) : 0;
        stats.paid += actualPaidAmount;
        
        // 计算剩余金额
        const remainingAmount = Math.max(0, amount - actualPaidAmount);
        if (remainingAmount > 0) {
            const dueDate = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
            if (dueDate < today) {
                stats.overdue += remainingAmount;
            } else {
                stats.pending += remainingAmount;
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
        
        const amount = parseFloat(record.amount) || 0;
        const paidAmount = typeof record.paidAmount === 'number' ? record.paidAmount : parseFloat(record.paidAmount) || 0;
        const remainingAmount = amount - paidAmount;
        
        monthlyStats[month].total += amount;
        monthlyStats[month].paid += paidAmount;
        if (remainingAmount > 0) {
            monthlyStats[month].pending += remainingAmount;
        }
    });
    
    const reportHtml = `
        <div class="space-y-6">
            <!-- 总体统计 -->
            <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="text-lg font-semibold mb-4">${texts.overallStats}</h4>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">

                    <div class="text-center">
                        <div class="text-2xl font-bold text-green-600">${currencySymbol}${records.reduce((sum, r) => sum + (parseFloat(r.paidAmount) || 0), 0).toLocaleString(locale, {minimumFractionDigits: 2})}</div>
                        <div class="text-sm text-gray-600">${texts.paidAmountReport}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-2xl font-bold text-orange-600">${currencySymbol}${records.reduce((sum, r) => {
                            const amount = parseFloat(r.amount) || 0;
                            const paid = parseFloat(r.paidAmount) || 0;
                            const remaining = Math.max(0, amount - paid);
                            return sum + remaining;
                        }, 0).toLocaleString(locale, {minimumFractionDigits: 2})}</div>
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
                                    <td class="px-4 py-2 text-right text-orange-600">${currencySymbol}${stats.pending.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
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
                                    <td class="px-4 py-2 text-right text-orange-600">${currencySymbol}${stats.pending.toLocaleString(locale, {minimumFractionDigits: 2})}</td>
                                    <td class="px-4 py-2 text-right">${stats.total > 0 ? ((stats.paid / stats.total) * 100).toFixed(1) : '0.0'}%</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;    
    
    // 使用showReportModal显示报表
    showReportModal(reportHtml);
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
            
            addChatMessage(`${strings.completed}\n${strings.customer}：${record.customerName}\n${strings.amount}：R$ ${record.amount}\n${strings.orderDate}：${record.orderDate}\n${strings.creditDays}：${creditDays} dias\n${strings.dueDate}：${dueDateStr}`, 'bot');
            
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
                        console.error(`Falha na importação da linha ${index + 1}:`, error.message);
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
            console.error('Erro ao importar arquivo:', error);
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
    const currencySymbol = 'R$';
    
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
    const paidAmount = records.reduce((sum, r) => sum + (parseFloat(r.paidAmount) || 0), 0);
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
        
        // 从payments数组计算实际已付金额
        const actualPaidAmount = record.payments ? record.payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) : 0;
        stats.paid += actualPaidAmount;
        
        // 计算剩余未付金额
        const remainingAmount = Math.max(0, record.amount - actualPaidAmount);
        if (remainingAmount > 0) {
            const dueDate = parseDDMMYYYYToDate(record.dueDate) || new Date(record.dueDate);
            if (dueDate < new Date()) {
                stats.overdue += remainingAmount;
            } else {
                stats.pending += remainingAmount;
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
        
        const actualPaidAmount = record.payments ? record.payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) : 0;
        const remainingAmount = Math.max(0, record.amount - actualPaidAmount);
        
        monthlyStats[month].total += record.amount;
        monthlyStats[month].paid += paidAmount;
        monthlyStats[month].pending += remainingAmount;
    });
    
    doc.setFontSize(10);
    Object.entries(monthlyStats).sort().reverse().forEach(([month, stats]) => {
        if (yPosition > 250) {
            doc.addPage();
            yPosition = 30;
        }
        const collectionRate = stats.total > 0 ? ((stats.paid / stats.total) * 100).toFixed(1) : '0.0';
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
    let totalPaidAmount = 0;
    let totalRemainingAmount = 0;
    
    selectedRecords.forEach(record => {
        if (record.amount) {
            const amount = parseFloat(record.amount.toString().replace(/[^\d.-]/g, ''));
            if (!isNaN(amount)) {
                totalAmount += amount;
            }
        }
        
        // 从payments数组计算实际已付金额
        const actualPaidAmount = record.payments ? record.payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) : 0;
        totalPaidAmount += actualPaidAmount;
        
        // 计算剩余金额
        const remainingAmount = Math.max(0, (record.amount || 0) - actualPaidAmount);
        totalRemainingAmount += remainingAmount;
    });
    
    const reportTitle = lang === 'zh' ? '收账记录报表' : 'Relatório de Contas a Receber';
    const generatedDate = lang === 'zh' ? `生成日期: ${currentDate}` : `Data de Geração: ${currentDate}`;
    const recordCount = lang === 'zh' ? `记录数量: ${selectedRecords.length}` : `Número de Registros: ${selectedRecords.length}`;
    const totalLabel = lang === 'zh' ? '总金额:' : 'Valor Total:';
    const paidLabel = lang === 'zh' ? '已付金额:' : 'Valor Pago:';
    const remainingLabel = lang === 'zh' ? '剩余金额:' : 'Valor Restante:';
    
    let tableRows = '';
    selectedRecords.forEach((record, index) => {
        const paidAmount = record.paidAmount || 0;
        const remainingAmount = Math.max(0, (record.amount || 0) - paidAmount);
        
        // 生成付款记录详情
        let paymentDetails = '';
        if (record.payments && record.payments.length > 0) {
            const paymentList = record.payments.map(payment => {
                const methodText = getPaymentMethodText(payment.method);
                return `${formatDate(payment.date)} - ${formatCurrency(payment.amount)} (${methodText})`;
            }).join('<br>');
            paymentDetails = `<div class="text-sm text-gray-600">${paymentList}</div>`;
        } else {
            paymentDetails = `<div class="text-sm text-gray-400">${lang === 'zh' ? '暂无付款记录' : 'Nenhum pagamento'}</div>`;
        }
        
        tableRows += `
            <tr>
                <td class="px-4 py-2 border">${index + 1}</td>
                <td class="px-4 py-2 border">${record.nf || '-'}</td>
                <td class="px-4 py-2 border">${record.orderNumber || '-'}</td>
                <td class="px-4 py-2 border">${record.customerName || '-'}</td>
                <td class="px-4 py-2 border">${formatDate(record.orderDate) || '-'}</td>
                <td class="px-4 py-2 border">${formatCurrency(record.amount)}</td>
                <td class="px-4 py-2 border">${formatCurrency(paidAmount)}</td>
                <td class="px-4 py-2 border">${formatCurrency(remainingAmount)}</td>
                <td class="px-4 py-2 border">${paymentDetails}</td>
            </tr>`;
    });
    
    return `
        <div class="p-6">
            <div class="mb-4">
                <h2 class="text-xl font-bold mb-2">${reportTitle}</h2>
                <p class="text-gray-600">${generatedDate}</p>
                <p class="text-gray-600">${recordCount}</p>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full border-collapse border border-gray-300">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '序号' : 'Nº'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">NF</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '订单号' : 'Nº DE PEDIDO'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '客户' : 'Cliente'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '订单日期' : 'Data de Emissão'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '订单金额' : 'Valor do Pedido'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '已付金额' : 'Valor Pago'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '剩余金额' : 'Valor Restante'}</th>
                            <th class="px-4 py-2 border border-gray-300 text-left">${lang === 'zh' ? '付款记录' : 'Registros de Pagamento'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                    <tfoot class="bg-gray-50">
                        <tr>
                            <td colspan="5" class="px-4 py-2 border border-gray-300 text-right font-bold">${totalLabel}</td>
                            <td class="px-4 py-2 border border-gray-300 font-bold">${formatCurrency(totalAmount)}</td>
                            <td class="px-4 py-2 border border-gray-300 font-bold">${formatCurrency(totalPaidAmount)}</td>
                            <td class="px-4 py-2 border border-gray-300 font-bold">${formatCurrency(totalRemainingAmount)}</td>
                            <td class="px-4 py-2 border border-gray-300"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <div class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h3 class="font-semibold text-blue-800">${totalLabel}</h3>
                    <p class="text-2xl font-bold text-blue-600">${formatCurrency(totalAmount)}</p>
                </div>
                <div class="bg-green-50 p-4 rounded-lg">
                    <h3 class="font-semibold text-green-800">${paidLabel}</h3>
                    <p class="text-2xl font-bold text-green-600">${formatCurrency(totalPaidAmount)}</p>
                </div>
                <div class="bg-orange-50 p-4 rounded-lg">
                    <h3 class="font-semibold text-orange-800">${remainingLabel}</h3>
                    <p class="text-2xl font-bold text-orange-600">${formatCurrency(totalRemainingAmount)}</p>
                </div>
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

// 查看付款记录
function viewPaymentRecords(index) {
    const record = records[index];
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    
    if (!record) {
        alert(lang === 'zh' ? '记录不存在' : 'Registro não encontrado');
        return;
    }
    
    const payments = record.payments || [];
    const actualPaidAmount = record.payments ? record.payments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0) : 0;
        const remainingAmount = Math.max(0, record.amount - actualPaidAmount);
    
    // 创建付款记录模态框
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 z-50 flex items-center justify-center p-4';
    modal.id = 'paymentRecordsModal';
    
    let paymentsHtml = '';
    if (payments.length > 0) {
        paymentsHtml = payments.map((payment, idx) => `
            <tr class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">${idx + 1}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${formatDate(payment.date)}</td>
                <td class="px-4 py-3 text-sm font-medium text-green-600">${formatCurrency(payment.amount)}</td>
                <td class="px-4 py-3 text-sm text-gray-900">${payment.method || (lang === 'zh' ? '未指定' : 'Não especificado')}</td>
                <td class="px-4 py-3 text-sm text-gray-500">${payment.remark || '-'}</td>
                <td class="px-4 py-3 text-sm text-gray-900">
                    <button onclick="deletePaymentRecord(${index}, ${idx})" class="text-red-600 hover:text-red-800 transition-colors" title="${lang === 'zh' ? '删除付款记录' : 'Excluir registro de pagamento'}">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } else {
        paymentsHtml = `
            <tr>
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">
                    <i class="fas fa-receipt text-4xl mb-2 text-gray-300"></i>
                    <p>${lang === 'zh' ? '暂无付款记录' : 'Nenhum registro de pagamento'}</p>
                </td>
            </tr>
        `;
    }
    
    modal.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-y-auto">
            <div class="flex justify-between items-center p-6 border-b">
                <div>
                    <h3 class="text-lg font-semibold text-gray-800">
                        <i class="fas fa-receipt mr-2 text-purple-600"></i>
                        ${lang === 'zh' ? '付款记录' : 'Registros de Pagamento'}
                    </h3>
                    <p class="text-sm text-gray-600 mt-1">
                        ${lang === 'zh' ? '客户' : 'Cliente'}: <span class="font-medium">${record.customerName}</span>
                        ${record.orderNumber ? ` | ${lang === 'zh' ? '订单号' : 'Nº Pedido'}: <span class="font-medium">${record.orderNumber}</span>` : ''}
                    </p>
                </div>
                <button onclick="closePaymentRecordsModal()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="p-6">
                <!-- 订单摘要 -->
                <div class="bg-gray-50 rounded-lg p-4 mb-6">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div class="text-center">
                            <p class="text-sm text-gray-600">${lang === 'zh' ? '订单总额' : 'Valor Total'}</p>
                            <p class="text-xl font-bold text-blue-600">${formatCurrency(record.amount)}</p>
                        </div>
                        <div class="text-center">
                            <p class="text-sm text-gray-600">${lang === 'zh' ? '已付金额' : 'Valor Pago'}</p>
                            <p class="text-xl font-bold text-green-600">${formatCurrency(paidAmount)}</p>
                        </div>
                        <div class="text-center">
                            <p class="text-sm text-gray-600">${lang === 'zh' ? '剩余金额' : 'Valor Restante'}</p>
                            <p class="text-xl font-bold ${remainingAmount > 0 ? 'text-orange-600' : 'text-gray-400'}">${formatCurrency(remainingAmount)}</p>
                        </div>
                    </div>
                </div>
                
                <!-- 付款记录表格 -->
                <div class="overflow-x-auto">
                    <table class="min-w-full divide-y divide-gray-200">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    ${lang === 'zh' ? '序号' : 'Nº'}
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    ${lang === 'zh' ? '付款日期' : 'Data de Pagamento'}
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    ${lang === 'zh' ? '付款金额' : 'Valor Pago'}
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    ${lang === 'zh' ? '付款方式' : 'Método de Pagamento'}
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    ${lang === 'zh' ? '备注' : 'Observações'}
                                </th>
                                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    ${lang === 'zh' ? '操作' : 'Ações'}
                                </th>
                            </tr>
                        </thead>
                        <tbody class="bg-white divide-y divide-gray-200">
                            ${paymentsHtml}
                        </tbody>
                    </table>
                </div>
                
                <!-- 操作按钮 -->
                <div class="mt-6 flex justify-end space-x-3">
                    <button onclick="openPaymentModal(${index})" class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
                        <i class="fas fa-plus mr-2"></i>
                        ${lang === 'zh' ? '添加付款' : 'Adicionar Pagamento'}
                    </button>
                    <button onclick="closePaymentRecordsModal()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors">
                        ${lang === 'zh' ? '关闭' : 'Fechar'}
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closePaymentRecordsModal();
        }
    });
}

// 删除单个付款记录
function deletePaymentRecord(recordIndex, paymentIndex) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const record = records[recordIndex];
    
    if (!record || !record.payments || paymentIndex >= record.payments.length) {
        showNotification(lang === 'zh' ? '付款记录不存在' : 'Registro de pagamento não encontrado', 'error');
        return;
    }
    
    const payment = record.payments[paymentIndex];
    const confirmMessage = lang === 'zh' 
        ? `确定要删除这条付款记录吗？\n\n付款日期：${formatDate(payment.date)}\n付款金额：${formatCurrency(payment.amount)}\n付款方式：${payment.method || '未指定'}` 
        : `Tem certeza de que deseja excluir este registro de pagamento?\n\nData: ${formatDate(payment.date)}\nValor: ${formatCurrency(payment.amount)}\nMétodo: ${payment.method || 'Não especificado'}`;
    
    if (confirm(confirmMessage)) {
        // 从付款记录数组中删除该付款
        const deletedAmount = parseFloat(payment.amount) || 0;
        record.payments.splice(paymentIndex, 1);
        
        // 重新计算已付金额
        record.paidAmount = record.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        
        // 更新记录状态
        if (record.paidAmount >= record.amount) {
            record.status = 'paid';
        } else if (record.paidAmount > 0) {
            // 部分付款，保持原状态或设为适当状态
            if (record.status === 'paid') {
                // 如果之前是已付款状态，现在改为未完全付款
                const today = new Date();
                const dueDate = new Date(record.dueDate);
                if (dueDate < today) {
                    record.status = 'overdue';
                } else {
                    record.status = 'pending';
                }
            }
        } else {
            // 没有付款记录，设为待付款
            const today = new Date();
            const dueDate = new Date(record.dueDate);
            if (dueDate < today) {
                record.status = 'overdue';
            } else {
                record.status = 'pending';
            }
        }
        
        // 更新时间戳
        record.updatedAt = new Date().toISOString();
        
        // 保存记录
        saveRecords();
        
        // 更新界面
        loadRecords();
        updateStatistics();
        
        // 触发客户数据同步
        if (typeof syncCustomersWithRecords === 'function') {
            syncCustomersWithRecords();
        }
        
        // 分发recordsUpdated事件
        window.dispatchEvent(new CustomEvent('recordsUpdated'));
        
        // 关闭当前模态框
        closePaymentRecordsModal();
        
        // 显示成功通知
        const successMessage = lang === 'zh' 
            ? `付款记录删除成功！已从 ${record.customerName} 的订单中删除 ${formatCurrency(deletedAmount)} 的付款记录。` 
            : `Registro de pagamento excluído com sucesso! Removido ${formatCurrency(deletedAmount)} do pedido de ${record.customerName}.`;
        showNotification(successMessage, 'success');
        
        // 重新打开付款记录模态框以显示更新后的数据
        setTimeout(() => {
            viewPaymentRecords(recordIndex);
        }, 100);
    }
}

// 关闭付款记录模态框
function closePaymentRecordsModal() {
    const modal = document.getElementById('paymentRecordsModal');
    if (modal) {
        document.body.removeChild(modal);
    }
}

// 删除指定客户的所有订单记录
function deleteCustomerRecords(customerNames) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    
    if (!Array.isArray(customerNames)) {
        customerNames = [customerNames];
    }
    
    let deletedCount = 0;
    
    // 从后往前遍历，避免索引问题
    for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (record.customerName && customerNames.some(name => 
            record.customerName.trim() === name.trim()
        )) {
            records.splice(i, 1);
            deletedCount++;
        }
    }
    
    if (deletedCount > 0) {
        // 保存到本地存储
        saveToLocalStorage();
        
        // 重新加载表格
        loadRecords();
        updateStatistics();
        
        // 触发数据更新事件
        window.dispatchEvent(new CustomEvent('recordsUpdated'));
        
        // 显示成功消息
        const message = lang === 'zh' 
            ? `已删除 ${deletedCount} 条记录` 
            : `${deletedCount} registros excluídos`;
        showNotification(message, 'success');
        
        console.log(`Excluídos ${deletedCount} registros, clientes envolvidos: ${customerNames.join(', ')}`);
    } else {
        const message = lang === 'zh' 
            ? '未找到相关记录' 
            : 'Nenhum registro encontrado';
        showNotification(message, 'warning');
        console.log(`Registros de clientes não encontrados: ${customerNames.join(', ')}`);
    }
    
    return deletedCount;
}

// 删除ABC贸易公司和XYZ建筑公司的订单记录
function deleteSpecificCustomerOrders() {
    const customersToDelete = ['ABC贸易公司', 'XYZ建筑公司'];
    return deleteCustomerRecords(customersToDelete);
}

// 切换客户管理面板的显示/隐藏
function toggleCustomerPanel() {
    const customerPanel = document.getElementById('customerPanel');
    const recordsPanel = document.getElementById('recordsPanel');
    const toggleIcon = document.getElementById('toggleIcon');
    const toggleButton = document.getElementById('toggleCustomerPanel');
    
    if (customerPanel.style.display === 'none' || customerPanel.classList.contains('hidden')) {
        // 显示客户面板
        customerPanel.style.display = 'block';
        customerPanel.classList.remove('hidden');
        customerPanel.classList.add('lg:col-span-1');
        recordsPanel.classList.remove('lg:col-span-5');
        recordsPanel.classList.add('lg:col-span-4');
        toggleIcon.classList.remove('fa-chevron-right');
        toggleIcon.classList.add('fa-chevron-left');
        toggleButton.style.left = '4px';
    } else {
        // 隐藏客户面板
        customerPanel.style.display = 'none';
        customerPanel.classList.add('hidden');
        customerPanel.classList.remove('lg:col-span-1');
        recordsPanel.classList.remove('lg:col-span-4');
        recordsPanel.classList.add('lg:col-span-5');
        toggleIcon.classList.remove('fa-chevron-left');
        toggleIcon.classList.add('fa-chevron-right');
        toggleButton.style.left = '4px';
    }
}

// 客户搜索功能
// 移动端搜索切换功能
function toggleMobileSearch() {
    const mobileSearchBar = document.getElementById('mobileSearchBar');
    const mobileSearchInput = document.getElementById('mobileCustomerSearchInput');
    
    if (mobileSearchBar.classList.contains('hidden')) {
        mobileSearchBar.classList.remove('hidden');
        setTimeout(() => mobileSearchInput.focus(), 100);
    } else {
        mobileSearchBar.classList.add('hidden');
        mobileSearchInput.value = '';
        clearCustomerSearch();
    }
}

function searchCustomers(query) {
    const searchResults = document.getElementById('customerSearchResults');
    const clearButton = document.getElementById('clearSearchBtn');
    
    if (!query || query.trim() === '') {
        searchResults.style.display = 'none';
        if (clearButton) clearButton.style.display = 'none';
        return;
    }
    
    // 获取所有客户名称
    const customers = [...new Set(records.map(record => record.customerName).filter(name => name))];
    
    // 过滤匹配的客户
    const filteredCustomers = customers.filter(customer => 
        customer.toLowerCase().includes(query.toLowerCase())
    );
    
    if (filteredCustomers.length > 0) {
        searchResults.innerHTML = filteredCustomers.map(customer => 
            `<div class="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0" onclick="selectCustomer('${customer}')">
                <div class="font-medium text-gray-900">${customer}</div>
            </div>`
        ).join('');
        searchResults.style.display = 'block';
        if (clearButton) clearButton.style.display = 'block';
    } else {
        searchResults.innerHTML = '<div class="px-4 py-2 text-gray-500">未找到匹配的客户</div>';
        searchResults.style.display = 'block';
        clearButton.style.display = 'block';
    }
}

// 选择客户
function selectCustomer(customerName) {
    const searchInput = document.getElementById('customerSearchInput');
    const mobileSearchInput = document.getElementById('mobileCustomerSearchInput');
    const searchResults = document.getElementById('customerSearchResults');
    const clearButton = document.getElementById('clearSearchBtn');
    
    if (searchInput) searchInput.value = customerName;
    if (mobileSearchInput) mobileSearchInput.value = customerName;
    searchResults.style.display = 'none';
    if (clearButton) clearButton.style.display = 'block';
    
    // 隐藏移动端搜索栏
    const mobileSearchBar = document.getElementById('mobileSearchBar');
    if (mobileSearchBar && !mobileSearchBar.classList.contains('hidden')) {
        mobileSearchBar.classList.add('hidden');
    }
    
    // 过滤显示该客户的记录
    filterRecordsByCustomer(customerName);
}

// 按客户过滤记录
function filterRecordsByCustomer(customerName) {
    // 更新客户筛选下拉框
    const customerFilter = document.getElementById('customerFilter');
    if (customerFilter) {
        customerFilter.value = customerName;
    }
    
    // 触发表格更新
    updateTable();
}

// 清除搜索
function clearCustomerSearch() {
    const searchInput = document.getElementById('customerSearchInput');
    const mobileSearchInput = document.getElementById('mobileCustomerSearchInput');
    const searchResults = document.getElementById('customerSearchResults');
    const clearButton = document.getElementById('clearSearchBtn');
    
    if (searchInput) searchInput.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
    searchResults.style.display = 'none';
    if (clearButton) clearButton.style.display = 'none';
    
    // 清除客户筛选
    const customerFilter = document.getElementById('customerFilter');
    if (customerFilter) {
        customerFilter.value = '';
    }
    
    // 更新表格显示所有记录
    updateTable();
}

// 点击外部关闭搜索结果
document.addEventListener('click', function(event) {
    const searchContainer = document.getElementById('customerSearchContainer');
    const searchResults = document.getElementById('customerSearchResults');
    
    if (searchContainer && !searchContainer.contains(event.target)) {
        searchResults.style.display = 'none';
    }
});