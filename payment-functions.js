// 付款记录相关函数
function openPaymentModal(recordIndex = null) {
    let targetRecords = [];
    
    if (recordIndex !== null) {
        // 单个记录付款
        const record = records[recordIndex];
        if (!record) {
            const lang = localStorage.getItem('selectedLanguage') || 'pt';
        const texts = uiTexts[lang];
        showNotification(texts.recordNotFound, 'error');
            return;
        }
        if (record.status === 'paid') {
            showNotification(texts.recordAlreadyPaid, 'warning');
            return;
        }
        targetRecords = [{
            ...record,
            originalIndex: recordIndex
        }];
    } else {
        // 批量付款
        targetRecords = getSelectedRecords();
        if (targetRecords.length === 0) {
            showNotification(texts.selectRecordsFirst, 'error');
            return;
        }
    }
    
    // 更新付款记录选择下拉框
    updatePaymentRecordOptions(targetRecords);
    
    // 设置默认付款日期为今天
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today;
    
    // 如果是单个记录，预填充金额
    if (recordIndex !== null && targetRecords.length === 1) {
        const record = targetRecords[0];
        document.getElementById('paymentAmount').value = record.amount;
        // 自动选择该记录
        document.getElementById('paymentRecord').value = recordIndex;
    } else {
        document.getElementById('paymentAmount').value = '';
    }
    
    // 清空其他字段
    document.getElementById('paymentMethod').value = 'transfer';
    document.getElementById('paymentRemark').value = '';
    
    // 显示模态框
    document.getElementById('paymentModal').classList.remove('hidden');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.add('hidden');
}

function updatePaymentRecordOptions(selectedRecords) {
    const select = document.getElementById('paymentRecord');
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    select.innerHTML = `<option value="">${texts.selectRecordPlaceholder}</option>`;
    
    selectedRecords.forEach((record, index) => {
        const option = document.createElement('option');
        option.value = record.originalIndex;
        const naText = lang === 'zh' ? 'N/A' : 'N/A';
        const displayText = `${record.customerName} - ${formatCurrency(record.amount)} (${record.orderNumber || naText})`;
        option.textContent = displayText;
        select.appendChild(option);
    });
}

function getSelectedRecords() {
    const selectedRecords = [];
    const checkboxes = document.querySelectorAll('input[type="checkbox"]:checked:not(#selectAll)');
    
    checkboxes.forEach(checkbox => {
        const index = parseInt(checkbox.dataset.index);
        const record = records[index];
        if (record && record.status !== 'paid') {
            selectedRecords.push({
                ...record,
                originalIndex: index
            });
        }
    });
    
    return selectedRecords;
}

function handlePaymentSubmit(e) {
    e.preventDefault();
    
    const recordIndex = parseInt(document.getElementById('paymentRecord').value);
    const paymentDate = document.getElementById('paymentDate').value;
    const paymentAmount = parseFloat(document.getElementById('paymentAmount').value);
    const paymentMethod = document.getElementById('paymentMethod').value;
    const paymentRemark = document.getElementById('paymentRemark').value;
    
    // 获取当前语言设置
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    // 验证表单
    if (isNaN(recordIndex) || !paymentDate || isNaN(paymentAmount) || paymentAmount <= 0) {
        showNotification(texts.fillRequiredFields, 'error');
        return;
    }
    
    const record = records[recordIndex];
    if (!record) {
        showNotification(texts.recordNotFoundError, 'error');
        return;
    }
    
    // 检查付款金额是否超过记录金额
    const currentPaid = record.paidAmount || 0;
    const remainingAmount = record.amount - currentPaid;
    
    if (paymentAmount > remainingAmount) {
        showNotification(`${texts.paymentExceedsRemaining} ${formatCurrency(remainingAmount)}`, 'error');
        return;
    }
    
    // 初始化付款记录数组（如果不存在）
    if (!record.payments) {
        record.payments = [];
    }
    
    // 创建付款记录
    const payment = {
        id: Date.now(),
        date: paymentDate,
        amount: paymentAmount,
        method: paymentMethod,
        remark: paymentRemark,
        createdAt: new Date().toISOString()
    };
    
    // 添加付款记录
    record.payments.push(payment);
    
    // 更新已付金额
    record.paidAmount = (record.paidAmount || 0) + paymentAmount;
    
    // 更新记录状态
    if (record.paidAmount >= record.amount) {
        record.status = 'paid';
    } else {
        // 保持原状态或设为部分付款状态
        if (record.status === 'pending' || record.status === 'overdue' || record.status === 'dueSoon') {
            // 可以添加部分付款状态，这里暂时保持原状态
        }
    }
    
    // 保存记录
    saveRecords();
    
    // 更新界面
    updateTable();
    updateStatistics();
    updateSelectionSummary();
    
    // 触发客户数据同步更新
    if (typeof syncCustomersWithRecords === 'function') {
        syncCustomersWithRecords();
    }
    
    // 触发recordsUpdated事件，通知客户管理系统数据已更新
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('recordsUpdated'));
    }
    
    // 关闭模态框
    closePaymentModal();
    
    // 显示成功通知
    const methodText = getPaymentMethodText(paymentMethod);
    showNotification(`${texts.paymentRecordSuccess}：${record.customerName} - ${formatCurrency(paymentAmount)} (${methodText})`, 'success');
}

function getPaymentMethodText(method) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    const methods = {
        'transfer': texts.paymentMethodTransfer,
        'cash': texts.paymentMethodCash,
        'alipay': texts.paymentMethodAlipay,
        'wechat': texts.paymentMethodWechat,
        'pix': texts.paymentMethodPix,
        'other': texts.paymentMethodOther
    };
    return methods[method] || method;
}

// 初始化付款表单事件监听器
document.addEventListener('DOMContentLoaded', function() {
    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        paymentForm.addEventListener('submit', handlePaymentSubmit);
    }
});