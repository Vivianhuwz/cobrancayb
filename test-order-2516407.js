// 测试订单2516407付款记录显示的脚本

// 创建测试数据
function createTestDataFor2516407() {
    const testRecord = {
        id: 'REC_2516407',
        nf: '',
        orderNumber: '2516407',
        customerName: 'AMERICA PRESENTES',
        amount: 11666.2,
        orderDate: '14/08/2025',
        creditDays: 30,
        dueDate: '13/10/2025',
        status: 'pending', // 注意：状态不是paid，但有付款记录
        notes: '',
        paidAmount: 3000, // 添加已付金额字段
        payments: [
            {
                id: 'PAY_2516407_001',
                date: '29/08/2025',
                amount: 3000,
                method: 'transfer',
                remark: 'Transferência Bancária'
            }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    // 获取现有记录
    let records = JSON.parse(localStorage.getItem('accountRecords')) || [];
    
    // 检查是否已存在订单2516407
    const existingIndex = records.findIndex(r => r.orderNumber === '2516407');
    
    if (existingIndex >= 0) {
        // 更新现有记录
        records[existingIndex] = testRecord;
        console.log('已更新订单2516407的记录');
    } else {
        // 添加新记录
        records.push(testRecord);
        console.log('已添加订单2516407的测试记录');
    }
    
    // 保存到localStorage
    localStorage.setItem('accountRecords', JSON.stringify(records));
    
    // 更新全局records变量
    if (typeof window.records !== 'undefined') {
        window.records = records;
    }
    
    // 触发数据同步
    if (typeof syncCustomersWithRecords === 'function') {
        syncCustomersWithRecords();
        console.log('已触发客户数据同步');
    }
    
    // 分发recordsUpdated事件
    window.dispatchEvent(new CustomEvent('recordsUpdated'));
    
    console.log('测试数据创建完成，订单2516407应该现在显示付款记录');
    
    return testRecord;
}

// 验证数据是否正确显示
function verifyOrder2516407Display() {
    // 查找AMERICA PRESENTES客户
    const customer = customers.find(c => c.name === 'AMERICA PRESENTES');
    
    if (!customer) {
        console.error('未找到AMERICA PRESENTES客户');
        return false;
    }
    
    // 查找订单2516407
    const order = customer.orders.find(o => o.orderNumber === '2516407');
    
    if (!order) {
        console.error('未找到订单2516407');
        return false;
    }
    
    // 检查付款记录
    if (!order.payments || order.payments.length === 0) {
        console.error('订单2516407没有付款记录');
        return false;
    }
    
    const payment = order.payments.find(p => p.amount === 3000 && p.date === '29/08/2025');
    
    if (!payment) {
        console.error('未找到预期的付款记录');
        return false;
    }
    
    console.log('✅ 验证成功：订单2516407的付款记录已正确显示');
    console.log('付款详情：', payment);
    return true;
}

// 自动执行测试
if (typeof window !== 'undefined') {
    // 等待页面加载完成后执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => {
                createTestDataFor2516407();
                setTimeout(() => {
                    verifyOrder2516407Display();
                }, 1000);
            }, 500);
        });
    } else {
        setTimeout(() => {
            createTestDataFor2516407();
            setTimeout(() => {
                verifyOrder2516407Display();
            }, 1000);
        }, 500);
    }
}

// 导出函数供手动调用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createTestDataFor2516407,
        verifyOrder2516407Display
    };
}