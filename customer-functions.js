// 客户管理功能

// 客户数据
// 注意：这些示例数据将被从收账记录中提取的真实数据替换
let customers = [
    {
        id: 'CUST003',
        name: 'AMERICA PRESENTES',
        contact: '',
        phone: '',
        remark: '来自收账记录',
        orders: []
    }
];

// DOM元素引用
let selectedCustomerId = null;
const customerListContainer = document.getElementById('customer-list');
const customerDetailsPanel = document.getElementById('customer-details');
const customerInfo = document.getElementById('current-customer-info');
const customerSummaryCards = document.querySelector('#customer-summary .grid');
const customerOrdersContainer = document.getElementById('orders-list');
const customerPaymentsContainer = document.getElementById('payments-list');
const customerSearchInput = document.getElementById('customer-search');

// 模态框元素和表单元素将在需要时动态获取

// 渲染客户列表
function renderCustomers() {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    const searchTerm = customerSearchInput.value.toLowerCase();
    const filteredCustomers = customers.filter(customer => 
        customer.name.toLowerCase().includes(searchTerm) ||
        customer.contact.toLowerCase().includes(searchTerm) ||
        customer.phone.includes(searchTerm)
    );

    customerListContainer.innerHTML = '';
    
    filteredCustomers.forEach(customer => {
        const totalAmount = customer.orders.reduce((sum, order) => sum + order.amount, 0);
        const paidAmount = customer.orders.reduce((sum, order) => {
            return sum + order.payments.reduce((paySum, payment) => paySum + payment.amount, 0);
        }, 0);
        const remainingAmount = totalAmount - paidAmount;
        
        const customerItem = document.createElement('div');
        customerItem.className = `customer-item p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
            selectedCustomerId === customer.id ? 'bg-blue-50 border-blue-300' : ''
        }`;
        customerItem.onclick = () => selectCustomer(customer.id);
        
        customerItem.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex-1">
                    <h4 class="font-semibold text-gray-800">${customer.name}</h4>
                    <p class="text-sm text-gray-600 mt-1">
                        <i class="fas fa-user mr-1"></i>${customer.contact}
                        <span class="ml-3"><i class="fas fa-phone mr-1"></i>${customer.phone}</span>
                    </p>
                    ${customer.remark ? `<p class="text-xs text-gray-500 mt-1">${customer.remark}</p>` : ''}
                </div>
                <div class="text-right">
                    <div class="text-sm font-medium ${remainingAmount > 0 ? 'text-red-600' : 'text-green-600'}">
                        R$ ${remainingAmount.toLocaleString('pt-BR')}
                    </div>
                    <div class="text-xs text-gray-500">
                        ${customer.orders.length} ${texts.ordersCount}
                    </div>
                </div>
            </div>
        `;
        
        customerListContainer.appendChild(customerItem);
    });
}

// 选择客户
function selectCustomer(customerId) {
    selectedCustomerId = customerId;
    const customer = customers.find(c => c.id === customerId);
    
    if (!customer) return;
    
    // 更新客户信息
    updateCustomerInfo(customer);
    
    // 显示客户详情面板
    const customerDetailsPanel = document.getElementById('customer-details');
    if (customerDetailsPanel) {
        customerDetailsPanel.classList.remove('hidden');
    }
    
    // 更新客户详情div中的客户名称
    const currentCustomerInfo = document.getElementById('current-customer-info');
    if (currentCustomerInfo) {
        currentCustomerInfo.textContent = customer.name;
        currentCustomerInfo.classList.add('text-lg', 'font-semibold', 'text-gray-800', 'border-b', 'border-gray-200', 'pb-2');
    }
    
    // 启用按钮
    const addOrderBtn = document.getElementById('add-order-btn');
    const addPaymentBtn = document.getElementById('add-payment-btn');
    if (addOrderBtn) addOrderBtn.disabled = false;
    if (addPaymentBtn) addPaymentBtn.disabled = false;
    
    // 显示摘要（包含收账记录统计）
    showCustomerSummary(customer);
    
    // 始终渲染订单和付款（renderCustomerOrders内部会处理空状态）
    renderCustomerOrders(customer);
    renderCustomerPayments(customer);
    
    // 默认显示订单标签页
    showOrdersSection();
    
    // 如果没有订单，确保显示空状态（作为备用）
    if (customer.orders.length === 0) {
        const paymentsListContainer = document.getElementById('payments-list');
        if (paymentsListContainer) {
            const lang = localStorage.getItem('selectedLanguage') || 'pt';
        const texts = uiTexts[lang];
        paymentsListContainer.innerHTML = `<div class="text-center py-8 text-gray-500">${lang === 'zh' ? '该客户暂无付款记录' : 'Este cliente não possui registros de pagamento'}</div>`;
        }
    }
    
    // 显示收账记录信息
    displayAccountingRecords(customer.name);
    
    // 更新客户列表样式
    renderCustomers();
}

// 更新客户信息
function updateCustomerInfo(customer) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    customerInfo.innerHTML = `
        <div class="bg-white p-4 rounded-lg border">
            <h3 class="text-lg font-semibold text-gray-800 mb-2">${customer.name}</h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-600">${lang === 'zh' ? '联系人：' : 'Contato:'}</span>
                    <span class="font-medium">${customer.contact}</span>
                </div>
                <div>
                    <span class="text-gray-600">${lang === 'zh' ? '电话：' : 'Telefone:'}</span>
                    <span class="font-medium">${customer.phone}</span>
                </div>
                ${customer.remark ? `
                <div class="col-span-2">
                    <span class="text-gray-600">${lang === 'zh' ? '备注：' : 'Observações:'}</span>
                    <span class="font-medium">${customer.remark}</span>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

// 显示客户摘要
function showCustomerSummary(customer) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    // 计算客户管理系统中的订单总金额和付款金额
    const customerTotalAmount = customer.orders.reduce((sum, order) => sum + order.amount, 0);
    const customerPaidAmount = customer.orders.reduce((sum, order) => {
        return sum + order.payments.reduce((paySum, payment) => paySum + payment.amount, 0);
    }, 0);
    
    // 获取收账记录统计
    const accountingSummary = getCustomerAccountingSummary(customer.name);
    
    // 检查重复订单，避免重复计算
    let duplicateAmount = 0;
    let duplicatePaidAmount = 0;
    
    if (typeof records !== 'undefined' && Array.isArray(records)) {
        const customerRecords = records.filter(record => 
            record.customerName && record.customerName.trim() === customer.name.trim()
        );
        
        customer.orders.forEach(order => {
            const matchingRecord = customerRecords.find(record => 
                record.orderNumber === order.orderNumber || record.nf === order.orderNumber
            );
            
            if (matchingRecord) {
                // 发现重复订单，从收账记录总额中减去重复部分
                duplicateAmount += parseFloat(matchingRecord.amount) || 0;
                
                // 计算收账记录中该订单的付款金额
                let recordPaidAmount = 0;
                if (matchingRecord.payments && Array.isArray(matchingRecord.payments)) {
                    recordPaidAmount = matchingRecord.payments.reduce((sum, payment) => 
                        sum + (parseFloat(payment.amount) || 0), 0
                    );
                } else if (matchingRecord.status === 'paid' && matchingRecord.paidAmount) {
                    recordPaidAmount = parseFloat(matchingRecord.paidAmount) || 0;
                } else if (matchingRecord.status === 'paid') {
                    recordPaidAmount = parseFloat(matchingRecord.amount) || 0;
                }
                duplicatePaidAmount += recordPaidAmount;
            }
        });
    }
    
    // 合并统计数据，避免重复计算
    const totalAmount = customerTotalAmount + accountingSummary.totalAmount - duplicateAmount;
    
    // 修复已收账计算逻辑：确保不重复计算相同订单的付款
    let finalPaidAmount = 0;
    
    // 计算客户管理系统中非重复订单的付款
    customer.orders.forEach(order => {
        const isOrderInRecords = typeof records !== 'undefined' && Array.isArray(records) && 
            records.some(record => 
                record.customerName && record.customerName.trim() === customer.name.trim() &&
                (record.orderNumber === order.orderNumber || record.nf === order.orderNumber)
            );
        
        if (!isOrderInRecords) {
            // 如果订单不在收账记录中，计算客户管理系统的付款
            finalPaidAmount += order.payments.reduce((sum, payment) => sum + payment.amount, 0);
        }
    });
    
    // 加上收账记录中的所有付款（包括重复订单的实际付款）
    finalPaidAmount += accountingSummary.paidAmount;
    
    const unpaidAmount = totalAmount - finalPaidAmount;
    
    // 更新客户名称和信息
    const currentCustomerName = document.getElementById('current-customer-name');
    const currentCustomerInfo = document.getElementById('current-customer-info');
    if (currentCustomerName) {
        currentCustomerName.textContent = customer.name;
    }
    if (currentCustomerInfo) {
        currentCustomerInfo.textContent = customer.name;
    }
    
    // 更新财务摘要卡片
    const summaryTotalOrders = document.getElementById('summary-total-orders');
    const summaryPaid = document.getElementById('summary-paid');
    const summaryUnpaid = document.getElementById('summary-unpaid');
    
    if (summaryTotalOrders) {
        summaryTotalOrders.textContent = `R$ ${totalAmount.toLocaleString('pt-BR')}`;
    }
    if (summaryPaid) {
        summaryPaid.textContent = `R$ ${finalPaidAmount.toLocaleString('pt-BR')}`;
    }
    if (summaryUnpaid) {
        summaryUnpaid.textContent = `R$ ${unpaidAmount.toLocaleString('pt-BR')}`;
    }
    
    // 显示客户摘要面板
    const customerSummary = document.getElementById('customer-summary');
    if (customerSummary) {
        customerSummary.classList.remove('hidden');
    }
    
    // 如果存在customerSummaryCards元素（用于其他布局），也更新它
    if (typeof customerSummaryCards !== 'undefined' && customerSummaryCards) {
        customerSummaryCards.innerHTML = `
            <div class="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div class="text-blue-600 text-sm font-medium">${texts.totalOrderAmount}</div>
                <div class="text-2xl font-bold text-blue-800">R$ ${totalAmount.toLocaleString('pt-BR')}</div>
            </div>
            <div class="bg-green-50 p-4 rounded-lg border border-green-200">
                <div class="text-green-600 text-sm font-medium">${texts.paidAmount}</div>
                <div class="text-2xl font-bold text-green-800">R$ ${finalPaidAmount.toLocaleString('pt-BR')}</div>
            </div>
            <div class="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <div class="text-yellow-600 text-sm font-medium">${texts.totalUnpaidAmount}</div>
                <div class="text-2xl font-bold text-yellow-800">R$ ${unpaidAmount.toLocaleString('pt-BR')}</div>
            </div>

        `;
    }
}

// 渲染客户订单
function renderCustomerOrders(customer) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    const sortedOrders = [...customer.orders].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    customerOrdersContainer.innerHTML = '';

    // 如果没有订单，显示空状态消息
    if (sortedOrders.length === 0) {
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        customerOrdersContainer.innerHTML = `<div class="text-center py-8 text-gray-500">${lang === 'zh' ? '该客户暂无订单记录' : 'Este cliente não possui registros de pedidos'}</div>`;
        return;
    }
    
    sortedOrders.forEach(order => {
        // 计算客户管理系统中的付款金额
        const customerSystemPaidAmount = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
        
        // 查找对应的收账记录付款信息
        let accountingRecordPaidAmount = 0;
        if (typeof records !== 'undefined' && Array.isArray(records)) {
            const matchingRecord = records.find(record => 
                record.customerName && record.customerName.trim() === customer.name.trim() &&
                (record.orderNumber === order.orderNumber || record.nf === order.orderNumber)
            );
            
            if (matchingRecord) {
                if (matchingRecord.status === 'paid' && matchingRecord.paidAmount) {
                    accountingRecordPaidAmount = parseFloat(matchingRecord.paidAmount) || 0;
                } else if (matchingRecord.payments && Array.isArray(matchingRecord.payments)) {
                    accountingRecordPaidAmount = matchingRecord.payments.reduce((sum, payment) => 
                        sum + (parseFloat(payment.amount) || 0), 0
                    );
                }
            }
        }
        
        // 合并两个系统的付款金额
        const paidAmount = customerSystemPaidAmount + accountingRecordPaidAmount;
        const remainingAmount = order.amount - paidAmount;
        const paymentProgress = order.amount > 0 ? Math.min((paidAmount / order.amount) * 100, 100) : 0;
        
        const isOverdue = parseDDMMYYYYToDate(order.dueDate) < new Date() && remainingAmount > 0;
        
        const orderItem = document.createElement('div');
        orderItem.className = 'bg-white p-4 rounded-lg border hover:shadow-md transition-shadow';
        
        orderItem.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center">
                    <h4 class="font-semibold text-gray-800 mr-2">${order.orderNumber || (lang === 'pt' ? 'Pedido' : '订单')}</h4>
                    ${isOverdue ? `<span class="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-600">${lang === 'pt' ? 'Vencido' : '已逾期'}</span>` : ''}
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold text-gray-800">R$ ${order.amount.toLocaleString('pt-BR')}</div>
                    <div class="text-sm text-yellow-500">${lang === 'pt' ? 'Pendente' : '未付'}: R$ ${(order.amount * (1 - paymentProgress / 100)).toLocaleString('pt-BR')}</div>
                </div>
            </div>
            <div class="mb-3">
                <p class="text-sm text-gray-600">${lang === 'pt' ? 'Data do Pedido' : '订单日期'}: ${formatDate(order.date)} · ${lang === 'pt' ? 'Pagamento Previsto' : '预计付款'}: ${formatDate(order.dueDate)}</p>
            </div>
            
            <div class="mb-3">
                <p class="text-sm text-gray-700">${order.products}</p>
                ${order.remark ? `<p class="text-sm text-gray-600 mt-1">${texts.remark}：${order.remark}</p>` : ''}
            </div>
            
            <div class="mb-3">
                <div class="flex justify-between text-sm mb-1">
                    <span>${texts.paymentProgress}</span>
                    <span>${paymentProgress.toFixed(1)}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div class="h-2 rounded-full transition-all duration-300" 
                         style="width: ${paymentProgress}%; background-color: ${paymentProgress >= 100 ? '#10b981' : paymentProgress >= 50 ? '#f59e0b' : '#ef4444'};"></div>
                </div>
            </div>
            
            ${order.payments && order.payments.length > 0 ? `
            <div class="mb-3">
                <div class="text-sm mb-2">
                    <span class="text-gray-600">${lang === 'pt' ? 'Pedido' : '订单'} (${order.payments.length})</span>
                </div>
                <div class="space-y-1">
                    ${order.payments.map(payment => `
                        <div class="flex justify-between items-center text-sm">
                            <span class="text-gray-500">${formatDate ? formatDate(payment.date) : payment.date} · ${getPaymentMethodText(payment.method)}</span>
                            <span class="text-green-600 font-medium">+R$ ${payment.amount.toLocaleString('pt-BR')}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        `;
        
        customerOrdersContainer.appendChild(orderItem);
    });
}

// 渲染客户付款记录
function renderCustomerPayments(customer) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    const allPayments = [];
    const paymentKeys = new Set(); // 用于去重的键集合
    
    // 添加客户管理系统中的付款记录
    customer.orders.forEach(order => {
        order.payments.forEach(payment => {
            // 创建唯一键用于去重：日期+金额+订单号+付款方式
            const paymentKey = `${payment.date}_${payment.amount}_${order.orderNumber}_${payment.method || 'transfer'}`;
            
            if (!paymentKeys.has(paymentKey)) {
                paymentKeys.add(paymentKey);
                allPayments.push({
                    ...payment,
                    orderNumber: order.orderNumber,
                    orderId: order.id,
                    source: payment.source || 'customer_system'
                });
            }
        });
    });
    
    // 添加来自收账记录的付款记录（只添加不重复的）
    if (typeof records !== 'undefined' && Array.isArray(records)) {
        const customerRecords = records.filter(record => 
            record.customerName && record.customerName.trim() === customer.name.trim()
        );
        
        customerRecords.forEach(record => {
            if (record.payments && Array.isArray(record.payments)) {
                record.payments.forEach(payment => {
                    // 创建唯一键用于去重
                    const paymentKey = `${payment.date}_${payment.amount}_${record.orderNumber || record.nf || 'N/A'}_${payment.method || 'transfer'}`;
                    
                    if (!paymentKeys.has(paymentKey)) {
                        paymentKeys.add(paymentKey);
                        allPayments.push({
                            ...payment,
                            orderNumber: record.orderNumber || record.nf || 'N/A',
                            orderId: record.id,
                            source: 'accounting_record'
                        });
                    }
                });
            }
        });
    }
    
    const sortedPayments = allPayments.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    customerPaymentsContainer.innerHTML = '';
    
    // 如果没有付款记录，显示空状态消息
    if (sortedPayments.length === 0) {
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        customerPaymentsContainer.innerHTML = `<div class="text-center py-8 text-gray-500">${lang === 'zh' ? '该客户暂无付款记录' : 'Este cliente não possui registros de pagamento'}</div>`;
        return;
    }
    
    sortedPayments.forEach(payment => {
        const paymentItem = document.createElement('div');
        paymentItem.className = 'bg-white p-4 rounded-lg border hover:shadow-md transition-shadow';
        
        // 确定来源标识
        const sourceText = payment.source === 'accounting_record' ? 
            (lang === 'pt' ? 'Registro Contábil' : '收账记录') : 
            (lang === 'pt' ? 'Sistema Cliente' : '客户系统');
        const sourceColor = payment.source === 'accounting_record' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600';
        
        paymentItem.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="flex-1">
                    <p class="text-sm font-medium text-gray-800 mb-1">${lang === 'pt' ? 'Transferência Bancária' : '银行转账'}</p>
                    <p class="text-xs text-gray-500">
                        ${lang === 'pt' ? 'Data do Pagamento' : '付款日期'}: ${formatDate ? formatDate(payment.date) : payment.date}
                    </p>
                </div>
                <div class="text-right">
                    <p class="text-lg font-semibold text-green-600">+R$ ${payment.amount.toLocaleString('pt-BR')}</p>
                    <p class="text-xs text-gray-500">${lang === 'pt' ? 'Pedido' : '订单'}: ${payment.orderNumber}</p>
                </div>
            </div>
        `;
        
        customerPaymentsContainer.appendChild(paymentItem);
    });
}

// 显示/隐藏订单和付款部分
function showOrdersSection() {
    document.getElementById('orders-tab').classList.add('border-blue-500', 'text-blue-600');
    document.getElementById('orders-tab').classList.remove('border-transparent', 'text-gray-500');
    document.getElementById('payments-tab').classList.remove('border-blue-500', 'text-blue-600');
    document.getElementById('payments-tab').classList.add('border-transparent', 'text-gray-500');
    
    document.getElementById('orders-section').classList.remove('hidden');
    document.getElementById('payments-section').classList.add('hidden');
}

function showPaymentsSection() {
    document.getElementById('payments-tab').classList.add('border-blue-500', 'text-blue-600');
    document.getElementById('payments-tab').classList.remove('border-transparent', 'text-gray-500');
    document.getElementById('orders-tab').classList.remove('border-blue-500', 'text-blue-600');
    document.getElementById('orders-tab').classList.add('border-transparent', 'text-gray-500');
    
    document.getElementById('payments-section').classList.remove('hidden');
    document.getElementById('orders-section').classList.add('hidden');
}

// 模态框管理
function showCustomerModal() {
    const addCustomerModal = document.getElementById('add-customer-modal');
    if (!addCustomerModal) {
        console.error('添加客户模态框元素未找到');
        return;
    }
    addCustomerModal.classList.remove('opacity-0', 'pointer-events-none');
    addCustomerModal.classList.add('opacity-100');
    const transformElement = addCustomerModal.querySelector('.transform');
    if (transformElement) {
        transformElement.classList.remove('scale-95');
        transformElement.classList.add('scale-100');
    }
}

function hideCustomerModal() {
    const addCustomerModal = document.getElementById('add-customer-modal');
    const addCustomerForm = document.getElementById('add-customer-form');
    if (!addCustomerModal) {
        console.error('添加客户模态框元素未找到');
        return;
    }
    addCustomerModal.classList.add('opacity-0', 'pointer-events-none');
    addCustomerModal.classList.remove('opacity-100');
    const transformElement = addCustomerModal.querySelector('.transform');
    if (transformElement) {
        transformElement.classList.add('scale-95');
        transformElement.classList.remove('scale-100');
    }
    if (addCustomerForm) {
        addCustomerForm.reset();
    }
}

function showOrderModal() {
    if (!selectedCustomerId) {
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        const message = lang === 'pt' ? 'Por favor, selecione um cliente primeiro' : '请先选择客户';
        showNotification(message, 'error');
        return;
    }
    
    const addOrderModal = document.getElementById('add-order-modal');
    if (!addOrderModal) {
        console.error('添加订单模态框元素未找到');
        return;
    }
    
    addOrderModal.classList.remove('hidden');
    
    // 设置默认日期为DD/MM/YYYY格式
    const today = new Date();
    const formattedDate = typeof formatDate === 'function' ? formatDate(today) : today.toISOString().split('T')[0];
    const orderDateInput = document.getElementById('orderDateInput');
    if (orderDateInput) {
        orderDateInput.value = formattedDate;
    }
}

function hideOrderModal() {
    const addOrderModal = document.getElementById('add-order-modal');
    const addOrderForm = document.getElementById('add-order-form');
    if (!addOrderModal) {
        console.error('添加订单模态框元素未找到');
        return;
    }
    addOrderModal.classList.add('hidden');
    if (addOrderForm) {
        addOrderForm.reset();
    }
}

function showPaymentModal() {
    if (!selectedCustomerId) {
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        const message = lang === 'pt' ? 'Por favor, selecione um cliente primeiro' : '请先选择客户';
        showNotification(message, 'error');
        return;
    }
    
    updatePaymentOrderOptions();
    
    const addPaymentModal = document.getElementById('add-payment-modal');
    if (!addPaymentModal) {
        console.error('添加付款模态框元素未找到');
        return;
    }
    
    addPaymentModal.classList.remove('hidden');
    
    // 设置默认日期为DD/MM/YYYY格式
    const today = new Date();
    const formattedDate = typeof formatDate === 'function' ? formatDate(today) : today.toISOString().split('T')[0];
    const paymentDateInput = document.getElementById('paymentDateInput');
    if (paymentDateInput) {
        paymentDateInput.value = formattedDate;
    }
}

function hidePaymentModal() {
    const addPaymentModal = document.getElementById('add-payment-modal');
    const addPaymentForm = document.getElementById('add-payment-form');
    if (!addPaymentModal) {
        console.error('添加付款模态框元素未找到');
        return;
    }
    addPaymentModal.classList.add('hidden');
    if (addPaymentForm) {
        addPaymentForm.reset();
    }
}

// 更新付款订单选项
function updatePaymentOrderOptions() {
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return;
    
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const paymentOrderSelect = document.getElementById('paymentOrderSelect');
    if (!paymentOrderSelect) {
        console.error('付款订单选择元素未找到');
        return;
    }
    paymentOrderSelect.innerHTML = `<option value="">${lang === 'pt' ? 'Selecione o pedido' : '请选择订单'}</option>`;
    
    customer.orders.forEach(order => {
        const paidAmount = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const remainingAmount = order.amount - paidAmount;
        
        if (remainingAmount > 0) {
            const option = document.createElement('option');
            option.value = order.id;
            option.textContent = `${order.orderNumber} - 余额：R$ ${remainingAmount.toLocaleString('pt-BR')}`;
            paymentOrderSelect.appendChild(option);
        }
    });
}

// 生成ID
function generateId(prefix = '') {
    const id = Date.now().toString().slice(-6) + Math.random().toString(36).substr(2, 3).toUpperCase();
    return prefix ? `${prefix}${id}` : id;
}

// 事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 初始化多语言支持
    updateCustomerUILanguage();
    
    // 初始渲染
    renderCustomers();
    
    // 初始化按钮状态 - 在没有选择客户时禁用订单和付款按钮
    const addOrderBtn = document.getElementById('add-order-btn');
    const addPaymentBtn = document.getElementById('add-payment-btn');
    if (addOrderBtn) addOrderBtn.disabled = true;
    if (addPaymentBtn) addPaymentBtn.disabled = true;
    
    // 搜索功能
    customerSearchInput.addEventListener('input', renderCustomers);
    
    // 标签切换
    const ordersTab = document.getElementById('orders-tab');
    if (ordersTab) ordersTab.addEventListener('click', showOrdersSection);
    
    const paymentsTab = document.getElementById('payments-tab');
    if (paymentsTab) paymentsTab.addEventListener('click', showPaymentsSection);
    
    // 按钮事件
    const addCustomerBtn = document.getElementById('add-customer-btn');
    if (addCustomerBtn) addCustomerBtn.addEventListener('click', showCustomerModal);
    
    if (addOrderBtn) addOrderBtn.addEventListener('click', showOrderModal);
    
    if (addPaymentBtn) addPaymentBtn.addEventListener('click', showPaymentModal);
    
    // 表单提交
    const addCustomerForm = document.getElementById('add-customer-form');
    if (addCustomerForm) addCustomerForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(addCustomerForm);
        const newCustomer = {
            id: generateId('CUST'),
            name: document.getElementById('customer-name').value,
            contact: document.getElementById('customer-contact').value,
            phone: document.getElementById('customer-phone').value,
            remark: document.getElementById('customer-remark').value,
            orders: []
        };
        
        customers.push(newCustomer);
        renderCustomers();
        hideCustomerModal();
        showNotification('客户添加成功', 'success');
    });
    
    const addOrderForm = document.getElementById('add-order-form');
    if (addOrderForm) addOrderForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const customer = customers.find(c => c.id === selectedCustomerId);
        if (!customer) return;
        
        const orderNumber = document.getElementById('orderNumberInput').value.trim();
        const orderDate = document.getElementById('orderDateInput').value;
        const orderAmount = parseFloat(document.getElementById('orderAmountInput').value);
        
        // 检查是否存在重复订单
        const isDuplicateOrder = customer.orders.some(order => {
            const sameOrderNumber = orderNumber && order.orderNumber && 
                order.orderNumber.trim() === orderNumber;
            const sameAmount = Math.abs(order.amount - orderAmount) < 0.01;
            const sameDate = order.date === orderDate;
            
            return sameOrderNumber || (sameAmount && sameDate);
        });
        
        if (isDuplicateOrder) {
            const lang = localStorage.getItem('selectedLanguage') || 'pt';
            showNotification(lang === 'pt' ? 'Pedido duplicado detectado!' : '检测到重复订单！', 'error');
            return;
        }
        
        const newOrder = {
            id: generateId('ORD'),
            orderNumber: orderNumber,
            date: orderDate,
            amount: orderAmount,
            dueDate: document.getElementById('orderDueDateInput').value,
            products: document.getElementById('orderProductsInput').value,
            remark: document.getElementById('orderRemarkInput').value,
            payments: []
        };
        
        customer.orders.push(newOrder);
        
        // 同时添加到收账记录数组中
        if (typeof records !== 'undefined' && Array.isArray(records)) {
            // 检查收账记录中是否已存在相同记录
            const isDuplicateRecord = records.some(record => {
                const sameCustomer = record.customerName.trim().toLowerCase() === customer.name.trim().toLowerCase();
                const sameAmount = Math.abs(record.amount - newOrder.amount) < 0.01;
                const sameOrderDate = record.orderDate === newOrder.date;
                const sameOrderNumber = newOrder.orderNumber && record.orderNumber && 
                    record.orderNumber.trim() === newOrder.orderNumber.trim();
                
                return sameCustomer && sameAmount && sameOrderDate && sameOrderNumber;
            });
            
            if (!isDuplicateRecord) {
                const accountingRecord = {
                    id: newOrder.id,
                    nf: '', // NF号码留空，可以后续编辑
                    orderNumber: newOrder.orderNumber,
                    customerName: customer.name,
                    amount: newOrder.amount,
                    orderDate: newOrder.date,
                    dueDate: newOrder.dueDate,
                    products: newOrder.products,
                    remark: newOrder.remark,
                    status: 'pending',
                    paidAmount: 0,
                    payments: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                records.push(accountingRecord);
                
                // 保存到localStorage
                if (typeof saveRecords === 'function') {
                    saveRecords();
                } else {
                    localStorage.setItem('accountRecords', JSON.stringify(records));
                }
                
                // 更新主表格显示
                if (typeof loadRecords === 'function') {
                    loadRecords();
                }
                
                // 更新统计信息
                if (typeof updateStatistics === 'function') {
                    updateStatistics();
                }
            }
        }
        
        // 更新显示
        selectCustomer(selectedCustomerId);
        hideOrderModal();
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        showNotification(lang === 'pt' ? 'Pedido adicionado com sucesso' : '订单添加成功', 'success');
    });
    
    const addPaymentForm = document.getElementById('add-payment-form');
    if (addPaymentForm) addPaymentForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const customer = customers.find(c => c.id === selectedCustomerId);
        const orderId = document.getElementById('paymentOrderSelect').value;
        const order = customer.orders.find(o => o.id === orderId);
        
        if (!order) {
            showNotification(lang === 'pt' ? 'Selecione um pedido válido' : '请选择有效订单', 'error');
            return;
        }
        
        const paymentAmount = parseFloat(document.getElementById('paymentAmountInput').value);
        const paidAmount = order.payments.reduce((sum, payment) => sum + payment.amount, 0);
        const remainingAmount = order.amount - paidAmount;
        
        if (paymentAmount > remainingAmount) {
            showNotification('付款金额不能超过剩余金额', 'error');
            return;
        }
        
        const newPayment = {
            id: generateId('PAY'),
            date: document.getElementById('paymentDateInput').value,
            amount: paymentAmount,
            method: document.getElementById('paymentMethodInput').value,
            remark: document.getElementById('paymentRemarkInput').value
        };
        
        order.payments.push(newPayment);
        
        // 更新显示
        selectCustomer(selectedCustomerId);
        hidePaymentModal();
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        showNotification(lang === 'zh' ? '付款记录添加成功' : 'Registro de pagamento adicionado com sucesso', 'success');
    });
});

// 监听语言切换事件
document.addEventListener('languageChanged', function() {
    updateCustomerUILanguage();
});

// 获取付款方式文本
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

// 多语言支持函数
function updateCustomerUILanguage() {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    // 确保uiTexts已定义，如果没有则使用基本翻译
    if (typeof uiTexts === 'undefined') {
        console.warn('uiTexts not defined, using basic translations');
        return;
    }
    const texts = uiTexts[lang];
    
    // 更新客户列表标题
    const customerListTitle = document.querySelector('#customer-list-section h2');
    if (customerListTitle) {
        customerListTitle.textContent = texts.customerList;
    }
    
    // 更新客户详情标题
    const customerDetailsTitle = document.querySelector('#customer-details-section h2');
    if (customerDetailsTitle) {
        customerDetailsTitle.textContent = texts.customerDetails;
    }
    
    // 更新按钮文本
    const addCustomerBtn = document.getElementById('add-customer-btn');
    if (addCustomerBtn) {
        addCustomerBtn.innerHTML = `<i class="fas fa-plus mr-2"></i>${texts.addCustomer}`;
    }
    
    const addOrderBtn = document.getElementById('add-order-btn');
    if (addOrderBtn) {
        addOrderBtn.innerHTML = `<i class="fas fa-plus mr-2"></i>${texts.addOrder}`;
    }
    
    const addPaymentBtn = document.getElementById('add-payment-btn');
    if (addPaymentBtn) {
        addPaymentBtn.innerHTML = `<i class="fas fa-plus mr-2"></i>${texts.addPayment}`;
    }
    
    // 更新搜索框
    if (customerSearchInput) {
        customerSearchInput.placeholder = texts.customerSearchPlaceholder;
    }
    
    // 更新标签页
    const ordersTab = document.getElementById('orders-tab');
    if (ordersTab) {
        ordersTab.textContent = texts.ordersTab;
    }
    
    const paymentsTab = document.getElementById('payments-tab');
    if (paymentsTab) {
        paymentsTab.textContent = texts.paymentsTab;
    }
    
    const accountingTab = document.getElementById('accounting-tab');
    if (accountingTab) {
        accountingTab.textContent = texts.accountingRecordsTab;
    }
    
    // 更新模态框标题和标签
    updateCustomerModalLanguage(texts);
    updateOrderModalLanguage(texts);
    updatePaymentModalLanguage(texts);
    
    // 更新摘要卡片
    updateSummaryCardsLanguage(texts);
    
    // 重新渲染客户列表以应用语言更改
    if (customers.length > 0) {
        renderCustomers();
        if (selectedCustomerId) {
            const customer = customers.find(c => c.id === selectedCustomerId);
            if (customer) {
                updateCustomerInfo(customer);
                showCustomerSummary(customer);
                renderCustomerOrders(customer);
                renderCustomerPayments(customer);
            }
        }
    }
}

function updateCustomerModalLanguage(texts) {
    // 添加客户模态框
    const addCustomerModalTitle = document.getElementById('addCustomerModalTitle');
    if (addCustomerModalTitle) addCustomerModalTitle.textContent = texts.addCustomerModalTitle;
    
    const customerNameModalLabel = document.getElementById('customerNameModalLabel');
    if (customerNameModalLabel) customerNameModalLabel.innerHTML = `${texts.customerNameRequired} <span class="text-red-500">*</span>`;
    
    const customerContactLabel = document.getElementById('customerContactLabel');
    if (customerContactLabel) customerContactLabel.textContent = texts.contactPersonOptional;
    
    const customerPhoneLabel = document.getElementById('customerPhoneLabel');
    if (customerPhoneLabel) customerPhoneLabel.textContent = texts.contactPhoneOptional;
    
    const customerRemarkLabel = document.getElementById('customerRemarkLabel');
    if (customerRemarkLabel) customerRemarkLabel.textContent = texts.customerRemarkOptional;
    
    const customerNameInput = document.getElementById('customer-name');
    if (customerNameInput) customerNameInput.placeholder = texts.customerNamePlaceholder;
    
    const customerContactInput = document.getElementById('customer-contact');
    if (customerContactInput) customerContactInput.placeholder = texts.contactPersonPlaceholder;
    
    const customerPhoneInput = document.getElementById('customer-phone');
    if (customerPhoneInput) customerPhoneInput.placeholder = texts.contactPhonePlaceholder;
    
    const customerRemarkInput = document.getElementById('customer-remark');
    if (customerRemarkInput) customerRemarkInput.placeholder = texts.customerRemarkPlaceholder;
    
    const cancelCustomerBtn = document.getElementById('cancelCustomerBtn');
    if (cancelCustomerBtn) cancelCustomerBtn.textContent = texts.cancelCustomerBtn;
    
    const saveCustomerBtn = document.getElementById('saveCustomerBtn');
    if (saveCustomerBtn) saveCustomerBtn.textContent = texts.saveCustomerBtn;
}

function updateOrderModalLanguage(texts) {
    // 添加订单模态框
    const addOrderModalTitle = document.getElementById('addOrderModalTitle');
    if (addOrderModalTitle) addOrderModalTitle.textContent = texts.addOrderModalTitle;
    
    const orderNumberModalLabel = document.getElementById('orderNumberModalLabel');
    if (orderNumberModalLabel) orderNumberModalLabel.innerHTML = `${texts.orderNumberRequired} <span class="text-red-500">*</span>`;
    
    const orderDateModalLabel = document.getElementById('orderDateModalLabel');
    if (orderDateModalLabel) orderDateModalLabel.innerHTML = `${texts.orderDateRequired} <span class="text-red-500">*</span>`;
    
    const orderAmountModalLabel = document.getElementById('orderAmountModalLabel');
    if (orderAmountModalLabel) orderAmountModalLabel.innerHTML = `${texts.orderAmountRequired} <span class="text-red-500">*</span>`;
    
    const orderDueDateModalLabel = document.getElementById('orderDueDateModalLabel');
    if (orderDueDateModalLabel) orderDueDateModalLabel.textContent = texts.orderDueDateOptional;
    
    const orderProductsModalLabel = document.getElementById('orderProductsModalLabel');
    if (orderProductsModalLabel) orderProductsModalLabel.innerHTML = `${texts.orderProductsRequired} <span class="text-red-500">*</span>`;
    
    const orderRemarkModalLabel = document.getElementById('orderRemarkModalLabel');
    if (orderRemarkModalLabel) orderRemarkModalLabel.textContent = texts.orderRemarkOptional;
    const orderNumberInput = document.getElementById('orderNumberInput');
    if (orderNumberInput) orderNumberInput.placeholder = texts.orderNumberPlaceholder;
    
    const orderAmountInput = document.getElementById('orderAmountInput');
    if (orderAmountInput) orderAmountInput.placeholder = texts.orderAmountPlaceholder;
    
    const orderProductsInput = document.getElementById('orderProductsInput');
    if (orderProductsInput) orderProductsInput.placeholder = texts.orderProductsPlaceholder;
    
    const orderRemarkInput = document.getElementById('orderRemarkInput');
    if (orderRemarkInput) orderRemarkInput.placeholder = texts.orderRemarkPlaceholder;
    
    const cancelOrderBtn = document.getElementById('cancelOrderBtn');
    if (cancelOrderBtn) cancelOrderBtn.textContent = texts.cancelOrderBtn;
    
    const saveOrderBtn = document.getElementById('saveOrderBtn');
    if (saveOrderBtn) saveOrderBtn.textContent = texts.saveOrderBtn;
}

function updatePaymentModalLanguage(texts) {
    // 添加付款模态框
    const addPaymentModalTitle = document.getElementById('addPaymentModalTitle');
    if (addPaymentModalTitle) addPaymentModalTitle.textContent = texts.addPaymentModalTitle;
    
    const paymentOrderModalLabel = document.getElementById('paymentOrderModalLabel');
    if (paymentOrderModalLabel) paymentOrderModalLabel.innerHTML = `${texts.paymentOrderRequired} <span class="text-red-500">*</span>`;
    
    const paymentDateModalLabel = document.getElementById('paymentDateModalLabel');
    if (paymentDateModalLabel) paymentDateModalLabel.innerHTML = `${texts.paymentDateRequired} <span class="text-red-500">*</span>`;
    
    const paymentAmountModalLabel = document.getElementById('paymentAmountModalLabel');
    if (paymentAmountModalLabel) paymentAmountModalLabel.innerHTML = `${texts.paymentAmountRequired} <span class="text-red-500">*</span>`;
    
    const paymentMethodModalLabel = document.getElementById('paymentMethodModalLabel');
    if (paymentMethodModalLabel) paymentMethodModalLabel.textContent = texts.paymentMethodOptional;
    
    const paymentRemarkModalLabel = document.getElementById('paymentRemarkModalLabel');
    if (paymentRemarkModalLabel) paymentRemarkModalLabel.textContent = texts.paymentRemarkOptional;
    
    const paymentAmountInput = document.getElementById('paymentAmountInput');
    if (paymentAmountInput) paymentAmountInput.placeholder = texts.paymentAmountPlaceholder;
    
    const paymentRemarkInput = document.getElementById('paymentRemarkInput');
    if (paymentRemarkInput) paymentRemarkInput.placeholder = texts.paymentRemarkPlaceholder;
    
    const cancelPaymentModalBtn = document.getElementById('cancelPaymentModalBtn');
    if (cancelPaymentModalBtn) cancelPaymentModalBtn.textContent = texts.cancelPaymentModalBtn;
    
    const savePaymentModalBtn = document.getElementById('savePaymentModalBtn');
    if (savePaymentModalBtn) savePaymentModalBtn.textContent = texts.savePaymentModalBtn;
    
    // 更新付款方式选项
    const paymentMethodSelect = document.getElementById('paymentMethodInput');
    if (paymentMethodSelect) {
        paymentMethodSelect.innerHTML = `
            <option value="transfer">${texts.paymentMethodTransfer}</option>
            <option value="cash">${texts.paymentMethodCash}</option>
            <option value="alipay">${texts.paymentMethodAlipay}</option>
            <option value="wechat">${texts.paymentMethodWechat}</option>
            <option value="pix">${texts.paymentMethodPix}</option>
            <option value="other">${texts.paymentMethodOther}</option>
        `;
    }
}

function updateSummaryCardsLanguage(texts) {
    // 这个函数会在showCustomerSummary中被调用，所以这里只是占位
}

// 通知函数
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification px-4 py-3 rounded-lg shadow-lg text-white transform translate-x-full transition-transform duration-300 ${
        type === 'success' ? 'bg-green-500' :
        type === 'error' ? 'bg-red-500' :
        type === 'warning' ? 'bg-yellow-500' :
        'bg-blue-500'
    }`;
    notification.textContent = message;
    
    document.getElementById('notifications').appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        notification.classList.add('translate-x-full');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

// ==================== 收账记录关联功能 ====================

// 从收账记录中提取客户数据并与现有客户关联
function syncCustomersWithRecords() {
    if (typeof records === 'undefined' || !Array.isArray(records)) {
        console.warn('收账记录数据不可用');
        return;
    }
    
    // 从收账记录中提取唯一客户
    const recordCustomers = new Map();
    
    records.forEach(record => {
        if (!record.customerName || record.customerName.trim() === '') {
            return;
        }
        
        const customerName = record.customerName.trim();
        
        if (!recordCustomers.has(customerName)) {
            recordCustomers.set(customerName, {
                id: generateId('CUST'),
                name: customerName,
                contact: '', // 从记录中无法获取，保持空白
                phone: '', // 从记录中无法获取，保持空白
                remark: '', // 从记录中无法获取，保持空白
                orders: [],
                createdAt: new Date().toISOString(),
                source: 'records' // 标记数据来源
            });
        }
        
        const customer = recordCustomers.get(customerName);
        
        // 将收账记录转换为订单格式
        const order = {
            id: record.id || generateId('ORD'),
            orderNumber: record.orderNumber || record.nf || `REC-${Date.now()}`,
            date: record.orderDate || new Date().toISOString().split('T')[0],
            amount: parseFloat(record.amount) || 0,
            dueDate: record.dueDate || '',
            products: record.products || '',
            remark: record.remark || '',
            payments: [],
            source: 'accounting_record' // 标记来源于收账记录
        };
        
        customer.orders.push(order);
        
        // 处理付款记录
        // 1. 首先检查payments数组中的付款记录
        if (record.payments && Array.isArray(record.payments)) {
            record.payments.forEach(payment => {
                const paymentRecord = {
                    id: payment.id || generateId('PAY'),
                    amount: parseFloat(payment.amount) || 0,
                    method: payment.method || 'transfer',
                    date: payment.date || new Date().toISOString().split('T')[0],
                    remark: payment.remark || '',
                    source: 'accounting_record'
                };
                order.payments.push(paymentRecord);
            });
        }
        
        // 2. 如果没有payments数组但记录已付款，添加付款记录
        else if (record.status === 'paid' && record.paidAmount > 0) {
            const payment = {
                id: generateId('PAY'),
                amount: parseFloat(record.paidAmount) || parseFloat(record.amount) || 0,
                method: 'transfer', // 默认为转账
                date: record.updatedAt ? record.updatedAt.split('T')[0] : new Date().toISOString().split('T')[0],
                remark: '',
                source: 'accounting_record'
            };
            order.payments.push(payment);
        }
    });
    
    // 合并现有客户数据和从记录中提取的客户数据
    const existingCustomerNames = new Set(customers.map(c => c.name));
    
    recordCustomers.forEach((recordCustomer, customerName) => {
        const existingCustomer = customers.find(c => c.name === customerName);
        
        if (existingCustomer) {
            // 合并订单数据，避免重复
            recordCustomer.orders.forEach(newOrder => {
                const existingOrder = existingCustomer.orders.find(o => o.orderNumber === newOrder.orderNumber);
                
                if (existingOrder) {
                    // 如果订单已存在，合并付款记录（去重）
                    const existingPaymentKeys = new Set();
                    
                    // 收集现有付款记录的键
                    existingOrder.payments.forEach(payment => {
                        const paymentKey = `${payment.date}_${payment.amount}_${payment.method || 'transfer'}`;
                        existingPaymentKeys.add(paymentKey);
                    });
                    
                    // 添加新的付款记录（去重）
                    newOrder.payments.forEach(payment => {
                        const paymentKey = `${payment.date}_${payment.amount}_${payment.method || 'transfer'}`;
                        if (!existingPaymentKeys.has(paymentKey)) {
                            existingOrder.payments.push(payment);
                        }
                    });
                } else {
                    // 如果订单不存在，直接添加
                    existingCustomer.orders.push(newOrder);
                }
            });
        } else {
            // 添加新客户
            customers.push(recordCustomer);
        }
    });
    
    // 重新渲染客户列表
    renderCustomers();
    
    console.log(`已同步 ${recordCustomers.size} 个客户的收账记录数据`);
}

// 获取客户的收账记录统计
function getCustomerAccountingSummary(customerName) {
    if (typeof records === 'undefined' || !Array.isArray(records)) {
        return {
            totalRecords: 0,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            overdueAmount: 0
        };
    }
    
    const customerRecords = records.filter(record => 
        record.customerName && record.customerName.trim() === customerName.trim()
    );
    
    let totalAmount = 0;
    let paidAmount = 0;
    let pendingAmount = 0;
    let overdueAmount = 0;
    
    const today = new Date();
    
    customerRecords.forEach(record => {
        const amount = parseFloat(record.amount) || 0;
        totalAmount += amount;
        
        // 计算该记录的实际付款金额
        let recordPaidAmount = 0;
        
        // 优先检查payments数组中的付款记录
        if (record.payments && Array.isArray(record.payments)) {
            recordPaidAmount = record.payments.reduce((sum, payment) => 
                sum + (parseFloat(payment.amount) || 0), 0
            );
        } else if (record.status === 'paid' && record.paidAmount) {
            // 如果没有payments数组，但状态为已付且有paidAmount字段
            recordPaidAmount = parseFloat(record.paidAmount) || 0;
        } else if (record.status === 'paid') {
            // 如果状态为已付但没有具体付款金额，假设全额付款
            recordPaidAmount = amount;
        }
        
        paidAmount += recordPaidAmount;
        const remainingAmount = amount - recordPaidAmount;
        
        if (remainingAmount > 0) {
            pendingAmount += remainingAmount;
            
            // 检查是否逾期
            if (record.dueDate) {
                const dueDate = parseDDMMYYYYToDate(record.dueDate);
                if (dueDate && dueDate < today) {
                    overdueAmount += remainingAmount;
                }
            }
        }
     });
    
    return {
        totalRecords: customerRecords.length,
        totalAmount,
        paidAmount,
        pendingAmount,
        overdueAmount
    };
}

// 在客户详情中显示收账记录信息
function displayAccountingRecords(customerName) {
    if (typeof records === 'undefined' || !Array.isArray(records)) {
        return;
    }
    
    const customerRecords = records.filter(record => 
        record.customerName && record.customerName.trim() === customerName.trim()
    );
    
    if (customerRecords.length === 0) {
        return;
    }
    
    // 在客户详情面板中添加收账记录标签页
    const tabsContainer = document.querySelector('.customer-tabs');
    if (tabsContainer && !document.getElementById('accounting-tab')) {
        const accountingTab = document.createElement('button');
        accountingTab.id = 'accounting-tab';
        accountingTab.className = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300';
        const lang = localStorage.getItem('selectedLanguage') || 'pt';
        const texts = uiTexts[lang];
        accountingTab.textContent = texts.accountingRecordsTab;
        accountingTab.onclick = () => showAccountingSection();
        tabsContainer.appendChild(accountingTab);
    }
    
    // 创建收账记录内容区域
    const detailsContent = document.querySelector('.customer-details-content');
    if (detailsContent && !document.getElementById('accounting-section')) {
        const accountingSection = document.createElement('div');
        accountingSection.id = 'accounting-section';
        accountingSection.className = 'hidden';
        accountingSection.innerHTML = generateAccountingRecordsHTML(customerRecords);
        detailsContent.appendChild(accountingSection);
    }
}

// 生成收账记录HTML
function generateAccountingRecordsHTML(records) {
    const lang = localStorage.getItem('selectedLanguage') || 'pt';
    const texts = uiTexts[lang];
    
    return `
        <div class="space-y-4">
            <h3 class="text-lg font-semibold text-gray-800">${texts.accountingRecords}</h3>
            <div class="overflow-x-auto">
                <table class="min-w-full bg-white border border-gray-200 rounded-lg">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NF</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">${lang === 'pt' ? 'Nº Pedido' : '订单号'}</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">${lang === 'pt' ? 'Valor' : '金额'}</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">${lang === 'pt' ? 'Data Pedido' : '订单日期'}</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">${lang === 'pt' ? 'Data Vencimento' : '到期日期'}</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">${lang === 'pt' ? 'Status' : '状态'}</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${records.map(record => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-4 py-2 text-sm text-gray-900">${record.nf || '-'}</td>
                                <td class="px-4 py-2 text-sm text-gray-900">${record.orderNumber || '-'}</td>
                                <td class="px-4 py-2 text-sm font-medium text-gray-900">R$ ${parseFloat(record.amount || 0).toLocaleString('pt-BR')}</td>
                                <td class="px-4 py-2 text-sm text-gray-900">${record.orderDate || '-'}</td>
                                <td class="px-4 py-2 text-sm text-gray-900">${record.dueDate || '-'}</td>
                                <td class="px-4 py-2">
                                    <span class="inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        record.status === 'paid' ? 'bg-green-100 text-green-800' :
                                        record.status === 'overdue' ? 'bg-red-100 text-red-800' :
                                        'bg-yellow-100 text-yellow-800'
                                    }">
                                        ${lang === 'pt' ? 
                                            (record.status === 'paid' ? 'Pago' : 
                                             record.status === 'overdue' ? 'Vencido' : 'Pendente') :
                                            (record.status === 'paid' ? '已付款' : 
                                             record.status === 'overdue' ? '逾期' : '待付款')
                                        }
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// 显示收账记录标签页
function showAccountingSection() {
    // 隐藏其他标签页内容
    document.getElementById('orders-section').classList.add('hidden');
    document.getElementById('payments-section').classList.add('hidden');
    const accountingSection = document.getElementById('accounting-section');
    if (accountingSection) {
        accountingSection.classList.remove('hidden');
    }
    
    // 更新标签页样式
    document.getElementById('orders-tab').className = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300';
    document.getElementById('payments-tab').className = 'px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 border-b-2 border-transparent hover:border-gray-300';
    const accountingTab = document.getElementById('accounting-tab');
    if (accountingTab) {
        accountingTab.className = 'px-4 py-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600';
    }
}

// 初始化时同步数据
function initializeCustomerRecordSync() {
    // 等待DOM加载完成后同步数据
    function attemptSync() {
        // 检查records变量是否可用
        if (typeof records !== 'undefined' && Array.isArray(records)) {
            syncCustomersWithRecords();
        } else {
            // 如果records还未加载，延迟100ms后重试
            setTimeout(attemptSync, 100);
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attemptSync);
    } else {
        attemptSync();
    }
    
    // 监听收账记录数据变化
    if (typeof window !== 'undefined') {
        window.addEventListener('recordsUpdated', syncCustomersWithRecords);
    }
}

// 自动初始化同步功能
initializeCustomerRecordSync();